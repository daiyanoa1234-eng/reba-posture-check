/**
 * PC 用の評価ワークスペース（画面全体を使う）。
 *   左: 自動解析（候補・フレーム＋骨格・関節調整・タイムライン）
 *   中: 3D骨格（推定）と角度表 … 幅 1500px 以上のとき
 *   右: REBA スコアとチェックリスト（幅が狭いときは 3D・角度をタブで切替）
 * 場面選択と手動入力を1画面で行い、入力内容は場面ごとに保持する。
 */
import type { ComponentChildren } from 'preact';
import { lazy, Suspense } from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';
import { AngleTable } from '../components/AngleTable';
import { Checklist, type ChecklistProps } from '../components/Checklist';
import { SkeletonLegend } from '../components/FrameView';
import { Timeline } from '../components/Timeline';
import { Notice, ScoreBox, useObjectUrl } from '../components/ui';
import type { AnalysisSummary } from '../lib/analysis/analyze';
import { ISSUE_LABEL } from '../lib/analysis/quality';
import type { AnalysisResult, FrameRecord } from '../lib/analysis/types';
import { VIEW_LABEL } from '../lib/angles/angles';
import { type Side, sideLabel } from '../lib/pose/landmarks';
import type { AssessmentStatus } from '../lib/reba/scoring';
import type { FrameScore } from '../lib/selection/candidates';
import { PRESETS, type AccuracyPreset } from '../state/settings';

const Skeleton3D = lazy(() => import('../components/Skeleton3D').then((m) => ({ default: m.Skeleton3D })));

export function useMediaQuery(q: string): boolean {
  const get = () => {
    try {
      return window.matchMedia(q).matches;
    } catch {
      return false;
    }
  };
  const [m, setM] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [q]);
  return m;
}

function Cand({ frame, score, n, active, touched, onClick }: { frame: FrameRecord; score: FrameScore; n: number; active: boolean; touched: boolean; onClick: () => void }) {
  const url = useObjectUrl(frame.imageBlob);
  return (
    <button class="ws-cand" aria-pressed={active} onClick={onClick} title={`${frame.time.toFixed(1)}秒`}>
      {url ? <img src={url} alt="" /> : <span class="ws-cand-ph" />}
      <span>
        <strong>候補{n}</strong> {frame.time.toFixed(1)}秒
        <br />
        <small>
          指標{score.postureIndex}・{score.bestSide ? sideLabel(score.bestSide) : ''}
          {touched ? '・入力あり' : ''}
        </small>
      </span>
    </button>
  );
}

type Tab = 'check' | '3d' | 'angles';

