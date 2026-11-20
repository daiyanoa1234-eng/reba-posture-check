/**
 * 評価候補の場面の抽出。
 * - 各フレームの推定角度から「姿勢指標」（手動項目を含まない Table C 相当の値）を左右別に計算
 * - 前後のフレームと比べて急変した角度（一瞬の推定エラー）を含むフレームは除外
 * - 前後どちらかのフレームでも同程度の負担が続いている場合のみ候補にする（持続確認）
 * - 採点は常に「選んだ1フレーム」の値だけを使う（部位ごとに別時刻の最大値を集めない）
 */
import type { Angles } from '../angles/angles';
import type { FrameRecord } from '../analysis/types';
import { type Side, SIDES } from '../pose/landmarks';
import {
  kneeAdjustment,
  lowerArmPositionScore,
  neckPositionScore,
  trunkPositionScore,
  upperArmPositionScore,
} from '../reba/rules';
import { lookupA, lookupB, lookupC } from '../reba/tables';

export interface SelectionSettings {
  uprightToleranceDeg: number;
  neckExtensionToleranceDeg: number;
  spikeThresholdDeg: number;
  candidateSeparationSec: number;
}

export interface FrameScore {
  index: number;
  time: number;
  /** 左右別の姿勢指標（Table C 相当, 1〜12） */
  perSide: Record<Side, number | null>;
  postureIndex: number | null;
  /** 並べ替え用の値（Table C を主、Table A+B を従とする合成値）。前後フレームで持続している分だけ */
  sustained: number | null;
  bestSide: Side | null;
  spike: boolean;
  eligible: boolean;
  reason: string | null;
}

/** 候補抽出用の姿勢指標。重量・把持・活動・ねじれ等の手動項目は含まない（REBA スコアではない） */
export function postureIndex(a: Angles, side: Side, s: SelectionSettings): number | null {
  return postureDetail(a, side, s)?.c ?? null;
}

/**
 * 姿勢指標の内訳。体幹が推定できることを必須とし、推定できなかった部位は最小区分として扱う
 * （候補の並べ替え専用。採点ではその部位は「要確認」として評価者が入力する）。
 * Table C は低負担域で同点になりやすいため、並べ替えには Table A+B と推定できた部位数も使う。
 */
export function postureDetail(
  a: Angles,
  side: Side,
  s: SelectionSettings,
): { c: number; ab: number; rank: number; complete: boolean } | null {
  if (a.trunkFlexion == null) return null;
  const ua = a.upperArm[side];
  const el = a.elbowFlexion[side];
  const knees = [a.kneeFlexion.left, a.kneeFlexion.right].filter((v): v is number => v != null);
  const trunk = trunkPositionScore(a.trunkFlexion, s.uprightToleranceDeg);
  const neck = a.neckFlexion != null ? neckPositionScore(a.neckFlexion, s.neckExtensionToleranceDeg) : 1;
  const legs = 1 + (knees.length ? kneeAdjustment(Math.max(...knees)) : 0);
  const A = lookupA(trunk, neck, legs);
  const B = lookupB(ua ? upperArmPositionScore(ua) : 1, el != null ? lowerArmPositionScore(el) : 1, 1);
  const c = lookupC(A, B);
  const found = (ua ? 1 : 0) + (el != null ? 1 : 0) + (knees.length ? 1 : 0);
  return { c, ab: A + B, rank: c * 1000 + (A + B) * 10 + found, complete: found === 3 };
}

type Series = (a: Angles) => number | null;
const SERIES: Series[] = [
  (a) => a.trunkFlexion,
  (a) => a.upperArm.left?.elevation ?? null,
  (a) => a.upperArm.right?.elevation ?? null,
  (a) => a.elbowFlexion.left,
  (a) => a.elbowFlexion.right,
  (a) => a.kneeFlexion.left,
  (a) => a.kneeFlexion.right,
];

/** 前後2フレームが互いに近いのに、そのフレームだけが大きく外れている角度があるか */
export function isSpike(prev: Angles | null, cur: Angles, next: Angles | null, thr: number): boolean {
  if (!prev || !next) return false;
  return SERIES.some((f) => {
    const p = f(prev);
    const c = f(cur);
    const n = f(next);
    if (p == null || c == null || n == null) return false;
    return Math.abs(c - p) > thr && Math.abs(c - n) > thr && Math.abs(p - n) < thr;
  });
}

export function scoreFrames(frames: FrameRecord[], s: SelectionSettings): FrameScore[] {
  const base = frames.map((f, i) => {
    const prev = i > 0 && frames[i - 1].quality.detected ? frames[i - 1].angles : null;
    const next = i < frames.length - 1 && frames[i + 1].quality.detected ? frames[i + 1].angles : null;
    const spike = f.quality.detected && isSpike(prev, f.angles, next, s.spikeThresholdDeg);
    const detail = (sd: Side) => (f.quality.detected ? postureDetail(f.angles, sd, s) : null);
    const dl = detail('left');
    const dr = detail('right');
    const perSide: Record<Side, number | null> = { left: dl?.c ?? null, right: dr?.c ?? null };
    const rank: Record<Side, number | null> = { left: dl?.rank ?? null, right: dr?.rank ?? null };
    return { f, spike, perSide, rank };
  });

  return base.map(({ f, spike, perSide, rank }, i) => {
    const vals = SIDES.map((sd) => perSide[sd]).filter((v): v is number => v != null);
    const postureIdx = vals.length ? Math.max(...vals) : null;
    const out: FrameScore = {
      index: f.index,
      time: f.time,
      perSide,
      postureIndex: postureIdx,
      sustained: null,
      bestSide: null,
      spike,
      eligible: false,
      reason: null,
    };
    if (!f.quality.detected) return { ...out, reason: '人物を検出できません' };
    if (f.quality.multiplePeople) return { ...out, reason: '複数人が映っています' };
    if (!f.quality.fullBody) return { ...out, reason: '全身が映っていません' };
    if (spike) return { ...out, reason: '前後と比べて角度が急変（推定の乱れの可能性）' };
    if (postureIdx == null) return { ...out, reason: '必要な関節点が確認できません' };

    let best: { side: Side; sus: number; raw: number } | null = null;
    for (const sd of SIDES) {
      const own = rank[sd];
      if (own == null) continue;
      const neigh = [i - 1, i + 1]
        .filter((j) => j >= 0 && j < base.length)
        .map((j) => base[j])
        .filter((b) => b.f.quality.detected && !b.spike && b.rank[sd] != null)
        .map((b) => b.rank[sd]!);
      if (neigh.length === 0) continue;
      const sus = Math.min(own, Math.max(...neigh));
      if (!best || sus > best.sus || (sus === best.sus && own > best.raw)) best = { side: sd, sus, raw: own };
    }
    if (!best) return { ...out, reason: '前後のフレームで同じ姿勢を確認できません' };
    return { ...out, eligible: true, sustained: best.sus, bestSide: best.side };
  });
}

export function pickCandidates(scores: FrameScore[], count: number, minSeparationSec: number): FrameScore[] {
  const sorted = scores
    .filter((x) => x.eligible)
    .sort((a, b) => b.sustained! - a.sustained! || b.postureIndex! - a.postureIndex! || a.time - b.time);
  const picked: FrameScore[] = [];
  for (const c of sorted) {
    if (picked.length >= count) break;
    if (picked.every((p) => Math.abs(p.time - c.time) >= minSeparationSec - 1e-9)) picked.push(c);
  }
  return picked;
}
