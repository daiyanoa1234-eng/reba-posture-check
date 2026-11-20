import { describe, expect, it } from 'vitest';
import { ITEM_KEYS, ITEMS, type ItemValues, effectiveValues, resolveItem } from './items';
import { computeReba, riskOf, statusOf } from './scoring';
import { TABLE_A, TABLE_B, TABLE_C, lookupA, lookupB, lookupC } from './tables';

/** 全項目を最小負担の選択肢で埋めた値 */
const ALL_LOW: ItemValues = {
  trunkPos: '1',
  trunkTwistSide: 'no',
  neckPos: '1',
  neckTwistSide: 'no',
  legSupport: 'bilateral',
  kneeAdj: '0',
  load: 'lt5',
  shock: 'no',
  upperArmPos: '1',
  upperArmAbdRot: 'no',
  shoulderRaised: 'no',
  armSupported: 'no',
  lowerArmPos: '1',
  wristPos: '1',
  wristDevTwist: 'no',
  coupling: 'good',
  actStatic: 'no',
  actRepeated: 'no',
  actRapid: 'no',
};

describe('REBA 採点表（Hignett & McAtamney 2000 / Hedge ワークシートと照合）', () => {
  it('Table A の全セル', () => {
    // [trunk][neck][legs]
    expect(TABLE_A).toEqual([
      [[1, 2, 3, 4], [1, 2, 3, 4], [3, 3, 5, 6]],
      [[2, 3, 4, 5], [3, 4, 5, 6], [4, 5, 6, 7]],
      [[2, 4, 5, 6], [4, 5, 6, 7], [5, 6, 7, 8]],
      [[3, 5, 6, 7], [5, 6, 7, 8], [6, 7, 8, 9]],
      [[4, 6, 7, 8], [6, 7, 8, 9], [7, 8, 9, 9]],
    ]);
  });

  it('Table B の全セル', () => {
    expect(TABLE_B).toEqual([
      [[1, 2, 2], [1, 2, 3]],
      [[1, 2, 3], [2, 3, 4]],
      [[3, 4, 5], [4, 5, 5]],
      [[4, 5, 5], [5, 6, 7]],
      [[6, 7, 8], [7, 8, 8]],
      [[7, 8, 8], [8, 9, 9]],
    ]);
  });

  it('Table C の全セル（12×12）', () => {
    expect(TABLE_C).toHaveLength(12);
    for (const row of TABLE_C) expect(row).toHaveLength(12);
    expect(TABLE_C[0]).toEqual([1, 1, 1, 2, 3, 3, 4, 5, 6, 7, 7, 7]);
    expect(TABLE_C[5]).toEqual([6, 6, 6, 7, 8, 8, 9, 9, 10, 10, 10, 10]);
    expect(TABLE_C[7]).toEqual([8, 8, 8, 9, 10, 10, 10, 10, 10, 11, 11, 11]);
    expect(TABLE_C[11]).toEqual(Array(12).fill(12));
  });

  it('各表は軸ごとに単調非減少（仮評価の範囲計算の前提）', () => {
    for (let t = 0; t < 5; t++)
      for (let n = 0; n < 3; n++)
        for (let l = 0; l < 4; l++) {
          if (t < 4) expect(TABLE_A[t + 1][n][l]).toBeGreaterThanOrEqual(TABLE_A[t][n][l]);
          if (n < 2) expect(TABLE_A[t][n + 1][l]).toBeGreaterThanOrEqual(TABLE_A[t][n][l]);
          if (l < 3) expect(TABLE_A[t][n][l + 1]).toBeGreaterThanOrEqual(TABLE_A[t][n][l]);
        }
    for (let u = 0; u < 6; u++)
      for (let lo = 0; lo < 2; lo++)
        for (let w = 0; w < 3; w++) {
          if (u < 5) expect(TABLE_B[u + 1][lo][w]).toBeGreaterThanOrEqual(TABLE_B[u][lo][w]);
          if (lo < 1) expect(TABLE_B[u][lo + 1][w]).toBeGreaterThanOrEqual(TABLE_B[u][lo][w]);
          if (w < 2) expect(TABLE_B[u][lo][w + 1]).toBeGreaterThanOrEqual(TABLE_B[u][lo][w]);
        }
    for (let a = 0; a < 12; a++)
      for (let b = 0; b < 12; b++) {
        if (a < 11) expect(TABLE_C[a + 1][b]).toBeGreaterThanOrEqual(TABLE_C[a][b]);
        if (b < 11) expect(TABLE_C[a][b + 1]).toBeGreaterThanOrEqual(TABLE_C[a][b]);
      }
  });

  it('範囲外の値は例外にする（勝手に丸めない）', () => {
    expect(() => lookupA(6, 1, 1)).toThrow(RangeError);
    expect(() => lookupA(1, 0, 1)).toThrow(RangeError);
    expect(() => lookupB(7, 1, 1)).toThrow(RangeError);
    expect(() => lookupC(13, 1)).toThrow(RangeError);
    expect(() => lookupC(1, NaN)).toThrow(RangeError);
  });

  it('ワークシート記載の計算例（Ergonomics Plus ガイド: Table A=2, B=9, C=8）と一致', () => {
    expect(lookupA(3, 1, 1)).toBe(2);
    expect(lookupB(6, 2, 3)).toBe(9);
    expect(lookupC(3, 10)).toBe(8);
  });
});

