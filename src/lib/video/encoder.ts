/**
 * フレーム画像の JPEG 化。
 * HTMLCanvasElement.toBlob はブラウザによってはアイドル時まで後回しにされ、解析中は1枚1秒近く待つことがあるため、
 * 対応環境では Web Worker（OffscreenCanvas）で並行して行う。非対応環境では toBlob を待たずに投げておく。
 */
import { canvasToJpeg } from './videoSource';

let worker: Worker | null = null;
let workerBroken = false;
let seq = 0;
const pending = new Map<number, { resolve: (b: Blob) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return null;
  if (!('convertToBlob' in OffscreenCanvas.prototype)) return null;
  try {
    worker = new Worker(new URL('./encodeWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; blob?: Blob; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.blob) p.resolve(e.data.blob);
      else p.reject(new Error(e.data.error ?? 'encode failed'));
    };
    worker.onerror = () => {
      workerBroken = true;
      for (const [, p] of pending) p.reject(new Error('worker error'));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

function bitmapToJpeg(bitmap: ImageBitmap, quality: number): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = bitmap.width;
  c.height = bitmap.height;
  c.getContext('2d')!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvasToJpeg(c, quality);
}

/** canvas の現在の内容を JPEG にする。内容は呼び出し時点で確定し、以後 canvas を描き換えてよい */
export function encodeFrame(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  const w = getWorker();
  if (!w) return canvasToJpeg(canvas, quality);
  // createImageBitmap は呼び出し時点の内容を複製する
  return createImageBitmap(canvas).then(
    (bitmap) =>
      new Promise<Blob>((resolve, reject) => {
        if (workerBroken || !worker) {
          bitmapToJpeg(bitmap, quality).then(resolve, reject);
          return;
        }
        const id = ++seq;
        pending.set(id, {
          resolve,
          reject: () => {
            // Worker 側で失敗した場合はメインスレッドで再試行（bitmap は転送済みのため再取得不可）
            reject(new Error('フレーム画像の作成に失敗しました'));
          },
        });
        worker.postMessage({ id, bitmap, quality }, [bitmap]);
      }),
  );
}
