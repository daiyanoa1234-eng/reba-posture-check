import { FrameView } from '../components/FrameView';
import { ModelStatus } from '../components/ModelStatus';
import { BottomBar, TopBar } from '../components/ui';
import type { AnalyzeProgress } from '../lib/analysis/analyze';

export function Analyzing({ progress, onCancel }: { progress: AnalyzeProgress | null; onCancel: () => void }) {
  const done = progress?.done ?? 0;
  const total = progress?.total ?? 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const el = (progress?.elapsedMs ?? 0) / 1000;
  return (
    <>
      <TopBar title="解析中" />
      <main class="desk-2col">
        <div class="card stack" aria-live="polite">
          <ModelStatus />
          {progress?.phase === 'frames' || done > 0 ? (
            <>
              <p>
                フレームを解析中：<strong>{done}</strong> / {total}（{pct}%）
              </p>
              <div class="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                <div style={{ width: `${pct}%` }} />
              </div>
              <small>
                経過 {el.toFixed(1)} 秒。{progress?.phase === 'images' ? 'フレーム画像を整理しています…' : '端末内で処理しています。'}
              </small>
            </>
          ) : (
            <p>解析モデルを準備しています…</p>
          )}
        </div>
        {progress?.last && (
          <div class="stack">
            <small>
              直近のフレーム（{progress.last.time.toFixed(1)}秒）：
              {progress.last.quality.detected ? (progress.last.numPoses > 1 ? '複数人を検出' : '人物を検出') : '人物を検出できません'}
            </small>
            <FrameView frame={progress.last} side={null} showLabels={false} />
          </div>
        )}
      </main>
      <BottomBar>
        <button class="btn danger big" onClick={onCancel}>
          キャンセル
        </button>
      </BottomBar>
    </>
  );
}
