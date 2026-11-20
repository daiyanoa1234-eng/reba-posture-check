import type { FrameScore } from '../lib/selection/candidates';

/**
 * フレームごとの姿勢指標（候補抽出用・手動項目を含まない）を時間順の棒で示す。
 * 1系列のみなので凡例箱は置かず、除外フレームの記号だけ下に文字で説明する。
 */
export function Timeline({
  scores,
  candidates,
  selected,
  onSelect,
}: {
  scores: FrameScore[];
  candidates: FrameScore[];
  selected: number;
  onSelect: (i: number) => void;
}) {
  const n = scores.length;
  const W = 600;
  const H = 96;
  const top = 18;
  const bottom = 14;
  const bw = W / Math.max(1, n);
  const yOf = (v: number) => H - bottom - ((H - top - bottom) * v) / 12;
  const pick = (clientX: number, el: SVGSVGElement) => {
    const rect = el.getBoundingClientRect();
    const i = Math.floor(((clientX - rect.left) / rect.width) * n);
    onSelect(Math.min(n - 1, Math.max(0, i)));
  };
  const candIdx = new Map(candidates.map((c, k) => [c.index, k + 1]));
  return (
    <div class="timeline">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="時間ごとの姿勢指標。棒が高いほど姿勢負担が大きいと推定。×は人物未検出、灰色は候補から除外したフレーム"
        onPointerDown={(e) => {
          (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
          pick(e.clientX, e.currentTarget as SVGSVGElement);
        }}
        onPointerMove={(e) => {
          if (e.buttons) pick(e.clientX, e.currentTarget as SVGSVGElement);
        }}
      >
        <rect x="0" y="0" width={W} height={H} fill="#ffffff" />
        {[4, 8, 12].map((v) => (
          <line key={v} x1="0" x2={W} y1={yOf(v)} y2={yOf(v)} stroke="#e3e8ed" stroke-width="1" />
        ))}
        <line x1="0" x2={W} y1={H - bottom} y2={H - bottom} stroke="#8795a1" stroke-width="1" />
        {scores.map((s, i) => {
          const x = i * bw;
          if (s.postureIndex == null) {
            return (
              <text key={i} x={x + bw / 2} y={H - bottom - 2} font-size="10" text-anchor="middle" fill="#8795a1">
                ×
              </text>
            );
          }
          const y = yOf(s.postureIndex);
          return (
            <rect
              key={i}
              x={x + Math.min(1, bw * 0.15)}
              y={y}
              width={Math.max(1, bw - Math.min(2, bw * 0.3))}
              height={H - bottom - y}
              rx={Math.min(2, bw / 4)}
              fill={s.eligible ? '#0a3a7a' : '#b8c2cc'}
            />
          );
        })}
        {candidates.map((c) => {
          const i = scores.findIndex((s) => s.index === c.index);
          const x = i * bw + bw / 2;
          return (
            <g key={`c${c.index}`}>
              <circle cx={x} cy={9} r={8} fill="#f2b705" stroke="#0b1620" stroke-width="1.5" />
              <text x={x} y={12.5} font-size="10" font-weight="700" text-anchor="middle" fill="#0b1620">
                {candIdx.get(c.index)}
              </text>
            </g>
          );
        })}
        <rect x={selected * bw} y={0} width={Math.max(2, bw)} height={H - bottom} fill="none" stroke="#d9480f" stroke-width="2.5" />
        <text x="2" y={H - 2} font-size="10" fill="#5b6875">
          {scores[0] ? `${scores[0].time.toFixed(1)}s` : ''}
        </text>
        <text x={W - 2} y={H - 2} font-size="10" fill="#5b6875" text-anchor="end">
          {scores[n - 1] ? `${scores[n - 1].time.toFixed(1)}s` : ''}
        </text>
      </svg>
      <small>
        棒の高さ＝候補抽出用の姿勢指標（重量・把持などの手動項目を含まない）。濃い棒＝候補になりうるフレーム／灰色＝除外（複数人・全身外・急変など）／×＝人物未検出／黄色の番号＝候補
      </small>
    </div>
  );
}
