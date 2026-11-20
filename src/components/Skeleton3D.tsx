import { useEffect, useRef, useState } from 'preact/hooks';
import type { Pt, Side } from '../lib/pose/landmarks';
import type { SkeletonScene, ViewPreset } from '../lib/three/skeletonScene';

/** 3D骨格（推定）。表示を開いたときに Three.js を読み込む */
export function Skeleton3D({ world, side, time }: { world: Pt[] | null; side: Side | null; time: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<SkeletonScene | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    import('../lib/three/skeletonScene')
      .then(({ SkeletonScene }) => {
        if (disposed || !ref.current) return;
        try {
          sceneRef.current = new SkeletonScene(ref.current);
          setReady(true);
        } catch (e) {
          setErr(e instanceof Error ? e.message : String(e));
        }
      })
      .catch(() => setErr('3D表示の読み込みに失敗しました'));
    return () => {
      disposed = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (ready) sceneRef.current?.setPose(world, side);
  }, [ready, world, side]);

  const view = (v: ViewPreset) => sceneRef.current?.setView(v);

  if (err) return <div class="notice error">3D表示を利用できません（{err}）。WebGL に対応したブラウザで開いてください。</div>;
  return (
    <div class="stack">
      <div class="three-wrap">
        <canvas ref={ref} aria-label="推定3D骨格。ドラッグで回転、ピンチで拡大縮小" />
        <div class="three-label">3D推定（{time.toFixed(1)}秒の姿勢）</div>
        {!world && <div class="three-label" style={{ top: 'auto', bottom: 8 }}>このフレームは人物を検出できていません</div>}
      </div>
      <div class="row">
        <button class="btn small" onClick={() => view('camera')}>動画と同じ向き</button>
        <button class="btn small" onClick={() => view('side')}>横から</button>
        <button class="btn small" onClick={() => view('top')}>上から</button>
      </div>
      <small>
        MediaPipe が推定した3次元座標（奥行きを含む推定値）を表示しています。実際の身体寸法・関節位置を測定したものではありません。左＝橙、右＝青、評価側は太く表示。
      </small>
    </div>
  );
}
