/**
 * 関節点の推定精度を上げるための補助処理（すべて同じ1フレーム内で完結し、時間方向には混ぜない）。
 *
 * 1. 人物領域の切り出し（2段階推定）
 *    1回目の推定で人物の範囲を求め、その周囲を元動画の解像度で切り出して拡大し、もう一度推定する。
 *    人物が画面内で小さく映っている現場動画で、関節点の位置が粗くなるのを防ぐ。
 * 2. 左右反転画像との統合
 *    切り出した画像を左右反転して推定し、左右を入れ替えて元に戻した結果と平均する。
 *    2つの推定が大きく食い違う関節点は「映りが不確か」として visibility を下げ、評価者の確認に回す。
 */
import { LANDMARK_COUNT, LM, type Pt } from './landmarks';

/** 左右反転したときに入れ替わる関節番号 */
export const MIRROR_INDEX: number[] = (() => {
  const m = Array.from({ length: LANDMARK_COUNT }, (_, i) => i);
  const pairs: [number, number][] = [
    [1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20],
    [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32],
  ];
  for (const [a, b] of pairs) {
    m[a] = b;
    m[b] = a;
  }
  return m;
})();

/** 元動画のピクセル座標での正方形の切り出し範囲 */
export interface Roi {
  x: number;
  y: number;
  size: number;
}

/** 1回目の推定結果（画像正規化座標）から、人物を余裕をもって囲む正方形を求める */
export function personRoi(image: Pt[], vw: number, vh: number, marginRatio = 0.22): Roi | null {
  const xs = image.map((p) => p.x * vw);
  const ys = image.map((p) => p.y * vh);
  if (xs.some((v) => !Number.isFinite(v)) || ys.some((v) => !Number.isFinite(v))) return null;
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const side = Math.max(x1 - x0, y1 - y0);
  if (side < 8) return null;
  const size = side * (1 + 2 * marginRatio);
  return { x: (x0 + x1) / 2 - size / 2, y: (y0 + y1) / 2 - size / 2, size };
}

/** 切り出し画像内の正規化座標 → 元フレームの正規化座標 */
export function cropToFrame(pts: Pt[], roi: Roi, vw: number, vh: number): Pt[] {
  return pts.map((p) => ({ ...p, x: (roi.x + p.x * roi.size) / vw, y: (roi.y + p.y * roi.size) / vh }));
}

/** 元フレームの正規化座標 → 切り出し画像内の正規化座標 */
export function frameToCrop(p: { x: number; y: number }, roi: Roi, vw: number, vh: number): { x: number; y: number } {
  return { x: (p.x * vw - roi.x) / roi.size, y: (p.y * vh - roi.y) / roi.size };
}

/** 左右反転画像での推定結果を元の向きに戻す（画像座標: x を反転、左右の番号を入れ替え） */
export function unflipImage(pts: Pt[]): Pt[] {
  return MIRROR_INDEX.map((src) => ({ ...pts[src], x: 1 - pts[src].x }));
}

/** 左右反転画像での推定結果を元の向きに戻す（3D座標: x の符号を反転、左右の番号を入れ替え） */
export function unflipWorld(pts: Pt[]): Pt[] {
  return MIRROR_INDEX.map((src) => ({ ...pts[src], x: -pts[src].x }));
}

const hip = (p: Pt[]) => ({ x: (p[LM.L_HIP].x + p[LM.R_HIP].x) / 2, y: (p[LM.L_HIP].y + p[LM.R_HIP].y) / 2 });

/** 候補の中から、期待する股関節中点に最も近い人物を選ぶ（見つからなければ -1） */
export function nearestPose(poses: Pt[][], expectHip: { x: number; y: number }, maxDist = 0.25): number {
  let best = -1;
  let bestD = Infinity;
  poses.forEach((p, i) => {
    const h = hip(p);
    const d = Math.hypot(h.x - expectHip.x, h.y - expectHip.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return bestD <= maxDist ? best : -1;
}

export function hipCenter(p: Pt[]): { x: number; y: number } {
  return hip(p);
}

/** 体幹の長さ（肩中点〜股関節中点, ピクセル） */
function torsoPx(p: Pt[], w: number, h: number): number {
  const sx = ((p[LM.L_SHOULDER].x + p[LM.R_SHOULDER].x) / 2) * w;
  const sy = ((p[LM.L_SHOULDER].y + p[LM.R_SHOULDER].y) / 2) * h;
  const hx = ((p[LM.L_HIP].x + p[LM.R_HIP].x) / 2) * w;
  const hy = ((p[LM.L_HIP].y + p[LM.R_HIP].y) / 2) * h;
  return Math.hypot(sx - hx, sy - hy);
}

export interface FusionResult {
  image: Pt[];
  world: Pt[];
  /** 2つの推定が一致した関節点の割合 */
  agreement: number;
}

/**
 * 通常画像と左右反転画像の推定を統合する。
 * 一致した点（体幹長の agreeRatio 倍以内）は平均し、食い違う点は通常画像の値を使って visibility を下げる。
 */
export function fusePasses(
  a: { image: Pt[]; world: Pt[] },
  b: { image: Pt[]; world: Pt[] },
  w: number,
  h: number,
  agreeRatio = 0.2,
): FusionResult {
  const tol = Math.max(4, torsoPx(a.image, w, h) * agreeRatio);
  let agree = 0;
  const image: Pt[] = [];
  const world: Pt[] = [];
  for (let i = 0; i < a.image.length; i++) {
    const pa = a.image[i];
    const pb = b.image[i];
    const d = Math.hypot((pa.x - pb.x) * w, (pa.y - pb.y) * h);
    if (d <= tol) {
      agree++;
      image.push({ x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2, z: (pa.z + pb.z) / 2, v: (pa.v + pb.v) / 2 });
      const wa = a.world[i];
      const wb = b.world[i];
      world.push({ x: (wa.x + wb.x) / 2, y: (wa.y + wb.y) / 2, z: (wa.z + wb.z) / 2, v: (wa.v + wb.v) / 2 });
    } else {
      // 同じ画像の向き違いで結果が食い違う点は信頼性が低い → 評価者の確認に回す
      const v = Math.min(pa.v, pb.v) * 0.45; // 初期のしきい値 0.5 では「映りが不確か」扱いになる
      image.push({ ...pa, v });
      world.push({ ...a.world[i], v });
    }
  }
  return { image, world, agreement: agree / Math.max(1, a.image.length) };
}
