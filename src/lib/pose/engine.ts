/**
 * MediaPipe Pose Landmarker の読み込みと推論。
 * WASM・モデルは同一オリジンから取得する（CDN 不使用）。Service Worker がキャッシュするため2回目以降はオフラインで動く。
 * 各フレームを独立に推定する IMAGE モードを使い、時間方向の平滑化で別時刻の姿勢が混ざらないようにする。
 */
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { DelegatePref, ModelVariant } from '../../state/settings';
import type { Pt } from './landmarks';

export type EngineState = 'idle' | 'loading' | 'ready' | 'error';

export interface EngineStatus {
  state: EngineState;
  model: ModelVariant;
  delegate: DelegatePref;
  message?: string;
  /** モデルファイルの取得進捗 0..1（不明時 null） */
  progress?: number | null;
  loadMs?: number;
}

export interface DetectOutput {
  image: Pt[][];
  world: Pt[][];
}

const base = import.meta.env.BASE_URL;
export const MODEL_FILES: Record<ModelVariant, { path: string; label: string; sizeMB: number }> = {
  lite: { path: `${base}models/pose_landmarker_lite.task`, label: '軽量（lite）', sizeMB: 5.8 },
  full: { path: `${base}models/pose_landmarker_full.task`, label: '標準（full）', sizeMB: 9.4 },
  heavy: { path: `${base}models/pose_landmarker_heavy.task`, label: '高精度（heavy）', sizeMB: 30.7 },
};

type Listener = (s: EngineStatus) => void;

class Engine {
  private landmarker: PoseLandmarker | null = null;
  private key = '';
  private loading: Promise<void> | null = null;
  private listeners = new Set<Listener>();
  private modelCache = new Map<ModelVariant, Uint8Array>();
  status: EngineStatus = { state: 'idle', model: 'lite', delegate: 'CPU' };

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    l(this.status);
    return () => this.listeners.delete(l);
  }

  private set(s: Partial<EngineStatus>) {
    this.status = { ...this.status, ...s };
    for (const l of this.listeners) l(this.status);
  }

  private async fetchModel(model: ModelVariant): Promise<Uint8Array> {
    const cached = this.modelCache.get(model);
    if (cached) return cached;
    const res = await fetch(MODEL_FILES[model].path);
    if (!res.ok) throw new Error(`モデルファイルを取得できません（HTTP ${res.status}）`);
    const total = Number(res.headers.get('content-length')) || 0;
    let buf: Uint8Array;
    if (res.body && total > 0) {
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        this.set({ progress: Math.min(1, got / total) });
      }
      buf = new Uint8Array(got);
      let o = 0;
      for (const c of chunks) {
        buf.set(c, o);
        o += c.length;
      }
    } else {
      buf = new Uint8Array(await res.arrayBuffer());
    }
    if (buf.byteLength < 1000) throw new Error('モデルファイルが不正です');
    this.modelCache.set(model, buf);
    return buf;
  }

  /** 指定のモデル・実行方式で準備する（同じ設定なら再利用） */
  ensure(model: ModelVariant, delegate: DelegatePref): Promise<void> {
    const key = `${model}/${delegate}`;
    if (this.landmarker && this.key === key) return Promise.resolve();
    if (this.loading && this.key === key) return this.loading;
    this.key = key;
    const t0 = performance.now();
    this.set({ state: 'loading', model, delegate, message: undefined, progress: null });
    this.loading = (async () => {
      try {
        this.landmarker?.close();
        this.landmarker = null;
        const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`);
        const buf = await this.fetchModel(model);
        const create = (d: DelegatePref) =>
          PoseLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetBuffer: buf, delegate: d },
            runningMode: 'IMAGE',
            numPoses: 2,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        let used: DelegatePref = delegate;
        try {
          this.landmarker = await create(delegate);
        } catch (e) {
          if (delegate !== 'GPU') throw e;
          // GPU が使えない端末では CPU に切り替える
          used = 'CPU';
          this.landmarker = await create('CPU');
        }
        this.set({ state: 'ready', delegate: used, loadMs: performance.now() - t0, progress: 1 });
      } catch (e) {
        this.key = '';
        this.landmarker = null;
        const msg = e instanceof Error ? e.message : String(e);
        this.set({ state: 'error', message: msg });
        throw new EngineLoadError(msg);
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  detect(source: TexImageSource): DetectOutput {
    if (!this.landmarker) throw new Error('姿勢推定モデルが準備できていません');
    const r = this.landmarker.detect(source as HTMLCanvasElement);
    const conv = (arr: { x: number; y: number; z: number; visibility?: number }[][]) =>
      arr.map((pose) => pose.map((p) => ({ x: p.x, y: p.y, z: p.z, v: p.visibility ?? 0 })));
    return { image: conv(r.landmarks), world: conv(r.worldLandmarks) };
  }

  /** GPU 推論で失敗したとき CPU に切り替えるために使う */
  async fallbackToCpu(): Promise<void> {
    await this.ensure(this.status.model, 'CPU');
  }
}

export class EngineLoadError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'EngineLoadError';
  }
}

export const poseEngine = new Engine();
