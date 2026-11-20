/** 動画フレーム上への骨格描画と顔のモザイク */
import { BONES, DRAW_POINTS, LM, type Pt, type Side, boneSide, pointSide } from '../pose/landmarks';

export const COLORS = {
  left: '#f76707',
  right: '#1971c2',
  center: '#ffffff',
  other: '#adb5bd',
  outline: 'rgba(0,0,0,0.75)',
};

export interface SkeletonOptions {
  evalSide?: Side | null;
  visThr?: number;
  others?: Pt[][];
  /** 線の太さの基準（画像の短辺に対する比） */
  scale?: number;
}

export function drawSkeleton(ctx: CanvasRenderingContext2D, pts: Pt[] | null, w: number, h: number, o: SkeletonOptions = {}) {
  const base = Math.max(2, Math.min(w, h) * (o.scale ?? 0.008));
  const visThr = o.visThr ?? 0.5;
  for (const other of o.others ?? []) {
    ctx.setLineDash([base * 2, base * 1.5]);
    ctx.strokeStyle = COLORS.other;
    ctx.lineWidth = base * 0.8;
    for (const [a, b] of BONES) {
      ctx.beginPath();
      ctx.moveTo(other[a].x * w, other[a].y * h);
      ctx.lineTo(other[b].x * w, other[b].y * h);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  if (!pts) return;
  const P = (i: number) => [pts[i].x * w, pts[i].y * h] as const;
  ctx.lineCap = 'round';
  // 首（肩中点→耳中点）の仮想線
  const neck = [
    [(P(LM.L_SHOULDER)[0] + P(LM.R_SHOULDER)[0]) / 2, (P(LM.L_SHOULDER)[1] + P(LM.R_SHOULDER)[1]) / 2],
    [(P(LM.L_EAR)[0] + P(LM.R_EAR)[0]) / 2, (P(LM.L_EAR)[1] + P(LM.R_EAR)[1]) / 2],
  ] as const;
  const hipMid = [(P(LM.L_HIP)[0] + P(LM.R_HIP)[0]) / 2, (P(LM.L_HIP)[1] + P(LM.R_HIP)[1]) / 2] as const;
  const lines: { a: readonly [number, number]; b: readonly [number, number]; color: string; width: number; dim: boolean }[] = [];
  for (const [a, b] of BONES) {
    const s = boneSide(a, b);
    const emph = o.evalSide && s === o.evalSide;
    lines.push({
      a: P(a),
      b: P(b),
      color: COLORS[s],
      width: base * (emph ? 1.6 : 1),
      dim: pts[a].v < visThr || pts[b].v < visThr,
    });
  }
  lines.push({ a: neck[0], b: neck[1], color: COLORS.center, width: base, dim: false });
  lines.push({ a: hipMid, b: neck[0], color: COLORS.center, width: base * 0.7, dim: false });
  for (const pass of [0, 1]) {
    for (const l of lines) {
      ctx.globalAlpha = l.dim ? 0.45 : 1;
      ctx.strokeStyle = pass === 0 ? COLORS.outline : l.color;
      ctx.lineWidth = pass === 0 ? l.width + base * 0.8 : l.width;
      ctx.setLineDash(l.dim && pass === 1 ? [base * 1.5, base] : []);
      ctx.beginPath();
      ctx.moveTo(l.a[0], l.a[1]);
      ctx.lineTo(l.b[0], l.b[1]);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  for (const i of DRAW_POINTS) {
    const [x, y] = P(i);
    const s = pointSide(i);
    const r = base * (o.evalSide && s === o.evalSide ? 1.5 : 1.15);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = pts[i].v >= visThr ? COLORS[s] : 'rgba(255,255,255,0.2)';
    ctx.fill();
    ctx.lineWidth = Math.max(1, base * 0.45);
    ctx.strokeStyle = COLORS.outline;
    ctx.stroke();
  }
}

/** 頭部の推定位置にモザイクをかける（保存・書き出し画像用） */
export function mosaicFace(ctx: CanvasRenderingContext2D, pts: Pt[] | null, w: number, h: number): boolean {
  if (!pts) return false;
  const face = [LM.NOSE, 1, 2, 3, 4, 5, 6, LM.L_EAR, LM.R_EAR, LM.MOUTH_L, LM.MOUTH_R].map((i) => pts[i]);
  const xs = face.map((p) => p.x * w);
  const ys = face.map((p) => p.y * h);
  const sw = Math.hypot((pts[LM.L_SHOULDER].x - pts[LM.R_SHOULDER].x) * w, (pts[LM.L_SHOULDER].y - pts[LM.R_SHOULDER].y) * h);
  const trunkLen = Math.hypot(
    ((pts[LM.L_SHOULDER].x + pts[LM.R_SHOULDER].x - pts[LM.L_HIP].x - pts[LM.R_HIP].x) / 2) * w,
    ((pts[LM.L_SHOULDER].y + pts[LM.R_SHOULDER].y - pts[LM.L_HIP].y - pts[LM.R_HIP].y) / 2) * h,
  );
  const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  // 顔点の広がり・肩幅・体幹長から頭部の大きさを見積もり、余裕をもって覆う
  const r = Math.max(span * 1.1, sw * 0.55, trunkLen * 0.4, Math.min(w, h) * 0.04);
  const x0 = Math.max(0, Math.floor(cx - r));
  const y0 = Math.max(0, Math.floor(cy - r * 1.15));
  const x1 = Math.min(w, Math.ceil(cx + r));
  const y1 = Math.min(h, Math.ceil(cy + r * 1.05));
  const bw = x1 - x0;
  const bh = y1 - y0;
  if (bw <= 2 || bh <= 2) return false;
  const cells = 7;
  const tmp = document.createElement('canvas');
  tmp.width = cells;
  tmp.height = Math.max(1, Math.round((cells * bh) / bw));
  const tctx = tmp.getContext('2d')!;
  tctx.imageSmoothingEnabled = true;
  tctx.drawImage(ctx.canvas, x0, y0, bw, bh, 0, 0, tmp.width, tmp.height);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, x0, y0, bw, bh);
  ctx.restore();
  return true;
}
