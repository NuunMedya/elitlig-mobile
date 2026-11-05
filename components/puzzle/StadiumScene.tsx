/**
 * STADYUM SAHNESİ — "Stadyumunu Kur"un görseli.
 *
 * NE: kuşbakışına yakın tek bir SVG sahne. Yapılan her parça (ör.
 * "saha.zemin", "tribun.ana", "isik.direkler") sahneye kendi katmanını ekler;
 * yapılmamış parçanın yeri boş ya da toprak kalır. Yeni yapılan parça
 * `highlight` ile kısa bir parlama alır (sonlu animasyon, ekran tarafında).
 *
 * NEDEN SVG: tek dosyada çözünürlükten bağımsız, hafif ve paket gerektirmez;
 * parça eklemek bir katman eklemek kadar basit.
 */

import React from "react";
import Svg, { Circle, G, Line, Path, Polygon, Rect, Text as SvgText } from "react-native-svg";

import { STADIUM_COLORS as C } from "@/lib/puzzle/stadiumPalette";

const W = 360;
const H = 270;
const F = { x: 86, y: 92, w: 188, h: 104 }; // saha

export function StadiumScene({ built, width }: { built: string[]; width: number }) {
  const has = (id: string) => built.includes(id);
  const height = (width * H) / W;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`} accessibilityLabel={`Stadyum: ${built.length} parça yapıldı`}>
      {/* Gökyüzü ve zemin */}
      <Rect x={0} y={0} width={W} height={H} fill={C.sky} />
      <Rect x={0} y={60} width={W} height={H - 60} fill={C.skyGlow} opacity={0.6} />
      <Rect x={20} y={70} width={W - 40} height={140} rx={18} fill={C.dirtDark} />

      {/* Havai fişek (efsane) */}
      {has("efsane.havai")
        ? [
            [60, 26],
            [180, 18],
            [300, 28],
          ].map(([cx, cy], i) => (
            <G key={`fw${i}`}>
              {Array.from({ length: 10 }, (_, k) => {
                const a = (k / 10) * Math.PI * 2;
                return <Line key={k} x1={cx} y1={cy} x2={cx + Math.cos(a) * 14} y2={cy + Math.sin(a) * 14} stroke={C.firework[(i + k) % C.firework.length]} strokeWidth={2} strokeLinecap="round" />;
              })}
              <Circle cx={cx} cy={cy} r={3} fill={C.light} />
            </G>
          ))
        : null}

      {/* Ana tribün + koltuklar + çatı + spiker kabini + VIP */}
      {has("tribun.ana") ? (
        <G>
          <Rect x={70} y={44} width={220} height={40} rx={6} fill={C.standBase} />
          <Rect x={70} y={74} width={220} height={10} fill={C.standShade} />
          {has("tribun.koltuk")
            ? [0, 1, 2, 3].map((r) => <Rect key={r} x={76} y={50 + r * 7} width={208} height={4} rx={2} fill={r % 2 ? C.seatB : C.seatA} />)
            : null}
          {has("tribun.taraftar") ? <Fans x={78} y={48} w={204} h={28} seed={1} /> : null}
          {has("tribun.cati") ? <Path d="M64 44 L296 44 L284 32 L76 32 Z" fill={C.roof} /> : null}
          {has("isik.spiker") ? (
            <G>
              <Rect x={164} y={34} width={32} height={12} rx={3} fill={C.board} />
              <Rect x={168} y={37} width={24} height={5} fill={C.glass} />
            </G>
          ) : null}
          {has("efsane.vip") ? [0, 1, 2, 3].map((i) => <Rect key={i} x={92 + i * 48} y={36} width={26} height={8} rx={2} fill={C.glass} opacity={0.9} />) : null}
        </G>
      ) : null}

      {/* Kale arkası tribünleri */}
      {has("tribun.kale_arkasi") ? (
        <G>
          <Rect x={34} y={92} width={44} height={104} rx={6} fill={C.standBase} />
          <Rect x={282} y={92} width={44} height={104} rx={6} fill={C.standBase} />
          {has("tribun.koltuk")
            ? [0, 1, 2, 3].map((c) => (
                <G key={c}>
                  <Rect x={40 + c * 9} y={98} width={4} height={92} rx={2} fill={c % 2 ? C.seatB : C.seatA} />
                  <Rect x={288 + c * 9} y={98} width={4} height={92} rx={2} fill={c % 2 ? C.seatB : C.seatA} />
                </G>
              ))
            : null}
          {has("tribun.taraftar") ? (
            <>
              <Fans x={38} y={96} w={36} h={96} seed={2} />
              <Fans x={286} y={96} w={36} h={96} seed={3} />
            </>
          ) : null}
        </G>
      ) : null}

      {/* LED panolar */}
      {has("isik.led") ? (
        <G>
          <Rect x={F.x - 6} y={F.y - 8} width={F.w + 12} height={4} fill={C.led} />
          <Rect x={F.x - 6} y={F.y + F.h + 4} width={F.w + 12} height={4} fill={C.ledAlt} />
        </G>
      ) : null}

      {/* Saha */}
      <Rect x={F.x} y={F.y} width={F.w} height={F.h} rx={4} fill={has("saha.zemin") ? C.grass : C.dirt} />
      {has("saha.zemin") ? [1, 3, 5, 7].map((i) => <Rect key={i} x={F.x + (i * F.w) / 8} y={F.y} width={F.w / 8} height={F.h} fill={C.grassStripe} />) : null}
      {has("saha.cizgiler") ? (
        <G stroke={C.line} strokeWidth={1.4} fill="none">
          <Rect x={F.x + 4} y={F.y + 4} width={F.w - 8} height={F.h - 8} />
          <Line x1={F.x + F.w / 2} y1={F.y + 4} x2={F.x + F.w / 2} y2={F.y + F.h - 4} />
          <Circle cx={F.x + F.w / 2} cy={F.y + F.h / 2} r={14} />
          <Rect x={F.x + 4} y={F.y + F.h / 2 - 22} width={26} height={44} />
          <Rect x={F.x + F.w - 30} y={F.y + F.h / 2 - 22} width={26} height={44} />
        </G>
      ) : null}
      {has("saha.kaleler") ? (
        <G>
          <Rect x={F.x - 4} y={F.y + F.h / 2 - 10} width={8} height={20} fill={C.net} stroke={C.goal} strokeWidth={1.5} />
          <Rect x={F.x + F.w - 4} y={F.y + F.h / 2 - 10} width={8} height={20} fill={C.net} stroke={C.goal} strokeWidth={1.5} />
        </G>
      ) : null}
      {has("saha.bayraklar")
        ? [
            [F.x + 4, F.y + 4],
            [F.x + F.w - 4, F.y + 4],
            [F.x + 4, F.y + F.h - 4],
            [F.x + F.w - 4, F.y + F.h - 4],
          ].map(([x, y], i) => (
            <G key={i}>
              <Line x1={x} y1={y} x2={x} y2={y - 9} stroke={C.line} strokeWidth={1} />
              <Polygon points={`${x},${y - 9} ${x + 6},${y - 7} ${x},${y - 5}`} fill={C.flag} />
            </G>
          ))
        : null}
      {has("saha.yedek") ? (
        <G>
          <Rect x={F.x + 50} y={F.y + F.h + 10} width={30} height={7} rx={3} fill={C.bench} />
          <Rect x={F.x + F.w - 80} y={F.y + F.h + 10} width={30} height={7} rx={3} fill={C.bench} />
        </G>
      ) : null}

      {/* Işık direkleri */}
      {has("isik.direkler")
        ? [
            [30, 54],
            [330, 54],
            [30, 214],
            [330, 214],
          ].map(([x, y], i) => (
            <G key={i}>
              <Line x1={x} y1={y} x2={x} y2={y + 26} stroke={C.pole} strokeWidth={3} />
              <Rect x={x - 9} y={y - 6} width={18} height={8} rx={2} fill={C.light} />
              <Polygon points={`${x - 9},${y + 2} ${x + 9},${y + 2} ${x + (x < 180 ? 60 : -60)},${y + (y < 100 ? 70 : -40)}`} fill={C.light} opacity={0.12} />
            </G>
          ))
        : null}

      {/* Skorboard */}
      {has("isik.skorboard") ? (
        <G>
          <Rect x={294} y={6} width={58} height={26} rx={4} fill={C.board} />
          <SvgText x={323} y={24} fill={C.boardText} fontSize={13} fontWeight="bold" textAnchor="middle">
            3 - 1
          </SvgText>
        </G>
      ) : null}
      {has("isik.kamera")
        ? [
            [F.x + F.w / 2 - 4, F.y - 16],
            [F.x - 16, F.y + 10],
          ].map(([x, y], i) => <Rect key={i} x={x} y={y} width={10} height={7} rx={2} fill={C.camera} />)
        : null}

      {/* Kulüp tesisleri (alt sıra) */}
      {has("tesis.soyunma") ? <Building x={24} y={222} w={56} label="Soyunma" /> : null}
      {has("tesis.kantin") ? (
        <G>
          <Rect x={92} y={228} width={46} height={26} rx={3} fill={C.kiosk} />
          {[0, 1, 2, 3, 4].map((i) => <Rect key={i} x={92 + i * 9.2} y={222} width={9.2} height={7} fill={i % 2 ? C.kiosk : C.kioskAwning} />)}
        </G>
      ) : null}
      {has("tesis.muze") ? <Building x={150} y={218} w={60} label="Müze" tall /> : null}
      {has("tesis.magaza") ? <Building x={220} y={224} w={50} label="Mağaza" /> : null}
      {has("tesis.otopark") ? (
        <G>
          <Rect x={280} y={220} width={70} height={40} rx={4} fill={C.asphalt} />
          {[0, 1, 2, 3, 4].map((i) => <Line key={i} x1={288 + i * 13} y1={224} x2={288 + i * 13} y2={238} stroke={C.parkLine} strokeWidth={1} />)}
        </G>
      ) : null}

      {/* Efsane */}
      {has("efsane.heykel") ? (
        <G>
          <Rect x={8} y={196} width={14} height={8} fill={C.bronze} />
          <Circle cx={15} cy={180} r={4} fill={C.bronze} />
          <Rect x={12} y={184} width={6} height={12} fill={C.bronze} />
        </G>
      ) : null}
      {has("efsane.kupa") ? (
        <G>
          <Rect x={170} y={204} width={20} height={10} fill={C.glass} opacity={0.7} />
          <Path d="M174 196 h12 v4 a6 6 0 0 1 -12 0 z" fill={C.gold} />
          <Rect x={178} y={204} width={4} height={6} fill={C.gold} />
        </G>
      ) : null}
      {has("efsane.acilis")
        ? Array.from({ length: 40 }, (_, i) => (
            <Rect key={i} x={(i * 97) % W} y={(i * 53) % 90} width={3} height={6} fill={C.confetti[i % C.confetti.length]} transform={`rotate(${(i * 37) % 90} ${(i * 97) % W} ${(i * 53) % 90})`} />
          ))
        : null}
    </Svg>
  );
}

function Building({ x, y, w, label, tall }: { x: number; y: number; w: number; label: string; tall?: boolean }) {
  const h = tall ? 40 : 32;
  return (
    <G>
      <Rect x={x} y={y} width={w} height={h} rx={3} fill={C.building} />
      <Rect x={x - 2} y={y - 4} width={w + 4} height={6} rx={2} fill={C.buildingRoof} />
      {[0, 1, 2].map((i) => <Rect key={i} x={x + 6 + i * ((w - 12) / 3)} y={y + 6} width={(w - 18) / 3} height={7} fill={C.window} />)}
      <SvgText x={x + w / 2} y={y + h - 6} fill={C.line} fontSize={7} textAnchor="middle">
        {label}
      </SvgText>
    </G>
  );
}

function Fans({ x, y, w, h, seed }: { x: number; y: number; w: number; h: number; seed: number }) {
  const dots = [];
  const cols = Math.max(2, Math.floor(w / 7));
  const rows = Math.max(2, Math.floor(h / 7));
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const k = (r * 31 + c * 17 + seed * 13) % 7;
      if (k === 0) continue;
      dots.push(<Circle key={`${r}-${c}`} cx={x + 3 + c * 7} cy={y + 3 + r * 7} r={2} fill={C.fan[(r + c + seed) % C.fan.length]} />);
    }
  }
  return <G>{dots}</G>;
}
