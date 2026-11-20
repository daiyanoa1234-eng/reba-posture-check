import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { type RebaResult, type AssessmentStatus, rangeText, riskOf } from '../lib/reba/scoring';
import { ITEMS } from '../lib/reba/items';

export function TopBar({ title, onBack, right }: { title: string; onBack?: () => void; right?: ComponentChildren }) {
  return (
    <header class="topbar">
      {onBack && (
        <button class="icon-btn" onClick={onBack} aria-label="戻る">
          ← 戻る
        </button>
      )}
      <h1>{title}</h1>
      {right}
    </header>
  );
}

export function DemoBanner() {
  return (
    <div class="demo-banner" role="status">
      模擬データを表示中（実測ではありません）
    </div>
  );
}

export function Notice({ kind = 'warn', title, children }: { kind?: 'warn' | 'error' | 'info'; title?: string; children?: ComponentChildren }) {
  return (
    <div class={`notice ${kind === 'warn' ? '' : kind}`} role={kind === 'error' ? 'alert' : 'note'}>
      {title && <strong>{kind === 'error' ? '⚠ ' : kind === 'warn' ? '注意：' : ''}{title}</strong>}
      {children && <div>{children}</div>}
    </div>
  );
}

const RISK_ICON = ['●', '●', '▲', '◆', '■'];

/** REBA スコア表示。確定時は数値・リスク区分・対応を、仮評価時は範囲と未確認数を示す（色だけに頼らない） */
export function ScoreBox({ result, status, compact }: { result: RebaResult; status: AssessmentStatus; compact?: boolean }) {
  if (status === 'final') {
    const s = result.reba.min;
    const r = riskOf(s);
    return (
      <div class={`score-box risk-${r.actionLevel}`} role="status" aria-live="polite">
        <div class="num" aria-label={`REBA ${s}`}>{s}</div>
        <div class="txt">
          <strong>
            {RISK_ICON[r.actionLevel]} 確定　リスク：{r.label}
          </strong>
          {!compact && <span>アクションレベル {r.actionLevel}：{r.action}</span>}
        </div>
      </div>
    );
  }
  const n = result.unknown.length;
  return (
    <div class="score-box prov" role="status" aria-live="polite">
      <div class="num" aria-label={`仮評価 ${rangeText(result.reba)}`}>{rangeText(result.reba)}</div>
      <div class="txt">
        <strong>仮評価（未確定）</strong>
        <span>
          {n > 0 ? `未確認 ${n} 項目` : '全項目入力済み・姿勢の確認待ち'}
          {!compact && n > 0 && result.reba.min !== result.reba.max && '：未確認項目の選択次第でこの範囲になります'}
        </span>
      </div>
    </div>
  );
}

export function unknownList(result: RebaResult): string {
  return result.unknown.map((k) => ITEMS[k].label).join('、');
}

export function useToast(): [string | null, (m: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);
  return [msg, setMsg];
}

export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div class="toast" role="status" aria-live="polite">
      {msg}
    </div>
  );
}

export function BottomBar({ children }: { children: ComponentChildren }) {
  return (
    <div class="bottom-bar">
      <div class="inner">{children}</div>
    </div>
  );
}

export const fmtSec = (s: number) => `${s.toFixed(1)}秒`;
export const fmtDeg = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v)}°`);
export const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Blob の一時 URL（アンマウント時に解放） */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

/** 共有シート（対応端末）またはダウンロードで書き出す */
export async function shareOrDownload(blob: Blob, filename: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'downloaded';
}

export function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
