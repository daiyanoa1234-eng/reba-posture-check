import { LM, type Pt, type Side, sideIdx } from '../pose/landmarks';

export type PartKey =
  | 'trunk'
  | 'neck'
  | 'upperArm_left'
  | 'upperArm_right'
  | 'lowerArm_left'
  | 'lowerArm_right'
  | 'wrist_left'
  | 'wrist_right'
  | 'knee_left'
  | 'knee_right'
  | 'ankle_left'
  | 'ankle_right';

export type IssueCode = 'no_person' | 'multiple_people' | 'not_full_body' | 'trunk_hidden';

export interface FrameQuality {
  detected: boolean;
  multiplePeople: boolean;
  fullBody: boolean;
  /** 部位ごとに、必要な関節点が画面内にあり visibility がしきい値以上か */
  parts: Record<PartKey, boolean>;
  issues: IssueCode[];
}

const MARGIN = 0.02;

export function inFrame(p: Pt | undefined): boolean {
  return !!p && p.x >= -MARGIN && p.x <= 1 + MARGIN && p.y >= -MARGIN && p.y <= 1 + MARGIN;
}

export function emptyParts(): Record<PartKey, boolean> {
  return {
    trunk: false,
    neck: false,
    upperArm_left: false,
    upperArm_right: false,
    lowerArm_left: false,
    lowerArm_right: false,
    wrist_left: false,
    wrist_right: false,
    knee_left: false,
    knee_right: false,
    ankle_left: false,
    ankle_right: false,
  };
}

/**
 * 1フレームの検出状態を判定する。
 * image: 対象者の画像正規化座標（visibility 付き）。numPoses: 同フレームで検出された人数。
 * visibility は「映っている見込み」であり測定精度の保証ではない。ここでは推定が成立するかの足切りにだけ使う。
 */
export function assessQuality(image: Pt[] | null, numPoses: number, visThr: number): FrameQuality {
  const parts = emptyParts();
  if (!image || image.length < 33) {
    return { detected: false, multiplePeople: numPoses >= 2, fullBody: false, parts, issues: ['no_person'] };
  }
  const vis = (i: number) => inFrame(image[i]) && image[i].v >= visThr;
  const present = (i: number) => inFrame(image[i]);

  // 体幹: 両肩・両股関節が画面内にあり、各ペアの少なくとも片側が見えていること（側方撮影では奥側が隠れるため）
  const trunk =
    present(LM.L_SHOULDER) && present(LM.R_SHOULDER) && present(LM.L_HIP) && present(LM.R_HIP) &&
    (vis(LM.L_SHOULDER) || vis(LM.R_SHOULDER)) && (vis(LM.L_HIP) || vis(LM.R_HIP));
  parts.trunk = trunk;
  parts.neck = trunk && (vis(LM.L_EAR) || vis(LM.R_EAR));

  for (const side of ['left', 'right'] as Side[]) {
    const s = sideIdx(side);
    parts[`upperArm_${side}`] = trunk && vis(s.shoulder) && vis(s.elbow);
    parts[`lowerArm_${side}`] = vis(s.shoulder) && vis(s.elbow) && vis(s.wrist);
    parts[`wrist_${side}`] = vis(s.elbow) && vis(s.wrist) && vis(s.index) && vis(s.pinky);
    parts[`knee_${side}`] = vis(s.hip) && vis(s.knee) && vis(s.ankle);
    parts[`ankle_${side}`] = vis(s.knee) && vis(s.ankle) && vis(s.heel) && vis(s.foot);
  }

  // 全身: 主要関節が画面内にあり、左右どちらかの膝・足首が見えている
  const majors = [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP, LM.L_KNEE, LM.R_KNEE, LM.L_ANKLE, LM.R_ANKLE];
  const fullBody =
    majors.every(present) &&
    (vis(LM.L_KNEE) || vis(LM.R_KNEE)) &&
    (vis(LM.L_ANKLE) || vis(LM.R_ANKLE)) &&
    trunk;

  const issues: IssueCode[] = [];
  if (numPoses >= 2) issues.push('multiple_people');
  if (!fullBody) issues.push('not_full_body');
  if (!trunk) issues.push('trunk_hidden');
  return { detected: true, multiplePeople: numPoses >= 2, fullBody, parts, issues };
}

export const ISSUE_LABEL: Record<IssueCode, string> = {
  no_person: '人物を検出できません',
  multiple_people: '複数人が映っています',
  not_full_body: '全身（足首まで）が映っていません',
  trunk_hidden: '肩・股関節が確認できません',
};
