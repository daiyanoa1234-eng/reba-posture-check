// 実行時に CDN へ依存しないよう、MediaPipe の WASM とポーズ推定モデルを public/ に配置する。
// - WASM: node_modules/@mediapipe/tasks-vision/wasm からコピー（npm パッケージ同梱物）
// - モデル: public/models に同梱（リポジトリにコミット済み）。無い場合のみ公式配布元から取得し SHA-256 を検証する。
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const quiet = process.argv.includes('--quiet');
const log = (...a) => { if (!quiet) console.log(...a); };

// --- WASM -----------------------------------------------------------------
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmDst = join(root, 'public/mediapipe/wasm');
mkdirSync(wasmDst, { recursive: true });
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) {
  const src = join(wasmSrc, f);
  if (!existsSync(src)) {
    console.error(`[assets] ${src} がありません。npm install を実行してください。`);
    process.exit(1);
  }
  copyFileSync(src, join(wasmDst, f));
}
log('[assets] MediaPipe WASM をコピーしました');

// --- Models ---------------------------------------------------------------
// 配布元: Google MediaPipe 公式モデル（Apache-2.0）。版を固定（/float16/1/）。
const MODELS = [
  {
    file: 'pose_landmarker_lite.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
    sha256: '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a',
  },
  {
    file: 'pose_landmarker_full.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
    sha256: '5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1',
  },
  {
    file: 'pose_landmarker_heavy.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task',
    sha256: '64437af838a65d18e5ba7a0d39b465540069bc8aae8308de3e318aad31fcbc7b',
  },
];
const modelDir = join(root, 'public/models');
mkdirSync(modelDir, { recursive: true });
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

for (const m of MODELS) {
  const dst = join(modelDir, m.file);
  if (!existsSync(dst)) {
    log(`[assets] ${m.file} を取得します: ${m.url}`);
    const res = await fetch(m.url);
    if (!res.ok) {
      console.error(`[assets] 取得失敗 ${res.status} ${m.url}`);
      process.exit(1);
    }
    writeFileSync(dst, Buffer.from(await res.arrayBuffer()));
  }
  const digest = sha(readFileSync(dst));
  if (digest !== m.sha256) {
    console.error(`[assets] ${m.file} のハッシュが一致しません\n  expected ${m.sha256}\n  actual   ${digest}`);
    process.exit(1);
  }
  log(`[assets] ${m.file} OK sha256=${digest}`);
}
