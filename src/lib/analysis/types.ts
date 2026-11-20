import type { Angles, ViewDirection } from '../angles/angles';
import type { Pt } from '../pose/landmarks';
import type { FrameQuality } from './quality';

export interface FrameRecord {
  index: number;
  /** 元動画内の時刻（秒） */
  time: number;
  /** 対象者の画像正規化座標 */
  image: Pt[] | null;
  /** 対象者の推定3D座標（m） */
  world: Pt[] | null;
  /** 対象者以外に検出された人物（画像正規化座標） */
  others: Pt[][];
  numPoses: number;
  quality: FrameQuality;
  angles: Angles;
  view: ViewDirection | null;
  /** 解析したフレーム画像（JPEG）。端末メモリ内のみ */
  imageBlob: Blob | null;
  width: number;
  height: number;
}

export interface AnalysisTiming {
  totalMs: number;
  modelLoadMs: number;
  seekMs: number;
  detectMs: number;
  encodeMs: number;
  frames: number;
}

export interface AnalysisResult {
  /** video: 実際の動画を解析 / demo: 模擬データ（実測ではない） */
  source: 'video' | 'demo';
  videoName: string;
  videoDuration: number;
  segment: { start: number; end: number };
  fps: number;
  frames: FrameRecord[];
  model: string;
  delegate: string;
  timing: AnalysisTiming;
  createdAt: string;
}
