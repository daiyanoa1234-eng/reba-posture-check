import { Fragment } from 'preact';
import type { Angles } from '../lib/angles/angles';
import type { Side } from '../lib/pose/landmarks';
import { ITEMS, type ItemKey, type ItemValues, SOURCE_LABEL, optionOf, resolveItem } from '../lib/reba/items';
import { type Range, type RebaResult, rangeText } from '../lib/reba/scoring';
import { fmtDeg } from './ui';

type RowSpec = { k: ItemKey; angle?: (a: Angles, s: Side) => string };

const GROUP_A: { items: RowSpec[]; sum: [string, keyof RebaResult] }[] = [
  {
    items: [
      { k: 'trunkPos', angle: (a) => (a.trunkFlexion == null ? '—' : `${a.trunkFlexion >= 0 ? '前傾' : '後傾'}${fmtDeg(Math.abs(a.trunkFlexion))}`) },
      { k: 'trunkTwistSide' },
    ],
    sum: ['体幹', 'trunk'],
  },
  { items: [{ k: 'neckPos', angle: (a) => (a.neckFlexion == null ? '—' : `参考 ${fmtDeg(a.neckFlexion)}`) }, { k: 'neckTwistSide' }], sum: ['頸部', 'neck'] },
  {
    items: [{ k: 'legSupport' }, { k: 'kneeAdj', angle: (a) => `左${fmtDeg(a.kneeFlexion.left)} 右${fmtDeg(a.kneeFlexion.right)}` }],
    sum: ['脚', 'legs'],
  },
];
const GROUP_B: { items: RowSpec[]; sum: [string, keyof RebaResult] }[] = [
  {
    items: [
      { k: 'upperArmPos', angle: (a, s) => (a.upperArm[s] ? `${a.upperArm[s]!.isExtension ? '伸展' : ''}${fmtDeg(a.upperArm[s]!.elevation)}` : '—') },
      { k: 'upperArmAbdRot', angle: (a, s) => (a.upperArm[s] ? `外転 参考${fmtDeg(Math.max(0, a.upperArm[s]!.abduction))}` : '') },
      { k: 'shoulderRaised' },
      { k: 'armSupported' },
    ],
    sum: ['上腕', 'upperArm'],
  },
  { items: [{ k: 'lowerArmPos', angle: (a, s) => fmtDeg(a.elbowFlexion[s]) }], sum: ['前腕', 'lowerArm'] },
  { items: [{ k: 'wristPos', angle: (a, s) => `参考 ${fmtDeg(a.wristBend[s])}` }, { k: 'wristDevTwist' }], sum: ['手首', 'wrist'] },
];

function ItemTr({ spec, auto, manual, a, side }: { spec: RowSpec; auto: ItemValues; manual: ItemValues; a: Angles; side: Side }) {
  const { value, source } = resolveItem(spec.k, auto, manual);
  const o = optionOf(spec.k, value);
  return (
    <tr>
      <th scope="row">
        {ITEMS[spec.k].label}
        {spec.angle && (
          <>
            <br />
            <small>推定 {spec.angle(a, side)}</small>
          </>
        )}
      </th>
      <td>{o ? o.label : <strong style={{ color: 'var(--danger)' }}>未確認</strong>}</td>
      <td class="num">{o ? (o.points > 0 && !['trunkPos', 'neckPos', 'legSupport', 'upperArmPos', 'lowerArmPos', 'wristPos', 'load', 'coupling'].includes(spec.k) ? `+${o.points}` : o.points) : '?'}</td>
      <td>
        <span class={`tag ${source}`}>{SOURCE_LABEL[source]}</span>
      </td>
    </tr>
  );
}

function SumTr({ label, r }: { label: string; r: Range }) {
  return (
    <tr class="sum">
      <td colSpan={2}>{label}</td>
      <td class="num">{rangeText(r)}</td>
      <td />
    </tr>
  );
}

export function ScoreTable({ result, auto, manual, angles, side }: { result: RebaResult; auto: ItemValues; manual: ItemValues; angles: Angles; side: Side }) {
  const block = (groups: typeof GROUP_A) =>
    groups.map((g) => (
      <Fragment key={g.sum[0]}>
        {g.items.map((s) => (
          <ItemTr key={s.k} spec={s} auto={auto} manual={manual} a={angles} side={side} />
        ))}
        <SumTr label={`${g.sum[0]}スコア`} r={result[g.sum[1]] as Range} />
      </Fragment>
    ));
  return (
    <table class="data">
      <thead>
        <tr>
          <th>項目</th>
          <th>選択</th>
          <th class="num">点</th>
          <th>出所</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th colSpan={4}>グループA（体幹・頸部・脚）</th>
        </tr>
        {block(GROUP_A)}
        <SumTr label="Table A" r={result.tableA} />
        <ItemTr spec={{ k: 'load' }} auto={auto} manual={manual} a={angles} side={side} />
        <ItemTr spec={{ k: 'shock' }} auto={auto} manual={manual} a={angles} side={side} />
        <SumTr label="スコアA（Table A＋重量/力）" r={result.scoreA} />
        <tr>
          <th colSpan={4}>グループB（上腕・前腕・手首：{side === 'left' ? '左' : '右'}）</th>
        </tr>
        {block(GROUP_B)}
        <SumTr label="Table B" r={result.tableB} />
        <ItemTr spec={{ k: 'coupling' }} auto={auto} manual={manual} a={angles} side={side} />
        <SumTr label="スコアB（Table B＋把持）" r={result.scoreB} />
        <SumTr label="Table C（スコアA×スコアB）" r={result.tableC} />
        <ItemTr spec={{ k: 'actStatic' }} auto={auto} manual={manual} a={angles} side={side} />
        <ItemTr spec={{ k: 'actRepeated' }} auto={auto} manual={manual} a={angles} side={side} />
        <ItemTr spec={{ k: 'actRapid' }} auto={auto} manual={manual} a={angles} side={side} />
        <SumTr label="活動スコア" r={result.activity} />
        <SumTr label="REBA スコア（Table C＋活動）" r={result.reba} />
      </tbody>
    </table>
  );
}