export function Workspace(
  props: ChecklistProps & {
    analysis: AnalysisResult;
    summary: AnalysisSummary;
    scores: FrameScore[];
    candidates: FrameScore[];
    selected: number;
    onSelect: (i: number) => void;
    onSide: (s: Side) => void;
    frame: FrameRecord;
    editor: ComponentChildren;
    editing: boolean;
    touchedFrames: Set<number>;
    status: AssessmentStatus;
    onUndo: () => void;
    onNext: () => void;
    onBack: () => void;
  },
) {
  const { analysis: an, scores, candidates, selected, frame } = props;
  const wide = useMediaQuery('(min-width: 1500px)');
  const [tab, setTab] = useState<Tab>('check');
  const score = scores[selected];
  const t = an.timing;
  const preset = an.accuracy && an.accuracy in PRESETS ? PRESETS[an.accuracy as AccuracyPreset].label : an.model;

  // キー操作: ←/→ でフレーム移動（関節調整中は関節の移動に使う）、Ctrl/⌘+Z で関節調整を元に戻す
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        props.onUndo();
        return;
      }
      if (props.editing) return;
      if (e.key === 'ArrowLeft') props.onSelect(Math.max(0, selected - 1));
      else if (e.key === 'ArrowRight') props.onSelect(Math.min(an.frames.length - 1, selected + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const unknownN = props.result.unknown.length;
  const threeD = (
    <Suspense fallback={<p>3D表示を読み込み中…</p>}>
      <Skeleton3D world={frame.world} side={props.side} time={frame.time} />
    </Suspense>
  );
  const angles = frame.quality.detected ? (
    <AngleTable a={frame.angles} side={props.side} auto={props.auto} hints={props.hints} />
  ) : (
    <Notice title="このフレームでは人物を検出できていません。" />
  );

  return (
    <div class="ws">
      <header class="ws-top">
        <button class="icon-btn" onClick={props.onBack} aria-label="戻る">
          ← 戻る
        </button>
        <h1>評価ワークスペース</h1>
        <ol class="ws-steps" aria-label="手順">
          <li>① 場面を選ぶ</li>
          <li>② 関節点を確認・調整</li>
          <li>③ チェックリスト</li>
          <li>④ 結果・保存</li>
        </ol>
        <div class="ws-top-right">
          <span class="ws-keys">←/→ フレーム移動・⌘/Ctrl+Z 元に戻す</span>
        </div>
      </header>
      {an.source === 'demo' && <div class="demo-banner">模擬データを表示中（実測ではありません）</div>}

      <div class={`ws-body ${wide ? 'three' : 'two'}`}>
        <section class="ws-col ws-left" aria-label="自動解析">
          <div class="ws-info">
            {an.source === 'demo' ? (
              <span>模擬データ（合成した骨格）</span>
            ) : (
              <span>
                {an.videoName}・{an.segment.start.toFixed(1)}〜{an.segment.end.toFixed(1)}秒・{t.frames}フレーム（毎秒{an.fps}）・{preset}・解析{' '}
                {(t.totalMs / 1000).toFixed(1)}秒
              </span>
            )}
            {props.summary.warnings.length > 0 && (
              <details class="ws-warn">
                <summary>⚠ 確認事項 {props.summary.warnings.length}件</summary>
                <ul>
                  {props.summary.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <div class="ws-cands" role="group" aria-label="評価候補の場面">
            {candidates.length ? (
              candidates.map((c, k) => (
                <Cand
                  key={c.index}
                  frame={an.frames[c.index]}
                  score={c}
                  n={k + 1}
                  active={c.index === selected}
                  touched={props.touchedFrames.has(c.index)}
                  onClick={() => props.onSelect(c.index)}
                />
              ))
            ) : (
              <span class="muted">評価候補を自動で抽出できませんでした。スライダーで場面を選んでください。</span>
            )}
            <small class="ws-cand-note">候補は姿勢負担が高いと推定された場面（作業全体の評価ではありません）</small>
          </div>

          {props.editor}
          <SkeletonLegend />

          <div class="stepper">
            <button class="btn small" onClick={() => props.onSelect(Math.max(0, selected - 1))} disabled={selected === 0} aria-label="前のフレーム">
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
              class="btn small"
              onClick={() => props.onSelect(Math.min(an.frames.length - 1, selected + 1))}
              disabled={selected === an.frames.length - 1}
              aria-label="次のフレーム"
            >
              ▶
            </button>
            <strong class="ws-time">{frame.time.toFixed(1)}秒</strong>
          </div>
          <Timeline scores={scores} candidates={candidates} selected={selected} onSelect={props.onSelect} />
          <small>
            検出状態：
            {frame.quality.detected
              ? frame.quality.issues.length
                ? frame.quality.issues.map((i) => ISSUE_LABEL[i]).join('、')
                : '人物1人・全身を検出'
              : '人物を検出できません'}
            {frame.view && `／撮影方向の目安：${VIEW_LABEL[frame.view]}`}
            {!score.eligible && score.reason && `／候補の対象外：${score.reason}`}
            。検出状態は関節点が映っているかの目安で、角度の精度を保証するものではありません。
          </small>
        </section>

        {wide && (
          <section class="ws-col ws-mid" aria-label="3D骨格と角度">
            <h2>3D骨格（推定）</h2>
            {threeD}
            <h2>推定角度と REBA の区分</h2>
            {angles}
          </section>
        )}

        <section class="ws-col ws-right" aria-label="評価">
          <div class="ws-score">
            <ScoreBox result={props.result} status={props.status} />
            <div class="ws-scene">
              <span>
                評価場面 <strong>{frame.time.toFixed(1)}秒</strong>
              </span>
              <div class="ws-side" role="group" aria-label="評価する側">
                {(['left', 'right'] as Side[]).map((s) => (
                  <button key={s} class="btn small" aria-pressed={props.side === s} onClick={() => props.onSide(s)}>
                    {sideLabel(s)}側{score.perSide[s] != null ? `（指標${score.perSide[s]}）` : ''}
                  </button>
                ))}
              </div>
            </div>
            {!wide && (
              <div class="ws-tabs" role="tablist">
                <button role="tab" aria-selected={tab === 'check'} onClick={() => setTab('check')}>
                  チェックリスト{unknownN ? ` 残り${unknownN}` : ' ✓'}
                </button>
                <button role="tab" aria-selected={tab === '3d'} onClick={() => setTab('3d')}>
                  3D骨格
                </button>
                <button role="tab" aria-selected={tab === 'angles'} onClick={() => setTab('angles')}>
                  角度
                </button>
              </div>
            )}
          </div>
          <div class="ws-right-body">
            {(wide || tab === 'check') && <Checklist {...props} frameSlot={null} />}
            {!wide && tab === '3d' && threeD}
            {!wide && tab === 'angles' && angles}
          </div>
          <div class="ws-next">
            <button class="btn primary block" onClick={props.onNext} disabled={!frame.quality.detected}>
              {props.status === 'final' ? '結果を確認して保存 →' : `結果へ（仮評価・未確認 ${unknownN}）→`}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
