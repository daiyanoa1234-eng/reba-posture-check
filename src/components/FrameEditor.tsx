/**
 * フレーム表示＋関節点の手動調整。
 * - 「関節を調整」で調整モード。関節点をタップで選択してドラッグ（直接操作）
 * - 点を選んだ後は、画面のどこをドラッグしても選択中の点が同じ量だけ動く（指で点を隠さずに微調整できる）
 * - 拡大（最大4倍）、拡大鏡（タッチ操作時）、1px 単位の微調整ボタン、元に戻す、自動推定に戻す
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { FrameRecord } from '../lib/analysis/types';
import { EDITABLE_JOINTS, JOINT_NAMES, type JointEdits, type JointPos } from '../lib/edit/edits';
import { drawSkeleton } from '../lib/export/overlay';
import type { Pt, Side } from '../lib/pose/landmarks';
import { bitmapOf, drawAngleLabels } from './FrameView';

type Bmp = ImageBitmap | HTMLImageElement;

interface Drag {
  joint: number;
  pointerId: number;
  startX: number;
  startY: number;
  base: JointPos;
  moved: boolean;
  touch: boolean;
}

const ZOOMS = [1, 1.5, 2, 3, 4];
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function FrameEditor(props: {
  frame: FrameRecord;
  autoFrame: FrameRecord;
  side: Side | null;
  edits: JointEdits;
  visThr: number;
  editable?: boolean;
  showLabels?: boolean;
  onEdit?: (joint: number, pos: JointPos | null) => void;
  onUndo?: () => void;
  onResetAll?: () => void;
  canUndo?: boolean;
  /** 調整モードの開始・終了を親に知らせる（キー操作の切替用） */
  onModeChange?: (editing: boolean) => void;
}) {
  const { frame, autoFrame, side, edits } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loupeRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const bmpRef = useRef<Bmp | null>(null);
  const [bmpTick, setBmpTick] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [zoomIdx, setZoomIdx] = useState(0);
  const [dragPos, setDragPos] = useState<JointPos | null>(null);
  const [loupe, setLoupe] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<Drag | null>(null);
  const pan = useRef<{ pointerId: number; x: number; y: number; sl: number; st: number } | null>(null);
  const zoom = ZOOMS[zoomIdx];
  // 等倍時の表示サイズ（拡大時の基準）
  const [base, setBase] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (ZOOMS[zoomRef.current] === 1 && c.clientWidth > 0) setBase({ w: c.clientWidth, h: c.clientHeight });
    });
    ro.observe(c);
    return () => ro.disconnect();
  }, []);
  const zoomRef = useRef(0);
  zoomRef.current = zoomIdx;
  const editedSet = useMemo(() => new Set(Object.keys(edits).map(Number)), [edits]);

  useEffect(() => props.onModeChange?.(editMode), [editMode]);

  // フレーム画像の読み込み
  useEffect(() => {
    let alive = true;
    if (!frame.imageBlob) return;
    bitmapOf(frame.imageBlob)
      .then((b) => {
        if (!alive) return;
        bmpRef.current = b;
        setBmpTick((t) => t + 1);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [frame.imageBlob]);

  // 別のフレームに移ったら選択を解除
  useEffect(() => {
    setSelected(null);
    setDragPos(null);
  }, [frame.index]);

  const shownPts = (): Pt[] | null => {
    if (!frame.image) return null;
    if (!dragPos || !drag.current) return frame.image;
    const pts = frame.image.slice();
    pts[drag.current.joint] = { ...pts[drag.current.joint], x: dragPos.x, y: dragPos.y, v: 1 };
    return pts;
  };

  // 描画
  useEffect(() => {
    const c = canvasRef.current;
    const img = bmpRef.current;
    if (!c || !img) return;
    if (c.width !== img.width) c.width = img.width;
    if (c.height !== img.height) c.height = img.height;
    const ctx = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    ctx.drawImage(img, 0, 0);
    const pts = shownPts();
    drawSkeleton(ctx, pts, W, H, { evalSide: side, others: frame.others, visThr: props.visThr });
    const unit = Math.max(2, Math.min(W, H) * 0.008);
    if (pts && autoFrame.image) {
      // 調整した点: 自動推定の位置（点線の丸）と調整後の位置（黄色の輪）
      for (const j of editedSet) {
        const a = autoFrame.image[j];
        const p = pts[j];
        ctx.setLineDash([unit, unit]);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = Math.max(1, unit * 0.4);
        ctx.beginPath();
        ctx.arc(a.x * W, a.y * H, unit * 1.4, 0, Math.PI * 2);
        ctx.moveTo(a.x * W, a.y * H);
        ctx.lineTo(p.x * W, p.y * H);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = '#f2b705';
        ctx.lineWidth = Math.max(2, unit * 0.6);
        ctx.beginPath();
        ctx.arc(p.x * W, p.y * H, unit * 2.2, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (editMode && selected != null) {
        const p = pts[selected];
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(2, unit * 0.7);
        ctx.beginPath();
        ctx.arc(p.x * W, p.y * H, unit * 3.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#d9480f';
        ctx.lineWidth = Math.max(1.5, unit * 0.4);
        ctx.stroke();
      }
    }
    // 拡大中の調整モードでは、角度ラベルは画面外にはみ出すため表示しない
    if (props.showLabels !== false && pts && side && !dragPos && !(editMode && zoom > 1)) drawAngleLabels(ctx, frame, side, pts);
    drawLoupe();
  }, [bmpTick, frame, autoFrame, side, edits, editMode, selected, dragPos, zoom, props.visThr, props.showLabels]);

  function drawLoupe() {
    const lc = loupeRef.current;
    const img = bmpRef.current;
    const c = canvasRef.current;
    if (!lc || !img || !c || !loupe || !dragPos) return;
    const size = lc.width;
    const ctx = lc.getContext('2d')!;
    const span = Math.max(24, Math.min(c.width, c.height) * 0.12); // 拡大鏡に映す範囲（元画像px）
    const cx = dragPos.x * c.width;
    const cy = dragPos.y * c.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, cx - span / 2, cy - span / 2, span, span, 0, 0, size, size);
    ctx.strokeStyle = '#ff2d2d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2);
    ctx.lineTo(size, size / 2);
    ctx.stroke();
  }

  const toNorm = (clientX: number, clientY: number) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left) / r.width, y: (clientY - r.top) / r.height, r };
  };

  const nearestJoint = (nx: number, ny: number, r: DOMRect): number | null => {
    if (!frame.image) return null;
    const hit = 30; // CSS px
    let best: number | null = null;
    let bestD = Infinity;
    for (const j of EDITABLE_JOINTS) {
      const p = frame.image[j];
      const d = Math.hypot((p.x - nx) * r.width, (p.y - ny) * r.height);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    return bestD <= hit ? best : null;
  };

  const centerOn = (j: number | null) => {
    const v = viewRef.current;
    const c = canvasRef.current;
    if (!v || !c || j == null || !frame.image) return;
    requestAnimationFrame(() => {
      const p = frame.image![j];
      v.scrollLeft = p.x * c.clientWidth - v.clientWidth / 2;
      v.scrollTop = p.y * c.clientHeight - v.clientHeight / 2;
    });
  };

  useEffect(() => {
    if (zoom > 1) centerOn(selected);
  }, [zoomIdx]);

  const onPointerDown = (e: PointerEvent) => {
    if (!editMode || !frame.image) return;
    const { x, y, r } = toNorm(e.clientX, e.clientY);
    const hitJ = nearestJoint(x, y, r);
    const j = hitJ ?? selected;
    if (j == null) {
      // 点を選んでいないときは、拡大した画像をドラッグで移動する
      const v = viewRef.current;
      if (v && zoom > 1) {
        e.preventDefault();
        pan.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, sl: v.scrollLeft, st: v.scrollTop };
      }
      return;
    }
    e.preventDefault();
    if (hitJ != null) setSelected(hitJ);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* キャプチャできなくてもドラッグは継続 */
    }
    const base = { x: frame.image[j].x, y: frame.image[j].y };
    drag.current = { joint: j, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, base, moved: false, touch: e.pointerType !== 'mouse' };
  };

  const onPointerMove = (e: PointerEvent) => {
    const pn = pan.current;
    if (pn && pn.pointerId === e.pointerId && viewRef.current) {
      viewRef.current.scrollLeft = pn.sl - (e.clientX - pn.x);
      viewRef.current.scrollTop = pn.st - (e.clientY - pn.y);
      return;
    }
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const r = canvasRef.current!.getBoundingClientRect();
    const dx = (e.clientX - d.startX) / r.width;
    const dy = (e.clientY - d.startY) / r.height;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 3) return;
    d.moved = true;
    setDragPos({ x: clamp01(d.base.x + dx), y: clamp01(d.base.y + dy) });
    if (d.touch) {
      const host = viewRef.current!.getBoundingClientRect();
      setLoupe({ x: e.clientX - host.left, y: e.clientY - host.top });
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (pan.current?.pointerId === e.pointerId) pan.current = null;
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (d.moved && dragPos) props.onEdit?.(d.joint, dragPos);
    drag.current = null;
    setDragPos(null);
    setLoupe(null);
  };

  const nudge = (dx: number, dy: number) => {
    if (selected == null || !frame.image) return;
    const c = canvasRef.current!;
    const p = frame.image[selected];
    props.onEdit?.(selected, { x: clamp01(p.x + dx / c.width), y: clamp01(p.y + dy / c.height) });
  };

  // 調整モード中のキー操作（矢印: 1px、Shift+矢印: 10px）
  useEffect(() => {
    if (!editMode) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      const step = e.shiftKey ? 10 : 1;
      const map: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (map[e.key] && selected != null) {
        e.preventDefault();
        nudge(...map[e.key]);
      } else if (e.key === 'Escape') {
        setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const editedNames = [...editedSet].map((j) => JOINT_NAMES[j]).filter(Boolean);

  return (
    <div class="editor">
      {props.editable !== false && (
        <div class="editor-bar">
          <button
            class={`btn small ${editMode ? 'primary' : ''}`}
            aria-pressed={editMode}
            onClick={() => {
              setEditMode(!editMode);
              if (editMode) {
                setSelected(null);
                setZoomIdx(0);
              }
            }}
          >
            {editMode ? '✓ 調整を終える' : '✥ 関節を調整'}
          </button>
          {editMode && (
            <>
              <button class="btn small" onClick={() => setZoomIdx(Math.max(0, zoomIdx - 1))} disabled={zoomIdx === 0} aria-label="縮小">
                −
              </button>
              <span class="zoom-label">{zoom}倍</span>
              <button class="btn small" onClick={() => setZoomIdx(Math.min(ZOOMS.length - 1, zoomIdx + 1))} disabled={zoomIdx === ZOOMS.length - 1} aria-label="拡大">
                ＋
              </button>
              <button class="btn small" onClick={props.onUndo} disabled={!props.canUndo}>
                ↶ 元に戻す
              </button>
            </>
          )}
          {!editMode && editedNames.length > 0 && <span class="tag override">調整済み {editedNames.length}点</span>}
        </div>
      )}
      <div class={`editor-main ${editMode ? 'editing' : ''}`}>
      <div
        ref={viewRef}
        class={`frame-wrap editor-view ${editMode ? 'editing' : ''} ${zoom > 1 ? 'zoomed' : ''}`}
        style={zoom > 1 && base ? { height: `${base.h}px` } : undefined}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`${frame.time.toFixed(1)}秒のフレームと推定骨格${editMode ? '（調整モード）' : ''}`}
          width={frame.width}
          height={frame.height}
          style={zoom > 1 && base ? { width: `${base.w * zoom}px`, height: `${base.h * zoom}px`, maxHeight: 'none', maxWidth: 'none' } : undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {loupe && dragPos && (
          <canvas
            ref={loupeRef}
            class="loupe"
            width={160}
            height={160}
            style={{ left: `${Math.max(0, loupe.x - 80)}px`, top: `${Math.max(0, loupe.y - 210)}px` }}
            aria-hidden="true"
          />
        )}
      </div>
      {editMode && (
        <div class="editor-panel">
          <div class="row">
            <label class="field grow" style={{ minWidth: 160 }}>
              <span class="sr-only">調整する関節</span>
              <select
                value={selected ?? ''}
                onChange={(e) => {
                  const v = (e.currentTarget as HTMLSelectElement).value;
                  const j = v === '' ? null : Number(v);
                  setSelected(j);
                  if (zoom > 1) centerOn(j);
                }}
              >
                <option value="">{selected == null ? '関節を選ぶ（または画像をタップ）' : '選択を解除（拡大画像をドラッグで移動）'}</option>
                {EDITABLE_JOINTS.map((j) => (
                  <option key={j} value={j}>
                    {editedSet.has(j) ? '✓ ' : ''}
                    {JOINT_NAMES[j]}
                  </option>
                ))}
              </select>
            </label>
            {selected != null && (
              <div class="nudge" role="group" aria-label="1ピクセルずつ動かす">
                <button class="icon-btn" onClick={() => nudge(-1, 0)} aria-label="左へ">
                  ◀
                </button>
                <button class="icon-btn" onClick={() => nudge(0, -1)} aria-label="上へ">
                  ▲
                </button>
                <button class="icon-btn" onClick={() => nudge(0, 1)} aria-label="下へ">
                  ▼
                </button>
                <button class="icon-btn" onClick={() => nudge(1, 0)} aria-label="右へ">
                  ▶
                </button>
              </div>
            )}
          </div>
          <div class="row">
            {selected != null && editedSet.has(selected) && (
              <button class="btn small" onClick={() => props.onEdit?.(selected, null)}>
                {JOINT_NAMES[selected]}を自動推定に戻す
              </button>
            )}
            {editedSet.size > 0 && (
              <button class="btn small danger" onClick={props.onResetAll}>
                すべて自動推定に戻す
              </button>
            )}
          </div>
          <small>
            点をタップして選び、ドラッグで動かします。点を選んだ後は画像のどこをドラッグしても選んだ点が同じだけ動くので、指で隠さずに微調整できます。
            {editedNames.length > 0 && `調整済み：${editedNames.join('、')}。`}調整した点は推定3D座標・角度・点数にも反映されます。
          </small>
        </div>
      )}
      </div>
    </div>
  );
}
