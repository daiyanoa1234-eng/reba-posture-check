/**
 * 推定3D座標（MediaPipe world landmarks）から REBA 用の部位角度を計算する。
 * 定義の詳細は docs/ANGLE_DEFINITIONS.md を参照。
 *
 * 座標系（MediaPipe world landmarks）: 単位 m、原点は左右股関節の中点、
 *   x = 画像の右方向、y = 画像の下方向、z = カメラから遠ざかる方向。
 * 前提: スマホを傾けずに構えて撮影しており、画像の上方向 ≒ 鉛直上方向。
 *   → 鉛直上向き U = (0, -1, 0)
 *
 * ここで出す角度はすべて「推定値」であり、腰椎・頸椎などの関節角度を直接測定したものではない。
 */
import type { FrameQuality } from '../analysis/quality';
import { LM, type Pt, type Side, sideIdx } from '../pose/landmarks';
import { type V3, angleBetween, atan2deg, cross, dot, mid, normalize, projectOnPlane, scale, sub } from './vec';

export const UP: V3 = [0, -1, 0];

export interface UpperArmAngles {
  /** 上腕挙上角: 体幹の下向き軸と上腕のなす3D角（0〜180°） */
  elevation: number;
  /** 矢状面での屈曲(+)/伸展(−)（体幹基準, 参考） */
  sagittal: number;
  /** 前額面での外転(+)/内転(−)（体幹基準, 参考） */
  abduction: number;
  /** 上腕が体幹より後方にあり、後方成分が外側成分より大きい＝伸展として扱う */
  isExtension: boolean;
}

export interface SideValues<T> {
  left: T | null;
  right: T | null;
}

export interface Angles {
  /** 体幹の前傾(+)/後傾(−): 股関節中点→肩中点の線と鉛直線のなす角を矢状面へ投影 */
  trunkFlexion: number | null;
  /** 体幹の側屈（参考, 絶対値で使用） */
  trunkLateral: number | null;
  /** 肩の線と骨盤の線の水平面内のずれ（ねじれの参考） */
  trunkTwist: number | null;
  /** 頭頸部の前傾(+)/後傾(−): 肩中点→耳の線と体幹線のなす角（参考） */
  neckFlexion: number | null;
  upperArm: SideValues<UpperArmAngles>;
  /** 肘屈曲角（伸展位 0°）: 上腕ベクトルと前腕ベクトルのなす角 */
  elbowFlexion: SideValues<number>;
  /** 手首の曲がり（屈曲・伸展・偏位を区別しない参考値） */
  wristBend: SideValues<number>;
  /** 膝屈曲角（伸展位 0°） */
  kneeFlexion: SideValues<number>;
  /** 足関節 背屈(+)/底屈(−)（追加情報。REBAの採点には使わない） */
  ankleDorsiflexion: SideValues<number>;
}

const p3 = (p: Pt): V3 => [p.x, p.y, p.z];

export function emptyAngles(): Angles {
  const sv = () => ({ left: null, right: null });
  return {
    trunkFlexion: null,
    trunkLateral: null,
    trunkTwist: null,
    neckFlexion: null,
    upperArm: sv(),
    elbowFlexion: sv(),
    wristBend: sv(),
    kneeFlexion: sv(),
    ankleDorsiflexion: sv(),
  };
}

interface Frames {
  /** 骨盤の左方向（水平面） */
  Lp: V3;
  /** 骨盤基準の前方向（水平面） */
  Fp: V3;
  /** 体幹上向き（股関節中点→肩中点） */
  Ut: V3;
  /** 胸郭の左方向（体幹軸に直交） */
  Lt: V3;
  /** 胸郭の前方向 */
  Ft: V3;
  trunk: V3;
  midShoulder: V3;
}

function bodyFrames(w: Pt[]): Frames | null {
  const lh = p3(w[LM.L_HIP]);
  const rh = p3(w[LM.R_HIP]);
  const ls = p3(w[LM.L_SHOULDER]);
  const rs = p3(w[LM.R_SHOULDER]);
  const midHip = mid(lh, rh);
  const midShoulder = mid(ls, rs);
  const trunk = sub(midShoulder, midHip);

  const Lp = normalize(projectOnPlane(sub(lh, rh), UP));
  if (!Lp) return null;
  const Fp = normalize(cross(Lp, UP));
  const Ut = normalize(trunk);
  if (!Fp || !Ut) return null;
  const Lt = normalize(projectOnPlane(sub(ls, rs), Ut));
  if (!Lt) return null;
  const Ft = normalize(cross(Lt, Ut));
  if (!Ft) return null;
  return { Lp, Fp, Ut, Lt, Ft, trunk, midShoulder };
}

