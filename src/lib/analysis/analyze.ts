/**
 * 動画から一定間隔でフレームを取り出し、姿勢推定・角度計算を行う。
 * 1フレームごとに処理を区切って画面更新とキャンセルを受け付ける。
 */
import { computeAngles, viewDirection } from '../angles/angles';
import { poseEngine } from '../pose/engine';
import { LM, type Pt } from '../pose/landmarks';
import { encodeFrame } from '../video/encoder';
import { type LoadedVideo, drawFrame, seekTo } from '../video/videoSource';
import type { Settings } from '../../state/settings';
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

export async function analyzeVideo(v: LoadedVideo, settings: Settings, opts: AnalyzeOptions): Promise<AnalysisResult> {
  const t0 = performance.now();
  const check = () => {
    if (opts.signal.aborted) throw new AnalysisCancelled();
  };
  const times = frameTimes(opts.start, opts.end, settings.fps, v.duration);

  opts.onProgress({ phase: 'model', done: 0, total: times.length, elapsedMs: 0 });
  const tm = performance.now();
  await poseEngine.ensure(settings.model, settings.delegate);
  const modelLoadMs = performance.now() - tm;
  check();

  const canvas = document.createElement('canvas');
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

    const td = performance.now();
    let out;
    try {
      out = poseEngine.detect(canvas);
    } catch (e) {
      if (poseEngine.status.delegate === 'GPU') {
        await poseEngine.fallbackToCpu();
        out = poseEngine.detect(canvas);
      } else throw e;
    }
    detectMs += performance.now() - td;

    const prev = prevTarget && t - prevTarget.t <= 1.0 ? prevTarget : null;
    const ti = chooseTarget(out.image, prev);
    const image = ti >= 0 ? out.image[ti] : null;
    const world = ti >= 0 ? out.world[ti] ?? null : null;
    const others = out.image.filter((_, k) => k !== ti);
    if (image) prevTarget = { ...hipCenter(image), t };

    const quality = assessQuality(image, out.image.length, settings.visibilityThreshold);
    const angles = computeAngles(world, quality);

    const rec: FrameRecord = {
      index: i,
      time: t,
      image,
      world,
      others,
      numPoses: out.image.length,
      quality,
      angles,
      view: quality.detected ? viewDirection(world) : null,
      imageBlob: null,
      width: w,
      height: h,
    };
    // JPEG 化は待たずに並行して進める（canvas の内容は呼び出し時点で複製される）
    const te = performance.now();
    encodes.push(
      encodeFrame(canvas, 0.85).then((b) => {
        rec.imageBlob = b;
        preview = rec;
      }),
    );
    encodeMs += performance.now() - te;
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
    model: settings.model,
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
