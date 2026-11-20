/**
 * 動画ファイルの読み込みとフレーム取り出し。動画は端末内の Blob URL として扱い、外部へ送らない。
 */

export interface LoadedVideo {
  url: string;
  video: HTMLVideoElement;
  name: string;
  type: string;
  size: number;
  duration: number;
  width: number;
  height: number;
}

export class VideoLoadError extends Error {
  constructor(
    msg: string,
    readonly kind: 'unsupported' | 'timeout' | 'empty',
  ) {
    super(msg);
    this.name = 'VideoLoadError';
  }
}

let holder: HTMLDivElement | null = null;
function hiddenHolder(): HTMLDivElement {
  if (holder) return holder;
  holder = document.createElement('div');
  // iOS Safari は DOM 外の video をデコードしないことがあるため、見えない形で配置する
  holder.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1';
  holder.setAttribute('aria-hidden', 'true');
  document.body.appendChild(holder);
  return holder;
}

function waitEvent(el: HTMLMediaElement, ok: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const handlers: [string, () => void][] = [];
    const done = (fn: () => void) => {
      clearTimeout(timer);
      for (const [n, h] of handlers) el.removeEventListener(n, h);
      fn();
    };
    for (const n of ok) {
      const h = () => done(() => resolve(n));
      handlers.push([n, h]);
      el.addEventListener(n, h);
    }
    const onErr = () => done(() => reject(new VideoLoadError('この動画形式は再生できません', 'unsupported')));
    handlers.push(['error', onErr]);
    el.addEventListener('error', onErr);
    const timer = setTimeout(() => done(() => reject(new VideoLoadError('動画の読み込みがタイムアウトしました', 'timeout'))), timeoutMs);
  });
}

export async function loadVideo(file: Blob, name: string): Promise<LoadedVideo> {
  if (!file || file.size === 0) throw new VideoLoadError('動画が空です', 'empty');
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  video.preload = 'auto';
  hiddenHolder().appendChild(video);
  video.src = url;
  try {
    await waitEvent(video, ['loadedmetadata'], 20000);
    // MediaRecorder で作った WebM は長さ情報が無いことがあるため末尾までシークして確定させる
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      video.currentTime = 1e7;
      await waitEvent(video, ['durationchange', 'seeked', 'timeupdate'], 8000).catch(() => undefined);
      for (let i = 0; i < 20 && !Number.isFinite(video.duration); i++) await new Promise((r) => setTimeout(r, 100));
      video.currentTime = 0;
    }
    if (video.readyState < 2) {
      // iOS ではいったん再生しないとフレームがデコードされないことがある
      try {
        await video.play();
        video.pause();
      } catch {
        /* 自動再生不可でも続行 */
      }
      await waitEvent(video, ['loadeddata', 'canplay'], 8000).catch(() => undefined);
    }
    if (!video.videoWidth || !video.videoHeight) {
      throw new VideoLoadError('映像トラックを読み取れません（端末が対応していない形式の可能性）', 'unsupported');
    }
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new VideoLoadError('動画の長さを取得できません', 'unsupported');
    }
    return {
      url,
      video,
      name,
      type: file.type,
      size: file.size,
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
    };
  } catch (e) {
    releaseVideo({ url, video } as LoadedVideo);
    throw e;
  }
}

export function releaseVideo(v: Pick<LoadedVideo, 'url' | 'video'> | null): void {
  if (!v) return;
  try {
    v.video.pause();
    v.video.removeAttribute('src');
    v.video.load();
    v.video.remove();
  } catch {
    /* noop */
  }
  URL.revokeObjectURL(v.url);
}

type RVFCVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

/** 指定時刻へシークし、そのフレームが描画可能になるまで待つ */
export function seekTo(video: HTMLVideoElement, t: number, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const v = video as RVFCVideo;
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeEventListener('seeked', onSeeked);
      if (err) reject(err);
      else resolve();
    };
    const onSeeked = () => {
      // Safari では seeked 直後に古いフレームが描画されることがあるため、次のフレーム提示を短時間待つ
      // 画面が非表示のときはフレーム提示が起きないため待たない
      if (v.requestVideoFrameCallback && !document.hidden) {
        let id = 0;
        const fallback = setTimeout(() => {
          v.cancelVideoFrameCallback?.(id);
          finish();
        }, 120);
        id = v.requestVideoFrameCallback(() => {
          clearTimeout(fallback);
          finish();
        });
      } else if (document.hidden) {
        finish();
      } else {
        setTimeout(() => finish(), 30);
      }
    };
    const timer = setTimeout(() => finish(new Error(`シークがタイムアウトしました（${t.toFixed(2)}秒）`)), timeoutMs);
    video.addEventListener('seeked', onSeeked);
    video.currentTime = t;
  });
}

/** 現在のフレームを長辺 maxSide 以下に縮小して canvas に描く */
export function drawFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement, maxSide: number): { w: number; h: number } {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const s = Math.min(1, maxSide / Math.max(vw, vh));
  const w = Math.round(vw * s);
  const h = Math.round(vh * s);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: false })!;
  ctx.drawImage(video, 0, 0, w, h);
  return { w, h };
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像の作成に失敗しました'))), 'image/jpeg', quality),
  );
}

export const VIDEO_HELP =
  'iPhone は「設定 > カメラ > フォーマット」で「互換性優先」にすると H.264 形式で保存され、多くのブラウザで読み込めます。' +
  'Android で読み込めない場合は、カメラアプリの動画形式（HEVC/H.265 など）を標準（H.264）に変更してください。';
