/**
 * YAYIN GRAFİKLERİ — skorbordla aynı katmanda PNG'ye çekilip videoya gömülen
 * küçük parçalar: altyazı (lower third), GOL bandı, röportaj bandı, sponsor
 * yuvası ve TEKRAR rozeti.
 *
 * Hepsi `scale` alır (1920 px sahneye göre çarpan) ve renklerini maçın yayın
 * paletinden (web "Yayın Tasarımı") okur; böylece skorbordla aynı kimliği taşır.
 *
 * BU PARÇALAR BİLEREK HAREKETSİZDİR. Katman yayına saniyede en çok bir-iki kez
 * gömülür; geçiş animasyonu olsaydı yayına animasyonun rastgele bir ara karesi
 * (yarı saydam, yarı kaymış) düşerdi.
 */

import { LinearGradient } from "expo-linear-gradient";
import React, { memo, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { DEFAULT_PALETTE, type BugPalette } from "@/lib/live/branding";
import { guestLine, type Interview } from "@/lib/live/interview";
import type { Caption, CaptionTone } from "@/lib/live/lowerThird";
import { GFX } from "@/lib/live/scorebug";
import { fonts } from "@/theme";

const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;

interface Base {
  scale: number;
  palette?: BugPalette | null;
  onAssetLoad?: () => void;
}

/** Görsel açılamazsa (SVG, kırık adres) sessizce gizlenir; çağıran metne düşer. */
function useImageOk(uri?: string | null) {
  const [failed, setFailed] = useState<string | null>(null);
  const ok = Boolean(uri) && uri !== failed;
  return { ok, onError: () => setFailed(uri ?? null) };
}

/* ═══════════════════════════ ALTYAZI ═══════════════════════════ */

function toneColors(tone: CaptionTone, C: BugPalette): { bg: string; fg: string } {
  switch (tone) {
    case "goal":
      return { bg: C.lowerGoal, fg: C.white };
    case "yellow":
      return { bg: C.lowerCard, fg: C.p900 };
    case "red":
      return { bg: C.lowerRed, fg: C.white };
    case "info":
      return { bg: C.v400, fg: C.p900 };
    case "sponsor":
      return { bg: C.white, fg: C.p900 };
    default:
      return { bg: C.v700, fg: C.white };
  }
}

export const LowerThird = memo(function LowerThird({ caption, scale: s, palette, onAssetLoad }: Base & { caption: Caption }) {
  const C = palette ?? DEFAULT_PALETTE;
  const tone = toneColors(caption.tone, C);
  const image = useImageOk(caption.imageUrl);
  const hasTag = Boolean(caption.tag) || image.ok;
  return (
    <View style={{ flexDirection: "row", alignItems: "stretch", maxWidth: s * GFX.caption.maxWidth, borderRadius: s * 10, overflow: "hidden" }}>
      {hasTag ? (
        <View style={{ backgroundColor: tone.bg, paddingHorizontal: s * 20, alignItems: "center", justifyContent: "center", gap: s * 6 }}>
          {image.ok && caption.imageUrl ? (
            <Image
              source={{ uri: caption.imageUrl }}
              onError={image.onError}
              onLoad={onAssetLoad}
              style={{ width: s * (caption.tone === "sponsor" ? 150 : 46), height: s * 46 }}
              resizeMode="contain"
            />
          ) : null}
          {caption.tag ? (
            <Text allowFontScaling={false} numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: s * 17, lineHeight: s * 22, letterSpacing: s * 1.6, color: tone.fg }}>
              {caption.tag}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={{ width: s * 8, backgroundColor: tone.bg }} />
      )}
      <View style={{ flexShrink: 1, justifyContent: "center", paddingHorizontal: s * 24, paddingVertical: s * 14, minHeight: s * 88 }}>
        <LinearGradient colors={[C.barTop, C.barBottom]} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
        <Text allowFontScaling={false} numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: s * 32, lineHeight: s * 40, letterSpacing: -s * 0.4, color: C.white }}>
          {caption.title}
        </Text>
        {caption.subtitle ? (
          <Text allowFontScaling={false} numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: s * 19, lineHeight: s * 26, color: C.white, opacity: 0.8 }}>
            {caption.subtitle}
          </Text>
        ) : null}
      </View>
      <View style={{ width: s * 6, backgroundColor: C.v400 }} />
    </View>
  );
});

