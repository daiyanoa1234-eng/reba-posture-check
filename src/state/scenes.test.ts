import { describe, expect, it } from 'vitest';
import { copyTaskItems, emptyScene, hasTaskItems, isSceneTouched, manualOf, resetEdits, setEdit, setItem, undoEdit } from './scenes';

describe('場面ごとの入力状態', () => {
  it('上腕などの左右別項目は側ごと、その他は共通で保持する', () => {
    let s = emptyScene();
    s = setItem(s, 'right', 'shoulderRaised', 'yes');
    s = setItem(s, 'right', 'load', 'gt10');
    expect(manualOf(s, 'right')).toEqual({ shoulderRaised: 'yes', load: 'gt10' });
    expect(manualOf(s, 'left')).toEqual({ load: 'gt10' });
    s = setItem(s, 'right', 'load', null);
    expect(manualOf(s, 'right')).toEqual({ shoulderRaised: 'yes' });
  });

  it('作業条件だけを別の場面からコピーできる', () => {
    let a = emptyScene();
    a = setItem(a, 'left', 'load', '5to10');
    a = setItem(a, 'left', 'coupling', 'poor');
    a = setItem(a, 'left', 'neckPos', '2');
    expect(hasTaskItems(a)).toBe(true);
    const b = copyTaskItems(a, emptyScene());
    expect(b.common).toEqual({ load: '5to10', coupling: 'poor' });
  });

  it('関節点の調整は元に戻せ、調整すると姿勢確認が取り消される', () => {
    let s = { ...emptyScene(), confirmed: { left: true, right: true } };
    s = setEdit(s, 14, { x: 0.5, y: 0.5 });
    expect(s.confirmed).toEqual({ left: false, right: false });
    s = setEdit(s, 16, { x: 0.6, y: 0.6 });
    expect(Object.keys(s.edits)).toEqual(['14', '16']);
    s = undoEdit(s);
    expect(Object.keys(s.edits)).toEqual(['14']);
    s = resetEdits(s);
    expect(s.edits).toEqual({});
    s = undoEdit(s);
    expect(Object.keys(s.edits)).toEqual(['14']);
    expect(isSceneTouched(s)).toBe(true);
    expect(isSceneTouched(emptyScene())).toBe(false);
  });
});