describe('REBA 総合スコア', () => {
  it('全項目が最小なら REBA 1（無視できる）', () => {
    const r = computeReba(ALL_LOW);
    expect(r.complete).toBe(true);
    expect(r.reba).toEqual({ min: 1, max: 1 });
    expect(riskOf(r.reba.min).label).toBe('無視できる');
  });

  it('典型例: 前屈40°+膝45°+5〜10kg / 上腕60° 前腕50° 手首20° 把持普通 / 反復あり', () => {
    const v: ItemValues = {
      ...ALL_LOW,
      trunkPos: '3', // 20–60°
      neckPos: '2',
      kneeAdj: '1',
      load: '5to10',
      upperArmPos: '3',
      lowerArmPos: '2',
      wristPos: '2',
      coupling: 'fair',
      actRepeated: 'yes',
    };
    const r = computeReba(v);
    // Table A: trunk3 neck2 legs2 → 5, +load1 = 6
    expect(r.tableA.min).toBe(5);
    expect(r.scoreA.min).toBe(6);
    // Table B: UA3 LA2 W2 → 5, +coupling1 = 6
    expect(r.tableB.min).toBe(5);
    expect(r.scoreB.min).toBe(6);
    // Table C(6,6) = 8, +activity1 = 9
    expect(r.tableC.min).toBe(8);
    expect(r.reba).toEqual({ min: 9, max: 9 });
    expect(riskOf(9).label).toBe('高い');
  });

  it('最大負担の組み合わせは 15 を超えない', () => {
    const max: ItemValues = {};
    for (const k of ITEM_KEYS) {
      const opts = ITEMS[k].options;
      max[k] = opts.reduce((a, b) => (b.points > a.points ? b : a)).id;
    }
    const r = computeReba(max);
    expect(r.scoreA.max).toBe(12);
    expect(r.scoreB.max).toBe(12);
    expect(r.reba).toEqual({ min: 15, max: 15 });
  });
});

describe('補正（手動加点）', () => {
  const base = { ...ALL_LOW };
  it('体幹のねじれ・側屈 +1', () => {
    expect(computeReba({ ...base, trunkTwistSide: 'yes' }).trunk.min).toBe(2);
  });
  it('頸部のねじれ・側屈 +1', () => {
    expect(computeReba({ ...base, neckTwistSide: 'yes' }).neck.min).toBe(2);
  });
  it('片脚支持 2点、膝 30–60° +1、60°超 +2', () => {
    expect(computeReba({ ...base, legSupport: 'unilateral' }).legs.min).toBe(2);
    expect(computeReba({ ...base, kneeAdj: '1' }).legs.min).toBe(2);
    expect(computeReba({ ...base, kneeAdj: '2' }).legs.min).toBe(3);
    expect(computeReba({ ...base, legSupport: 'unilateral', kneeAdj: '2' }).legs.min).toBe(4);
  });
  it('座位では膝 60°超の +2 を適用しない（原著注記）', () => {
    expect(computeReba({ ...base, legSupport: 'sitting', kneeAdj: '2' }).legs.min).toBe(1);
    expect(computeReba({ ...base, legSupport: 'sitting', kneeAdj: '1' }).legs.min).toBe(2);
  });
  it('重量/力と衝撃', () => {
    expect(computeReba({ ...base, load: '5to10' }).loadForce.min).toBe(1);
    expect(computeReba({ ...base, load: 'gt10', shock: 'yes' }).loadForce.min).toBe(3);
  });
  it('上腕: 外転/回旋 +1、肩の挙上 +1、支持 −1（下限 1）', () => {
    expect(computeReba({ ...base, upperArmPos: '3', upperArmAbdRot: 'yes' }).upperArm.min).toBe(4);
    expect(computeReba({ ...base, upperArmPos: '3', upperArmAbdRot: 'yes', shoulderRaised: 'yes' }).upperArm.min).toBe(5);
    expect(computeReba({ ...base, upperArmPos: '3', armSupported: 'yes' }).upperArm.min).toBe(2);
    expect(computeReba({ ...base, upperArmPos: '1', armSupported: 'yes' }).upperArm.min).toBe(1);
  });
  it('手首の偏位・ねじれ +1', () => {
    expect(computeReba({ ...base, wristPos: '2', wristDevTwist: 'yes' }).wrist.min).toBe(3);
  });
  it('把持 0〜3', () => {
    expect(computeReba({ ...base, coupling: 'unacceptable' }).coupling.min).toBe(3);
  });
  it('活動スコアは各 +1 の合計', () => {
    expect(computeReba({ ...base, actStatic: 'yes', actRepeated: 'yes', actRapid: 'yes' }).activity.min).toBe(3);
  });
});

