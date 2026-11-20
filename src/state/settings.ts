export type ModelVariant = 'lite' | 'full';
export type DelegatePref = 'CPU' | 'GPU';

export interface Settings {
  /** 1秒あたりの抽出フレーム数 */
  fps: number;
  model: ModelVariant;
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
  model: 'lite',
  delegate: 'CPU',
  visibilityThreshold: 0.5,
  uprightToleranceDeg: 5,
  neckExtensionToleranceDeg: 5,
  spikeThresholdDeg: 40,
  candidateSeparationSec: 1,
  faceBlur: true,
  frameMaxSide: 960,
};

const KEY = 'reba-settings-v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* プライベートモード等で保存できなくても動作は継続 */
  }
}
