import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DemoBanner, Toast, useToast } from './components/ui';
import { AnalysisCancelled, type AnalyzeProgress, analyzeVideo, summarize } from './lib/analysis/analyze';
import { ISSUE_LABEL } from './lib/analysis/quality';
import type { AnalysisResult } from './lib/analysis/types';
import { generateDemo } from './lib/demo/demo';
import { EngineLoadError, poseEngine } from './lib/pose/engine';
import type { Side } from './lib/pose/landmarks';
import { autoItemsFromAngles } from './lib/reba/autoItems';
import { type ItemKey, type ItemValues, SIDE_ITEM_KEYS, effectiveValues } from './lib/reba/items';
import { computeReba, statusOf } from './lib/reba/scoring';
import { pickCandidates, scoreFrames } from './lib/selection/candidates';
import { deleteRecord, listRecords, saveRecord } from './lib/storage/db';
import { type AssessmentMeta, type AssessmentRecord, newId } from './lib/storage/record';
import { type LoadedVideo, VIDEO_HELP, VideoLoadError, loadVideo, releaseVideo } from './lib/video/videoSource';
import { Analyzing } from './screens/Analyzing';
import { Help } from './screens/Help';
import { History } from './screens/History';
import { Home } from './screens/Home';
import { Manual } from './screens/Manual';
import { Prepare, type Segment, defaultSegment } from './screens/Prepare';
import { Recorder } from './screens/Recorder';
import { Result } from './screens/Result';
import { Review } from './screens/Review';
import { SettingsView } from './screens/SettingsView';
import { onPwaChange, pwaState } from './state/pwa';
import { type Settings, loadSettings, saveSettings } from './state/settings';

type Screen = 'home' | 'record' | 'prepare' | 'analyzing' | 'review' | 'manual' | 'result' | 'history' | 'saved' | 'settings' | 'help';

