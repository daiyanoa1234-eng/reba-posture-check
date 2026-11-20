import { useEffect, useState } from 'preact/hooks';
import { MODEL_FILES } from '../lib/pose/engine';
import { type AccuracyPreset, PRESETS } from '../state/settings';

/** モデルファイルがこの端末のキャッシュにあるか（オフラインで使えるか） */
export async function isModelCached(path: string): Promise<boolean> {
  try {
    if (!('caches' in globalThis)) return false;
    return !!(await caches.match(path, { ignoreSearch: true }));
  } catch {
    return false;
  }
}

export function useModelCached(path: string, bump = 0): boolean | null {
  const [v, setV] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    isModelCached(path).then((r) => alive && setV(r));
    return () => {
      alive = false;
    };
  }, [path, bump]);
  return v;
}

function Opt({ id, active, onPick }: { id: AccuracyPreset; active: boolean; onPick: (p: AccuracyPreset) => void }) {
  const p = PRESETS[id];
  const m = MODEL_FILES[p.model];
  const cached = useModelCached(m.path);
  return (
    <button class="opt" aria-pressed={active} onClick={() => onPick(id)} style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
      <span>
        <strong>{p.label}</strong>
        <small>　推定 {p.passes} 回／フレーム</small>
      </span>
      <small>{p.description}</small>
      <small>
        {m.label}・約{m.sizeMB}MB{cached ? '・オフライン可' : cached === false ? '・初回は通信が必要' : ''}
      </small>
    </button>
  );
}

export function AccuracyPicker({ value, onChange }: { value: AccuracyPreset; onChange: (p: AccuracyPreset) => void }) {
  return (
    <div class="seg one" role="group" aria-label="解析の精度">
      {(['fast', 'high', 'max'] as AccuracyPreset[]).map((id) => (
        <Opt key={id} id={id} active={value === id} onPick={onChange} />
      ))}
    </div>
  );
}
