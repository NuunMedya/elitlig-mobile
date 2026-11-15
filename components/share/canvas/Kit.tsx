/**
 * PAYLAŞIM TUVALİNİN ORTAK BİLEŞİKLERİ — birden çok şablonun aynı biçimde
 * kullandığı parçalar: skor yazısı, karşılaştırma çubuğu, radar, bilgi
 * şeridi, arma + ad sütunu. Yapı taşları (metin, arma, portre, cam) için
 * bkz. `Primitives.tsx`.
 */

import React from "react";
import { View } from "react-native";
import Svg, { Circle, G, Line, Polygon, Text as SvgText, TSpan } from "react-native-svg";

import { alpha } from "@/lib/share/palette";
import { fonts } from "@/theme";
import { CText, Crest, FillBox, FitName, Glass, Glyph, Overline } from "./Primitives";
import type { ShareFrame } from "./types";

export interface ShareTeamRef {
  name: string;
  logo: string | null;
}

/* ══════════════════════════ SKOR ══════════════════════════ */

/** "16 – 1" — iki basamaklı skorlarda punto düşer. */
export function ScoreText({
  f,
  home,
  away,
  scale = 1,
  k = "mega",
  maxWidth,
  color,
  dashColor,
  winnerOnly = false,
}: {
  f: ShareFrame;
  home: number | string | null;
  away: number | string | null;
  scale?: number;
  k?: "mega" | "score";
  /** Sığması gereken genişlik (birim); verilirse punto buna göre iner. */
  maxWidth?: number;
  color?: string;
  dashColor?: string;
  /** Kaybeden tarafın rakamı sönük yazılır. */
  winnerOnly?: boolean;
}) {
  const digits = String(home ?? "-").length + String(away ?? "-").length;
  const base = k === "mega" ? 132 : 84;
  // Archivo rakamı ~0.6 em; tire 0.62 ölçekte + iki yan boşluk.
  const estimate = base * (digits * 0.6 + 0.4) + 24;
  const fit = maxWidth ? Math.min(1, maxWidth / (estimate * scale)) : digits <= 3 ? 1 : digits === 4 ? 0.8 : 0.66;
  const h = Number(home);
  const a = Number(away);
  const dimHome = winnerOnly && Number.isFinite(h) && Number.isFinite(a) && h < a;
  const dimAway = winnerOnly && Number.isFinite(h) && Number.isFinite(a) && a < h;
  const ink = color ?? f.t.ink;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
      <CText f={f} k={k} scale={scale * fit} color={dimHome ? alpha(ink, 0.42) : ink}>
        {home ?? "-"}
      </CText>
      <CText f={f} k={k} scale={scale * fit * 0.5} color={dashColor ?? f.t.accent} style={{ marginHorizontal: f.u(10 * scale * fit) }}>
        –
      </CText>
      <CText f={f} k={k} scale={scale * fit} color={dimAway ? alpha(ink, 0.42) : ink}>
        {away ?? "-"}
      </CText>
    </View>
  );
}

/* ══════════════════════════ KİMLİK ══════════════════════════ */

/** Arma + ad sütunu (ortalı). */
export function TeamColumn({
  f,
  team,
  size,
  room = 13,
  halo,
  haloColor,
  dim,
  scale = 1,
}: {
  f: ShareFrame;
  team: ShareTeamRef;
  size: number;
  room?: number;
  halo?: boolean;
  haloColor?: string;
  dim?: boolean;
  scale?: number;
}) {
  return (
    <View style={{ flex: 1, alignItems: "center", gap: f.u(10) }}>
      <Crest f={f} logo={team.logo} name={team.name} size={size} halo={halo} haloColor={haloColor} dim={dim} />
      <FitName f={f} text={team.name} room={room} caps min={0.6} scale={scale} color={dim ? f.t.inkSoft : f.t.ink} />
    </View>
  );
}

/** Degrade hap etiket ("MAÇ SONU"). */
export function TagPill({ f, label, tone = "sig" }: { f: ShareFrame; label: string; tone?: "sig" | "gold" }) {
  return (
    <FillBox f={f} radius={20} tone={tone} style={{ alignSelf: "center", paddingHorizontal: f.u(13), paddingVertical: f.u(5) }}>
      <Overline f={f} color={tone === "gold" ? f.t.medalInk : f.t.onFill} scale={1.02}>
        {label}
      </Overline>
    </FillBox>
  );
}

/* ══════════════════════════ BİLGİ ŞERİDİ ══════════════════════════ */

export interface InfoItem {
  label: string;
  value: string;
  sub?: string | null;
  /** Büyük rakam (saat). */
  big?: boolean;
  /** Göreli genişlik. */
  weight?: number;
  icon?: React.ComponentProps<typeof Glyph>["name"];
}

