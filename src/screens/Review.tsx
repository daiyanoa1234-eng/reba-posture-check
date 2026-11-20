import { lazy, Suspense } from 'preact/compat';
import { useState } from 'preact/hooks';
import { AngleTable } from '../components/AngleTable';
import type { ComponentChildren } from 'preact';
import { SkeletonLegend } from '../components/FrameView';
import { Timeline } from '../components/Timeline';
import { BottomBar, Notice, ScoreBox, TopBar, useObjectUrl } from '../components/ui';
import type { AnalysisSummary } from '../lib/analysis/analyze';
import { ISSUE_LABEL } from '../lib/analysis/quality';
import type { AnalysisResult, FrameRecord } from '../lib/analysis/types';
import { VIEW_LABEL } from '../lib/angles/angles';
import { type Side, sideLabel } from '../lib/pose/landmarks';
import type { Hint } from '../lib/reba/autoItems';
import type { ItemKey, ItemValues } from '../lib/reba/items';
import type { AssessmentStatus, RebaResult } from '../lib/reba/scoring';
import type { FrameScore } from '../lib/selection/candidates';

const Skeleton3D = lazy(() => import('../components/Skeleton3D').then((m) => ({ default: m.Skeleton3D })));

function CandThumb({ frame, score, n, active, onClick }: { frame: FrameRecord; score: FrameScore; n: number; active: boolean; onClick: () => void }) {
  const url = useObjectUrl(frame.imageBlob);
  return (
    <button class="cand" aria-pressed={active} onClick={onClick}>
      {url ? <img src={url} alt="" /> : <div style={{ aspectRatio: '3/4', background: '#222' }} />}
      <div class="cap">
        <strong>候補{n}</strong> {frame.time.toFixed(1)}秒
        <br />
        指標{score.postureIndex}・{score.bestSide ? sideLabel(score.bestSide) : ''}
      </div>
    </button>
  );
}

