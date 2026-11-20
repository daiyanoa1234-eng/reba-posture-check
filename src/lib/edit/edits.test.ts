import { describe, expect, it } from 'vitest';
import { computeAngles } from '../angles/angles';
import { assessQuality } from '../analysis/quality';
import type { FrameRecord } from '../analysis/types';
import { NEUTRAL, type SynthParams, projectToImage, synthWorld } from '../demo/synthPose';
import { LM } from '../pose/landmarks';
import { applyEdits, describeEdits, fitImageWorld } from './edits';

function frameOf(p: SynthParams): FrameRecord {
  const world = synthWorld(p);
  const image = projectToImage(world);
  const quality = assessQuality(image, 1, 0.5);
  return {
    index: 0,
    time: 0,
    image,
    world,
    others: [],
    numPoses: 1,
    quality,
    angles: computeAngles(world, quality),
    view: 'side',
    imageBlob: null,
    width: 1,
    height: 1,
  };
}

describe('関節点の手動調整', () => {
  it('画像と3D座標の対応（スケール）を推定できる', () => {
    const f = frameOf(NEUTRAL);
    const fit = fitImageWorld(f.image!, f.world!, 1, 1)!;
    expect(fit.s).toBeCloseTo(0.42, 6); // projectToImage の既定スケール
  });

  it('肘を動かすと肘の角度が変わり、元のフレームは変わらない', () => {
    const f = frameOf({ ...NEUTRAL, arms: { ...NEUTRAL.arms, right: { flexion: 0, abduction: 0, elbow: 10, wrist: 0 } } });
    const before = f.angles.elbowFlexion.right!;
    // 手首を前方へ（facing right なので +x）動かして肘を曲げた姿勢にする
    const w = f.image![LM.R_WRIST];
    const e = f.image![LM.R_ELBOW];
    const len = Math.hypot(w.x - e.x, w.y - e.y);
    const edited = applyEdits(f, { [LM.R_WRIST]: { x: e.x + len, y: e.y } }, 0.5);
    expect(edited.angles.elbowFlexion.right!).toBeCloseTo(90, 0);
    expect(f.angles.elbowFlexion.right).toBe(before);
    expect(f.image![LM.R_WRIST].x).toBe(w.x);
  });

  it('見えていなかった関節点も、調整すれば確認済みとして角度を計算できる', () => {
    const f0 = frameOf(NEUTRAL);
    const img = f0.image!.map((p, i) => (i === LM.R_WRIST ? { ...p, v: 0.1 } : p));
    const q = assessQuality(img, 1, 0.5);
    const f: FrameRecord = { ...f0, image: img, quality: q, angles: computeAngles(f0.world, q) };
    expect(f.angles.elbowFlexion.right).toBeNull();
    const edited = applyEdits(f, { [LM.R_WRIST]: { x: img[LM.R_WRIST].x, y: img[LM.R_WRIST].y } }, 0.5);
    expect(edited.angles.elbowFlexion.right).not.toBeNull();
    expect(edited.image![LM.R_WRIST].v).toBe(1);
  });

  it('調整内容を関節名と前後の位置で記録する', () => {
    const f = frameOf(NEUTRAL);
    const d = describeEdits(f, { [LM.L_KNEE]: { x: 0.5, y: 0.7 } });
    expect(d).toEqual([{ joint: LM.L_KNEE, name: '左膝', from: { x: f.image![LM.L_KNEE].x, y: f.image![LM.L_KNEE].y }, to: { x: 0.5, y: 0.7 } }]);
    expect(describeEdits(f, {})).toEqual([]);
  });

  it('調整が無ければ同じフレームを返す', () => {
    const f = frameOf(NEUTRAL);
    expect(applyEdits(f, {}, 0.5)).toBe(f);
    expect(applyEdits(f, undefined, 0.5)).toBe(f);
  });
});
