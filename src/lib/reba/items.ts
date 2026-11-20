/**
 * REBA の入力項目定義。
 * 各項目は「自動推定値(auto)」と「評価者の入力値(manual)」を別々に持ち、
 * 有効値 = manual ?? auto。どちらも無い項目は「未確認」として扱い、0点や「なし」とはみなさない。
 */

export type ItemKey =
  | 'trunkPos'
  | 'trunkTwistSide'
  | 'neckPos'
  | 'neckTwistSide'
  | 'legSupport'
  | 'kneeAdj'
  | 'load'
  | 'shock'
  | 'upperArmPos'
  | 'upperArmAbdRot'
  | 'shoulderRaised'
  | 'armSupported'
  | 'lowerArmPos'
  | 'wristPos'
  | 'wristDevTwist'
  | 'coupling'
  | 'actStatic'
  | 'actRepeated'
  | 'actRapid';

export interface OptionDef {
  id: string;
  label: string;
  /** REBA 上の点数（補正項目は加算値） */
  points: number;
}

export interface ItemDef {
  key: ItemKey;
  label: string;
  /** 自動推定で値を提案・設定できる項目 */
  autoCapable: boolean;
  /** 左右別（評価側を切り替えると手動入力をやり直す） */
  perSide: boolean;
  options: OptionDef[];
  help?: string;
}

const YES_NO = (yesLabel: string, yesPoints = 1): OptionDef[] => [
  { id: 'no', label: 'なし', points: 0 },
  { id: 'yes', label: yesLabel, points: yesPoints },
];

export const ITEMS: Record<ItemKey, ItemDef> = {
  trunkPos: {
    key: 'trunkPos',
    label: '体幹の姿勢',
    autoCapable: true,
    perSide: false,
    options: [
      { id: '1', label: '直立', points: 1 },
      { id: '2', label: '0〜20° 前屈・後屈', points: 2 },
      { id: '3', label: '20〜60° 前屈／20°超の後屈', points: 3 },
      { id: '4', label: '60°超の前屈', points: 4 },
    ],
  },
  trunkTwistSide: {
    key: 'trunkTwistSide',
    label: '体幹のねじれ・側屈',
    autoCapable: false,
    perSide: false,
    options: YES_NO('ねじれ・側屈あり'),
    help: '+1',
  },
  neckPos: {
    key: 'neckPos',
    label: '頸部の姿勢',
    autoCapable: false,
    perSide: false,
    options: [
      { id: '1', label: '0〜20° 前屈', points: 1 },
      { id: '2', label: '20°超の前屈／後屈（伸展）', points: 2 },
    ],
    help: '推定が不安定なため評価者が確認',
  },
  neckTwistSide: {
    key: 'neckTwistSide',
    label: '頸部のねじれ・側屈',
    autoCapable: false,
    perSide: false,
    options: YES_NO('ねじれ・側屈あり'),
    help: '+1',
  },
  legSupport: {
    key: 'legSupport',
    label: '脚の支持・荷重状態',
    autoCapable: false,
    perSide: false,
    options: [
      { id: 'bilateral', label: '両脚で支持／歩行', points: 1 },
      { id: 'sitting', label: '座位', points: 1 },
      { id: 'unilateral', label: '片脚支持・不安定', points: 2 },
    ],
  },
  kneeAdj: {
    key: 'kneeAdj',
    label: '膝の屈曲',
    autoCapable: true,
    perSide: false,
    options: [
      { id: '0', label: '30°未満', points: 0 },
      { id: '1', label: '30〜60°', points: 1 },
      { id: '2', label: '60°超', points: 2 },
    ],
    help: '座位では 60°超の +2 を適用しない',
  },
  load: {
    key: 'load',
    label: '重量／力',
    autoCapable: false,
    perSide: false,
    options: [
      { id: 'lt5', label: '5kg未満', points: 0 },
      { id: '5to10', label: '5〜10kg', points: 1 },
      { id: 'gt10', label: '10kg超', points: 2 },
    ],
  },
  shock: {
    key: 'shock',
    label: '衝撃・急激な力の発生',
    autoCapable: false,
    perSide: false,
    options: YES_NO('あり'),
    help: '+1',
  },
  upperArmPos: {
    key: 'upperArmPos',
    label: '上腕の姿勢',
    autoCapable: true,
    perSide: true,
    options: [
      { id: '1', label: '20°伸展〜20°屈曲', points: 1 },
      { id: '2', label: '20°超伸展／20〜45°屈曲', points: 2 },
      { id: '3', label: '45〜90°屈曲', points: 3 },
      { id: '4', label: '90°超屈曲', points: 4 },
    ],
  },
  upperArmAbdRot: {
    key: 'upperArmAbdRot',
    label: '上腕の外転・回旋',
    autoCapable: false,
    perSide: true,
    options: YES_NO('あり'),
    help: '+1',
  },
  shoulderRaised: {
    key: 'shoulderRaised',
    label: '肩の挙上（すくめ）',
    autoCapable: false,
    perSide: true,
    options: YES_NO('あり'),
    help: '+1',
  },
  armSupported: {
    key: 'armSupported',
    label: '腕の支持・もたれ・重力補助',
    autoCapable: false,
    perSide: true,
    options: YES_NO('あり', -1),
    help: '−1',
  },
  lowerArmPos: {
    key: 'lowerArmPos',
    label: '前腕（肘）の姿勢',
    autoCapable: true,
    perSide: true,
    options: [
      { id: '1', label: '60〜100° 屈曲', points: 1 },
      { id: '2', label: '60°未満／100°超', points: 2 },
    ],
  },
  wristPos: {
    key: 'wristPos',
    label: '手首の屈曲・伸展',
    autoCapable: false,
    perSide: true,
    options: [
      { id: '1', label: '0〜15°', points: 1 },
      { id: '2', label: '15°超', points: 2 },
    ],
    help: '推定が不安定なため評価者が確認',
  },
  wristDevTwist: {
    key: 'wristDevTwist',
    label: '手首の偏位・ねじれ',
    autoCapable: false,
    perSide: true,
    options: YES_NO('あり'),
    help: '+1',
  },
  coupling: {
    key: 'coupling',
    label: '把持（カップリング）',
    autoCapable: false,
    perSide: false,
    options: [
      { id: 'good', label: '良い：取っ手が適切で中間位の握り', points: 0 },
      { id: 'fair', label: '普通：許容できるが理想的でない／体の他部位で保持', points: 1 },
      { id: 'poor', label: '悪い：許容できないが把持は可能', points: 2 },
      { id: 'unacceptable', label: '不適：取っ手なし・不安定・危険な握り', points: 3 },
    ],
  },
  actStatic: {
    key: 'actStatic',
    label: '静的保持（1分超の保持）',
    autoCapable: false,
    perSide: false,
    options: YES_NO('あり'),
    help: '+1',
  },
  actRepeated: {
    key: 'actRepeated',
    label: '反復（小範囲で毎分4回超・歩行を除く）',
    autoCapable: false,
    perSide: false,
    options: YES_NO('あり'),
    help: '+1',
  },
  actRapid: {
    key: 'actRapid',
    label: '急激な姿勢変化・不安定な足場',
    autoCapable: false,
    perSide: false,
    options: YES_NO('あり'),
    help: '+1',
  },
};