/** Cam şerit içinde 2–3 bilgi hücresi (tarih · saat · saha), kıl çizgiyle ayrık. */
export function InfoStrip({ f, items, pad = 14 }: { f: ShareFrame; items: InfoItem[]; pad?: number }) {
  const { u, t } = f;
  return (
    <Glass f={f} radius={18} style={{ flexDirection: "row", paddingVertical: u(pad) }}>
      {items.map((item, index) => (
        <View
          key={item.label}
          style={{
            flex: item.weight ?? 1,
            paddingHorizontal: u(11),
            borderLeftWidth: index ? Math.max(1, u(0.7)) : 0,
            borderLeftColor: t.line,
            justifyContent: "center",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: u(4) }}>
            {item.icon ? <Glyph f={f} name={item.icon} size={8.5} color={t.inkMuted} /> : null}
            <Overline f={f} color={t.inkMuted}>{item.label}</Overline>
          </View>
          {item.big ? (
            <CText f={f} k="score" scale={0.26} color={t.accent} style={{ marginTop: u(5) }}>
              {item.value}
            </CText>
          ) : (
            <FitName f={f} k="name" text={item.value} room={12} lines={2} align="left" scale={0.88} min={0.66} style={{ marginTop: u(5) }} />
          )}
          {item.sub ? (
            <CText f={f} k="body" color={t.inkMuted} scale={0.88} style={{ marginTop: u(1) }}>
              {item.sub}
            </CText>
          ) : null}
        </View>
      ))}
    </Glass>
  );
}

/* ══════════════════════════ KARŞILAŞTIRMA ══════════════════════════ */

export type Side = "a" | "b" | null;

/** Hangi taraf önde? `lowerIsBetter` kart sayısı gibi metrikler içindir. */
export function leader(a: number, b: number, lowerIsBetter = false): Side {
  if (a === b) return null;
  return (lowerIsBetter ? a < b : a > b) ? "a" : "b";
}

/** Sayıyı Türkçe biçimde yazar: tam sayı ondalıksız, kalanı virgüllü. */
export function fmtNum(value: number, unit = ""): string {
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
  return `${text}${unit}`;
}

/**
 * Karşılaştırma satırı — değerler uçlarda, etiket ortada; altında ortadan
 * dışa büyüyen iki çubuk. Önde olan taraf kendi renginde DOLU, geride
 * olan aynı rengin sönük tonunda. Beraberlikte ikisi de yarı ton.
 */
