import type { Angles } from '../lib/angles/angles';
import type { Side } from '../lib/pose/landmarks';
import type { Hint } from '../lib/reba/autoItems';
import { ITEMS, type ItemKey, type ItemValues, optionOf } from '../lib/reba/items';
import { fmtDeg } from './ui';

function Row({ name, angle, note, cat }: { name: string; angle: string; note?: string; cat?: string }) {
  return (
    <tr>
      <th scope="row">{name}</th>
      <td class="num">{angle}</td>
      <td>
        {cat ?? ''}
        {note && (
          <>
            {cat ? <br /> : null}
            <small>{note}</small>
          </>
        )}
      </td>
    </tr>
  );
}

/** 推定角度と REBA 区分の対応表。推定できない部位は「—」とし、手動確認に回す */
export function AngleTable({
  a,
  side,
  auto,
  hints,
}: {
  a: Angles;
  side: Side;
  auto: ItemValues;
  hints: Partial<Record<ItemKey, Hint>>;
}) {
  const sideJ = side === 'left' ? '左' : '右';
  const cat = (k: ItemKey) => {
    const o = optionOf(k, auto[k]);
    if (o) return `自動：${o.label}（${ITEMS[k].key === 'kneeAdj' ? '+' : ''}${o.points}）`;
    const h = hints[k];
    if (h?.suggestion) return `要確認（提案：${optionOf(k, h.suggestion)?.label}）`;
    return '要確認';
  };
  const ua = a.upperArm[side];
  const trunkTxt =
    a.trunkFlexion == null ? '—' : `${a.trunkFlexion >= 0 ? '前傾' : '後傾'} ${fmtDeg(Math.abs(a.trunkFlexion))}`;
  const neckTxt = a.neckFlexion == null ? '—' : `${a.neckFlexion >= 0 ? '前傾' : '後傾'} ${fmtDeg(Math.abs(a.neckFlexion))}`;
  return (
    <table class="data">
      <thead>
        <tr>
          <th>部位（推定）</th>
          <th class="num">角度</th>
          <th>REBA の区分</th>
        </tr>
      </thead>
      <tbody>
        <Row name="体幹の傾き" angle={trunkTxt} cat={cat('trunkPos')} note="股関節中点→肩中点の線と鉛直線（腰椎角ではない）" />
        <Row
          name="体幹の側屈／ねじれ"
          angle={`${fmtDeg(a.trunkLateral == null ? null : Math.abs(a.trunkLateral))}／${fmtDeg(a.trunkTwist == null ? null : Math.abs(a.trunkTwist))}`}
          cat="要確認（参考値）"
        />
        <Row name="頭頸部の傾き" angle={neckTxt} cat={cat('neckPos')} note="耳と肩の位置からの参考値（頸椎角ではない）" />
        <Row
          name={`上腕（${sideJ}）`}
          angle={ua ? `${ua.isExtension ? '伸展 ' : ''}${fmtDeg(ua.elevation)}` : '—'}
          cat={cat('upperArmPos')}
          note={ua ? `外転 約${fmtDeg(Math.max(0, ua.abduction))}（参考）` : undefined}
        />
        <Row name={`肘の屈曲（${sideJ}）`} angle={fmtDeg(a.elbowFlexion[side])} cat={cat('lowerArmPos')} />
        <Row name={`手首（${sideJ}）`} angle={fmtDeg(a.wristBend[side])} cat={cat('wristPos')} note="屈曲・伸展・偏位を区別しない参考値" />
        <Row name="膝の屈曲 左／右" angle={`${fmtDeg(a.kneeFlexion.left)}／${fmtDeg(a.kneeFlexion.right)}`} cat={cat('kneeAdj')} />
        <Row
          name="足関節 背屈 左／右"
          angle={`${fmtDeg(a.ankleDorsiflexion.left)}／${fmtDeg(a.ankleDorsiflexion.right)}`}
          cat="追加情報（REBA の採点には使わない）"
        />
      </tbody>
    </table>
  );
}
