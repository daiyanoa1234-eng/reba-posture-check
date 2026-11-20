import { useEffect, useRef } from 'preact/hooks';
import type { FrameRecord } from '../lib/analysis/types';
import { loadBitmap } from '../lib/export/compose';
import { COLORS, drawSkeleton } from '../lib/export/overlay';
import { LM, type Pt, type Side, sideIdx } from '../lib/pose/landmarks';

const cache = new Map<Blob, Promise<ImageBitmap | HTMLImageElement>>();
function bitmapOf(blob: Blob) {
  let p = cache.get(blob);
  if (!p) {
    p = loadBitmap(blob);
    cache.set(blob, p);
    if (cache.size > 16) {
      const first = cache.keys().next().value as Blob;
      const old = cache.get(first);
      cache.delete(first);
      old?.then((b) => 'close' in b && b.close()).catch(() => undefined);
    }
  }
  return p;
}

interface LabelItem {
  text: string;
  jx: number;
  jy: number;
  color: string;
}

/** 角度ラベルを体と反対側の余白に縦に並べ、引き出し線で関節と結ぶ（重なり防止） */
function drawLabels(ctx: CanvasRenderingContext2D, items: LabelItem[], bodyX: number) {
  if (!items.length) return;
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const size = Math.max(14, Math.round(Math.min(W, H) * 0.042));
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  const pad = size * 0.3;
  const boxH = size + pad * 2;
  const gap = size * 0.25;
  const maxW = Math.max(...items.map((i) => ctx.measureText(i.text).width)) + pad * 2;
  const onRight = bodyX < W / 2;
  const x = onRight ? W - maxW - size * 0.4 : size * 0.4;
  const sorted = [...items].sort((a, b) => a.jy - b.jy);
  const ys: number[] = [];
  sorted.forEach((it, i) => {
    let y = Math.max(size * 0.4, it.jy - boxH / 2);
    if (i > 0) y = Math.max(y, ys[i - 1] + boxH + gap);
    ys.push(y);
  });
  const overflow = ys[ys.length - 1] + boxH - (H - size * 0.4);
  if (overflow > 0) for (let i = ys.length - 1; i >= 0; i--) ys[i] = Math.max(0, ys[i] - overflow);
  sorted.forEach((it, i) => {
    const y = ys[i];
    const ax = onRight ? x : x + maxW;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(3, size * 0.22);
    ctx.beginPath();
    ctx.moveTo(ax, y + boxH / 2);
    ctx.lineTo(it.jx, it.jy);
    ctx.stroke();
    ctx.strokeStyle = it.color;
    ctx.lineWidth = Math.max(1.5, size * 0.1);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.fillRect(x, y, maxW, boxH);
    ctx.lineWidth = Math.max(2, size * 0.12);
    ctx.strokeRect(x, y, maxW, boxH);
    ctx.fillStyle = '#0b1620';
    ctx.textBaseline = 'top';
    ctx.fillText(it.text, x + pad, y + pad);
  });
}

const r = (v: number) => Math.round(v);

function drawAngleLabels(ctx: CanvasRenderingContext2D, f: FrameRecord, side: Side, pts: Pt[]) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const at = (i: number) => [pts[i].x * w, pts[i].y * h] as const;
  const a = f.angles;
  const s = sideIdx(side);
  const sideColor = side === 'left' ? COLORS.left : COLORS.right;
  const items: LabelItem[] = [];
  const ids = [LM.L_HIP, LM.R_HIP, LM.L_SHOULDER, LM.R_SHOULDER];
  const cx = ids.reduce((acc, i) => acc + at(i)[0], 0) / 4;
  const cy = ids.reduce((acc, i) => acc + at(i)[1], 0) / 4;
  if (a.trunkFlexion != null) {
    items.push({ text: `体幹 ${a.trunkFlexion >= 0 ? '前傾' : '後傾'}${r(Math.abs(a.trunkFlexion))}°`, jx: cx, jy: cy, color: '#333' });
  }
  const ua = a.upperArm[side];
  if (ua) {
    const [x, y] = at(s.shoulder);
    items.push({ text: `上腕(${side === 'left' ? '左' : '右'}) ${ua.isExtension ? '伸展' : ''}${r(ua.elevation)}°`, jx: x, jy: y, color: sideColor });
  }
  const el = a.elbowFlexion[side];
  if (el != null) {
    const [x, y] = at(s.elbow);
    items.push({ text: `肘(${side === 'left' ? '左' : '右'}) ${r(el)}°`, jx: x, jy: y, color: sideColor });
  }
  for (const sd of ['left', 'right'] as Side[]) {
    const k = a.kneeFlexion[sd];
    if (k == null) continue;
    const [x, y] = at(sideIdx(sd).knee);
    items.push({ text: `膝(${sd === 'left' ? '左' : '右'}) ${r(k)}°`, jx: x, jy: y, color: sd === 'left' ? COLORS.left : COLORS.right });
  }
  drawLabels(ctx, items, cx);
}

export function FrameView({
  frame,
  side,
  showLabels = true,
  visThr = 0.5,
}: {
  frame: FrameRecord;
  side: Side | null;
  showLabels?: boolean;
  visThr?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    const c = ref.current;
    if (!c || !frame.imageBlob) return;
    bitmapOf(frame.imageBlob)
      .then((img) => {
        if (!alive) return;
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        drawSkeleton(ctx, frame.image, c.width, c.height, { evalSide: side, others: frame.others, visThr });
        if (showLabels && frame.image && side) drawAngleLabels(ctx, frame, side, frame.image);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [frame, side, showLabels, visThr]);
  return (
    <div class="frame-wrap">
      <canvas
        ref={ref}
        role="img"
        aria-label={`${frame.time.toFixed(1)}秒のフレームと推定骨格`}
        width={frame.width}
        height={frame.height}
      />
    </div>
  );
}

export function SkeletonLegend() {
  return (
    <div class="legend" aria-label="骨格線の色の凡例">
      <span>
        <span class="sw" style={{ background: COLORS.left }} />
        作業者の左
      </span>
      <span>
        <span class="sw" style={{ background: COLORS.right }} />
        作業者の右
      </span>
      <span>
        <span class="sw" style={{ background: '#fff', border: '1px solid #333' }} />
        体幹・頸部
      </span>
      <span>
        <span class="sw" style={{ background: 'repeating-linear-gradient(90deg,#999 0 4px,transparent 4px 7px)' }} />
        点線＝映りが不確か／他の人物
      </span>
    </div>
  );
}
