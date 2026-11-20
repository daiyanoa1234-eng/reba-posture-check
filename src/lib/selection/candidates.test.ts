import { describe, expect, it } from 'vitest';
import { computeAngles } from '../angles/angles';
import { assessQuality } from '../analysis/quality';
import type { FrameRecord } from '../analysis/types';
import { NEUTRAL, type SynthParams, projectToImage, synthWorld } from '../demo/synthPose';
import { pickCandidates, scoreFrames } from './candidates';

const S = { uprightToleranceDeg: 5, neckExtensionToleranceDeg: 5, spikeThresholdDeg: 40, candidateSeparationSec: 1 };

function frame(i: number, p: SynthParams | null, opts: { numPoses?: number; fps?: number } = {}): FrameRecord {
  const fps = opts.fps ?? 5;
  const world = p ? synthWorld(p) : null;
  const image = world ? projectToImage(world) : null;
  const quality = assessQuality(image, p ? (opts.numPoses ?? 1) : 0, 0.5);
  return {
    index: i,
    time: i / fps,
    image,
    world,
    others: [],
    numPoses: p ? (opts.numPoses ?? 1) : 0,
    quality,
    angles: computeAngles(world, quality),
    view: 'side',
    imageBlob: null,
    width: 640,
    height: 480,
  };
}

const bend = (deg: number): SynthParams => ({ ...NEUTRAL, trunkFlexion: deg });

describe('評価候補の抽出', () => {
  it('持続した高負担姿勢を候補にする', () => {
    const degs = [0, 0, 10, 30, 70, 75, 72, 30, 0, 0, 0, 0];
    const frames = degs.map((d, i) => frame(i, bend(d)));
    const scores = scoreFrames(frames, S);
    const c = pickCandidates(scores, 3, 1);
    expect(c.length).toBeGreaterThan(0);
    expect([4, 5, 6]).toContain(c[0].index);
  });

  it('一瞬だけの角度の急変（推定エラー）は候補にしない', () => {
    const degs = [5, 5, 5, 85, 5, 5, 5, 25, 25, 25];
    const frames = degs.map((d, i) => frame(i, bend(d)));
    const scores = scoreFrames(frames, S);
    expect(scores[3].spike).toBe(true);
    expect(scores[3].eligible).toBe(false);
    const c = pickCandidates(scores, 1, 1);
    expect(c[0].index).not.toBe(3);
    expect([7, 8, 9]).toContain(c[0].index);
  });

  it('前後のフレームが検出できない孤立フレームは候補にしない', () => {
    const frames = [frame(0, null), frame(1, bend(80)), frame(2, null), frame(3, bend(10)), frame(4, bend(10))];
    const scores = scoreFrames(frames, S);
    expect(scores[1].eligible).toBe(false);
    expect(scores[1].reason).toContain('前後');
  });

  it('複数人が映るフレーム・人物未検出フレームは除外', () => {
    const frames = [frame(0, bend(70), { numPoses: 2 }), frame(1, bend(70), { numPoses: 2 }), frame(2, null)];
    const scores = scoreFrames(frames, S);
    expect(scores.every((s) => !s.eligible)).toBe(true);
    expect(pickCandidates(scores, 3, 1)).toEqual([]);
  });

  it('候補どうしは最小間隔以上離す', () => {
    const frames = Array.from({ length: 30 }, (_, i) => frame(i, bend(70)));
    const c = pickCandidates(scoreFrames(frames, S), 3, 1);
    expect(c).toHaveLength(3);
    for (let i = 0; i < c.length; i++)
      for (let j = i + 1; j < c.length; j++) expect(Math.abs(c[i].time - c[j].time)).toBeGreaterThanOrEqual(1 - 1e-9);
  });

  it('姿勢指標は同じフレームの値だけで計算される（左右で別々）', () => {
    const p: SynthParams = {
      ...bend(30),
      arms: { ...NEUTRAL.arms, right: { flexion: 120, abduction: 0, elbow: 20, wrist: 0 } },
    };
    const frames = [frame(0, p), frame(1, p), frame(2, p)];
    const s = scoreFrames(frames, S);
    expect(s[1].perSide.right!).toBeGreaterThan(s[1].perSide.left!);
    expect(s[1].bestSide).toBe('right');
  });
});

describe('一部の関節が見えないフレーム', () => {
  it('体幹が推定できれば候補の対象にし、見えない部位は最小区分として並べ替える', () => {
    const mk = (i: number, hideWrist: boolean) => {
      const f = frame(i, bend(65));
      if (hideWrist && f.image) {
        f.image[16] = { ...f.image[16], v: 0.1 };
        f.image[15] = { ...f.image[15], v: 0.1 };
        f.quality = assessQuality(f.image, 1, 0.5);
        f.angles = computeAngles(f.world, f.quality);
      }
      return f;
    };
    const frames = [mk(0, true), mk(1, true), mk(2, true)];
    const s = scoreFrames(frames, S);
    expect(s[1].postureIndex).not.toBeNull();
    expect(s[1].eligible).toBe(true);
  });

  it('同じ姿勢なら、推定できた部位が多いフレームを優先する', () => {
    const full = [0, 1, 2].map((i) => frame(i, bend(65)));
    const partial = [3, 4, 5].map((i) => {
      const f = frame(i, bend(65));
      f.image![14] = { ...f.image![14], v: 0.1 };
      f.image![13] = { ...f.image![13], v: 0.1 };
      f.quality = assessQuality(f.image, 1, 0.5);
      f.angles = computeAngles(f.world, f.quality);
      return f;
    });
    // partial を先に並べても full が上位になる
    const c = pickCandidates(scoreFrames([...partial, ...full].map((f, i) => ({ ...f, index: i, time: i / 5 })), S), 1, 0.1);
    expect(c[0].index).toBeGreaterThanOrEqual(3);
  });
});
