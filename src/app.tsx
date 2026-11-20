import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { FrameEditor } from './components/FrameEditor';
import { DemoBanner, Toast, useToast } from './components/ui';
import { applyEdits, describeEdits } from './lib/edit/edits';
import { AnalysisCancelled, type AnalyzeProgress, analyzeVideo, summarize } from './lib/analysis/analyze';
import { ISSUE_LABEL } from './lib/analysis/quality';
import type { AnalysisResult } from './lib/analysis/types';
import { generateDemo } from './lib/demo/demo';
import { EngineLoadError, poseEngine } from './lib/pose/engine';
import type { Side } from './lib/pose/landmarks';
import { autoItemsFromAngles } from './lib/reba/autoItems';
import { type ItemKey, type ItemValues, effectiveValues } from './lib/reba/items';
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
import { Workspace, useMediaQuery } from './screens/Workspace';
import {
  type SceneState,
  copyTaskItems,
  emptyScene,
  hasTaskItems,
  isSceneTouched,
  manualOf,
  resetEdits,
  setEdit,
  setItem as setSceneItem,
  setItems as setSceneItems,
  undoEdit,
} from './state/scenes';
import { onPwaChange, pwaState } from './state/pwa';
import { PRESETS, type Settings, loadSettings, saveSettings } from './state/settings';

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
  /** 場面（フレーム番号）ごとの手動入力・姿勢確認・関節調整 */
  const [scenes, setScenes] = useState<Record<number, SceneState>>({});
  const [meta, setMeta] = useState<AssessmentMeta>(loadMetaDefaults);
  const [analysisId, setAnalysisId] = useState(newId);
  /** 保存済みの評価（場面と評価側の組）→ 保存時刻 */
  const [savedDrafts, setSavedDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 1024px)');
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
    const t = setTimeout(() => poseEngine.ensure(PRESETS[settings.accuracy].model, settings.delegate).catch(() => undefined), 600);
    return () => clearTimeout(t);
  }, [settings.accuracy, settings.delegate]);

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
  const visThr = settings.visibilityThreshold;
  // 候補とタイムラインは自動推定の値で計算する（関節を調整しても候補の並びは変えない）
  const scores = useMemo(() => (analysis ? scoreFrames(analysis.frames, sel) : []), [analysis, ...Object.values(sel)]);
  const candidates = useMemo(() => pickCandidates(scores, 3, settings.candidateSeparationSec), [scores, settings.candidateSeparationSec]);
  const summary = useMemo(() => (analysis ? summarize(analysis) : null), [analysis]);
  const rawFrame = analysis?.frames[selected] ?? null;
  const sceneEdits = scenes[selected]?.edits;
  // 評価に使うフレームは、関節点の調整を反映したもの
  const frame = useMemo(() => (rawFrame ? applyEdits(rawFrame, sceneEdits, visThr) : null), [rawFrame, sceneEdits, visThr]);
  const scene = scenes[selected] ?? emptyScene();
  const manual = useMemo(() => manualOf(scene, side), [scene, side]);
  const postureConfirmed = scene.confirmed[side];
  const { auto, hints } = useMemo(
    () => (frame ? autoItemsFromAngles(frame.angles, side, settings) : { auto: {}, hints: {} }),
    [frame, side, settings.uprightToleranceDeg, settings.neckExtensionToleranceDeg],
  );
  const result = useMemo(() => computeReba(effectiveValues(auto, manual)), [auto, manual]);
  const status = statusOf(result, postureConfirmed);
  const draftKey = `${selected}-${side}`;
  const saved = savedDrafts[draftKey] != null;
  const touchedFrames = useMemo(() => new Set(Object.keys(scenes).map(Number).filter((k) => isSceneTouched(scenes[k]))), [scenes]);
  /** 作業条件をコピーできる別の場面（直近に入力した場面） */
  const copyFrom = useMemo(() => {
    if (hasTaskItems(scenes[selected])) return null;
    const others = Object.keys(scenes)
      .map(Number)
      .filter((k) => k !== selected && hasTaskItems(scenes[k]));
    if (!others.length) return null;
    return others.sort((a, b) => Math.abs(a - selected) - Math.abs(b - selected))[0];
  }, [scenes, selected]);

  const draft: AssessmentRecord | null = useMemo(() => {
    if (!analysis || !frame || !rawFrame) return null;
    const createdAt = savedDrafts[draftKey] ?? new Date().toISOString();
    return {
      id: `${analysisId}-${draftKey}`,
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
        accuracy: analysis.accuracy,
        delegate: analysis.delegate,
        analysisMs: analysis.timing.totalMs,
        analyzedFrames: analysis.frames.length,
      },
      side,
      view: frame.view,
      angles: frame.angles,
      anglesAuto: rawFrame.angles,
      landmarkEdits: describeEdits(rawFrame, scene.edits),
      auto,
      manual,
      hints,
      postureConfirmed,
      result,
      image: null,
      imageFaceBlurred: false,
      qualityIssues: frame.quality.issues.map((i) => ISSUE_LABEL[i]),
    };
  }, [analysis, frame, rawFrame, scene, analysisId, draftKey, savedDrafts, status, meta, side, auto, manual, hints, postureConfirmed, result]);

  // ---- 操作 --------------------------------------------------------------
  const resetAssessment = () => {
    setScenes({});
    setSavedDrafts({});
    setAnalysisId(newId());
    setEditing(false);
  };
  const updateScene = (fn: (s: SceneState) => SceneState) =>
    setScenes((all) => ({ ...all, [selected]: fn(all[selected] ?? emptyScene()) }));

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

  // 場面・評価側の切り替えでは入力を消さない（場面ごと・側ごとに保持）
  const selectFrame = (i: number) => {
    if (!analysis) return;
    setSelected(Math.min(analysis.frames.length - 1, Math.max(0, i)));
  };
  const changeSide = (s: Side) => setSide(s);
  const setItem = (k: ItemKey, v: string | null) => updateScene((sc) => setSceneItem(sc, side, k, v));
  const setItems = (v: ItemValues) => updateScene((sc) => setSceneItems(sc, side, v));
  const setConfirmed = (b: boolean) => updateScene((sc) => ({ ...sc, confirmed: { ...sc.confirmed, [side]: b } }));
  const onEdit = (joint: number, pos: { x: number; y: number } | null) => updateScene((sc) => setEdit(sc, joint, pos));
  const onUndo = () => updateScene(undoEdit);
  const onResetEdits = () => updateScene(resetEdits);
  const onCopyTask = copyFrom != null ? () => updateScene((sc) => copyTaskItems(scenes[copyFrom], sc)) : null;
  const copyLabel = copyFrom != null && analysis ? `${analysis.frames[copyFrom].time.toFixed(1)}秒の場面で入力した作業条件があります。` : undefined;

  const goHome = () => {
    clearAll();
    setScreen('home');
    refreshCount();
  };

  const anySaved = Object.keys(savedDrafts).length > 0;
  const confirmLeaveAnalysis = () =>
    !analysis || anySaved || touchedFrames.size === 0
      ? !analysis || anySaved || confirm('解析結果は保存されていません。破棄してよろしいですか？')
      : confirm('入力内容は保存されていません。破棄してよろしいですか？');

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
        setScreen(isDesktop ? 'review' : 'manual');
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
      if (analysis && !anySaved) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [analysis, anySaved]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  const isDemo = analysis?.source === 'demo' && ['review', 'manual', 'result'].includes(screen) && !(isDesktop && screen !== 'result');
  const fullScreen = isDesktop && (screen === 'review' || screen === 'manual');

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
      scene: () => scenes[selected],
      frame: () => frame,
      bench: async (url: string, accuracy: Settings['accuracy'], delegate: Settings['delegate'] = 'CPU', fps = 5) => {
        const { stabilityMetrics } = await import('./lib/analysis/metrics');
        const b = await (await fetch(url)).blob();
        const v = await loadVideo(new File([b], 'bench.mp4', { type: b.type || 'video/mp4' }), 'bench');
        try {
          const res = await analyzeVideo(v, { ...settings, accuracy, delegate, fps }, {
            start: 0,
            end: Math.min(20, v.duration),
            signal: new AbortController().signal,
            onProgress: () => undefined,
          });
          (window as unknown as Record<string, unknown>)[`__bench_${accuracy}_${delegate}`] = res;
          return { accuracy, delegate, totalSec: +(res.timing.totalMs / 1000).toFixed(1), ...stabilityMetrics(res) };
        } finally {
          releaseVideo(v);
        }
      },
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
          onRetryModel={() => poseEngine.ensure(PRESETS[settings.accuracy].model, settings.delegate).catch(() => undefined)}
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
          onSettings={updateSettings}
          message={prepMsg}
        />
      ) : null;
      break;
    case 'analyzing':
      body = <Analyzing progress={progress} onCancel={() => abortRef.current?.abort()} />;
      break;
    case 'review':
    case 'manual': {
      if (!analysis || !summary || !frame || !rawFrame) {
        body = null;
        break;
      }
      const editor = (
        <FrameEditor
          frame={frame}
          autoFrame={rawFrame}
          side={side}
          edits={scene.edits}
          visThr={visThr}
          onEdit={onEdit}
          onUndo={onUndo}
          onResetAll={onResetEdits}
          canUndo={scene.undo.length > 0}
          onModeChange={setEditing}
        />
      );
      const checklist = {
        side,
        auto,
        hints,
        manual,
        onSet: setItem,
        onSetMany: setItems,
        postureConfirmed,
        onPostureConfirmed: setConfirmed,
        result,
        onCopyTask,
        copyLabel,
      };
      if (isDesktop) {
        body = (
          <Workspace
            {...checklist}
            analysis={analysis}
            summary={summary}
            scores={scores}
            candidates={candidates}
            selected={selected}
            onSelect={selectFrame}
            onSide={changeSide}
            frame={frame}
            editor={editor}
            editing={editing}
            touchedFrames={touchedFrames}
            status={status}
            onUndo={onUndo}
            onNext={() => setScreen('result')}
            onBack={back}
          />
        );
      } else if (screen === 'review') {
        body = (
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
            visThr={visThr}
            editor={editor}
            frame={frame}
            onNext={() => setScreen('manual')}
            onBack={back}
          />
        );
      } else {
        body = <Manual {...checklist} frameTime={frame.time} status={status} editor={editor} onNext={() => setScreen('result')} onBack={back} />;
      }
      break;
    }
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
            setSavedDrafts((d) => ({ ...d, [draftKey]: r.createdAt }));
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
          onAnother={() => setScreen(isDesktop ? 'review' : 'review')}
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
    <div class={`app ${isDesktop ? 'desk' : ''} ${fullScreen ? 'full' : ''}`}>
      {isDemo && <DemoBanner />}
      {body}
      <Toast msg={toastMsg} />
    </div>
  );
}
