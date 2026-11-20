/** 評価結果の CSV 書き出し（Excel で文字化けしないよう UTF-8 BOM 付き・CRLF） */
import type { Angles } from '../angles/angles';
import { sideLabel } from '../pose/landmarks';
import { ITEM_KEYS, ITEMS, SOURCE_LABEL, optionOf, resolveItem } from '../reba/items';
import { rangeText, riskOf } from '../reba/scoring';
import type { AssessmentRecord } from '../storage/record';

export function csvCell(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const deg = (v: number | null | undefined) => (v == null ? '' : v.toFixed(1));

function angleColumns(a: Angles, side: 'left' | 'right'): [string, string][] {
  const ua = a.upperArm[side];
  return [
    ['体幹前傾(+)/後傾(-)_推定°', deg(a.trunkFlexion)],
    ['体幹側屈_推定°(参考)', deg(a.trunkLateral)],
    ['肩と骨盤の向きの差_推定°(参考)', deg(a.trunkTwist)],
    ['頭頸部前傾(+)/後傾(-)_推定°(参考)', deg(a.neckFlexion)],
    ['評価側_上腕挙上_推定°', deg(ua?.elevation)],
    ['評価側_上腕伸展扱い', ua ? (ua.isExtension ? 'はい' : 'いいえ') : ''],
    ['評価側_上腕外転_推定°(参考)', deg(ua?.abduction)],
    ['評価側_肘屈曲_推定°', deg(a.elbowFlexion[side])],
    ['評価側_手首の曲がり_推定°(参考)', deg(a.wristBend[side])],
    ['左膝屈曲_推定°', deg(a.kneeFlexion.left)],
    ['右膝屈曲_推定°', deg(a.kneeFlexion.right)],
    ['左足関節背屈_推定°(追加情報)', deg(a.ankleDorsiflexion.left)],
    ['右足関節背屈_推定°(追加情報)', deg(a.ankleDorsiflexion.right)],
  ];
}

export function recordRow(r: AssessmentRecord): [string, string][] {
  const res = r.result;
  const finalScore = r.status === 'final' ? res.reba.min : null;
  const risk = finalScore != null ? riskOf(finalScore) : null;
  const cols: [string, string][] = [
    ['ID', r.id],
    ['作成日時', r.createdAt],
    ['状態', r.status === 'final' ? '確定' : '仮評価'],
    ['データ種別', r.isDemo ? '模擬データ（実測ではない）' : '動画解析'],
    ['作業名', r.meta.taskName],
    ['場所', r.meta.site],
    ['評価者', r.meta.evaluator],
    ['メモ', r.meta.note],
    ['動画名', r.source.videoName],
    ['解析区間_開始秒', r.source.segmentStart.toFixed(2)],
    ['解析区間_終了秒', r.source.segmentEnd.toFixed(2)],
    ['評価フレーム_秒', r.source.frameTime.toFixed(2)],
    ['評価側', sideLabel(r.side)],
    ['撮影方向_推定', r.view ?? ''],
    ...angleColumns(r.angles, r.side),
  ];
  for (const k of ITEM_KEYS) {
    const { value, source } = resolveItem(k, r.auto, r.manual);
    const label = ITEMS[k].label;
    cols.push([`${label}`, optionOf(k, value)?.label ?? '未確認']);
    cols.push([`${label}_点`, optionOf(k, value) ? String(optionOf(k, value)!.points) : '']);
    cols.push([`${label}_出所`, SOURCE_LABEL[source]]);
    cols.push([`${label}_自動推定値`, optionOf(k, r.auto[k])?.label ?? '']);
  }
  cols.push(
    ['体幹スコア', rangeText(res.trunk)],
    ['頸部スコア', rangeText(res.neck)],
    ['脚スコア', rangeText(res.legs)],
    ['TableA', rangeText(res.tableA)],
    ['重量力スコア', rangeText(res.loadForce)],
    ['スコアA', rangeText(res.scoreA)],
    ['上腕スコア', rangeText(res.upperArm)],
    ['前腕スコア', rangeText(res.lowerArm)],
    ['手首スコア', rangeText(res.wrist)],
    ['TableB', rangeText(res.tableB)],
    ['把持スコア', rangeText(res.coupling)],
    ['スコアB', rangeText(res.scoreB)],
    ['TableC', rangeText(res.tableC)],
    ['活動スコア', rangeText(res.activity)],
    ['REBAスコア(確定)', finalScore != null ? String(finalScore) : ''],
    ['REBAスコア範囲(仮評価)', r.status === 'final' ? '' : rangeText(res.reba)],
    ['リスク区分', risk ? risk.label : ''],
    ['アクションレベル', risk ? String(risk.actionLevel) : ''],
    ['対応', risk ? risk.action : ''],
    ['未確認項目', res.unknown.map((k) => ITEMS[k].label).join(' / ')],
    ['姿勢確認済み', r.postureConfirmed ? 'はい' : 'いいえ'],
    ['検出上の注意', r.qualityIssues.join(' / ')],
    ['モデル', r.source.model],
    ['実行方式', r.source.delegate],
    ['抽出fps', String(r.source.fps)],
    ['解析フレーム数', String(r.source.analyzedFrames)],
    ['解析時間_秒', (r.source.analysisMs / 1000).toFixed(1)],
    ['顔ぼかし', r.imageFaceBlurred ? 'あり' : 'なし'],
    ['アプリ版', r.appVersion],
  );
  return cols;
}

export function recordsToCsv(records: AssessmentRecord[]): string {
  if (records.length === 0) return '﻿';
  const rows = records.map(recordRow);
  const header = rows[0].map(([h]) => csvCell(h)).join(',');
  const body = rows.map((r) => r.map(([, v]) => csvCell(v)).join(','));
  return `﻿${[header, ...body].join('\r\n')}\r\n`;
}
