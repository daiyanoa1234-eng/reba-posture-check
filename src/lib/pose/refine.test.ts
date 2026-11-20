import { describe, expect, it } from 'vitest';
import { NEUTRAL, projectToImage, synthWorld } from '../demo/synthPose';
import { LM, type Pt } from './landmarks';
import { MIRROR_INDEX, cropToFrame, frameToCrop, fusePasses, nearestPose, personRoi, unflipImage, unflipWorld } from './refine';

describe('精度向上の補助処理', () => {
  it('左右の番号の入れ替え表は対称', () => {
    for (let i = 0; i < 33; i++) expect(MIRROR_INDEX[MIRROR_INDEX[i]]).toBe(i);
    expect(MIRROR_INDEX[LM.L_ELBOW]).toBe(LM.R_ELBOW);
    expect(MIRROR_INDEX[LM.NOSE]).toBe(LM.NOSE);
  });

  it('人物を囲む正方形の切り出し範囲と、座標の往復変換', () => {
    const img = projectToImage(synthWorld(NEUTRAL));
    const roi = personRoi(img, 1920, 1080)!;
    expect(roi.size).toBeGreaterThan(0);
    const back = cropToFrame(
      img.map((p) => ({ ...p, ...frameToCrop(p, roi, 1920, 1080) })),
      roi,
      1920,
      1080,
    );
    back.forEach((p, i) => {
      expect(p.x).toBeCloseTo(img[i].x, 9);
      expect(p.y).toBeCloseTo(img[i].y, 9);
    });
    // 全ての点が切り出し範囲の内側（0..1）に入る
    for (const p of img) {
      const c = frameToCrop(p, roi, 1920, 1080);
      expect(c.x).toBeGreaterThan(0);
      expect(c.x).toBeLessThan(1);
    }
  });

  it('左右反転した推定結果を元の向きに戻せる', () => {
    const img = projectToImage(synthWorld(NEUTRAL));
    const flipped: Pt[] = MIRROR_INDEX.map((src) => ({ ...img[src], x: 1 - img[src].x }));
    const restored = unflipImage(flipped);
    restored.forEach((p, i) => expect(p.x).toBeCloseTo(img[i].x, 12));
    const w = synthWorld(NEUTRAL);
    const wf: Pt[] = MIRROR_INDEX.map((src) => ({ ...w[src], x: -w[src].x }));
    unflipWorld(wf).forEach((p, i) => expect(p.x).toBeCloseTo(w[i].x, 12));
  });

  it('一致する点は平均し、食い違う点は確認対象（visibility を下げる）にする', () => {
    const w = synthWorld(NEUTRAL);
    const a = { image: projectToImage(w), world: w };
    const bImg = a.image.map((p) => ({ ...p, x: p.x + 0.002 }));
    bImg[LM.R_WRIST] = { ...bImg[LM.R_WRIST], x: bImg[LM.R_WRIST].x + 0.3 };
    const r = fusePasses(a, { image: bImg, world: w }, 1000, 1000);
    expect(r.image[LM.L_SHOULDER].x).toBeCloseTo(a.image[LM.L_SHOULDER].x + 0.001, 9);
    expect(r.image[LM.R_WRIST].x).toBe(a.image[LM.R_WRIST].x);
    expect(r.image[LM.R_WRIST].v).toBeLessThan(0.5);
    expect(r.agreement).toBeCloseTo(32 / 33, 6);
  });

  it('期待位置に近い人物を選び、遠すぎれば選ばない', () => {
    const p = projectToImage(synthWorld(NEUTRAL));
    const q = p.map((x) => ({ ...x, x: x.x + 0.4 }));
    const hip = { x: (p[LM.L_HIP].x + p[LM.R_HIP].x) / 2, y: (p[LM.L_HIP].y + p[LM.R_HIP].y) / 2 };
    expect(nearestPose([q, p], hip)).toBe(1);
    expect(nearestPose([q], hip, 0.1)).toBe(-1);
  });
});
