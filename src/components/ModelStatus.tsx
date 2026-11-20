import { useEffect, useState } from 'preact/hooks';
import { type EngineStatus, MODEL_FILES, poseEngine } from '../lib/pose/engine';

export function useEngineStatus(): EngineStatus {
  const [s, setS] = useState<EngineStatus>(poseEngine.status);
  useEffect(() => poseEngine.subscribe(setS), []);
  return s;
}

export function ModelStatus({ onRetry }: { onRetry?: () => void }) {
  const s = useEngineStatus();
  const model = MODEL_FILES[s.model].label;
  let text: string;
  let icon: string;
  switch (s.state) {
    case 'idle':
      icon = '○';
      text = `解析モデル：未読み込み（${model}）`;
      break;
    case 'loading':
      icon = '…';
      text = `解析モデル：読み込み中${s.progress != null ? ` ${Math.round(s.progress * 100)}%` : ''}（${model}）`;
      break;
    case 'ready':
      icon = '✓';
      text = `解析モデル：準備完了（${model}・${s.delegate}${s.loadMs ? `・${(s.loadMs / 1000).toFixed(1)}秒` : ''}）`;
      break;
    default:
      icon = '⚠';
      text = `解析モデル：読み込み失敗（${s.message ?? '不明なエラー'}）`;
  }
  return (
    <div class={`row ${s.state === 'error' ? 'notice error' : ''}`} role="status" aria-live="polite">
      <span aria-hidden="true" style={{ fontWeight: 800 }}>
        {icon}
      </span>
      <span class="grow" style={{ fontSize: '0.95rem' }}>
        {text}
      </span>
      {s.state === 'error' && onRetry && (
        <button class="btn small" onClick={onRetry}>
          再試行
        </button>
      )}
    </div>
  );
}
