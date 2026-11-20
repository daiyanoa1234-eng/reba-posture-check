/**
 * 模擬（合成）の骨格を作る。単体テストと「模擬データ」表示専用であり、実測データではない。
 * 座標系は MediaPipe world landmarks と同じ（m, x右, y下, z奥, 原点=股関節中点）。
 */
import { LANDMARK_COUNT, LM, type Pt, type Side } from '../pose/landmarks';
import { type V3, add, cross, dot, normalize, projectOnPlane, scale, sub } from '../angles/vec';

export interface ArmParams {
  /** 矢状面の屈曲(+)/伸展(−)（体幹基準, 度） */
  flexion: number;
  /** 外転（度） */
  abduction: number;
  /** 肘屈曲（度） */
  elbow: number;
  /** 手首の曲がり（度） */
  wrist: number;
}

export interface LegParams {
  /** 股関節屈曲（太ももの前方への傾き, 度） */
  hip: number;
  /** 膝屈曲（度） */
  knee: number;
}

export interface SynthParams {
  facing: 'right' | 'left' | 'camera' | 'away';
  trunkFlexion: number;
  trunkLateral: number;
  neckFlexion: number;
  arms: Record<Side, ArmParams>;
  legs: Record<Side, LegParams>;
}

export const NEUTRAL: SynthParams = {
  facing: 'right',
  trunkFlexion: 0,
  trunkLateral: 0,
  neckFlexion: 0,
  arms: {
    left: { flexion: 0, abduction: 0, elbow: 10, wrist: 0 },
    right: { flexion: 0, abduction: 0, elbow: 10, wrist: 0 },
  },
  legs: { left: { hip: 0, knee: 0 }, right: { hip: 0, knee: 0 } },
};

const D2R = Math.PI / 180;
const rot = (a: V3, b: V3, deg: number): V3 => add(scale(a, Math.cos(deg * D2R)), scale(b, Math.sin(deg * D2R)));
const must = (v: V3 | null, fallback: V3): V3 => v ?? fallback;

function basis(facing: SynthParams['facing']): { f: V3; u: V3; l: V3 } {
  const u: V3 = [0, -1, 0];
  const f: V3 =
    facing === 'right' ? [1, 0, 0] : facing === 'left' ? [-1, 0, 0] : facing === 'camera' ? [0, 0, -1] : [0, 0, 1];
  // F = L × U を満たす L（本人の左方向）
  const l = must(normalize(cross(u, f)), [1, 0, 0]);
  return { f, u, l };
}

export function synthWorld(p: SynthParams): Pt[] {
  const { f, u, l } = basis(p.facing);
  const pts: V3[] = Array.from({ length: LANDMARK_COUNT }, () => [0, 0, 0] as V3);
  const O: V3 = [0, 0, 0];
  pts[LM.L_HIP] = add(O, scale(l, 0.1));
  pts[LM.R_HIP] = add(O, scale(l, -0.1));

  // 体幹
  let t = rot(u, f, p.trunkFlexion);
  t = must(normalize(rot(t, l, p.trunkLateral)), u);
  const S = add(O, scale(t, 0.5));
  const lt = must(normalize(projectOnPlane(l, t)), l);
  const ft = must(normalize(cross(lt, t)), f);
  pts[LM.L_SHOULDER] = add(S, scale(lt, 0.18));
  pts[LM.R_SHOULDER] = add(S, scale(lt, -0.18));

  // 頭部
  const n = rot(t, ft, p.neckFlexion);
  const E = add(S, scale(n, 0.25));
  pts[LM.L_EAR] = add(E, scale(lt, 0.07));
  pts[LM.R_EAR] = add(E, scale(lt, -0.07));
  const nose = add(add(E, scale(n, 0.02)), scale(ft, 0.1));
  pts[LM.NOSE] = nose;
  for (const [i, s] of [[1, 1], [2, 1], [3, 1], [4, -1], [5, -1], [6, -1]] as const) {
    pts[i] = add(add(nose, scale(n, 0.03)), add(scale(lt, s * 0.035), scale(ft, -0.02)));
  }
  pts[LM.MOUTH_L] = add(add(nose, scale(n, -0.04)), scale(lt, 0.025));
  pts[LM.MOUTH_R] = add(add(nose, scale(n, -0.04)), scale(lt, -0.025));

  for (const side of ['left', 'right'] as Side[]) {
    const sgn = side === 'left' ? 1 : -1;
    const out = scale(lt, sgn);
    const a = p.arms[side];
    const sh = side === 'left' ? pts[LM.L_SHOULDER] : pts[LM.R_SHOULDER];
    const down = scale(t, -1);
    const armDir = must(normalize(rot(must(normalize(rot(down, ft, a.flexion)), down), out, a.abduction)), down);
    const elbow = add(sh, scale(armDir, 0.3));
    const bend = normalize(projectOnPlane(ft, armDir)) ?? must(normalize(projectOnPlane(t, armDir)), ft);
    const fa = must(normalize(rot(armDir, bend, a.elbow)), armDir);
    const wrist = add(elbow, scale(fa, 0.27));
    const perpHand = must(normalize(cross(fa, out)), bend);
    const h = must(normalize(rot(fa, perpHand, a.wrist)), fa);
    const handSide = must(normalize(cross(h, perpHand)), out);
    const idx = side === 'left' ? LM.L_ELBOW : LM.R_ELBOW;
    pts[idx] = elbow;
    pts[idx + 2] = wrist;
    pts[idx + 4] = add(add(wrist, scale(h, 0.08)), scale(handSide, -0.02)); // pinky
    pts[idx + 6] = add(add(wrist, scale(h, 0.09)), scale(handSide, 0.02)); // index
    pts[idx + 8] = add(add(wrist, scale(h, 0.04)), scale(handSide, 0.04)); // thumb

    const lg = p.legs[side];
    const hip = side === 'left' ? pts[LM.L_HIP] : pts[LM.R_HIP];
    const thigh = rot(scale(u, -1), f, lg.hip);
    const knee = add(hip, scale(thigh, 0.42));
    const back = must(normalize(projectOnPlane(scale(f, -1), thigh)), scale(f, -1));
    const shank = must(normalize(rot(thigh, back, lg.knee)), thigh);
    const ankle = add(knee, scale(shank, 0.42));
    const kIdx = side === 'left' ? LM.L_KNEE : LM.R_KNEE;
    pts[kIdx] = knee;
    pts[kIdx + 2] = ankle;
    const dn = scale(u, -1);
    pts[kIdx + 4] = add(add(ankle, scale(dn, 0.06)), scale(f, -0.05)); // heel
    pts[kIdx + 6] = add(add(ankle, scale(dn, 0.06)), scale(f, 0.14)); // foot index
  }
  return pts.map((q) => ({ x: q[0], y: q[1], z: q[2], v: 0.99 }));
}

/** world 座標を正射影で画像正規化座標へ（模擬表示用） */
export function projectToImage(world: Pt[], cx = 0.5, cy = 0.5, s = 0.42): Pt[] {
  return world.map((q) => ({ x: cx + q.x * s, y: cy + q.y * s, z: q.z, v: q.v }));
}

export function dist(a: V3, b: V3): number {
  const d = sub(a, b);
  return Math.sqrt(dot(d, d));
}
