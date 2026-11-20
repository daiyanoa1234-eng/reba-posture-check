import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { ModelStatus } from '../components/ModelStatus';
import { Notice, TopBar } from '../components/ui';
import { MODEL_FILES } from '../lib/pose/engine';
import { AccuracyPicker } from '../components/AccuracyPicker';
import { PRESETS, type Settings, deviceDefaults } from '../state/settings';

function Choice<T extends string | number>({ label, value, options, onChange, help }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void; help?: ComponentChildren }) {
  return (
    <div class="item">
      <div class="item-head">
        <span class="label">{label}</span>
      </div>
      {help && <p class="hint">{help}</p>}
      <div class="seg">
        {options.map(([v, l]) => (
          <button key={String(v)} class="opt" aria-pressed={value === v} onClick={() => onChange(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettingsView({ settings, onChange, onBack }: { settings: Settings; onChange: (s: Settings) => void; onBack: () => void }) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });
  const [fetchMsg, setFetchMsg] = useState<string | null>(null);
  const model = MODEL_FILES[PRESETS[settings.accuracy].model];
  const cacheFull = async () => {
    setFetchMsg('取得中…');
    try {
      const res = await fetch(model.path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.arrayBuffer();
      setFetchMsg(`${model.label}モデルを取得しました（オフラインでも使えます）`);
    } catch (e) {
      setFetchMsg(`取得できませんでした（${e instanceof Error ? e.message : String(e)}）`);
    }
  };
  return (
    <>
      <TopBar title="詳細設定" onBack={onBack} />
      <main class="desk-2col">
        <section class="card">
          <h2>解析</h2>
          <Choice
            label="抽出フレーム数（毎秒）"
            value={settings.fps}
            options={[
              [2, '2'],
              [5, '5（初期値）'],
              [10, '10'],
              [15, '15'],
            ]}
            onChange={(v) => set('fps', v)}
            help="多いほど細かく調べられますが、解析時間とメモリ使用量が増えます。"
          />
          <div class="item">
            <div class="item-head">
              <span class="label">解析の精度</span>
            </div>
            <AccuracyPicker value={settings.accuracy} onChange={(v) => set('accuracy', v)} />
            <p class="hint">PC では「最高精度」、スマホでは「高精度」が初期値です。どの設定が現場の動画に最適かは未検証です。</p>
          </div>
          <Choice
            label="実行方式"
            value={settings.delegate}
            options={[
              ['CPU', 'CPU（初期値・安定）'],
              ['GPU', 'GPU（高速化・端末により不安定）'],
            ]}
            onChange={(v) => set('delegate', v)}
            help="GPU が使えない場合は自動で CPU に切り替えます。"
          />
          <ModelStatus />
          <button class="btn small" onClick={cacheFull}>
            選択中の精度のモデル（{model.label}・約{model.sizeMB}MB）をオフライン用に取得
          </button>
          {fetchMsg && <p class="hint">{fetchMsg}</p>}
        </section>

        <section class="card">
          <h2>判定の取り決め</h2>
          <Choice
            label="体幹を「直立」とみなす範囲"
            value={settings.uprightToleranceDeg}
            options={[
              [0, '0°（厳密）'],
              [5, '±5°（初期値）'],
              [10, '±10°'],
            ]}
            onChange={(v) => set('uprightToleranceDeg', v)}
            help="REBA 原著は「直立」の許容範囲を数値で定めていません。推定誤差で直立が 0–20° と判定されるのを避けるための本アプリの取り決めです。"
          />
          <Choice
            label="関節点を「映っている」とみなす下限"
            value={settings.visibilityThreshold}
            options={[
              [0.3, '0.3（緩い）'],
              [0.5, '0.5（初期値）'],
              [0.7, '0.7（厳しい）'],
            ]}
            onChange={(v) => set('visibilityThreshold', v)}
            help="MediaPipe の visibility 値。角度の精度を保証する値ではありません。変更は次の解析から反映されます。"
          />
          <Choice
            label="一瞬の推定エラーとみなす角度の急変"
            value={settings.spikeThresholdDeg}
            options={[
              [30, '30°'],
              [40, '40°（初期値）'],
              [60, '60°'],
            ]}
            onChange={(v) => set('spikeThresholdDeg', v)}
          />
        </section>

        <section class="card">
          <h2>画像</h2>
          <Choice
            label="保存・書き出し画像の顔ぼかし（初期値）"
            value={settings.faceBlur ? 'on' : 'off'}
            options={[
              ['on', 'ぼかす（初期値）'],
              ['off', 'ぼかさない'],
            ]}
            onChange={(v) => set('faceBlur', v === 'on')}
          />
        </section>

        <Notice kind="info">設定はこの端末に保存されます。</Notice>
        <button class="btn block" onClick={() => onChange(deviceDefaults())}>
          初期値に戻す
        </button>
      </main>
    </>
  );
}
