/**
 * 関節点の手動調整。
 * 評価者が画像上で動かした関節点（画像正規化座標）を、そのフレームの推定3D座標にも反映して角度を計算し直す。
 *
 * 3Dへの反映方法（弱透視近似）:
 *   そのフレームで見えている関節点から、画像（ピクセル）と推定3D座標（m）の対応を
 *   px ≈ s·X + tx, py ≈ s·Y + ty（等方スケール）で最小二乗推定し、
 *   画像上の移動量 (Δpx, Δpy) を 3D の (ΔX, ΔY) = (Δpx, Δpy) / s として加える。奥行き Z は推定値のまま。
 * 調整した点は評価者が確認したものとして visibility = 1 とする。
 */
import { computeAngles, viewDirection } from '../angles/angles';
import { assessQuality } from '../analysis/quality';
import type { FrameRecord } from '../analysis/types';
import { LM, type Pt } from '../pose/landmarks';

export interface JointPos {
  x: number;
  y: number;
}

/** 関節番号 → 調整後の位置（画像正規化座標） */
export type JointEdits = Record<number, JointPos>;

export const JOINT_NAMES: Record<number, string> = {
  [LM.NOSE]: '鼻',
  [LM.L_EAR]: '左耳',
  [LM.R_EAR]: '右耳',
  [LM.L_SHOULDER]: '左肩',
  [LM.R_SHOULDER]: '右肩',
  [LM.L_ELBOW]: '左肘',
  [LM.R_ELBOW]: '右肘',
  [LM.L_WRIST]: '左手首',
  [LM.R_WRIST]: '右手首',
  [LM.L_PINKY]: '左小指',
  [LM.R_PINKY]: '右小指',
  [LM.L_INDEX]: '左人差し指',
  [LM.R_INDEX]: '右人差し指',
  [LM.L_HIP]: '左股関節',
  [LM.R_HIP]: '右股関節',
  [LM.L_KNEE]: '左膝',
  [LM.R_KNEE]: '右膝',
  [LM.L_ANKLE]: '左足首',
  [LM.R_ANKLE]: '右足首',
  [LM.L_HEEL]: '左かかと',
  [LM.R_HEEL]: '右かかと',
  [LM.L_FOOT]: '左つま先',
  [LM.R_FOOT]: '右つま先',
};

/** 調整できる関節点（描画している点） */
export const EDITABLE_JOINTS: number[] = Object.keys(JOINT_NAMES).map(Number);

export interface ImageWorldFit {
  /** m → px のスケール */
  s: number;
  tx: number;
  ty: number;
}

/** 画像（px）と推定3D座標（m）の対応を最小二乗で求める */
export function fitImageWorld(image: Pt[], world: Pt[], w: number, h: number, minVis = 0.5): ImageWorldFit | null {
  const idx: number[] = [];
  for (let i = 0; i < Math.min(image.length, world.length); i++) if (image[i].v >= minVis) idx.push(i);
  if (idx.length < 4) return null;
  const px = idx.map((i) => image[i].x * w);
  const py = idx.map((i) => image[i].y * h);
  const wx = idx.map((i) => world[i].x);
  const wy = idx.map((i) => world[i].y);
  const m = (a: number[]) => a.reduce((p, q) => p + q, 0) / a.length;
  const [mpx, mpy, mwx, mwy] = [m(px), m(py), m(wx), m(wy)];
  let num = 0;
  let den = 0;
  for (let k = 0; k < idx.length; k++) {
    num += (wx[k] - mwx) * (px[k] - mpx) + (wy[k] - mwy) * (py[k] - mpy);
    den += (wx[k] - mwx) ** 2 + (wy[k] - mwy) ** 2;
  }
  if (den < 1e-9) return null;
  const s = num / den;
  if (!Number.isFinite(s) || s <= 0) return null;
  return { s, tx: mpx - s * mwx, ty: mpy - s * mwy };
}

export function hasEdits(e: JointEdits | undefined): boolean {
  return !!e && Object.keys(e).length > 0;
}

/** 調整を反映したフレームを返す（元のフレームは変更しない） */
export function applyEdits(frame: FrameRecord, edits: JointEdits | undefined, visThr: number): FrameRecord {
  if (!frame.image || !hasEdits(edits)) return frame;
  const image = frame.image.map((p) => ({ ...p }));
  const world = frame.world ? frame.world.map((p) => ({ ...p })) : null;
  const fit = world ? fitImageWorld(frame.image, world, frame.width, frame.height) : null;
  for (const [k, pos] of Object.entries(edits!)) {
    const i = Number(k);
    const before = frame.image[i];
    if (!before) continue;
    image[i] = { ...before, x: pos.x, y: pos.y, v: 1 };
    if (world && fit) {
      const dX = ((pos.x - before.x) * frame.width) / fit.s;
      const dY = ((pos.y - before.y) * frame.height) / fit.s;
      world[i] = { ...world[i], x: world[i].x + dX, y: world[i].y + dY, v: 1 };
    }
  }
  const quality = assessQuality(image, frame.numPoses, visThr);
  return {
    ...frame,
    image,
    world,
    quality,
    angles: computeAngles(world, quality),
    view: quality.detected ? viewDirection(world) : null,
  };
}

/** 保存用の調整内容（関節名・調整前後の位置） */
export function describeEdits(frame: FrameRecord, edits: JointEdits | undefined): { joint: number; name: string; from: JointPos | null; to: JointPos }[] {
  if (!hasEdits(edits)) return [];
  return Object.entries(edits!).map(([k, to]) => {
    const i = Number(k);
    const p = frame.image?.[i];
    return { joint: i, name: JOINT_NAMES[i] ?? `#${i}`, from: p ? { x: p.x, y: p.y } : null, to };
  });
}
