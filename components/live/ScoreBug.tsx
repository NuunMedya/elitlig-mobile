/**
 * ScoreBug — yayın skorbordu (web /skoroverlay "ScoreBugPremier" birebir).
 *
 * Çubuk: [renk kepi][ev arma + kısa ad][skor][ElitLig madalyası][skor]
 * [deplasman kısa ad + arma][saat · devre]; altta takım renkli ince şerit,
 * olay olunca altında "GOL · Oyuncu" bandı.
 *
 * `scale` web sahnesinin (1920 px genişlik) piksel ölçeğine göre çarpandır:
 * önizleme 640 px genişse scale = 640 / 1920. Aynı bileşen hem kamera
 * önizlemesinin üstünde görünür hem de yayına gömülmek için PNG'ye çekilir
 * (react-native-view-shot) — ekranda gördüğün, yayına giden olur.
 */

import { LinearGradient } from "expo-linear-gradient";
import React, { forwardRef, memo, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { DEFAULT_PALETTE, type BugPalette } from "@/lib/live/branding";
import { clockText, periodLabel, teamShortCode } from "@/lib/live/scorebug";
import { fonts } from "@/theme";

export const ELITLIG_LOGO = require("../../assets/images/elitlig-beyaz.png");

/**
 * Marka logosu: maçın yayın görünümünde yüklenmiş logo varsa o, yoksa (ya da
 * açılamazsa) Elitlig logosu.
 */
export function useBrandLogoSource(logoUrl?: string | null) {
  const [failed, setFailed] = useState<string | null>(null);
  const custom = logoUrl && logoUrl !== failed ? logoUrl : null;
  return {
    source: custom ? { uri: custom } : ELITLIG_LOGO,
    onError: () => {
      if (custom) setFailed(custom);
    },
  };
}

export interface ScoreBugEvent {
  /** "GOL", "SARI KART", "KIRMIZI KART"… */
  label: string;
  player?: string | null;
  kind: "goal" | "yellow" | "red" | "other";
}

export interface ScoreBugProps {
  homeName: string;
  awayName: string;
  homeLogo?: string | null;
  awayLogo?: string | null;
  homeScore: number;
  awayScore: number;
  clockMs: number;
  period: number | null;
  finished?: boolean;
  event?: ScoreBugEvent | null;
  scale: number;
  homeColor?: string | null;
  awayColor?: string | null;
  /** Maçın yayın görünümünden (sunucu verisi): renk takımı, logo, logo boyutu %. */
  palette?: BugPalette | null;
  logoUrl?: string | null;
  logoScale?: number | null;
}

const BAR_START = { x: 0.5, y: 0 } as const;
const BAR_END = { x: 0.5, y: 1 } as const;

export const ScoreBug = memo(
  forwardRef<View, ScoreBugProps>(function ScoreBug(props, ref) {
    const s = props.scale;
    const C = props.palette ?? DEFAULT_PALETTE;
    const logo = useBrandLogoSource(props.logoUrl);
    const logoSize = s * 60 * ((props.logoScale ?? 100) / 100);
    const code = (name: string) => teamShortCode(name);
    const crest = (uri?: string | null) => (
      <View style={{ width: s * 26, height: s * 26, alignItems: "center", justifyContent: "center" }}>
        {uri ? <Image source={{ uri }} style={{ width: s * 26, height: s * 26 }} resizeMode="contain" /> : null}
      </View>
    );
    const codeText = (name: string) => (
      <Text
        allowFontScaling={false}
        style={{ fontFamily: fonts.bold, fontSize: s * 18, lineHeight: s * 20, color: C.white, letterSpacing: s * 0.2 }}
      >
        {code(name)}
      </Text>
    );
    const score = (value: number) => (
      <View style={[styles.cell, { width: s * 38, backgroundColor: C.p900 }]}>
        <Text allowFontScaling={false} style={{ fontFamily: fonts.bold, fontSize: s * 25, lineHeight: s * 28, color: C.white, letterSpacing: -s * 0.8 }}>
          {value}
        </Text>
      </View>
    );
    const lowerColor = props.event?.kind === "goal" ? C.lowerGoal : props.event?.kind === "red" ? C.lowerRed : props.event?.kind === "yellow" ? C.lowerCard : C.v700;

    return (
      <View ref={ref} collapsable={false} style={styles.root}>
        <View style={{ height: s * 44, borderRadius: s * 6, flexDirection: "row", alignItems: "stretch" }}>
          <LinearGradient
            colors={[C.barTop, C.barBottom]}
            start={BAR_START}
            end={BAR_END}
            style={[StyleSheet.absoluteFill, { borderRadius: s * 6 }]}
          />
          {/* Sol menekşe kep */}
          <LinearGradient
            colors={[C.v400, C.v700]}
            start={BAR_START}
            end={BAR_END}
            style={{ position: "absolute", left: 0, top: 0, bottom: s * 2, width: s * 3, borderTopLeftRadius: s * 6 }}
          />
          <View style={[styles.team, { width: s * 106, justifyContent: "flex-end", paddingLeft: s * 13, paddingRight: s * 10, gap: s * 8 }]}>
            {crest(props.homeLogo)}
            {codeText(props.homeName)}
          </View>
          {score(props.homeScore)}
          <View style={{ width: s * 62, backgroundColor: C.p900, alignItems: "center", justifyContent: "center" }}>
            <View style={[styles.divider, { left: 0, top: s * 12, bottom: s * 12, backgroundColor: C.hair }]} />
            <View style={[styles.divider, { right: 0, top: s * 12, bottom: s * 12, backgroundColor: C.hair }]} />
            <Image source={logo.source} onError={logo.onError} style={{ position: "absolute", width: logoSize, height: logoSize }} resizeMode="contain" />
          </View>
          {score(props.awayScore)}
          <View style={[styles.team, { width: s * 106, justifyContent: "flex-start", paddingHorizontal: s * 10, gap: s * 8 }]}>
            {codeText(props.awayName)}
            {crest(props.awayLogo)}
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s * 6,
              paddingHorizontal: s * 12,
              backgroundColor: C.v700,
              borderTopRightRadius: s * 6,
              borderBottomRightRadius: s * 6,
            }}
          >
            {props.finished ? null : <View style={{ width: s * 5, height: s * 5, borderRadius: s * 3, backgroundColor: C.live }} />}
            <Text allowFontScaling={false} style={{ fontFamily: fonts.bold, fontSize: s * 17, lineHeight: s * 20, color: C.white }}>
              {props.finished ? "MAÇ SONU" : clockText(props.clockMs)}
            </Text>
            {props.finished ? null : (
              <Text allowFontScaling={false} style={{ fontFamily: fonts.bold, fontSize: s * 11, lineHeight: s * 14, color: C.white, opacity: 0.75 }}>
                {periodLabel(props.period)}
              </Text>
            )}
          </View>
          {/* Alt şerit: takım renkleri */}
          <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: s * 2, flexDirection: "row", overflow: "hidden", borderBottomLeftRadius: s * 6, borderBottomRightRadius: s * 6 }}>
            <View style={{ flex: 1, backgroundColor: props.homeColor || C.homeBright }} />
            <View style={{ flex: 1, backgroundColor: props.awayColor || C.awayBright }} />
          </View>
        </View>
        {props.event ? (
          <View style={{ flexDirection: "row", alignItems: "stretch", marginTop: s * 4, borderRadius: s * 4, overflow: "hidden" }}>
            <View style={{ backgroundColor: lowerColor, paddingHorizontal: s * 10, justifyContent: "center" }}>
              <Text allowFontScaling={false} style={{ fontFamily: fonts.bold, fontSize: s * 13, lineHeight: s * 26, color: C.white }}>
                {props.event.label}
              </Text>
            </View>
            {props.event.player ? (
              <View style={{ backgroundColor: C.p900, paddingHorizontal: s * 12, justifyContent: "center" }}>
                <Text allowFontScaling={false} style={{ fontFamily: fonts.bold, fontSize: s * 14, lineHeight: s * 26, color: C.white }}>
                  {props.event.player}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  })
);

const styles = StyleSheet.create({
  root: { alignSelf: "flex-start", backgroundColor: "transparent" },
  team: { flexDirection: "row", alignItems: "center" },
  cell: { alignItems: "center", justifyContent: "center" },
  divider: { position: "absolute", width: StyleSheet.hairlineWidth },
});
