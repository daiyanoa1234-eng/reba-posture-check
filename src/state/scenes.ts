/**
 * 評価場面（フレーム）ごとの入力状態。
 * 手動項目・姿勢確認・関節点の調整を場面ごとに保持し、場面を切り替えても消さない（場面に対応した入力）。
 * 上腕・前腕・手首の項目は評価側（左右）ごとに保持する。
 */
import type { JointEdits, JointPos } from '../lib/edit/edits';
import type { Side } from '../lib/pose/landmarks';
import { type ItemKey, type ItemValues, SIDE_ITEM_KEYS } from '../lib/reba/items';

export interface SceneState {
  common: ItemValues;
  bySide: Record<Side, ItemValues>;
  confirmed: Record<Side, boolean>;
  edits: JointEdits;
  undo: JointEdits[];
}

export const emptyScene = (): SceneState => ({
  common: {},
  bySide: { left: {}, right: {} },
  confirmed: { left: false, right: false },
  edits: {},
  undo: [],
});

/** 作業条件（場面をまたいで同じことが多い項目）。別の場面からコピーできる */
export const TASK_KEYS: ItemKey[] = ['load', 'shock', 'coupling', 'actStatic', 'actRepeated', 'actRapid'];

export function manualOf(s: SceneState, side: Side): ItemValues {
  return { ...s.common, ...s.bySide[side] };
}

export function setItem(s: SceneState, side: Side, key: ItemKey, value: string | null): SceneState {
  const perSide = SIDE_ITEM_KEYS.includes(key);
  const target = { ...(perSide ? s.bySide[side] : s.common) };
  if (value == null) delete target[key];
  else target[key] = value;
  return perSide ? { ...s, bySide: { ...s.bySide, [side]: target } } : { ...s, common: target };
}

export function setItems(s: SceneState, side: Side, values: ItemValues): SceneState {
  let out = s;
  for (const [k, v] of Object.entries(values)) out = setItem(out, side, k as ItemKey, v ?? null);
  return out;
}

export function hasTaskItems(s: SceneState | undefined): boolean {
  return !!s && TASK_KEYS.some((k) => s.common[k] != null);
}

export function copyTaskItems(from: SceneState, to: SceneState): SceneState {
  const common = { ...to.common };
  for (const k of TASK_KEYS) if (from.common[k] != null) common[k] = from.common[k];
  return { ...to, common };
}

/** 関節点の調整（null で自動推定に戻す）。角度が変わるため姿勢確認は取り消す */
export function setEdit(s: SceneState, joint: number, pos: JointPos | null): SceneState {
  const edits = { ...s.edits };
  if (pos == null) delete edits[joint];
  else edits[joint] = pos;
  return { ...s, edits, undo: [...s.undo, s.edits].slice(-50), confirmed: { left: false, right: false } };
}

export function undoEdit(s: SceneState): SceneState {
  if (!s.undo.length) return s;
  return { ...s, edits: s.undo[s.undo.length - 1], undo: s.undo.slice(0, -1), confirmed: { left: false, right: false } };
}

export function resetEdits(s: SceneState): SceneState {
  if (!Object.keys(s.edits).length) return s;
  return { ...s, edits: {}, undo: [...s.undo, s.edits].slice(-50), confirmed: { left: false, right: false } };
}

export function isSceneTouched(s: SceneState | undefined): boolean {
  if (!s) return false;
  return (
    Object.keys(s.common).length > 0 ||
    Object.keys(s.bySide.left).length > 0 ||
    Object.keys(s.bySide.right).length > 0 ||
    Object.keys(s.edits).length > 0 ||
    s.confirmed.left ||
    s.confirmed.right
  );
}
