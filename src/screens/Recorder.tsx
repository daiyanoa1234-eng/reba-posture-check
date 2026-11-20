import { useEffect, useRef, useState } from 'preact/hooks';
import { BottomBar, Notice, TopBar, stamp } from '../components/ui';
import { MAX_CLIP_SEC } from '../state/settings';

const MIME_CANDIDATES = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

function pickMime(): string {
  for (const m of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* noop */
    }
  }
  return '';
}

function cameraError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'カメラの使用が許可されていません。ブラウザの設定でカメラを許可するか、下の「端末のカメラで撮影」を使ってください。';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'カメラが見つかりません。';
  if (name === 'NotReadableError') return 'カメラを他のアプリが使用中の可能性があります。';
  return `カメラを起動できません（${e instanceof Error ? e.message : String(e)}）`;
}

export function Recorder({ onDone, onCancel }: { onDone: (f: File) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelled = useRef(false);
  const captureRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<'starting' | 'preview' | 'recording' | 'saving' | 'error'>('starting');
  const [err, setErr] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let alive = true;
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: false,
      })
      .then((stream) => {
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => undefined);
        }
        setState('preview');
      })
      .catch((e) => {
        if (!alive) return;
        setErr(cameraError(e));
        setState('error');
      });
    return () => {
      alive = false;
      cancelled.current = true;
      try {
        if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
      } catch {
        /* noop */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (state !== 'recording') return;
    const t0 = performance.now();
    const id = setInterval(() => {
      const s = (performance.now() - t0) / 1000;
      setElapsed(s);
      if (s >= MAX_CLIP_SEC) stop();
    }, 100);
    return () => clearInterval(id);
  }, [state]);

  const start = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const mime = pickMime();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000 } : undefined);
    } catch (e) {
      setErr(`録画を開始できません（${e instanceof Error ? e.message : String(e)}）`);
      setState('error');
      return;
    }
    chunks.current = [];
    rec.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.current.push(ev.data);
    };
    rec.onstop = () => {
      if (cancelled.current) return;
      const type = rec.mimeType || mime || 'video/webm';
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(chunks.current, { type });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (blob.size === 0) {
        setErr('録画データが空でした。もう一度お試しください。');
        setState('error');
        return;
      }
      onDone(new File([blob], `撮影_${stamp()}.${ext}`, { type }));
    };
    recRef.current = rec;
    rec.start(500);
    setElapsed(0);
    setState('recording');
  };

  const stop = () => {
    const rec = recRef.current;
    if (rec && rec.state !== 'inactive') {
      setState('saving');
      rec.stop();
    }
  };

  const remain = Math.max(0, MAX_CLIP_SEC - elapsed);
  return (
    <>
      <TopBar title="撮影" onBack={state === 'recording' ? undefined : onCancel} />
      <main>
        {err && <Notice kind="error" title={err} />}
        <div class="rec-view">
          <video ref={videoRef} muted playsInline autoPlay aria-label="カメラのプレビュー" />
          <div class="rec-guide" aria-hidden="true" />
          {state === 'recording' && (
            <div class="rec-badge" role="timer" aria-live="off">
              ● 録画中 残り {remain.toFixed(0)}秒
            </div>
          )}
        </div>
        <small>
          枠内に作業者の全身が入るように、真横から撮影してください。{MAX_CLIP_SEC}秒で自動停止します。動画は解析後に破棄され、保存されません。
        </small>
        {state === 'error' && (
          <>
            <button class="btn big" onClick={() => captureRef.current?.click()}>
              端末のカメラで撮影
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
                if (f) onDone(f);
              }}
            />
          </>
        )}
      </main>
      <BottomBar>
        {state === 'recording' ? (
          <button class="btn danger primary big" onClick={stop}>
            ■ 停止（{elapsed.toFixed(1)}秒）
          </button>
        ) : (
          <button class="btn primary big" onClick={start} disabled={state !== 'preview'}>
            {state === 'starting' ? 'カメラ起動中…' : state === 'saving' ? '保存中…' : '● 録画開始'}
          </button>
        )}
      </BottomBar>
    </>
  );
}