const META_KEY = 'reba-meta-defaults-v1';
function loadMetaDefaults(): AssessmentMeta {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Partial<AssessmentMeta>;
    return { taskName: '', site: m.site ?? '', evaluator: m.evaluator ?? '', note: '' };
  } catch {
    return { taskName: '', site: '', evaluator: '', note: '' };
  }
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [video, setVideo] = useState<LoadedVideo | null>(null);
  const [segment, setSegment] = useState<Segment>({ start: 0, end: 0 });
  const [prepMsg, setPrepMsg] = useState<string | null>(null);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<AnalyzeProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [selected, setSelected] = useState(0);
  const [side, setSide] = useState<Side>('right');
  const [manual, setManual] = useState<ItemValues>({});
  const [postureConfirmed, setPostureConfirmed] = useState(false);
  const [meta, setMeta] = useState<AssessmentMeta>(loadMetaDefaults);
  const [draftId, setDraftId] = useState(newId);
  const [createdAt, setCreatedAt] = useState(() => new Date().toISOString());
  const [saved, setSaved] = useState(false);
  const [savedRecord, setSavedRecord] = useState<AssessmentRecord | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [toastMsg, toast] = useToast();
  const [pwa, setPwa] = useState({ ...pwaState });

  useEffect(() => onPwaChange(() => setPwa({ ...pwaState })), []);

  const refreshCount = () =>
    listRecords()
      .then((r) => setSavedCount(r.length))
      .catch(() => setSavedCount(null));
  useEffect(() => {
    refreshCount();
  }, []);

  // 解析モデルを裏で先読みしておく（失敗してもホーム画面に状態を表示するだけ）
  useEffect(() => {
    const t = setTimeout(() => poseEngine.ensure(settings.model, settings.delegate).catch(() => undefined), 600);
    return () => clearTimeout(t);
  }, [settings.model, settings.delegate]);

  const updateSettings = (s: Settings) => {
    setSettingsState(s);
    saveSettings(s);
  };

  // ---- 派生状態 ---------------------------------------------------------
  const sel = {
    uprightToleranceDeg: settings.uprightToleranceDeg,
    neckExtensionToleranceDeg: settings.neckExtensionToleranceDeg,
    spikeThresholdDeg: settings.spikeThresholdDeg,
    candidateSeparationSec: settings.candidateSeparationSec,
  };
  const scores = useMemo(() => (analysis ? scoreFrames(analysis.frames, sel) : []), [analysis, ...Object.values(sel)]);
  const candidates = useMemo(() => pickCandidates(scores, 3, settings.candidateSeparationSec), [scores, settings.candidateSeparationSec]);
  const summary = useMemo(() => (analysis ? summarize(analysis) : null), [analysis]);
  const frame = analysis?.frames[selected] ?? null;
  const { auto, hints } = useMemo(
    () => (frame ? autoItemsFromAngles(frame.angles, side, settings) : { auto: {}, hints: {} }),
    [frame, side, settings.uprightToleranceDeg, settings.neckExtensionToleranceDeg],
  );
  const result = useMemo(() => computeReba(effectiveValues(auto, manual)), [auto, manual]);
  const status = statusOf(result, postureConfirmed);

  const draft: AssessmentRecord | null = useMemo(() => {
    if (!analysis || !frame) return null;
    return {
      id: draftId,
      createdAt,
      updatedAt: createdAt,
      appVersion: __APP_VERSION__,
      isDemo: analysis.source === 'demo',
      status,
      meta,
      source: {
        videoName: analysis.videoName,
        segmentStart: analysis.segment.start,
        segmentEnd: analysis.segment.end,
        frameIndex: frame.index,
        frameTime: frame.time,
        fps: analysis.fps,
        model: analysis.model,
        delegate: analysis.delegate,
        analysisMs: analysis.timing.totalMs,
        analyzedFrames: analysis.frames.length,
      },
      side,
      view: frame.view,
      angles: frame.angles,
      auto,
      manual,
      hints,
      postureConfirmed,
      result,
      image: null,
      imageFaceBlurred: false,
      qualityIssues: frame.quality.issues.map((i) => ISSUE_LABEL[i]),
    };
  }, [analysis, frame, draftId, createdAt, status, meta, side, auto, manual, hints, postureConfirmed, result]);

  // ---- 操作 --------------------------------------------------------------
  const resetAssessment = () => {
    setManual({});
    setPostureConfirmed(false);
    setDraftId(newId());
    setCreatedAt(new Date().toISOString());
    setSaved(false);
  };

  const clearAll = () => {
    abortRef.current?.abort();
    releaseVideo(video);
    setVideo(null);
    setAnalysis(null);
    setProgress(null);
    setPrepMsg(null);
    resetAssessment();
    setMeta(loadMetaDefaults());
  };

  const openVideo = async (f: File, autoStart: boolean) => {
    setBusy(true);
    setHomeError(null);
    clearAll();
    try {
      const v = await loadVideo(f, f.name || '動画');
      setVideo(v);
      const seg = defaultSegment(v.duration);
      setSegment(seg);
      // アプリ内撮影は20秒で自動停止しているため、そのまま解析を始める（わずかに超えた分は区間外）
      if (autoStart) startAnalysis(v, seg);
      else setScreen('prepare');
    } catch (e) {
      const msg = e instanceof VideoLoadError && e.kind === 'unsupported' ? `${e.message}。${VIDEO_HELP}` : `動画を読み込めません：${errorText(e)}`;
      setHomeError(msg);
      setScreen('home');
    } finally {
      setBusy(false);
    }
  };

  const onAnalysisDone = (res: AnalysisResult) => {
    const sc = scoreFrames(res.frames, sel);
    const cands = pickCandidates(sc, 3, settings.candidateSeparationSec);
    const firstDetected = res.frames.findIndex((f) => f.quality.detected);
    setAnalysis(res);
    setSelected(cands[0]?.index ?? Math.max(0, firstDetected));
    setSide(cands[0]?.bestSide ?? 'right');
    resetAssessment();
    setScreen('review');
  };

  const startAnalysis = (v: LoadedVideo | null = video, seg: Segment = segment) => {
    if (!v) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setProgress(null);
    setPrepMsg(null);
    setScreen('analyzing');
    analyzeVideo(v, settings, { start: seg.start, end: seg.end, signal: ac.signal, onProgress: setProgress })
      .then((res) => {
        if (!ac.signal.aborted) onAnalysisDone(res);
      })
      .catch((e) => {
        if (e instanceof AnalysisCancelled) setPrepMsg('解析をキャンセルしました。区間や設定を確認して、もう一度開始できます。');
        else if (e instanceof EngineLoadError)
          setPrepMsg(`解析モデルの読み込みに失敗しました（${e.message}）。通信状態を確認するか、一度オンラインでアプリを開いてから再度お試しください。`);
        else setPrepMsg(`解析中にエラーが発生しました：${errorText(e)}`);
        setScreen('prepare');
      });
  };

  const startDemo = async () => {
    setBusy(true);
    clearAll();
    try {
      onAnalysisDone(await generateDemo());
    } catch (e) {
      setHomeError(`模擬データを作成できません：${errorText(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const hasInput = () => Object.keys(manual).length > 0 || postureConfirmed;

  const selectFrame = (i: number) => {
    if (i === selected) return;
    if (hasInput() && !confirm('評価場面を変更すると、入力済みの手動項目と姿勢の確認はリセットされます。変更しますか？')) return;
    if (hasInput()) resetAssessment();
    setSelected(i);
  };

  const changeSide = (s: Side) => {
    if (s === side) return;
    const sideKeys = SIDE_ITEM_KEYS.filter((k) => manual[k] != null);
    if (sideKeys.length && !confirm('評価側を変更すると、上腕・前腕・手首の手動入力はリセットされます。変更しますか？')) return;
    const m = { ...manual };
    for (const k of SIDE_ITEM_KEYS) delete m[k];
    setManual(m);
    setPostureConfirmed(false);
    setSide(s);
  };

  const setItem = (k: ItemKey, v: string | null) => {
    setManual((m) => {
      const n = { ...m };
      if (v == null) delete n[k];
      else n[k] = v;
      return n;
    });
  };

  const goHome = () => {
    clearAll();
    setScreen('home');
    refreshCount();
  };

  const confirmLeaveAnalysis = () =>
    !analysis || saved || confirm('解析結果と入力内容は保存されていません。破棄してよろしいですか？');

  // ---- 戻る操作（Android の戻るボタンにも対応） -------------------------------
  const back = (): boolean => {
    switch (screen) {
      case 'home':
        return false;
      case 'record':
      case 'settings':
      case 'help':
      case 'history':
        setScreen('home');
        if (screen === 'history') refreshCount();
        return true;
      case 'saved':
        setScreen('history');
        return true;
      case 'prepare':
        goHome();
        return true;
      case 'analyzing':
        abortRef.current?.abort();
        return true;
      case 'review':
        if (!confirmLeaveAnalysis()) return true;
        if (video) {
          setAnalysis(null);
          resetAssessment();
          setScreen('prepare');
        } else goHome();
        return true;
      case 'manual':
        setScreen('review');
        return true;
      case 'result':
        setScreen('manual');
        return true;
    }
  };
  const backRef = useRef(back);
  backRef.current = back;
  useEffect(() => {
    history.pushState({ reba: true }, '');
    const onPop = () => {
      if (backRef.current()) history.pushState({ reba: true }, '');
      else history.back();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (analysis && !saved) e.preventDefault();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [analysis, saved]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  const isDemo = analysis?.source === 'demo' && ['review', 'manual', 'result'].includes(screen);

  // 開発時の検証用フック（本番ビルドでは無効）
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__reba = {
      openUrl: async (url: string, name = 'test.mp4') => {
        const b = await (await fetch(url)).blob();
        await openVideo(new File([b], name, { type: b.type || 'video/mp4' }), false);
      },
      state: () => ({ screen, selected, side, status, reba: result.reba, unknown: result.unknown, timing: analysis?.timing }),
      analysis: () => analysis,
      scores: () => scores,
    };
  }

  let body;
  switch (screen) {
    case 'home':
      body = (
        <Home
          onRecord={() => {
            clearAll();
            setScreen('record');
          }}
          onPickFile={(f) => openVideo(f, false)}
          onDemo={startDemo}
          onHistory={() => setScreen('history')}
          onSettings={() => setScreen('settings')}
          onHelp={() => setScreen('help')}
          onRetryModel={() => poseEngine.ensure(settings.model, settings.delegate).catch(() => undefined)}
          error={homeError}
          offlineReady={pwa.offlineReady || !!navigator.serviceWorker?.controller}
          needRefresh={pwa.needRefresh}
          onUpdate={() => pwa.update?.()}
          savedCount={savedCount}
          busy={busy}
        />
      );
      break;
    case 'record':
      body = <Recorder onDone={(f) => openVideo(f, true)} onCancel={() => setScreen('home')} />;
      break;
    case 'prepare':
      body = video ? (
        <Prepare
          video={video}
          segment={segment}
          onSegment={setSegment}
          onStart={() => startAnalysis()}
          onCancel={goHome}
          settings={settings}
          message={prepMsg}
        />
      ) : null;
      break;
    case 'analyzing':
      body = <Analyzing progress={progress} onCancel={() => abortRef.current?.abort()} />;
      break;
    case 'review':
      body =
        analysis && summary ? (
          <Review
            analysis={analysis}
            summary={summary}
            scores={scores}
            candidates={candidates}
            selected={selected}
            onSelect={selectFrame}
            side={side}
            onSide={changeSide}
            auto={auto}
            hints={hints}
            result={result}
            status={status}
            visThr={settings.visibilityThreshold}
            onNext={() => setScreen('manual')}
            onBack={back}
          />
        ) : null;
      break;
    case 'manual':
      body = frame ? (
        <Manual
          frame={frame}
          side={side}
          auto={auto}
          hints={hints}
          manual={manual}
          onSet={setItem}
          onSetMany={(v) => setManual((m) => ({ ...m, ...v }))}
          postureConfirmed={postureConfirmed}
          onPostureConfirmed={setPostureConfirmed}
          result={result}
          status={status}
          isDemo={analysis?.source === 'demo'}
          onNext={() => setScreen('result')}
          onBack={back}
        />
      ) : null;
      break;
    case 'result':
      body = draft ? (
        <Result
          record={draft}
          frame={frame}
          saved={saved}
          defaultFaceBlur={settings.faceBlur}
          onMeta={setMeta}
          onSave={async (r) => {
            await saveRecord(r);
            setSaved(true);
            try {
              localStorage.setItem(META_KEY, JSON.stringify({ site: r.meta.site, evaluator: r.meta.evaluator }));
            } catch {
              /* noop */
            }
            refreshCount();
          }}
          onNew={() => {
            if (confirmLeaveAnalysis()) goHome();
          }}
          onBack={back}
          toast={toast}
        />
      ) : null;
      break;
    case 'history':
      body = (
        <History
          onOpen={(r) => {
            setSavedRecord(r);
            setScreen('saved');
          }}
          onBack={back}
          toast={toast}
        />
      );
      break;
    case 'saved':
      body = savedRecord ? (
        <Result
          record={savedRecord}
          frame={null}
          saved
          defaultFaceBlur={settings.faceBlur}
          onDelete={async () => {
            if (!confirm('この評価を端末から削除します。元に戻せません。削除しますか？')) return;
            await deleteRecord(savedRecord.id);
            toast('削除しました');
            setScreen('history');
          }}
          onNew={goHome}
          onBack={back}
          toast={toast}
        />
      ) : null;
      break;
    case 'settings':
      body = <SettingsView settings={settings} onChange={updateSettings} onBack={back} />;
      break;
    case 'help':
      body = <Help onBack={back} />;
      break;
  }

  return (
    <div class="app">
      {isDemo && <DemoBanner />}
      {body}
      <Toast msg={toastMsg} />
    </div>
  );
}