export function DuelRow({
  f,
  label,
  a,
  b,
  unit,
  lowerIsBetter,
  neutral,
  thick = 5,
  scale = 1,
}: {
  f: ShareFrame;
  label: string;
  a: number;
  b: number;
  unit?: string;
  lowerIsBetter?: boolean;
  neutral?: boolean;
  thick?: number;
  scale?: number;
}) {
  const { u, t } = f;
  const win = neutral ? null : leader(a, b, lowerIsBetter);
  const max = Math.max(Math.abs(a), Math.abs(b), 0.0001);
  const pa = Math.max(0.04, Math.abs(a) / max);
  const pb = Math.max(0.04, Math.abs(b) / max);
  const colorA = win === "b" ? alpha(t.sideA, 0.34) : win === "a" ? t.sideA : alpha(t.sideA, 0.6);
  const colorB = win === "a" ? alpha(t.sideB, 0.34) : win === "b" ? t.sideB : alpha(t.sideB, 0.6);
  const th = u(thick * scale);
  return (
    <View style={{ gap: u(5 * scale) }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <CText f={f} k="numStrong" scale={1.15 * scale} color={win === "b" ? t.inkMuted : t.ink} style={{ minWidth: u(40) }}>
          {fmtNum(a, unit)}
        </CText>
        <Overline f={f} color={t.inkSoft} scale={0.95 * Math.min(1, scale)} align="center" style={{ flex: 1 }}>
          {label}
        </Overline>
        <CText f={f} k="numStrong" scale={1.15 * scale} color={win === "a" ? t.inkMuted : t.ink} align="right" style={{ minWidth: u(40) }}>
          {fmtNum(b, unit)}
        </CText>
      </View>
      <View style={{ flexDirection: "row", height: th, gap: u(4) }}>
        <View style={{ flex: 1, flexDirection: "row-reverse", backgroundColor: t.glass, borderRadius: th / 2 }}>
          <View style={{ width: `${pa * 100}%`, backgroundColor: colorA, borderRadius: th / 2 }} />
        </View>
        <View style={{ flex: 1, flexDirection: "row", backgroundColor: t.glass, borderRadius: th / 2 }}>
          <View style={{ width: `${pb * 100}%`, backgroundColor: colorB, borderRadius: th / 2 }} />
        </View>
      </View>
    </View>
  );
}

export interface RadarAxis {
  label: string;
  a: number;
  b: number;
  lowerIsBetter?: boolean;
}

/**
 * Radar (örümcek) grafiği — her eksen kendi içinde ölçeklenir: öndeki taraf
 * dış halkaya değer, geride olan oranınca içeride kalır. "Az olan iyi"
 * eksenlerde oran ters çevrilir. 3–8 eksen.
 */
export function Radar({ f, axes, size }: { f: ShareFrame; axes: RadarAxis[]; size: number }) {
  const { u, t } = f;
  const s = u(size);
  const pad = u(50);
  const box = s + pad * 2;
  const cx = box / 2;
  const cy = box / 2;
  const r = s / 2;
  const n = axes.length;
  const angle = (i: number) => -Math.PI / 2 + (i * Math.PI * 2) / n;
  const pt = (i: number, k: number) => [cx + Math.cos(angle(i)) * r * k, cy + Math.sin(angle(i)) * r * k] as const;
  const norm = (ax: RadarAxis, v: number) => {
    const lo = Math.min(ax.a, ax.b);
    const hi = Math.max(ax.a, ax.b);
    if (hi <= 0 && lo <= 0) return 0.12;
    if (ax.lowerIsBetter) return v <= 0 ? 1 : Math.max(0.12, lo / v);
    return Math.max(0.12, v / hi);
  };
  const poly = (side: "a" | "b") => axes.map((ax, i) => pt(i, norm(ax, ax[side])).join(",")).join(" ");
  const ring = (k: number) => axes.map((_, i) => pt(i, k).join(",")).join(" ");
  const sw = Math.max(1, u(1.4));
  const fontSize = u(7.4);
  return (
    <Svg width={box} height={box}>
      {[0.25, 0.5, 0.75, 1].map((k) => (
        <Polygon key={k} points={ring(k)} fill={k === 1 ? t.glass : "none"} stroke={t.line} strokeWidth={Math.max(0.6, u(0.7))} />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <Line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={t.line} strokeWidth={Math.max(0.6, u(0.7))} />;
      })}
      <Polygon points={poly("b")} fill={alpha(t.sideB, 0.22)} stroke={t.sideB} strokeWidth={sw} strokeLinejoin="round" />
      <Polygon points={poly("a")} fill={alpha(t.sideA, 0.22)} stroke={t.sideA} strokeWidth={sw} strokeLinejoin="round" />
      {axes.map((ax, i) => (
        <G key={`d${i}`}>
          <Circle cx={pt(i, norm(ax, ax.b))[0]} cy={pt(i, norm(ax, ax.b))[1]} r={u(2.2)} fill={t.sideB} />
          <Circle cx={pt(i, norm(ax, ax.a))[0]} cy={pt(i, norm(ax, ax.a))[1]} r={u(2.2)} fill={t.sideA} />
        </G>
      ))}
      {axes.map((ax, i) => {
        const [x, y] = pt(i, 1.13);
        const c = Math.cos(angle(i));
        const sn = Math.sin(angle(i));
        const anchor = Math.abs(c) < 0.2 ? "middle" : c > 0 ? "start" : "end";
        // Uzun etiket iki satıra bölünür (ortadaki boşluktan).
        const label = ax.label.toLocaleUpperCase("tr-TR");
        const words = label.split(" ");
        const lines = label.length > 9 && words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")] : [label];
        const lh = fontSize * 1.15;
        const top = y + fontSize * 0.35 - (sn < -0.2 ? (lines.length - 1) * lh : sn > 0.2 ? 0 : ((lines.length - 1) * lh) / 2);
        return (
          <SvgText key={`l${i}`} fill={t.inkSoft} fontSize={fontSize} fontFamily={fonts.heading} letterSpacing={u(0.6)} textAnchor={anchor}>
            {lines.map((line, li) => (
              <TSpan key={li} x={x} y={top + li * lh}>
                {line}
              </TSpan>
            ))}
          </SvgText>
        );
      })}
    </Svg>
  );
}

/** Taraf işareti: renkli kısa çizgi + ad (radar ve düello açıklaması). */
export function SideKey({ f, side, name, align = "left" }: { f: ShareFrame; side: "a" | "b"; name: string; align?: "left" | "right" }) {
  const { u, t } = f;
  return (
    <View style={{ flexDirection: align === "right" ? "row-reverse" : "row", alignItems: "center", gap: u(6), flex: 1 }}>
      <View style={{ width: u(14), height: u(4), borderRadius: u(2), backgroundColor: side === "a" ? t.sideA : t.sideB }} />
      <FitName f={f} k="row" text={name} width={92} lines={1} align={align} caps scale={0.95} min={0.5} style={{ flexShrink: 1 }} />
    </View>
  );
}