/* ═══════════════════════════ GOL BANDI ═══════════════════════════ */

export interface GoalFlashData {
  /** Golü kazanan takım (kendi kalesine golde rakip). */
  teamName: string;
  teamLogo?: string | null;
  scorer?: string | null;
  own?: boolean;
  penalty?: boolean;
  homeCode: string;
  awayCode: string;
  homeScore: number;
  awayScore: number;
  minute: number;
}

/** Golcü adı + takım · dakika + skor. Sahne ölçeğinin `GFX.goal.scale` katı. */
export const GoalFlash = memo(function GoalFlash({ data, scale, palette, onAssetLoad }: Base & { data: GoalFlashData }) {
  const C = palette ?? DEFAULT_PALETTE;
  const logo = useImageOk(data.teamLogo);
  const s = scale * GFX.goal.scale;
  const head = data.own ? "KENDİ KALESİNE" : data.penalty ? "PENALTI GOLÜ" : "GOL";
  return (
    <View style={{ flexDirection: "row", alignItems: "stretch", borderRadius: s * 14, overflow: "hidden" }}>
      <View style={{ backgroundColor: C.lowerGoal, paddingHorizontal: s * 26, justifyContent: "center" }}>
        <Text allowFontScaling={false} style={{ fontFamily: fonts.bold, fontSize: s * 36, lineHeight: s * 44, letterSpacing: s * 2, color: C.white }}>
          {head}
        </Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: s * 18, paddingHorizontal: s * 26, paddingVertical: s * 14 }}>
        <LinearGradient colors={[C.barTop, C.barBottom]} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
        {logo.ok && data.teamLogo ? (
          <Image source={{ uri: data.teamLogo }} onError={logo.onError} onLoad={onAssetLoad} style={{ width: s * 64, height: s * 64 }} resizeMode="contain" />
        ) : null}
        <View style={{ maxWidth: s * 620 }}>
          <Text allowFontScaling={false} numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: s * 34, lineHeight: s * 42, color: C.white }}>
            {(data.scorer || data.teamName).toLocaleUpperCase("tr-TR")}
          </Text>
          <Text allowFontScaling={false} numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: s * 19, lineHeight: s * 26, color: C.white, opacity: 0.8 }}>
            {data.scorer ? `${data.teamName} · ${data.minute}'` : `${data.minute}'`}
          </Text>
        </View>
      </View>
      <View style={{ backgroundColor: C.p900, paddingHorizontal: s * 26, alignItems: "center", justifyContent: "center" }}>
        <Text allowFontScaling={false} style={{ fontFamily: fonts.bold, fontSize: s * 15, lineHeight: s * 20, letterSpacing: s * 1.4, color: C.white, opacity: 0.75 }}>
          {data.homeCode} – {data.awayCode}
        </Text>
        <Text allowFontScaling={false} style={{ fontFamily: fonts.bold, fontSize: s * 44, lineHeight: s * 50, letterSpacing: -s * 1, color: C.white }}>
          {data.homeScore} – {data.awayScore}
        </Text>
      </View>
    </View>
  );
});

/* ═══════════════════════════ RÖPORTAJ BANDI ═══════════════════════════ */

