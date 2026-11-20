import { useEffect, useRef } from 'preact/hooks';
import { ModelStatus } from '../components/ModelStatus';
import { BottomBar, Notice, TopBar, fmtSec } from '../components/ui';
import { AccuracyPicker } from '../components/AccuracyPicker';
import type { LoadedVideo } from '../lib/video/videoSource';
import { MAX_CLIP_SEC, PRESETS, type Settings } from '../state/settings';

export interface Segment {
  start: number;
  end: number;
}

export function defaultSegment(duration: number): Segment {
  return { start: 0, end: Math.min(duration, MAX_CLIP_SEC) };
}

export function Prepare({
  video,
  segment,
  onSegment,
  onStart,
  onCancel,
  settings,
  onSettings,
  message,
}: {
  video: LoadedVideo;
  segment: Segment;
  onSegment: (s: Segment) => void;
  onStart: () => void;
  onCancel: () => void;
  settings: Settings;
  onSettings: (s: Settings) => void;
  message: string | null;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const long = video.duration > MAX_CLIP_SEC + 0.05;
  const len = segment.end - segment.start;
  const frames = Math.max(1, Math.floor(len * settings.fps + 1e-6));

  useEffect(() => {
    const v = ref.current;
    if (v && Math.abs(v.currentTime - segment.start) > 0.05 && v.paused) v.currentTime = segment.start;
  }, [segment.start]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const onTime = () => {
      if (!v.paused && v.currentTime >= segment.end) v.pause();
    };
    v.addEventListener('timeupdate', onTime);
    return () => v.removeEventListener('timeupdate', onTime);
  }, [segment.end]);

  const setStart = (s: number) => {
    const l = Math.min(len, video.duration);
    const start = Math.max(0, Math.min(s, video.duration - l));
    onSegment({ start, end: start + l });
  };
  const setLen = (l: number) => {
    const L = Math.min(Math.max(1, l), MAX_CLIP_SEC, video.duration);
    const start = Math.min(segment.start, video.duration - L);
    onSegment({ start, end: start + L });
  };
  const playSegment = () => {
    const v = ref.current;
    if (!v) return;
    v.currentTime = segment.start;
    v.play().catch(() => undefined);
  };

  return (
    <>
      <TopBar title="解析の準備" onBack={onCancel} />
      <main class="desk-2col">
        {message && <Notice kind="info" title={message} />}
        <div class="rec-view">
          <video ref={ref} src={video.url} controls playsInline muted preload="metadata" aria-label="選択した動画" />
        </div>
        <dl class="kv card tight">
          <dt>動画</dt>
          <dd>{video.name}</dd>
          <dt>長さ</dt>
          <dd>{fmtSec(video.duration)}</dd>
          <dt>解像度</dt>
          <dd>
            {video.width}×{video.height}
          </dd>
          <dt>形式</dt>
          <dd>{video.type || '不明'}</dd>
        </dl>

        {long && (
          <div class="card stack">
            <h2>解析する区間を選ぶ（最大{MAX_CLIP_SEC}秒）</h2>
            <p>
              この動画は{MAX_CLIP_SEC}秒を超えています。評価したい動作を含む区間を選んでください。
            </p>
            <label class="field">
              <span>
                開始位置：<strong>{fmtSec(segment.start)}</strong>
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(0, video.duration - len)}
                step={0.1}
                value={segment.start}
                onInput={(e) => setStart(Number((e.currentTarget as HTMLInputElement).value))}
              />
            </label>
            <label class="field">
              <span>
                長さ：<strong>{fmtSec(len)}</strong>
              </span>
              <input
                type="range"
                min={1}
                max={Math.min(MAX_CLIP_SEC, video.duration)}
                step={0.5}
                value={len}
                onInput={(e) => setLen(Number((e.currentTarget as HTMLInputElement).value))}
              />
            </label>
            <div class="row">
              <button class="btn small" onClick={() => setStart(segment.start - 1)}>
                −1秒
              </button>
              <button class="btn small" onClick={() => setStart(segment.start + 1)}>
                ＋1秒
              </button>
              <button class="btn small" onClick={playSegment}>
                ▶ 区間を再生
              </button>
            </div>
          </div>
        )}

        <div class="card stack">
          <p>
            解析区間：<strong>
              {fmtSec(segment.start)}〜{fmtSec(segment.end)}
            </strong>
            （{fmtSec(len)}）
          </p>
          <p>
            毎秒 {settings.fps} フレームを抽出 → 約 {frames} フレーム × 推定 {PRESETS[settings.accuracy].passes} 回（{settings.delegate}）
          </p>
          <h3>解析の精度</h3>
          <AccuracyPicker value={settings.accuracy} onChange={(a) => onSettings({ ...settings, accuracy: a })} />
          <small>精度を上げるほど時間がかかります（端末の性能で大きく変わります）。解析後、関節点は画面上で手動調整できます。</small>
          <ModelStatus />
        </div>
      </main>
      <BottomBar>
        <button class="btn primary big" onClick={onStart}>
          解析を開始
        </button>
      </BottomBar>
    </>
  );
}
