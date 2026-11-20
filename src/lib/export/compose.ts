/** 評価画像（フレーム＋骨格＋結果の要約）を作る */
import type { Pt, Side } from '../pose/landmarks';
import { canvasToJpeg } from '../video/videoSource';
import { drawSkeleton, mosaicFace } from './overlay';

export interface ComposeOptions {
  pts: Pt[] | null;
  others: Pt[][];
  side: Side;
  faceBlur: boolean;
  isDemo: boolean;
  lines: string[];
  headline: string;
  headlineColor: string;
}

export async function loadBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in globalThis) {
    try {
      return await createImageBitmap(blob);
    } catch {
      /* Safari の古い版などはフォールバック */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 日本語を含む文字列を、指定幅に収まるよう文字単位で折り返す */
export function wrapText(measure: (t: string) => number, text: string, maxW: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const ch of text) {
    if (cur && measure(cur + ch) > maxW) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

export async function composeEvaluationImage(frame: Blob, o: ComposeOptions): Promise<{ blob: Blob; blurred: boolean }> {
  const img = await loadBitmap(frame);
  const w = img.width;
  const h = img.height;
  const lineH = Math.round(Math.max(20, w * 0.042));
  const measureCanvas = document.createElement('canvas').getContext('2d')!;
  const headFont = `bold ${Math.round(lineH * 1.0)}px sans-serif`;
  const bodyFont = `${Math.round(lineH * 0.78)}px sans-serif`;
  const maxW = w - lineH;
  measureCanvas.font = headFont;
  const head = wrapText((t) => measureCanvas.measureText(t).width, o.headline, maxW);
  measureCanvas.font = bodyFont;
  const body = o.lines.flatMap((l) => wrapText((t) => measureCanvas.measureText(t).width, l, maxW));
  const headH = lineH * (0.6 + head.length * 1.25);
  const panelH = Math.round(headH + lineH * (0.5 + body.length * 1.15));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h + panelH;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  const blurred = o.faceBlur ? mosaicFace(ctx, o.pts, w, h) : false;
  // 対象者以外に検出された人物の顔もぼかす（検出されなかった人物には適用できない）
  if (o.faceBlur) for (const other of o.others) mosaicFace(ctx, other, w, h);
  drawSkeleton(ctx, o.pts, w, h, { evalSide: o.side, others: o.others });

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, h, w, panelH);
  ctx.fillStyle = o.headlineColor;
  ctx.fillRect(0, h, w, headH);
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  ctx.font = headFont;
  head.forEach((l, i) => ctx.fillText(l, lineH * 0.5, h + lineH * (0.35 + i * 1.25)));
  ctx.fillStyle = '#111111';
  ctx.font = bodyFont;
  body.forEach((l, i) => ctx.fillText(l, lineH * 0.5, h + headH + lineH * (0.3 + i * 1.15)));
  if (o.isDemo) {
    ctx.save();
    ctx.fillStyle = 'rgba(200,0,0,0.85)';
    ctx.font = `bold ${Math.round(lineH * 1.1)}px sans-serif`;
    ctx.fillText('模擬データ（実測ではありません）', lineH * 0.5, lineH * 1.4);
    ctx.restore();
  }
  if ('close' in img) img.close();
  return { blob: await canvasToJpeg(canvas, 0.88), blurred };
}