export const ITEM_KEYS = Object.keys(ITEMS) as ItemKey[];
export const SIDE_ITEM_KEYS = ITEM_KEYS.filter((k) => ITEMS[k].perSide);

export type ItemValues = Partial<Record<ItemKey, string>>;

export function optionOf(key: ItemKey, id: string | null | undefined): OptionDef | null {
  if (id == null) return null;
  return ITEMS[key].options.find((o) => o.id === id) ?? null;
}

export function pointsOf(key: ItemKey, id: string | null | undefined): number | null {
  return optionOf(key, id)?.points ?? null;
}

export type ValueSource = 'auto' | 'manual' | 'override' | 'unset';

/** 有効値と出所（自動 / 手動 / 自動値を手動で修正 / 未確認） */
export function resolveItem(key: ItemKey, auto: ItemValues, manual: ItemValues): { value: string | null; source: ValueSource } {
  const m = manual[key];
  const a = auto[key];
  if (m != null) return { value: m, source: a != null && a !== m ? 'override' : 'manual' };
  if (a != null) return { value: a, source: 'auto' };
  return { value: null, source: 'unset' };
}

export function effectiveValues(auto: ItemValues, manual: ItemValues): ItemValues {
  const out: ItemValues = {};
  for (const k of ITEM_KEYS) {
    const v = manual[k] ?? auto[k];
    if (v != null) out[k] = v;
  }
  return out;
}

export const SOURCE_LABEL: Record<ValueSource, string> = {
  auto: '自動推定',
  manual: '手動入力',
  override: '手動修正',
  unset: '未確認',
};
