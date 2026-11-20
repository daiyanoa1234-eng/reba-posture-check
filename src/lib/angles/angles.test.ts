import { describe, expect, it } from 'vitest';
import { assessQuality } from '../analysis/quality';
import { NEUTRAL, type SynthParams, projectToImage, synthWorld } from '../demo/synthPose';
import { autoItemsFromAngles } from '../reba/autoItems';
import { computeAngles, viewDirection } from './angles';

function anglesOf(p: SynthParams) {
  const w = synthWorld(p);
  const q = assessQuality(projectToImage(w), 1, 0.5);
  return computeAngles(w, q);
}

const withArm = (side: 'left' | 'right', arm: Partial<SynthParams['arms']['left']>, base: SynthParams = NEUTRAL): SynthParams => ({
  ...base,
  arms: { ...base.arms, [side]: { ...base.arms[side], ...arm } },
});

describe('角度計算（合成骨格で既知の角度を再現できるか）', () => {
  for (const facing of ['right', 'left', 'camera', 'away'] as const) {
    it(`体幹の前屈・後屈（向き: ${facing}）`, () => {
      for (const deg of [-25, 0, 15, 45, 80]) {
        const a = anglesOf({ ...NEUTRAL, facing, trunkFlexion: deg });
        expect(a.trunkFlexion).toBeCloseTo(deg, 5);
      }
    });
  }

  it('体幹の側屈は前屈と区別される', () => {
    const a = anglesOf({ ...NEUTRAL, trunkLateral: 15 });
    expect(Math.abs(a.trunkFlexion!)).toBeLessThan(0.5);
    expect(Math.abs(a.trunkLateral!)).toBeCloseTo(15, 3);
  });

  it('頭頸部の前傾は体幹に対する相対角', () => {
    const a = anglesOf({ ...NEUTRAL, trunkFlexion: 30, neckFlexion: 25 });
    expect(a.neckFlexion).toBeCloseTo(25, 5);
  });

  it('上腕の屈曲・伸展・外転', () => {
    const flex = anglesOf(withArm('right', { flexion: 100 })).upperArm.right!;
    expect(flex.elevation).toBeCloseTo(100, 5);
    expect(flex.isExtension).toBe(false);

    const ext = anglesOf(withArm('left', { flexion: -30 })).upperArm.left!;
    expect(ext.elevation).toBeCloseTo(30, 5);
    expect(ext.isExtension).toBe(true);

    const abd = anglesOf(withArm('left', { abduction: 60 })).upperArm.left!;
    expect(abd.elevation).toBeCloseTo(60, 5);
    expect(abd.abduction).toBeCloseTo(60, 5);
    expect(abd.isExtension).toBe(false);
  });

  it('上腕角は体幹に対する相対角（前屈しても腕を下げたままなら小さい）', () => {
    const a = anglesOf({ ...NEUTRAL, trunkFlexion: 60 });
    expect(a.upperArm.right!.elevation).toBeLessThan(1);
  });

  it('肘・膝・手首・足関節', () => {
    const a = anglesOf({
      ...withArm('right', { elbow: 90, wrist: 25 }),
      legs: { left: { hip: 50, knee: 70 }, right: { hip: 0, knee: 0 } },
    });
    expect(a.elbowFlexion.right).toBeCloseTo(90, 5);
    expect(a.wristBend.right).toBeCloseTo(25, 5);
    expect(a.kneeFlexion.left).toBeCloseTo(70, 5);
    expect(a.kneeFlexion.right).toBeCloseTo(0, 5);
    expect(a.ankleDorsiflexion.right).toBeCloseTo(0, 5);
  });

  it('撮影方向の目安', () => {
    expect(viewDirection(synthWorld({ ...NEUTRAL, facing: 'right' }))).toBe('side');
    expect(viewDirection(synthWorld({ ...NEUTRAL, facing: 'camera' }))).toBe('front');
  });

  it('関節点が見えない部位は角度を出さない（null）', () => {
    const w = synthWorld(withArm('right', { elbow: 90 }));
    const img = projectToImage(w);
    img[16] = { ...img[16], v: 0.1 }; // 右手首を不可視に
    const a = computeAngles(w, assessQuality(img, 1, 0.5));
    expect(a.elbowFlexion.right).toBeNull();
    expect(a.elbowFlexion.left).not.toBeNull();
  });
});

describe('自動設定と参考提案', () => {
  const s = { uprightToleranceDeg: 5, neckExtensionToleranceDeg: 5 };

  it('体幹・上腕・前腕・膝は自動設定、頸部・手首は提案のみ', () => {
    const a = anglesOf({
      ...withArm('right', { flexion: 70, elbow: 40, wrist: 30 }),
      trunkFlexion: 45,
      neckFlexion: 30,
      legs: { left: { hip: 30, knee: 45 }, right: { hip: 30, knee: 40 } },
    });
    const { auto, hints } = autoItemsFromAngles(a, 'right', s);
    expect(auto).toEqual({ trunkPos: '3', upperArmPos: '3', lowerArmPos: '2', kneeAdj: '1' });
    expect(auto.neckPos).toBeUndefined();
    expect(auto.wristPos).toBeUndefined();
    expect(hints.neckPos?.suggestion).toBe('2');
    expect(hints.wristPos?.suggestion).toBe('2');
  });

  it('片側の膝しか推定できない場合は自動設定せず提案にとどめる', () => {
    const w = synthWorld({ ...NEUTRAL, legs: { left: { hip: 0, knee: 70 }, right: { hip: 0, knee: 0 } } });
    const img = projectToImage(w);
    img[25] = { ...img[25], v: 0.1 }; // 左膝を不可視
    const a = computeAngles(w, assessQuality(img, 1, 0.5));
    const { auto, hints } = autoItemsFromAngles(a, 'right', s);
    expect(auto.kneeAdj).toBeUndefined();
    expect(hints.kneeAdj?.suggestion).toBe('0');
  });
});
