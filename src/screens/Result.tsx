import { useEffect, useState } from 'preact/hooks';
import { ScoreTable } from '../components/ScoreTable';
import { BottomBar, Notice, ScoreBox, TopBar, fmtDate, shareOrDownload, stamp, unknownList, useObjectUrl } from '../components/ui';
import type { FrameRecord } from '../lib/analysis/types';
import { composeEvaluationImage } from '../lib/export/compose';
import { recordsToCsv } from '../lib/export/csv';
import { sideLabel } from '../lib/pose/landmarks';
import { ITEMS, ITEM_KEYS, optionOf } from '../lib/reba/items';
import { rangeText, riskOf } from '../lib/reba/scoring';
import type { AssessmentMeta, AssessmentRecord } from '../lib/storage/record';

const RISK_COLORS = ['#5f6b76', '#2b8a3e', '#b07d00', '#d9480f', '#c92a2a'];

export function headlineOf(r: AssessmentRecord): { text: string; color: string } {
  if (r.status === 'final') {
    const s = r.result.reba.min;
    const k = riskOf(s);
    return { text: `REBA ${s}　リスク：${k.label}（AL${k.actionLevel} ${k.action}）`, color: RISK_COLORS[k.actionLevel] };
  }
  return { text: `仮評価 REBA ${rangeText(r.result.reba)}（未確認 ${r.result.unknown.length} 項目）`, color: '#33414e' };
}

export async function buildImage(r: AssessmentRecord, frame: FrameRecord, faceBlur: boolean) {
  const h = headlineOf(r);
  const lines = [
    `${fmtDate(r.createdAt)}　${r.meta.taskName || '作業名未入力'}${r.meta.site ? `／${r.meta.site}` : ''}`,
    `評価場面 ${r.source.frameTime.toFixed(1)}秒／評価側 ${sideLabel(r.side)}／スコアA ${rangeText(r.result.scoreA)}・B ${rangeText(r.result.scoreB)}・C ${rangeText(r.result.tableC)}・活動 ${rangeText(r.result.activity)}`,
    '骨格線 左=橙・右=青（評価側を太線）。角度は画像からの推定値。',
    '撮影区間の1場面の評価であり、作業全体の評価ではありません。',
  ];
  return composeEvaluationImage(frame.imageBlob!, {
    pts: frame.image,
    others: frame.others,
    side: r.side,
    faceBlur,
    isDemo: r.isDemo,
    lines,
    headline: h.text,
    headlineColor: h.color,
  });
}