describe('未確認項目の扱い', () => {
  it('未確認を 0点・「なし」とみなさず、取りうる範囲で仮評価にする', () => {
    const v = { ...ALL_LOW };
    delete v.load;
    const r = computeReba(v);
    expect(r.complete).toBe(false);
    expect(r.unknown).toEqual(['load']);
    expect(r.loadForce).toEqual({ min: 0, max: 2 });
    expect(r.reba.min).toBe(1);
    expect(r.reba.max).toBeGreaterThan(1);
  });

  it('全項目未確認なら 1〜15', () => {
    const r = computeReba({});
    expect(r.unknown).toHaveLength(ITEM_KEYS.length);
    expect(r.reba).toEqual({ min: 1, max: 15 });
  });

  it('支持(−1)が未確認なら上腕スコアの下限側に反映される', () => {
    const v = { ...ALL_LOW, upperArmPos: '3' };
    delete v.armSupported;
    expect(computeReba(v).upperArm).toEqual({ min: 2, max: 3 });
  });

  it('座位かどうか未確認で膝 60°超なら、脚スコアは 1〜4', () => {
    const v = { ...ALL_LOW, kneeAdj: '2' };
    delete v.legSupport;
    expect(computeReba(v).legs).toEqual({ min: 1, max: 4 });
  });

  it('全項目確認済みでも、姿勢確認が無ければ仮評価', () => {
    const r = computeReba(ALL_LOW);
    expect(statusOf(r, false)).toBe('provisional');
    expect(statusOf(r, true)).toBe('final');
    const partial = computeReba({ trunkPos: '1' });
    expect(statusOf(partial, true)).toBe('provisional');
  });
});

describe('自動推定値と手動修正値の区別', () => {
  it('手動値があれば手動を優先し、出所を区別する', () => {
    expect(resolveItem('trunkPos', { trunkPos: '2' }, {})).toEqual({ value: '2', source: 'auto' });
    expect(resolveItem('trunkPos', { trunkPos: '2' }, { trunkPos: '3' })).toEqual({ value: '3', source: 'override' });
    expect(resolveItem('trunkPos', { trunkPos: '2' }, { trunkPos: '2' })).toEqual({ value: '2', source: 'manual' });
    expect(resolveItem('load', {}, { load: 'lt5' })).toEqual({ value: 'lt5', source: 'manual' });
    expect(resolveItem('load', {}, {})).toEqual({ value: null, source: 'unset' });
    expect(effectiveValues({ trunkPos: '2' }, { trunkPos: '4', load: 'gt10' })).toEqual({ trunkPos: '4', load: 'gt10' });
  });
});

describe('リスク区分（Action level）', () => {
  it.each([
    [1, 0, '無視できる'],
    [2, 1, '低い'],
    [3, 1, '低い'],
    [4, 2, '中程度'],
    [7, 2, '中程度'],
    [8, 3, '高い'],
    [10, 3, '高い'],
    [11, 4, '非常に高い'],
    [15, 4, '非常に高い'],
  ])('REBA %i → AL%i %s', (score, al, label) => {
    const r = riskOf(score);
    expect(r.actionLevel).toBe(al);
    expect(r.label).toBe(label);
  });
  it('0 以下は不正', () => {
    expect(() => riskOf(0)).toThrow();
  });
});
