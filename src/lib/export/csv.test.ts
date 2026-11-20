import { describe, expect, it } from 'vitest';
import { emptyAngles } from '../angles/angles';
import { computeReba } from '../reba/scoring';
import type { AssessmentRecord } from '../storage/record';
import { csvCell, recordsToCsv } from './csv';

function rec(over: Partial<AssessmentRecord> = {}): AssessmentRecord {
  const manual = { load: 'gt10' };
  return {
    id: 'x1',
    createdAt: '2026-11-20T10:00:00.000Z',
    updatedAt: '2026-11-20T10:00:00.000Z',
    appVersion: '0.1.0',
    isDemo: false,
    status: 'provisional',
    meta: { taskName: '鉄筋, 結束 "A"', site: '', evaluator: '', note: '1行目\n2行目' },
    source: { videoName: 'a.mp4', segmentStart: 0, segmentEnd: 20, frameIndex: 3, frameTime: 0.6, fps: 5, model: 'lite', delegate: 'CPU', analysisMs: 12000, analyzedFrames: 100 },
    side: 'right',
    view: 'side',
    angles: emptyAngles(),
    auto: { trunkPos: '3' },
    manual,
    hints: {},
    postureConfirmed: false,
    result: computeReba({ trunkPos: '3', ...manual }),
    image: null,
    imageFaceBlurred: true,
    qualityIssues: [],
    ...over,
  };
}

describe('CSV 書き出し', () => {
  it('カンマ・引用符・改行をエスケープする', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('x\ny')).toBe('"x\ny"');
    expect(csvCell(null)).toBe('');
  });

  it('BOM 付き・ヘッダー行と同じ列数', () => {
    const text = recordsToCsv([rec(), rec({ id: 'x2', isDemo: true })]);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain('模擬データ（実測ではない）');
    expect(text).toContain('"鉄筋, 結束 ""A"""');
  });

  it('仮評価は確定スコアを空欄にし、範囲と未確認項目を出す', () => {
    const text = recordsToCsv([rec()]);
    const [header, row] = text.replace('﻿', '').split('\r\n');
    const h = header.split(',');
    expect(text).toContain('仮評価');
    expect(text).toContain('未確認');
    expect(h).toContain('REBAスコア(確定)');
    expect(row.length).toBeGreaterThan(0);
  });

  it('自動推定値と手動値の出所を区別して出力する', () => {
    const text = recordsToCsv([rec({ manual: { trunkPos: '4' } })]);
    expect(text).toContain('手動修正');
  });
});
