/**
 * REBA 採点（Hignett & McAtamney 2000）。
 *  体幹・頸部・脚 → Table A → +重量/力 = Score A
 *  上腕・前腕・手首 → Table B → +把持 = Score B
 *  Table C(Score A, Score B) + 活動スコア = REBA スコア
 *
 * 未確認項目がある場合は、その項目が取りうる全選択肢を考慮した最小〜最大の範囲を返す（仮評価）。
 * Table A/B/C は各軸で単調非減少（テストで確認）なので、部位スコアの最小・最大を通せば全体の範囲になる。
 */
import { ITEM_KEYS, ITEMS, type ItemKey, type ItemValues, pointsOf } from './items';
import { lookupA, lookupB, lookupC } from './tables';

export interface Range {
  min: number;
  max: number;
}

export interface RebaResult {
  /** 全項目が確認済み（手動 or 自動） */
  complete: boolean;
  unknown: ItemKey[];
  trunk: Range;
  neck: Range;
  legs: Range;
  tableA: Range;
  loadForce: Range;
  scoreA: Range;
  upperArm: Range;
  lowerArm: Range;
  wrist: Range;
  tableB: Range;
  coupling: Range;
  scoreB: Range;
  tableC: Range;
  activity: Range;
  reba: Range;
}

type Pts = Partial<Record<ItemKey, number>>;

/** 指定項目のうち未確認のものを全選択肢で列挙し、f の最小・最大を求める */
function componentRange(values: ItemValues, keys: ItemKey[], f: (p: Pts, v: ItemValues) => number): Range {
  const known: Pts = {};
  const unknownKeys: ItemKey[] = [];
  for (const k of keys) {
    const p = pointsOf(k, values[k]);
    if (p == null) unknownKeys.push(k);
    else known[k] = p;
  }
  let min = Infinity;
  let max = -Infinity;
  const rec = (i: number, pts: Pts, vals: ItemValues) => {
    if (i === unknownKeys.length) {
      const r = f(pts, vals);
      if (r < min) min = r;
      if (r > max) max = r;
      return;
    }
    const k = unknownKeys[i];
    for (const o of ITEMS[k].options) rec(i + 1, { ...pts, [k]: o.points }, { ...vals, [k]: o.id });
  };
  rec(0, known, values);
  return { min, max };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function legsScore(legSupportId: string | undefined, legBase: number, kneeAdj: number): number {
  // 原著注記: 膝 60°超の +2 は座位には適用しない (n.b. Not for sitting)
  const adj = legSupportId === 'sitting' && kneeAdj === 2 ? 0 : kneeAdj;
  return legBase + adj;
}

export function computeReba(values: ItemValues): RebaResult {
  const unknown = ITEM_KEYS.filter((k) => pointsOf(k, values[k]) == null);

  const trunk = componentRange(values, ['trunkPos', 'trunkTwistSide'], (p) => p.trunkPos! + p.trunkTwistSide!);
  const neck = componentRange(values, ['neckPos', 'neckTwistSide'], (p) => p.neckPos! + p.neckTwistSide!);
  const legs = componentRange(values, ['legSupport', 'kneeAdj'], (p, v) => legsScore(v.legSupport, p.legSupport!, p.kneeAdj!));
  const loadForce = componentRange(values, ['load', 'shock'], (p) => p.load! + p.shock!);
  const upperArm = componentRange(
    values,
    ['upperArmPos', 'upperArmAbdRot', 'shoulderRaised', 'armSupported'],
    // 支持による −1 で 0 以下にならないよう最小 1 に制限（Table B の範囲）
    (p) => clamp(p.upperArmPos! + p.upperArmAbdRot! + p.shoulderRaised! + p.armSupported!, 1, 6),
  );
  const lowerArm = componentRange(values, ['lowerArmPos'], (p) => p.lowerArmPos!);
  const wrist = componentRange(values, ['wristPos', 'wristDevTwist'], (p) => p.wristPos! + p.wristDevTwist!);
  const coupling = componentRange(values, ['coupling'], (p) => p.coupling!);
  const activity = componentRange(values, ['actStatic', 'actRepeated', 'actRapid'], (p) => p.actStatic! + p.actRepeated! + p.actRapid!);

  const tableA = { min: lookupA(trunk.min, neck.min, legs.min), max: lookupA(trunk.max, neck.max, legs.max) };
  const scoreA = { min: tableA.min + loadForce.min, max: tableA.max + loadForce.max };
  const tableB = {
    min: lookupB(upperArm.min, lowerArm.min, wrist.min),
    max: lookupB(upperArm.max, lowerArm.max, wrist.max),
  };
  const scoreB = { min: tableB.min + coupling.min, max: tableB.max + coupling.max };
  const tableC = { min: lookupC(scoreA.min, scoreB.min), max: lookupC(scoreA.max, scoreB.max) };
  const reba = { min: tableC.min + activity.min, max: tableC.max + activity.max };

  return {
    complete: unknown.length === 0,
    unknown,
    trunk,
    neck,
    legs,
    tableA,
    loadForce,
    scoreA,
    upperArm,
    lowerArm,
    wrist,
    tableB,
    coupling,
    scoreB,
    tableC,
    activity,
    reba,
  };
}

export const rangeText = (r: Range): string => (r.min === r.max ? `${r.min}` : `${r.min}〜${r.max}`);

export interface RiskInfo {
  /** REBA action level 0〜4 */
  actionLevel: 0 | 1 | 2 | 3 | 4;
  /** リスク区分（日本語） */
  label: string;
  /** 原著の英語表記 */
  en: string;
  /** 対応（詳細な評価を含む） */
  action: string;
}

export const RISK_TABLE: RiskInfo[] = [
  { actionLevel: 0, label: '無視できる', en: 'Negligible', action: '対応不要' },
  { actionLevel: 1, label: '低い', en: 'Low', action: '対応が必要な場合がある' },
  { actionLevel: 2, label: '中程度', en: 'Medium', action: '対応が必要' },
  { actionLevel: 3, label: '高い', en: 'High', action: '早期の対応が必要' },
  { actionLevel: 4, label: '非常に高い', en: 'Very high', action: '直ちに対応が必要' },
];

/** REBA スコア → リスク区分（1 / 2–3 / 4–7 / 8–10 / 11–15） */
export function riskOf(score: number): RiskInfo {
  if (!Number.isFinite(score) || score < 1) throw new RangeError(`REBA score ${score} is invalid`);
  if (score === 1) return RISK_TABLE[0];
  if (score <= 3) return RISK_TABLE[1];
  if (score <= 7) return RISK_TABLE[2];
  if (score <= 10) return RISK_TABLE[3];
  return RISK_TABLE[4];
}

export type AssessmentStatus = 'final' | 'provisional';

/** 確定条件: 全項目が確認済み かつ 評価者が推定姿勢を確認した */
export function statusOf(result: RebaResult, postureConfirmed: boolean): AssessmentStatus {
  return result.complete && postureConfirmed ? 'final' : 'provisional';
}
