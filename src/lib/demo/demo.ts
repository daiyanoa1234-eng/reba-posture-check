/**
 * 模擬データ（デモ）。カメラや動画が無くても画面の流れを確認するためのもので、実測データではない。
 * 生成した結果には source: 'demo' が付き、画面・保存データ・書き出しの全てに「模擬データ」と表示する。
 */
import { computeAngles, viewDirection } from '../angles/angles';
import { assessQuality } from '../analysis/quality';
import type { AnalysisResult, FrameRecord } from '../analysis/types';
import { BONES, LM, type Pt } from '../pose/landmarks';
import { canvasToJpeg } from '../video/videoSource';
import { NEUTRAL, type SynthParams, synthWorld } from './synthPose';

const W = 540;
const H = 960;
const PX_PER_M = 380;

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));

/** 時刻 t（秒）の模擬姿勢 */
function poseAt(t: number): SynthParams {
  const p: SynthParams = structuredClone(NEUTRAL);
  if (t < 2) return p;
  if (t < 5) {
    const k = (t - 2) / 2;
    p.trunkFlexion = lerp(0, 70, k);
    p.neckFlexion = lerp(0, 15, k);
    for (const s of ['left', 'right'] as const) {
      p.arms[s] = { flexion: lerp(0, 65, k), abduction: 5, elbow: 20, wrist: 10 };
      p.legs[s] = { hip: lerp(0, 25, k), knee: lerp(0, 40, k) };
    }
    return p;
  }
  if (t < 7) {
    const k = (t - 5) / 2;
    p.trunkFlexion = lerp(70, 15, k);
    for (const s of ['left', 'right'] as const) {
      p.arms[s] = { flexion: lerp(65, 50, k), abduction: 5, elbow: lerp(20, 90, k), wrist: 10 };
      p.legs[s] = { hip: lerp(25, 5, k), knee: lerp(40, 10, k) };
    }
    return p;
  }
  const k = (t - 7) / 2;
  p.trunkFlexion = lerp(15, -5, k);
  p.neckFlexion = lerp(0, -25, k);
  p.arms.right = { flexion: lerp(50, 135, k), abduction: 10, elbow: lerp(90, 25, k), wrist: 20 };
  p.arms.left = { flexion: lerp(50, 110, k), abduction: 10, elbow: lerp(90, 40, k), wrist: 20 };
  return p;
}

function toImage(world: Pt[]): Pt[] {
  return world.map((q) => ({ x: 0.5 + (q.x * PX_PER_M) / W, y: 0.6 + (q.y * PX_PER_M) / H, z: q.z, v: q.v }));
}

function render(ctx: CanvasRenderingContext2D, img: Pt[]) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#dfe6ee');
  g.addColorStop(1, '#bfc9d4');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#9aa6b2';
  ctx.fillRect(0, H * 0.93, W, H * 0.07);
  const P = (i: number) => [img[i].x * W, img[i].y * H] as const;
  ctx.strokeStyle = '#4a5560';
  ctx.lineCap = 'round';
  ctx.lineWidth = 22;
  for (const [a, b] of BONES) {
    if (a <= 10 || b <= 10) continue;
    ctx.beginPath();
    ctx.moveTo(...P(a));
    ctx.lineTo(...P(b));
    ctx.stroke();
  }
  const [ex, ey] = [(P(LM.L_EAR)[0] + P(LM.R_EAR)[0]) / 2, (P(LM.L_EAR)[1] + P(LM.R_EAR)[1]) / 2];
  ctx.fillStyle = '#4a5560';
  ctx.beginPath();
  ctx.arc(ex, ey, 0.11 * PX_PER_M, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(W / 2, H * 0.12);
  ctx.fillStyle = 'rgba(160, 20, 20, 0.85)';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('模擬データ（実測ではありません）', 0, 0);
  ctx.restore();
}

export async function generateDemo(onProgress?: (done: number, total: number) => void): Promise<AnalysisResult> {
  const fps = 5;
  const duration = 9;
  const n = duration * fps;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const frames: FrameRecord[] = [];
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    const t = i / fps;
    const world = synthWorld(poseAt(t));
    // 推定の乱れを模した1フレーム（候補から除外されることを確認するため）
    if (i === 6) for (const k of [LM.L_SHOULDER, LM.R_SHOULDER]) world[k] = { ...world[k], x: world[k].x + 0.45, y: world[k].y + 0.25 };
    const image = toImage(world);
    const quality = assessQuality(image, 1, 0.5);
    render(ctx, image);
    frames.push({
      index: i,
      time: t,
      image,
      world,
      others: [],
      numPoses: 1,
      quality,
      angles: computeAngles(world, quality),
      view: viewDirection(world),
      imageBlob: await canvasToJpeg(canvas, 0.8),
      width: W,
      height: H,
    });
    onProgress?.(i + 1, n);
  }
  return {
    source: 'demo',
    videoName: '模擬データ',
    videoDuration: duration,
    segment: { start: 0, end: duration },
    fps,
    frames,
    model: '模擬',
    delegate: '-',
    timing: { totalMs: performance.now() - t0, modelLoadMs: 0, seekMs: 0, detectMs: 0, encodeMs: 0, frames: n },
    createdAt: new Date().toISOString(),
  };
}
