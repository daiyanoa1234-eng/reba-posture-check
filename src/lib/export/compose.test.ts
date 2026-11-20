import { describe, expect, it } from 'vitest';
import { wrapText } from './compose';

describe('評価画像の文字の折り返し', () => {
  it('幅を超えたら文字単位で折り返す', () => {
    const m = (t: string) => t.length * 10;
    expect(wrapText(m, 'あいうえおかきくけこ', 40)).toEqual(['あいうえ', 'おかきく', 'けこ']);
    expect(wrapText(m, '', 40)).toEqual([]);
  });
});
