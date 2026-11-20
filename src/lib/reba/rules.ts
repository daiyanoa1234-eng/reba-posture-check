/**
 * 推定角度 → REBA 部位スコアの区分。
 * REBA 原著の区分は「0–20°」「20–60°」のように境界値が両側に現れるため、
 * 本アプリでは境界値を「低い方の区分」に含める（例: 体幹 20° は 2点、60° は 3点）。
 * 詳細は docs/REBA_RULES.md。
 */
import type { UpperArmAngles } from '../angles/angles';

export type Score = number;

/** 体幹: 直立 1 / 0–20°屈曲・0–20°伸展 2 / 20–60°屈曲・>20°伸展 3 / >60°屈曲 4 */
export function trunkPositionScore(flexionDeg: number, uprightTolDeg: number): Score {
  if (Math.abs(flexionDeg) <= uprightTolDeg) return 1;
  if (flexionDeg > 0) {
    if (flexionDeg <= 20) return 2;
    if (flexionDeg <= 60) return 3;
    return 4;
  }
  return -flexionDeg <= 20 ? 2 : 3;
}

/** 頸部（参考提示用）: 0–20°屈曲 1 / >20°屈曲 または 伸展 2 */
export function neckPositionScore(flexionDeg: number, extensionTolDeg: number): Score {
  if (flexionDeg < -extensionTolDeg) return 2;
  return flexionDeg <= 20 ? 1 : 2;
}

/** 上腕: 20°伸展〜20°屈曲 1 / >20°伸展・20–45°屈曲 2 / 45–90°屈曲 3 / >90°屈曲 4 */
export function upperArmPositionScore(a: Pick<UpperArmAngles, 'elevation' | 'isExtension'>): Score {
  const e = a.elevation;
  if (a.isExtension) return e <= 20 ? 1 : 2;
  if (e <= 20) return 1;
  if (e <= 45) return 2;
  if (e <= 90) return 3;
  return 4;
}

/** 前腕: 60–100°屈曲 1 / <60° または >100° 2 */
export function lowerArmPositionScore(elbowFlexionDeg: number): Score {
  return elbowFlexionDeg >= 60 && elbowFlexionDeg <= 100 ? 1 : 2;
}

/** 手首（参考提示用）: 0–15° 1 / >15° 2 */
export function wristPositionScore(bendDeg: number): Score {
  return bendDeg <= 15 ? 1 : 2;
}

/** 膝の補正: 30–60°屈曲 +1 / >60°屈曲 +2（座位では +2 を適用しない：採点側で処理） */
export function kneeAdjustment(kneeFlexionDeg: number): Score {
  if (kneeFlexionDeg < 30) return 0;
  if (kneeFlexionDeg <= 60) return 1;
  return 2;
}
