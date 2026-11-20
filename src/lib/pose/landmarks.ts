/** MediaPipe Pose Landmarker の33点のうち本アプリで使う番号 */
export const LM = {
  NOSE: 0,
  L_EYE: 2,
  R_EYE: 5,
  L_EAR: 7,
  R_EAR: 8,
  MOUTH_L: 9,
  MOUTH_R: 10,
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_ELBOW: 13,
  R_ELBOW: 14,
  L_WRIST: 15,
  R_WRIST: 16,
  L_PINKY: 17,
  R_PINKY: 18,
  L_INDEX: 19,
  R_INDEX: 20,
  L_THUMB: 21,
  R_THUMB: 22,
  L_HIP: 23,
  R_HIP: 24,
  L_KNEE: 25,
  R_KNEE: 26,
  L_ANKLE: 27,
  R_ANKLE: 28,
  L_HEEL: 29,
  R_HEEL: 30,
  L_FOOT: 31,
  R_FOOT: 32,
} as const;

export const LANDMARK_COUNT = 33;

/** 1点の座標。image: 画像正規化座標(0..1)、world: 推定3D座標(m, 股関節中点が原点) */
export interface Pt {
  x: number;
  y: number;
  z: number;
  /** MediaPipe の visibility（映っている見込み）。測定精度ではない */
  v: number;
}

export type Side = 'left' | 'right';
export const SIDES: Side[] = ['left', 'right'];
export const sideLabel = (s: Side): string => (s === 'left' ? '左' : '右');

/** 左右別の関節番号 */
export function sideIdx(side: Side) {
  const l = side === 'left';
  return {
    shoulder: l ? LM.L_SHOULDER : LM.R_SHOULDER,
    elbow: l ? LM.L_ELBOW : LM.R_ELBOW,
    wrist: l ? LM.L_WRIST : LM.R_WRIST,
    pinky: l ? LM.L_PINKY : LM.R_PINKY,
    index: l ? LM.L_INDEX : LM.R_INDEX,
    hip: l ? LM.L_HIP : LM.R_HIP,
    knee: l ? LM.L_KNEE : LM.R_KNEE,
    ankle: l ? LM.L_ANKLE : LM.R_ANKLE,
    heel: l ? LM.L_HEEL : LM.R_HEEL,
    foot: l ? LM.L_FOOT : LM.R_FOOT,
    ear: l ? LM.L_EAR : LM.R_EAR,
  };
}

/** 骨格線（描画用）。頭部は顔の一部のみ */
export const BONES: ReadonlyArray<readonly [number, number]> = [
  [LM.L_SHOULDER, LM.R_SHOULDER],
  [LM.L_SHOULDER, LM.L_ELBOW],
  [LM.L_ELBOW, LM.L_WRIST],
  [LM.R_SHOULDER, LM.R_ELBOW],
  [LM.R_ELBOW, LM.R_WRIST],
  [LM.L_WRIST, LM.L_INDEX],
  [LM.L_WRIST, LM.L_PINKY],
  [LM.L_INDEX, LM.L_PINKY],
  [LM.R_WRIST, LM.R_INDEX],
  [LM.R_WRIST, LM.R_PINKY],
  [LM.R_INDEX, LM.R_PINKY],
  [LM.L_SHOULDER, LM.L_HIP],
  [LM.R_SHOULDER, LM.R_HIP],
  [LM.L_HIP, LM.R_HIP],
  [LM.L_HIP, LM.L_KNEE],
  [LM.L_KNEE, LM.L_ANKLE],
  [LM.R_HIP, LM.R_KNEE],
  [LM.R_KNEE, LM.R_ANKLE],
  [LM.L_ANKLE, LM.L_HEEL],
  [LM.L_HEEL, LM.L_FOOT],
  [LM.L_ANKLE, LM.L_FOOT],
  [LM.R_ANKLE, LM.R_HEEL],
  [LM.R_HEEL, LM.R_FOOT],
  [LM.R_ANKLE, LM.R_FOOT],
  [LM.NOSE, LM.L_EYE],
  [LM.NOSE, LM.R_EYE],
  [LM.L_EYE, LM.L_EAR],
  [LM.R_EYE, LM.R_EAR],
];

/** 骨の左右（色分け用）。center は体幹中央・頭部 */
export function boneSide(a: number, b: number): Side | 'center' {
  const isL = (i: number) => i > 10 && i % 2 === 1;
  const isR = (i: number) => i > 10 && i % 2 === 0;
  if (isL(a) && isL(b)) return 'left';
  if (isR(a) && isR(b)) return 'right';
  return 'center';
}

/** 描画する関節点（顔の細かい点は除く） */
export const DRAW_POINTS: number[] = [
  LM.NOSE, LM.L_EAR, LM.R_EAR,
  LM.L_SHOULDER, LM.R_SHOULDER, LM.L_ELBOW, LM.R_ELBOW, LM.L_WRIST, LM.R_WRIST,
  LM.L_INDEX, LM.R_INDEX, LM.L_PINKY, LM.R_PINKY,
  LM.L_HIP, LM.R_HIP, LM.L_KNEE, LM.R_KNEE, LM.L_ANKLE, LM.R_ANKLE,
  LM.L_HEEL, LM.R_HEEL, LM.L_FOOT, LM.R_FOOT,
];

const FACE_LEFT = new Set([1, 2, 3, 7, 9]);

export function pointSide(i: number): Side | 'center' {
  if (i === 0) return 'center';
  if (i <= 10) return FACE_LEFT.has(i) ? 'left' : 'right';
  return i % 2 === 1 ? 'left' : 'right';
}