export function Review(props: {
  analysis: AnalysisResult;
  summary: AnalysisSummary;
  scores: FrameScore[];
  candidates: FrameScore[];
  selected: number;
  onSelect: (i: number) => void;
  side: Side;
  onSide: (s: Side) => void;
  auto: ItemValues;
  hints: Partial<Record<ItemKey, Hint>>;
  result: RebaResult;
  status: AssessmentStatus;
  visThr: number;
  /** 関節調整つきのフレーム表示 */
  editor: ComponentChildren;
  /** 関節を調整したフレーム（角度表示用） */
  frame: FrameRecord;
  onNext: () => void;
  onBack: () => void;
}) {
  const { analysis: an, scores, candidates, selected } = props;
  const frame = props.frame;
  const score = scores[selected];
  const [show3d, setShow3d] = useState(false);
  const t = an.timing;
  const detectAvg = t.frames ? t.detectMs / t.frames : 0;
  const seekAvg = t.frames ? t.seekMs / t.frames : 0;
  const isCand = candidates.some((c) => c.index === selected);

  return (
    <>
      <TopBar title="評価する場面を選ぶ" onBack={props.onBack} />
      <main>
        {an.source === 'demo' ? (
          <Notice kind="info" title="模擬データ（合成した骨格）です。実際の動画解析の結果ではありません。" />
        ) : (
          <div class="card tight">
            <small>
              実データの解析結果：{an.videoName}（{an.segment.start.toFixed(1)}〜{an.segment.end.toFixed(1)}秒、{t.frames}
              フレーム、毎秒{an.fps}）
              <br />
              解析時間 <strong>{(t.totalMs / 1000).toFixed(1)}秒</strong>（モデル準備 {(t.modelLoadMs / 1000).toFixed(1)}秒／1フレーム平均：読込{' '}
              {seekAvg.toFixed(0)}ms・推定 {detectAvg.toFixed(0)}ms）・{an.model}・{an.delegate}
            </small>
          </div>
        )}
        {props.summary.warnings.length > 0 && (
          <Notice title="確認してください">
            <ul>
              {props.summary.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Notice>
        )}

        <section class="stack" aria-label="評価候補">
          <h2>評価候補の場面</h2>
          {candidates.length > 0 ? (
            <>
              <div class="cands">
                {candidates.map((c, k) => (
                  <CandThumb
                    key={c.index}
                    frame={an.frames[c.index]}
                    score={c}
                    n={k + 1}
                    active={c.index === selected}
                    onClick={() => props.onSelect(c.index)}
                  />
                ))}
              </div>
              <small>
                検出できたフレームのうち、前後のフレームでも同程度の姿勢が続き、姿勢負担が高いと推定された場面です。下のグラフやスライダーで別の場面に選び直せます。この区間の結果は作業全体の評価ではありません。
              </small>
            </>
          ) : (
            <Notice title="評価候補を自動で抽出できませんでした">
              人物が十分に検出できていない可能性があります。下のスライダーで場面を選ぶか、全身が映るように撮影し直してください。
            </Notice>
          )}
        </section>

        <section class="stack" aria-label="選択中のフレーム">
          <div class="row">
            <h2 class="grow" style={{ margin: 0 }}>
              {frame.time.toFixed(1)}秒のフレーム{isCand ? `（候補${candidates.findIndex((c) => c.index === selected) + 1}）` : ''}
            </h2>
          </div>
          {props.editor}
          <SkeletonLegend />
          <div class="stepper">
            <button class="btn" onClick={() => props.onSelect(Math.max(0, selected - 1))} disabled={selected === 0} aria-label="前のフレーム">
              ◀
            </button>
            <input
              type="range"
              min={0}
              max={an.frames.length - 1}
              value={selected}
              aria-label="フレームを選ぶ"
              onInput={(e) => props.onSelect(Number((e.currentTarget as HTMLInputElement).value))}
            />
            <button
              class="btn"
              onClick={() => props.onSelect(Math.min(an.frames.length - 1, selected + 1))}
              disabled={selected === an.frames.length - 1}
              aria-label="次のフレーム"
            >
              ▶
            </button>
          </div>
          <Timeline scores={scores} candidates={candidates} selected={selected} onSelect={props.onSelect} />
          <div class="card tight">
            <small>
              検出状態：
              {frame.quality.detected
                ? frame.quality.issues.length
                  ? frame.quality.issues.map((i) => ISSUE_LABEL[i]).join('、')
                  : '人物1人・全身を検出'
                : '人物を検出できません'}
              {frame.view && `／撮影方向の目安：${VIEW_LABEL[frame.view]}`}
              {!score.eligible && score.reason && `／候補の対象外：${score.reason}`}
              <br />
              検出状態は関節点が映っているかの目安で、角度の精度を保証するものではありません。
            </small>
          </div>
        </section>

        <section class="stack" aria-label="評価側">
          <h2>評価する側（作業者本人の左右）</h2>
          <div class="seg">
            {(['left', 'right'] as Side[]).map((s) => (
              <button key={s} class="opt" aria-pressed={props.side === s} onClick={() => props.onSide(s)}>
                <span>
                  {sideLabel(s)}側
                  <br />
                  <small>姿勢指標 {score.perSide[s] ?? '—'}</small>
                </span>
              </button>
            ))}
          </div>
          <small>上腕・前腕・手首は評価側の値で採点します。体幹・頸部・脚は左右共通です。</small>
        </section>

        <section class="stack" aria-label="推定角度">
          <h2>推定角度と REBA の区分</h2>
          {frame.quality.detected ? (
            <AngleTable a={frame.angles} side={props.side} auto={props.auto} hints={props.hints} />
          ) : (
            <Notice title="このフレームでは人物を検出できていません。別の場面を選んでください。" />
          )}
          <small>角度はすべて画像からの推定値です。推定が難しい項目（頸部・手首・ねじれ等）は次の画面で評価者が確認します。</small>
        </section>

        <section class="stack">
          <button class="btn block" aria-expanded={show3d} onClick={() => setShow3d(!show3d)}>
            {show3d ? '▲ 3D骨格を閉じる' : '▼ 3D骨格を表示（推定）'}
          </button>
          {show3d && (
            <Suspense fallback={<p>3D表示を読み込み中…</p>}>
              <Skeleton3D world={frame.world} side={props.side} time={frame.time} />
            </Suspense>
          )}
        </section>

        <section class="stack" aria-label="REBA仮評価">
          <h2>REBA（この時点の仮評価）</h2>
          <ScoreBox result={props.result} status={props.status} />
          <small>重量・把持・活動などの手動項目が未確認のため、取りうる範囲を表示しています。</small>
        </section>
      </main>
      <BottomBar>
        <button class="btn primary big" onClick={props.onNext} disabled={!frame.quality.detected}>
          この場面で評価する →
        </button>
      </BottomBar>
    </>
  );
}
