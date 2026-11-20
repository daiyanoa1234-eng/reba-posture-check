/**
 * 推定の安定性の指標（正解データが無い状態での比較用）。
 * 連続する3フレームの2階差分（p[i-1] - 2p[i] + p[i+1]）は、滑らかな動きでは小さく、
 * 推定のばらつき（ノイズ）で大きくなる。体幹長で割って人物の大きさの影響を除く。
 * 精度（実測との誤差）を示すものではない。
 */
import { LM, type Pt } from '../pose/landmarks';
import type { AnalysisResult } from './types';

const KEY_JOINTS = [
  LM.L_SHOULDER, LM.R_SHOULDER, LM.L_ELBOW, LM.R_ELBOW, LM.L_WRIST, LM.R_WRIST,
  LM.L_HIP, LM.R_HIP, LM.L_KNEE, LM.R_KNEE, LM.L_ANKLE, LM.R_ANKLE,
];

function torso(p: Pt[], w: number, h: number): number {
  const sx = ((p[LM.L_SHOULDER].x + p[LM.R_SHOULDER].x) / 2) * w;
  const sy = ((p[LM.L_SHOULDER].y + p[LM.R_SHOULDER].y) / 2) * h;
  const hx = ((p[LM.L_HIP].x + p[LM.R_HIP].x) / 2) * w;
  const hy = ((p[LM.L_HIP].y + p[LM.R_HIP].y) / 2) * h;
  return Math.hypot(sx - hx, sy - hy);
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

export interface StabilityMetrics {
  frames: number;
  detected: number;
  fullBody: number;
  /** 主要12関節の2階差分の平均（体幹長に対する比） */
  jointJitter: number;
  /** 角度の2階差分の平均（度） */
  angleJitter: { trunk: number; elbow: number; knee: number };
  /** 主要関節の visibility の平均 */
  meanVisibility: number;
  /** 左右反転推定との一致率の平均（最高精度のみ） */
  flipAgreement: number | null;
  msPerFrame: number;
}

export function stabilityMetrics(r: AnalysisResult): StabilityMetrics {
  const f = r.frames;
  const jj: number[] = [];
  const at: number[] = [];
  const ae: number[] = [];
  const ak: number[] = [];
  const vis: number[] = [];
  for (const fr of f) if (fr.image) for (const j of KEY_JOINTS) vis.push(fr.image[j].v);
  for (let i = 1; i < f.length - 1; i++) {
    const a = f[i - 1];
    const b = f[i];
    const c = f[i + 1];
    if (!a.image || !b.image || !c.image) continue;
    const t = torso(b.image, b.width, b.height);
    if (t < 1) continue;
    for (const j of KEY_JOINTS) {
      if (a.image[j].v < 0.5 || b.image[j].v < 0.5 || c.image[j].v < 0.5) continue;
      const dx = (a.image[j].x - 2 * b.image[j].x + c.image[j].x) * b.width;
      const dy = (a.image[j].y - 2 * b.image[j].y + c.image[j].y) * b.height;
      jj.push(Math.hypot(dx, dy) / t);
    }
    const d2 = (x: number | null, y: number | null, z: number | null) => (x == null || y == null || z == null ? null : Math.abs(x - 2 * y + z));
    const tr = d2(a.angles.trunkFlexion, b.angles.trunkFlexion, c.angles.trunkFlexion);
    if (tr != null) at.push(tr);
    for (const s of ['left', 'right'] as const) {
      const e = d2(a.angles.elbowFlexion[s], b.angles.elbowFlexion[s], c.angles.elbowFlexion[s]);
      if (e != null) ae.push(e);
      const k = d2(a.angles.kneeFlexion[s], b.angles.kneeFlexion[s], c.angles.kneeFlexion[s]);
      if (k != null) ak.push(k);
    }
  }
  const agr = f.map((x) => x.flipAgreement).filter((v): v is number => v != null);
  return {
    frames: f.length,
    detected: f.filter((x) => x.quality.detected).length,
    fullBody: f.filter((x) => x.quality.fullBody).length,
    jointJitter: mean(jj),
    angleJitter: { trunk: mean(at), elbow: mean(ae), knee: mean(ak) },
    meanVisibility: mean(vis),
    flipAgreement: agr.length ? mean(agr) : null,
    msPerFrame: r.timing.detectMs / Math.max(1, r.timing.frames),
  };
}
