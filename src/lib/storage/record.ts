import type { Angles, ViewDirection } from '../angles/angles';
import type { Side } from '../pose/landmarks';
import type { Hint } from '../reba/autoItems';
import type { ItemKey, ItemValues } from '../reba/items';
import type { AssessmentStatus, RebaResult } from '../reba/scoring';

export interface AssessmentMeta {
  taskName: string;
  site: string;
  evaluator: string;
  note: string;
}

/** 端末内に保存する評価結果。動画そのものは保存しない */
export interface AssessmentRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  appVersion: string;
  /** 模擬データから作った評価（実測ではない） */
  isDemo: boolean;
  status: AssessmentStatus;
  meta: AssessmentMeta;
  source: {
    videoName: string;
    segmentStart: number;
    segmentEnd: number;
    frameIndex: number;
    frameTime: number;
    fps: number;
    model: string;
    /** 精度設定（速度優先 / 高精度 / 最高精度） */
    accuracy?: string;
    delegate: string;
    analysisMs: number;
    analyzedFrames: number;
  };
  side: Side;
  view: ViewDirection | null;
  /** 評価フレームの角度（関節点の手動調整を反映した値。推定値） */
  angles: Angles;
  /** 手動調整前の自動推定の角度 */
  anglesAuto?: Angles;
  /** 評価者が手動で調整した関節点（画像正規化座標の調整前→調整後） */
  landmarkEdits?: { joint: number; name: string; from: { x: number; y: number } | null; to: { x: number; y: number } }[];
  /** 自動推定で設定した値 */
  auto: ItemValues;
  /** 評価者が入力・修正した値 */
  manual: ItemValues;
  hints: Partial<Record<ItemKey, Hint>>;
  postureConfirmed: boolean;
  result: RebaResult;
  /** 評価画像（JPEG） */
  image: Blob | null;
  imageFaceBlurred: boolean;
  qualityIssues: string[];
}

export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
