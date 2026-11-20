export type V3 = readonly [number, number, number];

export const v3 = (x: number, y: number, z: number): V3 => [x, y, z];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const mid = (a: V3, b: V3): V3 => scale(add(a, b), 0.5);

const EPS = 1e-9;

/** 長さ0に近いベクトルは方向が定まらないため null を返す */
export function normalize(a: V3): V3 | null {
  const l = length(a);
  return l < EPS ? null : scale(a, 1 / l);
}

/** n（単位ベクトル）に垂直な平面へ射影 */
export function projectOnPlane(a: V3, n: V3): V3 {
  return sub(a, scale(n, dot(a, n)));
}

export const RAD2DEG = 180 / Math.PI;

/** 2ベクトルのなす角（0〜180°）。どちらかが長さ0なら null */
export function angleBetween(a: V3, b: V3): number | null {
  const la = length(a);
  const lb = length(b);
  if (la < EPS || lb < EPS) return null;
  const c = Math.min(1, Math.max(-1, dot(a, b) / (la * lb)));
  return Math.acos(c) * RAD2DEG;
}

/** 2成分から符号付き角度（度）。atan2(y, x) */
export const atan2deg = (y: number, x: number): number => Math.atan2(y, x) * RAD2DEG;
