import { TopBar } from '../components/ui';

export function Help({ onBack }: { onBack: () => void }) {
  return (
    <>
      <TopBar title="使い方と注意" onBack={onBack} />
      <main class="desk-2col">
        <section class="card stack">
          <h2>使い方</h2>
          <ol style={{ margin: 0, paddingLeft: '1.3em' }}>
            <li>「撮影する」または「保存済みの動画を選ぶ」（20秒を超える動画は区間を選択）</li>
            <li>精度（速度優先／高精度／最高精度）を選んで解析（毎秒5フレーム程度。進捗とキャンセルを表示）</li>
            <li>評価候補の場面から1つ選ぶ（別の場面に選び直し可）</li>
            <li>骨格・推定角度・3D骨格・仮スコアを確認。関節点がずれていれば「関節を調整」でドラッグして直す（拡大・1px 微調整・元に戻す）</li>
            <li>手動項目（重量・把持・活動・ねじれ等）を入力し、推定姿勢を確認</li>
            <li>結果を確認して端末に保存。画像・CSV で書き出し</li>
          </ol>
        </section>
        <section class="card stack">
          <h2>撮影のコツ</h2>
          <ul style={{ margin: 0, paddingLeft: '1.2em' }}>
            <li>作業者1人だけが映るように。全身（頭から足首）を画面に入れる</li>
            <li>体幹・上腕の前後の角度は、真横から撮ると推定が安定しやすい</li>
            <li>スマホは傾けずに構える（画面の上方向を鉛直上方向とみなして計算します）</li>
            <li>逆光・暗所・遠すぎる撮影、工具や資材で関節が隠れる場面は推定が不安定になります</li>
          </ul>
        </section>
        <section class="card stack">
          <h2>この評価の位置づけ</h2>
          <ul style={{ margin: 0, paddingLeft: '1.2em' }}>
            <li>角度は MediaPipe Pose Landmarker による画像からの推定値です。腰椎・頸椎などの関節角度を直接測定したものではありません。</li>
            <li>関節点の「検出状態（visibility）」は映っている見込みの目安であり、角度の精度を保証しません。</li>
            <li>頸部・手首・ねじれ・側屈・肩の挙上などは推定が難しいため、評価者が画像を見て入力します。</li>
            <li>採点は選んだ1フレームの姿勢だけで行います。部位ごとに別時刻の最大値を集めることはしません。</li>
            <li>撮影区間の結果であり、作業全体の評価ではありません。保持時間・反復頻度は作業全体を知る評価者が判断します。</li>
            <li>未確認の項目は0点や「なし」とみなさず、取りうる範囲の「仮評価」として表示します。</li>
            <li>本アプリの臨床的・研究的な妥当性は検証されていません。</li>
          </ul>
        </section>
        <section class="card stack">
          <h2>REBA の出典</h2>
          <p>
            Hignett S, McAtamney L. Rapid Entire Body Assessment (REBA). Applied Ergonomics. 2000;31(2):201–205.
          </p>
          <small>採点表・補正条件の照合に使った資料と実装上の取り決めは README（docs/REBA_RULES.md）に記載しています。</small>
        </section>
        <section class="card stack">
          <h2>データの扱い</h2>
          <ul style={{ margin: 0, paddingLeft: '1.2em' }}>
            <li>動画・解析結果は端末内のブラウザで処理し、外部に送信しません。</li>
            <li>動画は保存しません（解析中のみメモリ上で使用）。</li>
            <li>保存されるのは評価結果と評価画像（初期設定で顔をぼかす）です。</li>
          </ul>
        </section>
        <small class="center">
          v{__APP_VERSION__}（{__BUILD_TIME__.slice(0, 10)}）
        </small>
      </main>
    </>
  );
}
