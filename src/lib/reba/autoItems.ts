/**
 * 1フレームの推定角度から、自動設定する項目（auto）と、評価者に見せる参考提案（hints）を作る。
 * - auto: 体幹・膝・上腕・前腕の位置区分（推定が成立した場合のみ）
 * - hints: 頸部・手首・上腕外転・体幹ねじれ/側屈など、推定が不安定な項目。値は設定せず提案だけ示す。
 */
import type { Angles } from '../angles/angles';
import type { Side } from '../pose/landmarks';
import type { ItemKey, ItemValues } from './items';
import {
  kneeAdjustment,
  lowerArmPositionScore,
  neckPositionScore,
  trunkPositionScore,
  upperArmPositionScore,
  wristPositionScore,
} from './rules';

export interface Hint {
  /** 提案する選択肢 id（提案できない場合 null） */
  suggestion: string | null;
  /** 根拠の説明（推定値） */
  text: string;
}

export interface AutoItemSettings {
  uprightToleranceDeg: number;
  neckExtensionToleranceDeg: number;
}

const r = (v: number) => Math.round(v);

export function autoItemsFromAngles(
  a: Angles,
  side: Side,
  s: AutoItemSettings,
): { auto: ItemValues; hints: Partial<Record<ItemKey, Hint>> } {
  const auto: ItemValues = {};
  const hints: Partial<Record<ItemKey, Hint>> = {};

  if (a.trunkFlexion != null) auto.trunkPos = String(trunkPositionScore(a.trunkFlexion, s.uprightToleranceDeg));

  const kl = a.kneeFlexion.left;
  const kr = a.kneeFlexion.right;
  if (kl != null && kr != null) {
    auto.kneeAdj = String(kneeAdjustment(Math.max(kl, kr)));
  } else if (kl != null || kr != null) {
    const k = (kl ?? kr)!;
    hints.kneeAdj = {
      suggestion: String(kneeAdjustment(k)),
      text: `片側の膝のみ推定（${kl != null ? '左' : '右'} 約${r(k)}°）。反対側を確認してください`,
    };
  }

  const ua = a.upperArm[side];
  if (ua) auto.upperArmPos = String(upperArmPositionScore(ua));
  const el = a.elbowFlexion[side];
  if (el != null) auto.lowerArmPos = String(lowerArmPositionScore(el));

  if (a.neckFlexion != null) {
    hints.neckPos = {
      suggestion: String(neckPositionScore(a.neckFlexion, s.neckExtensionToleranceDeg)),
      text: `頭頸部の${a.neckFlexion >= 0 ? '前傾' : '後傾'} 約${r(Math.abs(a.neckFlexion))}°（耳と肩の位置からの参考値）`,
    };
  } else {
    hints.neckPos = { suggestion: null, text: '耳・肩が確認できず推定できません' };
  }

  const wb = a.wristBend[side];
  if (wb != null) {
    hints.wristPos = {
      suggestion: String(wristPositionScore(wb)),
      text: `手首の曲がり 約${r(wb)}°（屈曲・伸展・偏位を区別しない参考値）`,
    };
  } else {
    hints.wristPos = { suggestion: null, text: '手指の点が確認できず推定できません' };
  }

  if (ua) {
    hints.upperArmAbdRot = {
      suggestion: ua.abduction > 30 ? 'yes' : null,
      text: `外転 約${r(Math.max(0, ua.abduction))}°（推定）。回旋は推定していません`,
    };
  }

  if (a.trunkLateral != null || a.trunkTwist != null) {
    const lat = a.trunkLateral != null ? Math.abs(a.trunkLateral) : null;
    const tw = a.trunkTwist != null ? Math.abs(a.trunkTwist) : null;
    const parts: string[] = [];
    if (lat != null) parts.push(`側屈 約${r(lat)}°`);
    if (tw != null) parts.push(`肩と骨盤の向きの差 約${r(tw)}°`);
    hints.trunkTwistSide = {
      suggestion: (lat != null && lat > 10) || (tw != null && tw > 20) ? 'yes' : null,
      text: `${parts.join('、')}（推定・参考）`,
    };
  }

  return { auto, hints };
}
