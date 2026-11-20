/**
 * 動画から一定間隔でフレームを取り出し、姿勢推定・角度計算を行う。
 * 1フレームごとに処理を区切って画面更新とキャンセルを受け付ける。
 */
import { computeAngles, viewDirection } from '../angles/angles';
import { type DetectOutput, poseEngine } from '../pose/engine';
import { LM, type Pt } from '../pose/landmarks';
import { type Roi, cropToFrame, frameToCrop, fusePasses, hipCenter as hipOf, nearestPose, personRoi, unflipImage, unflipWorld } from '../pose/refine';
import { encodeFrame } from '../video/encoder';
import { type LoadedVideo, drawFrame, seekTo } from '../video/videoSource';
import { PRESETS, type PresetDef, type Settings } from '../../state/settings';
import { assessQuality } from './quality';
import type { AnalysisResult, FrameRecord } from './types';

export interface AnalyzeProgress {
  phase: 'model' | 'frames' | 'images';
  done: number;
  total: number;
  elapsedMs: number;
  last?: FrameRecord;
}

export interface AnalyzeOptions {
  start: number;
  end: number;
  signal: AbortSignal;
  onProgress: (p: AnalyzeProgress) => void;
}

export class AnalysisCancelled extends Error {
  constructor() {
    super('解析をキャンセルしました');
    this.name = 'AnalysisCancelled';
  }
}

export function frameTimes(start: number, end: number, fps: number, duration: number): number[] {
  const n = Math.max(1, Math.floor((end - start) * fps + 1e-6));
  const maxT = Math.max(0, duration - 0.04);
  return Array.from({ length: n }, (_, i) => Math.min(maxT, start + i / fps));
}

/**
 * 1フレームごとに制御を画面へ返す。setTimeout はバックグラウンドで間引かれるため、
 * scheduler.yield / MessageChannel を優先する。
 */
const channel = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
const yieldToUI = (): Promise<void> => {
  const sch = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (sch?.yield) return sch.yield();
  if (channel) {
    return new Promise((r) => {
      channel.port1.onmessage = () => r();
      channel.port2.postMessage(0);
    });
  }
  return new Promise((r) => setTimeout(r, 0));
};

function bboxArea(p: Pt[]): number {
  const vis = p.filter((q) => q.v > 0.3);
  if (vis.length < 3) return 0;
  const xs = vis.map((q) => q.x);
  const ys = vis.map((q) => q.y);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
}

const hipCenter = (p: Pt[]) => ({ x: (p[LM.L_HIP].x + p[LM.R_HIP].x) / 2, y: (p[LM.L_HIP].y + p[LM.R_HIP].y) / 2 });

