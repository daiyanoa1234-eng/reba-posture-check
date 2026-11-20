import { useEffect, useState } from 'preact/hooks';
import { Notice, TopBar, fmtDate, shareOrDownload, stamp, useObjectUrl } from '../components/ui';
import { recordsToCsv } from '../lib/export/csv';
import { sideLabel } from '../lib/pose/landmarks';
import { rangeText, riskOf } from '../lib/reba/scoring';
import { listRecords } from '../lib/storage/db';
import type { AssessmentRecord } from '../lib/storage/record';

function Item({ r, onOpen }: { r: AssessmentRecord; onOpen: () => void }) {
  const url = useObjectUrl(r.image);
  const final = r.status === 'final';
  return (
    <button class="history-item" onClick={onOpen}>
      {url ? <img src={url} alt="" /> : <div style={{ width: 72, height: 96, background: '#ddd', borderRadius: 8 }} />}
      <div class="grow">
        <div class="status-pill">
          {final ? `確定 REBA ${r.result.reba.min}（${riskOf(r.result.reba.min).label}）` : `仮評価 ${rangeText(r.result.reba)}`}
        </div>
        <div>{r.meta.taskName || '作業名未入力'}</div>
        <small>
          {fmtDate(r.createdAt)}・{sideLabel(r.side)}側・{r.source.frameTime.toFixed(1)}秒
        </small>
        {r.isDemo && (
          <div>
            <span class="tag demo">模擬データ</span>
          </div>
        )}
      </div>
    </button>
  );
}

export function History({ onOpen, onBack, toast }: { onOpen: (r: AssessmentRecord) => void; onBack: () => void; toast: (m: string) => void }) {
  const [items, setItems] = useState<AssessmentRecord[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    listRecords()
      .then(setItems)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);
  const exportAll = async () => {
    if (!items?.length) return;
    const res = await shareOrDownload(new Blob([recordsToCsv(items)], { type: 'text/csv;charset=utf-8' }), `REBA_一覧_${stamp()}.csv`);
    if (res !== 'cancelled') toast('CSV を書き出しました');
  };
  return (
    <>
      <TopBar title="保存した評価" onBack={onBack} />
      <main>
        {err && <Notice kind="error" title={err} />}
        {items == null && !err && <p>読み込み中…</p>}
        {items?.length === 0 && <p>保存した評価はまだありません。</p>}
        {!!items?.length && (
          <>
            <button class="btn block" onClick={exportAll}>
              すべて CSV で書き出す（{items.length}件）
            </button>
            <div class="stack">
              {items.map((r) => (
                <Item key={r.id} r={r} onOpen={() => onOpen(r)} />
              ))}
            </div>
          </>
        )}
        <small>評価結果はこの端末のブラウザ内に保存されています。ブラウザのデータ消去やアプリの削除で消えるため、必要に応じて CSV・画像で書き出してください。</small>
      </main>
    </>
  );
}
