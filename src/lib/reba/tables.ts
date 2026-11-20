/**
 * REBA 採点表（Hignett S, McAtamney L. Rapid Entire Body Assessment (REBA).
 * Applied Ergonomics 2000;31:201-205）。
 *
 * 照合した資料（README「REBA の出典と実装ルール」参照）:
 *  - A. Hedge, Cornell University "REBA" 講義資料 (2001)
 *  - Ergonomics Plus "REBA Employee Assessment Worksheet"（A. Hedge 作成ワークシート準拠）
 *  - INSST(スペイン) NTP 601 (2001)
 * Table A・Table C は上記資料間で一致。Table B の [上腕1, 前腕1, 手首3] は
 * Ergonomics Plus と NTP 601 が 2、Cornell 講義資料のスライドが 3 と食い違うため、
 * 多数の資料に合わせて 2 を採用している（原著本文での最終確認は未了）。
 */

/** TABLE_A[trunk-1][neck-1][legs-1]  trunk 1..5, neck 1..3, legs 1..4 */
export const TABLE_A: number[][][] = [
  [[1, 2, 3, 4], [1, 2, 3, 4], [3, 3, 5, 6]],
  [[2, 3, 4, 5], [3, 4, 5, 6], [4, 5, 6, 7]],
  [[2, 4, 5, 6], [4, 5, 6, 7], [5, 6, 7, 8]],
  [[3, 5, 6, 7], [5, 6, 7, 8], [6, 7, 8, 9]],
  [[4, 6, 7, 8], [6, 7, 8, 9], [7, 8, 9, 9]],
];

/** TABLE_B[upperArm-1][lowerArm-1][wrist-1]  upperArm 1..6, lowerArm 1..2, wrist 1..3 */
export const TABLE_B: number[][][] = [
  [[1, 2, 2], [1, 2, 3]],
  [[1, 2, 3], [2, 3, 4]],
  [[3, 4, 5], [4, 5, 5]],
  [[4, 5, 5], [5, 6, 7]],
  [[6, 7, 8], [7, 8, 8]],
  [[7, 8, 8], [8, 9, 9]],
];

/** TABLE_C[scoreA-1][scoreB-1]  scoreA 1..12, scoreB 1..12 */
export const TABLE_C: number[][] = [
  [1, 1, 1, 2, 3, 3, 4, 5, 6, 7, 7, 7],
  [1, 2, 2, 3, 4, 4, 5, 6, 6, 7, 7, 8],
  [2, 3, 3, 3, 4, 5, 6, 7, 7, 8, 8, 8],
  [3, 4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9],
  [4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9, 9],
  [6, 6, 6, 7, 8, 8, 9, 9, 10, 10, 10, 10],
  [7, 7, 7, 8, 9, 9, 9, 10, 10, 11, 11, 11],
  [8, 8, 8, 9, 10, 10, 10, 10, 10, 11, 11, 11],
  [9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 12],
  [10, 10, 10, 11, 11, 11, 11, 12, 12, 12, 12, 12],
  [11, 11, 11, 11, 12, 12, 12, 12, 12, 12, 12, 12],
  [12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12],
];

const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

function check(name: string, v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v) || v < lo || v > hi) throw new RangeError(`${name}=${v} は ${lo}〜${hi} の範囲外です`);
  return clampInt(v, lo, hi);
}

export function lookupA(trunk: number, neck: number, legs: number): number {
  return TABLE_A[check('trunk', trunk, 1, 5) - 1][check('neck', neck, 1, 3) - 1][check('legs', legs, 1, 4) - 1];
}

export function lookupB(upperArm: number, lowerArm: number, wrist: number): number {
  return TABLE_B[check('upperArm', upperArm, 1, 6) - 1][check('lowerArm', lowerArm, 1, 2) - 1][check('wrist', wrist, 1, 3) - 1];
}

export function lookupC(scoreA: number, scoreB: number): number {
  return TABLE_C[check('scoreA', scoreA, 1, 12) - 1][check('scoreB', scoreB, 1, 12) - 1];
}