/** Üstte başlık şeridi, altta arma + konuk adı + görev · takım. */
export const InterviewBand = memo(function InterviewBand({ interview, scale: s, palette, onAssetLoad }: Base & { interview: Interview }) {
  const C = palette ?? DEFAULT_PALETTE;
  const g = interview.guest;
  const logo = useImageOk(g.logoUrl);
  const line = guestLine(g);
  return (
    <View style={{ maxWidth: s * GFX.interview.maxWidth, alignItems: "flex-start" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: s * 10, backgroundColor: C.lowerGoal, paddingHorizontal: s * 18, height: s * 36, borderTopLeftRadius: s * 10, borderTopRightRadius: s * 10 }}>
        <View style={{ width: s * 10, height: s * 10, borderRadius: s * 5, backgroundColor: C.white }} />
        <Text allowFontScaling={false} numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: s * 17, lineHeight: s * 22, letterSpacing: s * 2, color: C.white }}>
          {interview.title}
        </Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "stretch", borderBottomLeftRadius: s * 10, borderBottomRightRadius: s * 10, borderTopRightRadius: s * 10, overflow: "hidden" }}>
        {logo.ok && g.logoUrl ? (
          <View style={{ backgroundColor: C.white, paddingHorizontal: s * 16, alignItems: "center", justifyContent: "center" }}>
            <Image source={{ uri: g.logoUrl }} onError={logo.onError} onLoad={onAssetLoad} style={{ width: s * 56, height: s * 56 }} resizeMode="contain" />
          </View>
        ) : (
          <View style={{ width: s * 8, backgroundColor: C.lowerGoal }} />
        )}
        <View style={{ flexShrink: 1, justifyContent: "center", paddingHorizontal: s * 26, paddingVertical: s * 14, minHeight: s * 96 }}>
          <LinearGradient colors={[C.barTop, C.barBottom]} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
          <Text allowFontScaling={false} numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: s * 36, lineHeight: s * 44, letterSpacing: -s * 0.4, color: C.white }}>
            {g.name.toLocaleUpperCase("tr-TR")}
          </Text>
          {line ? (
            <Text allowFontScaling={false} numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: s * 20, lineHeight: s * 27, color: C.white, opacity: 0.82 }}>
              {line}
            </Text>
          ) : null}
        </View>
        <View style={{ width: s * 6, backgroundColor: C.v400 }} />
      </View>
    </View>
  );
});

/* ═══════════════════════════ SPONSOR YUVASI ═══════════════════════════ */

export const SponsorBug = memo(function SponsorBug({ name, logoUrl, scale: s, palette, onAssetLoad }: Base & { name: string; logoUrl?: string | null }) {
  const C = palette ?? DEFAULT_PALETTE;
  const logo = useImageOk(logoUrl);
  return (
    <View style={{ height: s * GFX.sponsor.height, flexDirection: "row", alignItems: "stretch", borderRadius: s * 8, overflow: "hidden" }}>
      <View style={{ backgroundColor: C.v700, paddingHorizontal: s * 10, justifyContent: "center" }}>
        <Text allowFontScaling={false} style={{ fontFamily: fonts.bold, fontSize: s * 11, lineHeight: s * 14, letterSpacing: s * 2.2, color: C.white }}>
          SPONSOR
        </Text>
      </View>
      <View style={{ backgroundColor: C.white, paddingHorizontal: s * 14, alignItems: "center", justifyContent: "center", maxWidth: s * GFX.sponsor.maxWidth }}>
        {logo.ok && logoUrl ? (
          <Image source={{ uri: logoUrl }} onError={logo.onError} onLoad={onAssetLoad} style={{ width: s * 150, height: s * 46 }} resizeMode="contain" />
        ) : (
          <Text allowFontScaling={false} numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: s * 22, lineHeight: s * 28, color: C.p900 }}>
            {name}
          </Text>
        )}
      </View>
    </View>
  );
});

/* ═══════════════════════════ TEKRAR ROZETİ ═══════════════════════════ */

export const ReplayBadge = memo(function ReplayBadge({ label, scale: s, palette }: Base & { label: string }) {
  const C = palette ?? DEFAULT_PALETTE;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: s * 10, paddingHorizontal: s * 20, height: s * 52, borderRadius: s * 10, backgroundColor: C.lowerRed }}>
      <View style={{ width: s * 12, height: s * 12, borderRadius: s * 6, backgroundColor: C.white }} />
      <Text allowFontScaling={false} style={{ fontFamily: fonts.bold, fontSize: s * 26, lineHeight: s * 32, letterSpacing: s * 2, color: C.white }}>
        {label}
      </Text>
    </View>
  );
});
