import type { ComponentChildren } from 'preact';
import { Notice } from './ui';
import { type Side, sideLabel } from '../lib/pose/landmarks';
import type { Hint } from '../lib/reba/autoItems';
import { ITEMS, type ItemKey, type ItemValues, SOURCE_LABEL, optionOf, resolveItem } from '../lib/reba/items';
import type { RebaResult } from '../lib/reba/scoring';

const BASE_ITEMS = new Set<ItemKey>(['trunkPos', 'neckPos', 'legSupport', 'upperArmPos', 'lowerArmPos', 'wristPos', 'load', 'coupling']);

function ptsText(k: ItemKey, p: number): string {
  if (BASE_ITEMS.has(k)) return `${p}点`;
  return p > 0 ? `+${p}` : p < 0 ? `−${-p}` : '±0';
}

function ItemRow({
  k,
  auto,
  manual,
  hint,
  onSet,
  wide,
}: {
  k: ItemKey;
  auto: ItemValues;
  manual: ItemValues;
  hint?: Hint;
  onSet: (k: ItemKey, v: string | null) => void;
  wide?: boolean;
}) {
  const def = ITEMS[k];
  const { value, source } = resolveItem(k, auto, manual);
  const id = `item-${k}`;
  return (
    <div class={`item ${value == null ? 'missing' : ''}`} id={id}>
      <div class="item-head">
        <span class="label">{def.label}</span>
        <span class={`tag ${source}`}>{SOURCE_LABEL[source]}</span>
        {def.help && !def.help.startsWith('+') && !def.help.startsWith('−') && <small>{def.help}</small>}
      </div>
      {hint && (
        <p class="hint">
          推定：{hint.text}
          {hint.suggestion && value == null && `／提案「${optionOf(k, hint.suggestion)?.label}」（点線）`}
        </p>
      )}
      <div class={`seg ${wide ? 'one' : ''}`} role="group" aria-labelledby={id}>
        {def.options.map((o) => (
          <button
            key={o.id}
            class={`opt ${auto[k] === o.id ? 'is-auto' : ''} ${hint?.suggestion === o.id && value == null ? 'suggest' : ''}`}
            aria-pressed={value === o.id}
            onClick={() => onSet(k, o.id)}
          >
            <span>
              {o.label}
              {auto[k] === o.id && <small>（自動）</small>}
            </span>
            <span class="pts">{ptsText(k, o.points)}</span>
          </button>
        ))}
      </div>
      {source === 'override' && (
        <button class="link-btn" onClick={() => onSet(k, null)}>
          自動推定値（{optionOf(k, auto[k])?.label}）に戻す
        </button>
      )}
    </div>
  );
}

function Group({ title, children, action }: { title: string; children: ComponentChildren; action?: ComponentChildren }) {
  return (
    <section class="card">
      <div class="row" style={{ marginBottom: 4 }}>
        <h2 class="grow" style={{ margin: 0 }}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export interface ChecklistProps {
  side: Side;
  auto: ItemValues;
  hints: Partial<Record<ItemKey, Hint>>;
  manual: ItemValues;
  onSet: (k: ItemKey, v: string | null) => void;
  onSetMany: (v: ItemValues) => void;
  postureConfirmed: boolean;
  onPostureConfirmed: (b: boolean) => void;
  result: RebaResult;
  /** 「1. 推定された姿勢の確認」の中に表示するもの（スマホではフレームと関節調整） */
  frameSlot?: ComponentChildren;
  /** 別の場面で入力した作業条件をコピーする操作 */
  onCopyTask?: (() => void) | null;
  copyLabel?: string;
}

/** REBA の確認・入力項目（場面に対応）。スマホの手動入力画面と PC の作業画面で共通 */
export function Checklist(props: ChecklistProps) {
  const { auto, manual, hints, onSet } = props;
  const row = (k: ItemKey, wide = false) => <ItemRow k={k} auto={auto} manual={manual} hint={hints[k]} onSet={onSet} wide={wide} />;
  const allNo = (keys: ItemKey[]) => (
    <button class="btn small" onClick={() => props.onSetMany(Object.fromEntries(keys.map((k) => [k, 'no'])) as ItemValues)}>
      すべて「なし」
    </button>
  );
  const missing = props.result.unknown;
  const autoMissing = (['trunkPos', 'upperArmPos', 'lowerArmPos', 'kneeAdj'] as ItemKey[]).filter((k) => auto[k] == null);
  const side = sideLabel(props.side);
  return (
    <div class="checklist stack">
      {props.onCopyTask && (
        <div class="notice info row">
          <span class="grow">{props.copyLabel ?? '別の場面で入力した作業条件があります。'}</span>
          <button class="btn small" onClick={props.onCopyTask}>
            重量・把持・活動をコピー
          </button>
        </div>
      )}
      <Group title="1. 推定された姿勢の確認">
        {props.frameSlot}
        {autoMissing.length > 0 && (
          <Notice title={`推定できなかった項目：${autoMissing.map((k) => ITEMS[k].label).join('、')}`}>
            画像を見て選ぶか、関節点を調整してください。
          </Notice>
        )}
        {row('trunkPos', true)}
        {row('upperArmPos', true)}
        {row('lowerArmPos', true)}
        {row('kneeAdj')}
        <label class="check" style={{ marginTop: 10 }}>
          <input
            type="checkbox"
            checked={props.postureConfirmed}
            onChange={(e) => props.onPostureConfirmed((e.currentTarget as HTMLInputElement).checked)}
          />
          画像と関節点を見て、上の姿勢区分を確認しました
        </label>
      </Group>

      <Group title="2. 頸部・手首（目視で選択）">
        {row('neckPos', true)}
        {row('wristPos')}
      </Group>

      <Group title="3. ねじれ・側屈" action={allNo(['trunkTwistSide', 'neckTwistSide'])}>
        {row('trunkTwistSide')}
        {row('neckTwistSide')}
      </Group>

      <Group title="4. 脚の支持・荷重状態">{row('legSupport', true)}</Group>

      <Group title="5. 重量／力">
        {row('load')}
        {row('shock')}
      </Group>

      <Group title={`6. 上腕（${side}）の補正`} action={allNo(['upperArmAbdRot', 'shoulderRaised', 'armSupported'])}>
        {row('upperArmAbdRot')}
        {row('shoulderRaised')}
        {row('armSupported')}
      </Group>

      <Group title={`7. 手首（${side}）の偏位・ねじれ`}>{row('wristDevTwist')}</Group>

      <Group title="8. 把持の状態">{row('coupling', true)}</Group>

      <Group title="9. 活動条件（作業全体から判断）" action={allNo(['actStatic', 'actRepeated', 'actRapid'])}>
        {row('actStatic')}
        {row('actRepeated')}
        {row('actRapid')}
      </Group>

      {missing.length > 0 && (
        <Notice title={`未確認：${missing.length} 項目`}>
          <ul>
            {missing.map((k) => (
              <li key={k}>
                <a
                  href={`#item-${k}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(`item-${k}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                >
                  {ITEMS[k].label}
                </a>
              </li>
            ))}
          </ul>
          未確認の項目は0点や「なし」とはみなさず、仮評価（範囲）として扱います。
        </Notice>
      )}
      {!props.postureConfirmed && <Notice title="「1. 推定された姿勢の確認」のチェックが必要です" />}
    </div>
  );
}