/** 関節点の調整前後で変わった角度 */
function EditedAngles({ r }: { r: AssessmentRecord }) {
  const a0 = r.anglesAuto;
  const a1 = r.angles;
  if (!a0) return null;
  const s = r.side;
  const rows: [string, number | null | undefined, number | null | undefined][] = [
    ['体幹の傾き', a0.trunkFlexion, a1.trunkFlexion],
    ['頭頸部の傾き', a0.neckFlexion, a1.neckFlexion],
    [`上腕（${sideLabel(s)}）`, a0.upperArm[s]?.elevation, a1.upperArm[s]?.elevation],
    [`肘（${sideLabel(s)}）`, a0.elbowFlexion[s], a1.elbowFlexion[s]],
    [`手首（${sideLabel(s)}）`, a0.wristBend[s], a1.wristBend[s]],
    ['膝（左）', a0.kneeFlexion.left, a1.kneeFlexion.left],
    ['膝（右）', a0.kneeFlexion.right, a1.kneeFlexion.right],
  ];
  const f = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v)}°`);
  const changed = rows.filter(([, b, c]) => (b == null) !== (c == null) || (b != null && c != null && Math.abs(b - c) >= 0.5));
  if (!changed.length) return <small>角度の変化はありません。</small>;
  return (
    <table class="data">
      <thead>
        <tr>
          <th>部位</th>
          <th class="num">自動推定</th>
          <th class="num">調整後</th>
        </tr>
      </thead>
      <tbody>
        {changed.map(([n, b, c]) => (
          <tr key={n}>
            <th scope="row">{n}</th>
            <td class="num">{f(b)}</td>
            <td class="num">{f(c)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Result(props: {
  record: AssessmentRecord;
  /** 新規評価のときだけ渡す（画像の再生成に使う） */
  frame: FrameRecord | null;
  saved: boolean;
  defaultFaceBlur: boolean;
  onMeta?: (m: AssessmentMeta) => void;
  onSave?: (r: AssessmentRecord) => Promise<void>;
  onDelete?: () => void;
  onNew: () => void;
  /** 同じ解析結果で別の場面・評価側を評価する */
  onAnother?: () => void;
  onBack: () => void;
  toast: (m: string) => void;
}) {
  const { record: r, frame } = props;
  const [faceBlur, setFaceBlur] = useState(r.image ? r.imageFaceBlurred : props.defaultFaceBlur);
  const [image, setImage] = useState<Blob | null>(r.image);
  const [blurOk, setBlurOk] = useState<boolean>(r.imageFaceBlurred);
  const [busy, setBusy] = useState(false);
  const url = useObjectUrl(image);

  useEffect(() => {
    if (!frame?.imageBlob) return;
    let alive = true;
    buildImage(r, frame, faceBlur)
      .then(({ blob, blurred }) => {
        if (!alive) return;
        setImage(blob);
        setBlurOk(blurred);
      })
      .catch(() => props.toast('評価画像を作成できませんでした'));
    return () => {
      alive = false;
    };
  }, [frame, faceBlur, r.status, r.result.reba.min, r.result.reba.max, r.side, r.meta.taskName, r.meta.site]);

  const recordWithImage = (): AssessmentRecord => ({ ...r, image, imageFaceBlurred: faceBlur && blurOk, updatedAt: new Date().toISOString() });

  const save = async () => {
    if (!props.onSave) return;
    setBusy(true);
    try {
      await props.onSave(recordWithImage());
      props.toast('端末に保存しました');
    } catch (e) {
      props.toast(`保存できませんでした：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };
  const exportImage = async () => {
    if (!image) return;
    const res = await shareOrDownload(image, `REBA_${stamp(new Date(r.createdAt))}_${r.status === 'final' ? '確定' : '仮'}${r.isDemo ? '_模擬' : ''}.jpg`);
    if (res !== 'cancelled') props.toast('画像を書き出しました');
  };
  const exportCsv = async () => {
    const csv = recordsToCsv([recordWithImage()]);
    const res = await shareOrDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `REBA_${stamp(new Date(r.createdAt))}.csv`);
    if (res !== 'cancelled') props.toast('CSV を書き出しました');
  };

  const meta = r.meta;
  const setMeta = (p: Partial<AssessmentMeta>) => props.onMeta?.({ ...meta, ...p });
  const manualKeys = ITEM_KEYS.filter((k) => r.manual[k] != null);
  const editable = !!props.onMeta;

  return (
    <>
      <TopBar title={props.saved && !editable ? '保存した評価' : '評価結果'} onBack={props.onBack} />
      <main class="result-main">
        <div class="result-grid">
        <div class="result-left">
        {r.isDemo && <Notice kind="info" title="模擬データから作成した評価です（実測ではありません）" />}
        <ScoreBox result={r.result} status={r.status} />
        {r.status !== 'final' && (
          <Notice title="仮評価です（最終点数ではありません）">
            {r.result.unknown.length > 0 && <>未確認：{unknownList(r.result)}。</>}
            {!r.postureConfirmed && <>推定姿勢の確認チェックが未完了です。</>}
            前の画面に戻って入力すると確定できます。
          </Notice>
        )}

        <section class="stack">
          {url ? <img src={url} alt="評価した画像（骨格と結果の要約）" style={{ borderRadius: 12, border: '1px solid var(--line)' }} /> : <p>評価画像を作成中…</p>}
          {frame && (
            <label class="check">
              <input type="checkbox" checked={faceBlur} onChange={(e) => setFaceBlur((e.currentTarget as HTMLInputElement).checked)} />
              保存・書き出す画像の顔をぼかす
            </label>
          )}
          {frame && faceBlur && (
            <small>評価対象者と、検出できた他の人物の頭部にモザイクをかけます。検出できなかった人物や看板・車両番号などには適用されないため、画像を共有する前に確認してください。</small>
          )}
          {faceBlur && !blurOk && image && <Notice title="顔の位置を推定できず、ぼかしを適用できませんでした。画像の扱いに注意してください。" />}
        </section>
        </div>
        <div class="result-right">

        <section class="card stack">
          <h2>部位別の点数</h2>
          <p>
            評価場面 {r.source.frameTime.toFixed(1)}秒／評価側 <strong>{sideLabel(r.side)}</strong>（同じフレームの姿勢のみで採点）
          </p>
          {!!r.landmarkEdits?.length && (
            <small>関節点を手動調整したため、「自動推定」の区分は調整後の関節点から計算しています（調整した点：{r.landmarkEdits.map((e) => e.name).join('、')}）。</small>
          )}
          <ScoreTable result={r.result} auto={r.auto} manual={r.manual} angles={r.angles} side={r.side} />
        </section>

        <section class="card stack">
          <h2>関節点の手動調整</h2>
          {r.landmarkEdits?.length ? (
            <>
              <p>{r.landmarkEdits.map((e) => e.name).join('、')}（評価者が画像上で位置を調整）</p>
              <EditedAngles r={r} />
            </>
          ) : (
            <p>なし（自動推定の関節点を使用）</p>
          )}
        </section>

        <section class="card stack">
          <h2>手動で入力・修正した項目</h2>
          {manualKeys.length ? (
            <ul style={{ margin: 0, paddingLeft: '1.2em' }}>
              {manualKeys.map((k) => (
                <li key={k}>
                  {ITEMS[k].label}：{optionOf(k, r.manual[k])?.label}
                  {r.auto[k] != null && r.auto[k] !== r.manual[k] && <small>（自動推定値「{optionOf(k, r.auto[k])?.label}」を修正）</small>}
                </li>
              ))}
            </ul>
          ) : (
            <p>なし</p>
          )}
        </section>

        <section class="card stack">
          <h2>記録情報</h2>
          {editable ? (
            <>
              <label class="field">
                <span>作業名</span>
                <input value={meta.taskName} onInput={(e) => setMeta({ taskName: (e.currentTarget as HTMLInputElement).value })} placeholder="例：鉄筋の結束" />
              </label>
              <label class="field">
                <span>場所・現場</span>
                <input value={meta.site} onInput={(e) => setMeta({ site: (e.currentTarget as HTMLInputElement).value })} />
              </label>
              <label class="field">
                <span>評価者</span>
                <input value={meta.evaluator} onInput={(e) => setMeta({ evaluator: (e.currentTarget as HTMLInputElement).value })} />
              </label>
              <label class="field">
                <span>メモ</span>
                <textarea rows={3} value={meta.note} onInput={(e) => setMeta({ note: (e.currentTarget as HTMLTextAreaElement).value })} />
              </label>
              <small>作業者を特定できる情報（氏名など）は入力しないことをおすすめします。</small>
            </>
          ) : (
            <dl class="kv">
              <dt>作業名</dt>
              <dd>{meta.taskName || '—'}</dd>
              <dt>場所</dt>
              <dd>{meta.site || '—'}</dd>
              <dt>評価者</dt>
              <dd>{meta.evaluator || '—'}</dd>
              <dt>メモ</dt>
              <dd>{meta.note || '—'}</dd>
              <dt>作成</dt>
              <dd>{fmtDate(r.createdAt)}</dd>
            </dl>
          )}
          <dl class="kv">
            <dt>動画</dt>
            <dd>
              {r.source.videoName}（{r.source.segmentStart.toFixed(1)}〜{r.source.segmentEnd.toFixed(1)}秒）
            </dd>
            <dt>解析</dt>
            <dd>
              {r.source.analyzedFrames}フレーム・毎秒{r.source.fps}・{r.source.model}/{r.source.delegate}・{(r.source.analysisMs / 1000).toFixed(1)}秒
            </dd>
            {r.qualityIssues.length > 0 && (
              <>
                <dt>注意</dt>
                <dd>{r.qualityIssues.join('、')}</dd>
              </>
            )}
          </dl>
        </section>

        <Notice kind="info">
          この結果は、撮影した区間の1場面について、画像から推定した角度と評価者の入力に基づく REBA 評価です。作業全体の評価や、臨床的・研究的に妥当性が検証された測定値ではありません。
        </Notice>

        <div class="stack">
          <button class="btn block" onClick={exportImage} disabled={!image}>
            画像を書き出す
          </button>
          <button class="btn block" onClick={exportCsv}>
            CSV を書き出す
          </button>
          {props.onDelete && (
            <button class="btn danger block" onClick={props.onDelete}>
              この評価を削除
            </button>
          )}
          {props.onAnother && (
            <button class="btn block" onClick={props.onAnother}>
              同じ動画で別の場面・評価側を評価する
            </button>
          )}
          <button class="btn block" onClick={props.onNew}>
            新しい評価を始める
          </button>
        </div>
        </div>
        </div>
      </main>
      {props.onSave && (
        <BottomBar>
          <button class="btn primary big" onClick={save} disabled={busy || !image}>
            {props.saved ? '保存内容を更新' : r.status === 'final' ? '確定して端末に保存' : '仮評価として保存'}
          </button>
        </BottomBar>
      )}
    </>
  );
}
