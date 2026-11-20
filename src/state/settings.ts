export type ModelVariant = 'lite' | 'full' | 'heavy';
export type DelegatePref = 'CPU' | 'GPU';
export type AccuracyPreset = 'fast' | 'high' | 'max';

export interface PresetDef {
  label: string;
  model: ModelVariant;
  /** 人物領域を切り出して2回目の推定を行う */
  refine: boolean;
  /** 左右反転画像でも推定して統合する */
  flip: boolean;
  /** 1フレームあたりの推定回数 */
  passes: number;
  description: string;
}

export const PRESETS: Record<AccuracyPreset, PresetDef> = {
  fast: {
    label: '速度優先',
    model: 'lite',
    refine: false,
    flip: false,
    passes: 1,
    description: '軽量モデルで1回推定。最も速いが関節点は粗い',
  },
  high: {
    label: '高精度',
    model: 'full',
    refine: true,
    flip: false,
    passes: 2,
    description: '標準モデル＋人物を切り出して拡大し再推定',
  },
  max: {
    label: '最高精度',
    model: 'heavy',
    refine: true,
    flip: true,
    passes: 3,
    description: '高精度モデル＋切り出し再推定＋左右反転画像との統合（不一致の点は要確認に）',
  },
};

/** PC（大きな画面・マウス操作）かどうか。初期設定の選択だけに使う */
export function isDesktopLike(): boolean {
  try {
    return window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches;
  } catch {
    return false;
  }
}

export interface Settings {
  /** 1秒あたりの抽出フレーム数 */
  fps: number;
  /** 精度と速度の設定（モデル・推定回数を決める） */
  accuracy: AccuracyPreset;
  delegate: DelegatePref;
  /** 関節点を「映っている」とみなす visibility の下限（精度の保証ではない） */
  visibilityThreshold: number;
  /** 体幹を「直立」とみなす前後傾の範囲（±度）。REBA原著に数値はなく、本アプリの実装上の取り決め */
  uprightToleranceDeg: number;
  /** 頸部の「伸展」とみなす後傾量（度）。推定ノイズを伸展と誤判定しないための取り決め（参考提示のみに使用） */
  neckExtensionToleranceDeg: number;
  /** 前後フレームと比べてこれ以上急変した角度は一瞬の推定エラーとみなす（度） */
  spikeThresholdDeg: number;
  /** 評価候補どうしの最小時間間隔（秒） */
  candidateSeparationSec: number;
  /** 保存・書き出し画像の顔ぼかし */
  faceBlur: boolean;
  /** 解析用フレーム画像の長辺（px） */
  frameMaxSide: number;
}

export const MAX_CLIP_SEC = 20;

export const DEFAULT_SETTINGS: Settings = {
  fps: 5,
  accuracy: 'high',
  delegate: 'CPU',
  visibilityThreshold: 0.5,
  uprightToleranceDeg: 5,
  neckExtensionToleranceDeg: 5,
  spikeThresholdDeg: 40,
  candidateSeparationSec: 1,
  faceBlur: true,
  frameMaxSide: 960,
};

const KEY = 'reba-settings-v2';

/** 端末に合わせた初期設定（PC は最高精度、スマホは高精度） */
export function deviceDefaults(): Settings {
  const desk = isDesktopLike();
  return { ...DEFAULT_SETTINGS, accuracy: desk ? 'max' : 'high', frameMaxSide: desk ? 1280 : 960 };
}

export function loadSettings(): Settings {
  const base = deviceDefaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const s = { ...base, ...parsed };
    if (!(s.accuracy in PRESETS)) s.accuracy = base.accuracy;
    return s;
  } catch {
    return base;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* プライベートモード等で保存できなくても動作は継続 */
  }
}
