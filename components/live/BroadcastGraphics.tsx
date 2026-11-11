/**
 * YAYIN GRAFİKLERİ — skorbordla aynı katmanda PNG'ye çekilip videoya gömülen
 * küçük parçalar: altyazı (lower third), GOL bandı, sponsor yuvası ve TEKRAR
 * rozeti.
 *
 * Hepsi `scale` alır (1920 px sahneye göre çarpan) ve renklerini maçın yayın
 * paletinden (web "Yayın Tasarımı") okur; böylece skorbordla aynı kimliği taşır.
 *
 * BU PARÇALAR BİLEREK HAREKETSİZDİR. Katman yayına saniyede en çok bir-iki kez
 * gömülür; geçiş animasyonu olsaydı yayına animasyonun rastgele bir ara karesi
 * (yarı saydam, yarı kaymış) düşerdi. Hareket hissi "GOL" bandının iki aşamalı
 * kesmesiyle (büyük GOL → ayrıntı) verilir.
 */

import { LinearGradient } from "expo-linear-gradient";
import React, { memo, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { DEFAULT_PALETTE, type BugPalette } from "@/lib/live/branding";
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

export type GoalFlashPhase = "burst" | "detail";

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

export const GoalFlash = memo(function GoalFlash({ phase, data, scale: s, palette, onAssetLoad }: Base & { phase: GoalFlashPhase; data: GoalFlashData }) {
  const C = palette ?? DEFAULT_PALETTE;
  const logo = useImageOk(data.teamLogo);
  if (phase === "burst") {
    return (
      <View style={{ flexDirection: "row", alignItems: "stretch", borderRadius: s * 16, overflow: "hidden" }}>
        <View style={{ width: s * 14, backgroundColor: C.white }} />
        <View style={{ backgroundColor: C.lowerGoal, paddingHorizontal: s * 70, paddingVertical: s * 10, alignItems: "center", justifyContent: "center" }}>
          <Text allowFontScaling={false} style={{ fontFamily: fonts.bold, fontSize: s * 120, lineHeight: s * 132, letterSpacing: s * 10, color: C.white }}>
            GOL!
          </Text>
        </View>
        <View style={{ width: s * 14, backgroundColor: C.white }} />
      </View>
    );
  }
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