export function upperArmAngles(w: Pt[], side: Side, f: Frames): UpperArmAngles | null {
  const s = sideIdx(side);
  const A = sub(p3(w[s.elbow]), p3(w[s.shoulder]));
  const D = scale(f.Ut, -1);
  const elevation = angleBetween(A, D);
  if (elevation == null) return null;
  const outward = side === 'left' ? f.Lt : scale(f.Lt, -1);
  const fwd = dot(A, f.Ft);
  const lat = dot(A, outward);
  const down = dot(A, D);
  const sagittal = atan2deg(fwd, down);
  const abduction = atan2deg(lat, down);
  const isExtension = fwd < 0 && Math.abs(fwd) > Math.max(lat, 0);
  return { elevation, sagittal, abduction, isExtension };
}

export function computeAngles(world: Pt[] | null, q: FrameQuality): Angles {
  const out = emptyAngles();
  if (!world || world.length < 33 || !q.detected) return out;
  const f = q.parts.trunk ? bodyFrames(world) : null;

  if (f) {
    out.trunkFlexion = atan2deg(dot(f.trunk, f.Fp), dot(f.trunk, UP));
    out.trunkLateral = atan2deg(dot(f.trunk, f.Lp), dot(f.trunk, UP));
    // 肩の線と骨盤の線を水平面に投影し、鉛直軸まわりの角度差を求める
    const sh = normalize(projectOnPlane(sub(p3(world[LM.L_SHOULDER]), p3(world[LM.R_SHOULDER])), UP));
    if (sh) out.trunkTwist = atan2deg(dot(cross(f.Lp, sh), UP), dot(f.Lp, sh));

    if (q.parts.neck) {
      const le = world[LM.L_EAR];
      const re = world[LM.R_EAR];
      const ear = mid(p3(le), p3(re));
      const H = sub(ear, f.midShoulder);
      out.neckFlexion = atan2deg(dot(H, f.Ft), dot(H, f.Ut));
    }
  }

  for (const side of ['left', 'right'] as Side[]) {
    const s = sideIdx(side);
    if (f && q.parts[`upperArm_${side}`]) out.upperArm[side] = upperArmAngles(world, side, f);
    if (q.parts[`lowerArm_${side}`]) {
      const ua = sub(p3(world[s.elbow]), p3(world[s.shoulder]));
      const fa = sub(p3(world[s.wrist]), p3(world[s.elbow]));
      out.elbowFlexion[side] = angleBetween(ua, fa);
    }
    if (q.parts[`wrist_${side}`]) {
      const fa = sub(p3(world[s.wrist]), p3(world[s.elbow]));
      const hand = sub(mid(p3(world[s.index]), p3(world[s.pinky])), p3(world[s.wrist]));
      out.wristBend[side] = angleBetween(fa, hand);
    }
    if (q.parts[`knee_${side}`]) {
      const thigh = sub(p3(world[s.knee]), p3(world[s.hip]));
      const shank = sub(p3(world[s.ankle]), p3(world[s.knee]));
      out.kneeFlexion[side] = angleBetween(thigh, shank);
    }
    if (q.parts[`ankle_${side}`]) {
      const shankUp = sub(p3(world[s.knee]), p3(world[s.ankle]));
      const foot = sub(p3(world[s.foot]), p3(world[s.heel]));
      const a = angleBetween(shankUp, foot);
      out.ankleDorsiflexion[side] = a == null ? null : 90 - a;
    }
  }
  return out;
}

/** 撮影方向の目安: 骨盤の左右軸がカメラの奥行き方向に近いほど側方撮影 */
export type ViewDirection = 'side' | 'oblique' | 'front';
export function viewDirection(world: Pt[] | null): ViewDirection | null {
  if (!world || world.length < 33) return null;
  const Lp = normalize(projectOnPlane(sub(p3(world[LM.L_HIP]), p3(world[LM.R_HIP])), UP));
  const Ls = normalize(projectOnPlane(sub(p3(world[LM.L_SHOULDER]), p3(world[LM.R_SHOULDER])), UP));
  if (!Lp || !Ls) return null;
  const depth = (Math.abs(Lp[2]) + Math.abs(Ls[2])) / 2; // 0: 正面/背面, 1: 真横
  if (depth > 0.8) return 'side';
  if (depth > 0.4) return 'oblique';
  return 'front';
}

export const VIEW_LABEL: Record<ViewDirection, string> = {
  side: '側方',
  oblique: '斜め',
  front: '正面/背面',
};
