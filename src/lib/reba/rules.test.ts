import { describe, expect, it } from 'vitest';
import {
  kneeAdjustment,
  lowerArmPositionScore,
  neckPositionScore,
  trunkPositionScore,
  upperArmPositionScore,
  wristPositionScore,
} from './rules';

describe('角度の区分境界（境界値は低い方の区分に含める）', () => {
  it('体幹（直立の許容 ±5°）', () => {
    const t = (d: number) => trunkPositionScore(d, 5);
    expect(t(0)).toBe(1);
    expect(t(5)).toBe(1);
    expect(t(-5)).toBe(1);
    expect(t(5.1)).toBe(2);
    expect(t(20)).toBe(2);
    expect(t(20.1)).toBe(3);
    expect(t(60)).toBe(3);
    expect(t(60.1)).toBe(4);
    expect(t(-20)).toBe(2);
    expect(t(-20.1)).toBe(3);
    expect(t(-50)).toBe(3);
  });

  it('体幹（直立の許容 0° = 原著どおり厳密）', () => {
    expect(trunkPositionScore(0, 0)).toBe(1);
    expect(trunkPositionScore(0.5, 0)).toBe(2);
  });

  it('頸部（参考提示）: 0–20° 屈曲は 1、20°超 または 伸展は 2', () => {
    const n = (d: number) => neckPositionScore(d, 5);
    expect(n(0)).toBe(1);
    expect(n(20)).toBe(1);
    expect(n(20.1)).toBe(2);
    expect(n(-5)).toBe(1);
    expect(n(-5.1)).toBe(2);
  });

  it('上腕', () => {
    const u = (e: number, ext = false) => upperArmPositionScore({ elevation: e, isExtension: ext });
    expect(u(0)).toBe(1);
    expect(u(20)).toBe(1);
    expect(u(20.1)).toBe(2);
    expect(u(45)).toBe(2);
    expect(u(45.1)).toBe(3);
    expect(u(90)).toBe(3);
    expect(u(90.1)).toBe(4);
    expect(u(170)).toBe(4);
    expect(u(20, true)).toBe(1);
    expect(u(20.1, true)).toBe(2);
    expect(u(60, true)).toBe(2);
  });

  it('前腕（肘屈曲）', () => {
    expect(lowerArmPositionScore(59.9)).toBe(2);
    expect(lowerArmPositionScore(60)).toBe(1);
    expect(lowerArmPositionScore(100)).toBe(1);
    expect(lowerArmPositionScore(100.1)).toBe(2);
    expect(lowerArmPositionScore(5)).toBe(2);
  });

  it('手首（参考提示）', () => {
    expect(wristPositionScore(15)).toBe(1);
    expect(wristPositionScore(15.1)).toBe(2);
  });

  it('膝の補正', () => {
    expect(kneeAdjustment(29.9)).toBe(0);
    expect(kneeAdjustment(30)).toBe(1);
    expect(kneeAdjustment(60)).toBe(1);
    expect(kneeAdjustment(60.1)).toBe(2);
  });
});
