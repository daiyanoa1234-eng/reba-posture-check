import type { ComponentChildren } from 'preact';
import { Checklist, type ChecklistProps } from '../components/Checklist';
import { BottomBar, Notice, ScoreBox, TopBar } from '../components/ui';
import { sideLabel } from '../lib/pose/landmarks';
import type { AssessmentStatus } from '../lib/reba/scoring';

/** スマホ用の手動項目入力画面（1画面・大きなボタン） */
export function Manual(
  props: ChecklistProps & {
    frameTime: number;
    status: AssessmentStatus;
    editor: ComponentChildren;
    onNext: () => void;
    onBack: () => void;
  },
) {
  return (
    <>
      <TopBar title="手動項目の入力・確認" onBack={props.onBack} />
      <main>
        <div class="sticky-score">
          <ScoreBox result={props.result} status={props.status} compact />
        </div>
        <Notice kind="info">
          評価場面：<strong>{props.frameTime.toFixed(1)}秒</strong>／評価側：<strong>{sideLabel(props.side)}</strong>。
          入力はこの場面の姿勢と、作業全体を知る評価者の判断で行ってください。保持時間や反復頻度は20秒の動画だけでは判断できません。
        </Notice>
        <Checklist {...props} frameSlot={props.editor} />
      </main>
      <BottomBar>
        <button class="btn primary big" onClick={props.onNext}>
          {props.status === 'final' ? '結果を確定へ →' : '結果を見る（仮評価）→'}
        </button>
      </BottomBar>
    </>
  );
}
