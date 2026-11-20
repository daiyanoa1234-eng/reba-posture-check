// フレーム画像の JPEG 化を別スレッドで行う（解析ループを止めないため）
interface WorkerScope {
  onmessage: ((e: MessageEvent<{ id: number; bitmap: ImageBitmap; quality: number }>) => void) | null;
  postMessage: (m: unknown) => void;
}
const scope = globalThis as unknown as WorkerScope;

scope.onmessage = async (e) => {
  const { id, bitmap, quality } = e.data;
  try {
    const c = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await c.convertToBlob({ type: 'image/jpeg', quality });
    scope.postMessage({ id, blob });
  } catch (err) {
    scope.postMessage({ id, error: String(err) });
  }
};
