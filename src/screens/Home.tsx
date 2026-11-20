import { useRef } from 'preact/hooks';
import { ModelStatus } from '../components/ModelStatus';
import { Notice, TopBar } from '../components/ui';
import { MAX_CLIP_SEC } from '../state/settings';

export function Home(props: {
  onRecord: () => void;
  onPickFile: (f: File) => void;
  onDemo: () => void;
  onHistory: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onRetryModel: () => void;
  error: string | null;
  offlineReady: boolean;
  needRefresh: boolean;
  onUpdate: () => void;
  savedCount: number | null;
  busy: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const canRecord = !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined' && window.isSecureContext;
  return (
    <>
      <TopBar
        title="REBA 姿勢評価"
        right={
          <button class="icon-btn" onClick={props.onHelp} aria-label="使い方と注意">
            ？使い方
          </button>
        }
      />
      <main>
        {props.needRefresh && (
          <Notice kind="info" title="新しいバージョンがあります">
            <button class="btn small" onClick={props.onUpdate}>
              更新して再読み込み
            </button>
          </Notice>
        )}
        {props.error && <Notice kind="error" title={props.error} />}
        <div class="stack">
          <button
            class="btn primary big"
            onClick={() => (canRecord ? props.onRecord() : captureRef.current?.click())}
            disabled={props.busy}
          >
            ● 撮影する（最大{MAX_CLIP_SEC}秒）
          </button>
          {!canRecord && (
            <small>
              この環境ではアプリ内撮影が使えないため、端末のカメラで撮影する画面を開きます（自動停止はしません。{MAX_CLIP_SEC}秒を超えた場合は解析区間を選べます）。
            </small>
          )}
          <button class="btn big" onClick={() => fileRef.current?.click()} disabled={props.busy}>
            ▶ 保存済みの動画を選ぶ
          </button>
          <input
            ref={captureRef}
            type="file"
            accept="video/*"
            capture="environment"
            class="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const f = (e.currentTarget as HTMLInputElement).files?.[0];
              (e.currentTarget as HTMLInputElement).value = '';
              if (f) props.onPickFile(f);
            }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            class="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const f = (e.currentTarget as HTMLInputElement).files?.[0];
              (e.currentTarget as HTMLInputElement).value = '';
              if (f) props.onPickFile(f);
            }}
          />
          <button class="btn big" onClick={props.onHistory}>
            ≡ 保存した評価{props.savedCount != null ? `（${props.savedCount}件）` : ''}
          </button>
        </div>

        <div class="card stack">
          <ModelStatus onRetry={props.onRetryModel} />
          <small>
            {props.offlineReady
              ? '✓ オフラインで利用できる状態です（解析に必要なファイルを端末に保存済み）。'
              : 'インターネット接続時に一度開くと、以後はオフラインでも利用できます。'}
          </small>
          <small>動画と解析結果は端末内だけで処理し、外部へ送信しません。動画は保存しません。</small>
        </div>

        <div class="card stack">
          <h2>撮影のコツ</h2>
          <ul style={{ margin: 0, paddingLeft: '1.2em' }}>
            <li>作業者1人の全身（頭から足首まで）が入るように</li>
            <li>できるだけ真横から、スマホを傾けずに縦向きで</li>
            <li>評価したい動作を含む {MAX_CLIP_SEC} 秒以内</li>
          </ul>
        </div>

        <div class="row">
          <button class="btn small" onClick={props.onSettings}>
            ⚙ 詳細設定
          </button>
          <button class="btn small" onClick={props.onDemo} disabled={props.busy}>
            模擬データで操作を試す
          </button>
        </div>
        <small class="center">
          本アプリの角度・スコアは画像からの推定に基づく参考値です。臨床的・研究的な妥当性は検証されていません。最終判断は評価者が行ってください。
          <br />v{__APP_VERSION__}
        </small>
      </main>
    </>
  );
}