/** 複数人が検出されたとき、直前の対象者に近い人物（いなければ最も大きく映る人物）を選ぶ */
export function chooseTarget(poses: Pt[][], prev: { x: number; y: number } | null): number {
  if (poses.length <= 1) return poses.length - 1;
  if (prev) {
    let best = 0;
    let bestD = Infinity;
    poses.forEach((p, i) => {
      const c = hipCenter(p);
      const d = Math.hypot(c.x - prev.x, c.y - prev.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (bestD < 0.25) return best;
  }
  let best = 0;
  let bestA = -1;
  poses.forEach((p, i) => {
    const a = bboxArea(p);
    if (a > bestA) {
      bestA = a;
      best = i;
    }
  });
  return best;
}

function detectWithFallback(source: HTMLCanvasElement): DetectOutput | Promise<DetectOutput> {
  try {
    return poseEngine.detect(source);
  } catch (e) {
    if (poseEngine.status.delegate === 'GPU') return poseEngine.fallbackToCpu().then(() => poseEngine.detect(source));
    throw e;
  }
}

interface RefineCanvases {
  crop: HTMLCanvasElement;
  flip: HTMLCanvasElement;
}

/** 元動画から正方形の範囲を切り出して描く（範囲外は黒） */
function drawCrop(video: HTMLVideoElement, roi: Roi, c: HTMLCanvasElement): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const out = Math.round(Math.min(640, Math.max(384, roi.size)));
  if (c.width !== out) c.width = out;
  if (c.height !== out) c.height = out;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, out, out);
  // 範囲外を含む source rect の扱いはブラウザで差があるため、交差部分だけを明示的に描く
  const sx = Math.max(0, roi.x);
  const sy = Math.max(0, roi.y);
  const ex = Math.min(vw, roi.x + roi.size);
  const ey = Math.min(vh, roi.y + roi.size);
  if (ex <= sx || ey <= sy) return;
  const k = out / roi.size;
  ctx.drawImage(video, sx, sy, ex - sx, ey - sy, (sx - roi.x) * k, (sy - roi.y) * k, (ex - sx) * k, (ey - sy) * k);
}

/**
 * 1フレームの関節点推定。設定に応じて、人物領域の切り出し再推定・左右反転との統合を行う。
 * いずれの段階でも人物が見つからなければ、前の段階の結果をそのまま使う。
 */
async function estimate(
  video: HTMLVideoElement,
  full: HTMLCanvasElement,
  preset: PresetDef,
  cv: RefineCanvases,
  prev: { x: number; y: number } | null,
): Promise<{ image: Pt[] | null; world: Pt[] | null; others: Pt[][]; numPoses: number; refined: boolean; agreement: number | null }> {
  const out1 = await detectWithFallback(full);
  const ti = chooseTarget(out1.image, prev);
  const others = out1.image.filter((_, k) => k !== ti);
  let image = ti >= 0 ? out1.image[ti] : null;
  let world = ti >= 0 ? (out1.world[ti] ?? null) : null;
  if (!image || !world || !preset.refine) return { image, world, others, numPoses: out1.image.length, refined: false, agreement: null };

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const roi = personRoi(image, vw, vh);
  if (!roi) return { image, world, others, numPoses: out1.image.length, refined: false, agreement: null };
  drawCrop(video, roi, cv.crop);
  const expect = frameToCrop(hipOf(image), roi, vw, vh);
  const out2 = await detectWithFallback(cv.crop);
  const k2 = nearestPose(out2.image, expect, 0.2);
  if (k2 < 0 || !out2.world[k2]) return { image, world, others, numPoses: out1.image.length, refined: false, agreement: null };
  let cropImage = out2.image[k2];
  let cropWorld = out2.world[k2];
  let agreement: number | null = null;

  if (preset.flip) {
    const n = cv.crop.width;
    if (cv.flip.width !== n) cv.flip.width = n;
    if (cv.flip.height !== n) cv.flip.height = n;
    const fctx = cv.flip.getContext('2d')!;
    fctx.setTransform(-1, 0, 0, 1, n, 0);
    fctx.drawImage(cv.crop, 0, 0);
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    const out3 = await detectWithFallback(cv.flip);
    const k3 = nearestPose(out3.image, { x: 1 - expect.x, y: expect.y }, 0.2);
    if (k3 >= 0 && out3.world[k3]) {
      const fused = fusePasses(
        { image: cropImage, world: cropWorld },
        { image: unflipImage(out3.image[k3]), world: unflipWorld(out3.world[k3]) },
        n,
        n,
      );
      cropImage = fused.image;
      cropWorld = fused.world;
      agreement = fused.agreement;
    }
  }
  image = cropToFrame(cropImage, roi, vw, vh);
  world = cropWorld;
  return { image, world, others, numPoses: out1.image.length, refined: true, agreement };
}

export async function analyzeVideo(v: LoadedVideo, settings: Settings, opts: AnalyzeOptions): Promise<AnalysisResult> {
  const t0 = performance.now();
  const check = () => {
    if (opts.signal.aborted) throw new AnalysisCancelled();
  };
  const preset = PRESETS[settings.accuracy];
  const times = frameTimes(opts.start, opts.end, settings.fps, v.duration);

  opts.onProgress({ phase: 'model', done: 0, total: times.length, elapsedMs: 0 });
  const tm = performance.now();
  await poseEngine.ensure(preset.model, settings.delegate);
  const modelLoadMs = performance.now() - tm;
  check();

  const canvas = document.createElement('canvas');
  const cv: RefineCanvases = { crop: document.createElement('canvas'), flip: document.createElement('canvas') };
  const frames: FrameRecord[] = [];
  let seekMs = 0;
  let detectMs = 0;
  let encodeMs = 0;
  let prevTarget: { x: number; y: number; t: number } | null = null;
  const encodes: Promise<void>[] = [];
  let preview: FrameRecord | null = null;

  for (let i = 0; i < times.length; i++) {
    check();
    const t = times[i];
    const ts = performance.now();
    await seekTo(v.video, t);
    const { w, h } = drawFrame(v.video, canvas, settings.frameMaxSide);
    seekMs += performance.now() - ts;
    check();

    // JPEG 化は待たずに並行して進める（canvas の内容は呼び出し時点で複製される）
    const te = performance.now();
    const encP = encodeFrame(canvas, 0.85);
    encodeMs += performance.now() - te;

    const td = performance.now();
    const prev = prevTarget && t - prevTarget.t <= 1.0 ? prevTarget : null;
    const est = await estimate(v.video, canvas, preset, cv, prev);
    detectMs += performance.now() - td;
    if (est.image) prevTarget = { ...hipCenter(est.image), t };

    const quality = assessQuality(est.image, est.numPoses, settings.visibilityThreshold);
    const angles = computeAngles(est.world, quality);

    const rec: FrameRecord = {
      index: i,
      time: t,
      image: est.image,
      world: est.world,
      others: est.others,
      numPoses: est.numPoses,
      quality,
      angles,
      view: quality.detected ? viewDirection(est.world) : null,
      imageBlob: null,
      width: w,
      height: h,
      refined: est.refined,
      flipAgreement: est.agreement,
    };
    encodes.push(
      encP.then((b) => {
        rec.imageBlob = b;
        preview = rec;
      }),
    );
    frames.push(rec);
    opts.onProgress({ phase: 'frames', done: i + 1, total: times.length, elapsedMs: performance.now() - t0, last: preview ?? undefined });
    await yieldToUI();
  }

  opts.onProgress({ phase: 'images', done: times.length, total: times.length, elapsedMs: performance.now() - t0, last: preview ?? undefined });
  const tw = performance.now();
  await Promise.all(encodes);
  encodeMs += performance.now() - tw;
  check();

  return {
    source: 'video',
    videoName: v.name,
    videoDuration: v.duration,
    segment: { start: opts.start, end: opts.end },
    fps: settings.fps,
    frames,
    model: preset.model,
    accuracy: settings.accuracy,
    delegate: poseEngine.status.delegate,
    timing: { totalMs: performance.now() - t0, modelLoadMs, seekMs, detectMs, encodeMs, frames: frames.length },
    createdAt: new Date().toISOString(),
  };
}

export interface AnalysisSummary {
  total: number;
  detected: number;
  fullBody: number;
  multiPerson: number;
  views: Record<'side' | 'oblique' | 'front', number>;
  warnings: string[];
}

export function summarize(r: AnalysisResult): AnalysisSummary {
  const total = r.frames.length;
  const detected = r.frames.filter((f) => f.quality.detected).length;
  const fullBody = r.frames.filter((f) => f.quality.fullBody).length;
  const multiPerson = r.frames.filter((f) => f.quality.multiplePeople).length;
  const views = { side: 0, oblique: 0, front: 0 };
  for (const f of r.frames) if (f.view) views[f.view]++;
  const pct = (n: number) => Math.round((n / Math.max(1, total)) * 100);
  const warnings: string[] = [];
  if (detected === 0) warnings.push('人物を検出できませんでした。作業者の全身が映るように撮影し直してください。');
  else if (detected / total < 0.6) warnings.push(`人物を検出できたフレームが ${pct(detected)}% です。全身が大きく映るように再撮影を検討してください。`);
  if (detected > 0 && fullBody / Math.max(1, detected) < 0.6)
    warnings.push(`全身（足首まで）が映っていないフレームが多くあります（全身が映るのは ${pct(fullBody)}%）。脚の評価は目視で確認してください。`);
  if (multiPerson > 0)
    warnings.push(`複数人が映っているフレームが ${multiPerson} 枚あります。評価対象者の骨格になっているか確認してください（複数人のフレームは候補から除外）。`);
  if (views.front > views.side + views.oblique && detected > 0)
    warnings.push('正面または背面からの撮影が多いようです。体幹・上腕の前後の角度は側方（真横）からの撮影の方が安定しやすくなります。');
  return { total, detected, fullBody, multiPerson, views, warnings };
}
