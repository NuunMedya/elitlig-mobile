/**
 * BottomBoard — "orta-alt" yayın skorbordu (web /skoroverlay BottomScoreBoard
 * görünümünün sadeleştirilmiş kopyası).
 *
 * Ekranın altında ortalanmış geniş bant: [ev arma + ad][skor][marka logosu]
 * [skor][deplasman ad + arma], altında takım renkli ince şerit; bandın altında
 * "1. YARI · 12:34" saat dili. Olay olunca bandın üstünde "GOL · Oyuncu" etiketi.
 * Web'deki golcü listesi telefonda yoktur.
 *
 * ScoreBug ile aynı sözleşme: `scale` web sahnesinin (1920 px) piksel ölçeğine
 * göre çarpandır, kök View `ref` alır ve olduğu gibi PNG'ye çekilip yayına
 * gömülür (ekranda gördüğün, yayına giden olur). Genişlik sabittir
 * (BUG.low.width × scale) — konumlandırma bunu varsayar.
 */

import { LinearGradient } from "expo-linear-gradient";
import React, { forwardRef, memo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { DEFAULT_PALETTE } from "@/lib/live/branding";
import { BUG, clockText, periodLabel } from "@/lib/live/scorebug";
import { fonts } from "@/theme";

import { useBrandLogoSource, type ScoreBugProps } from "./ScoreBug";

const L = BUG.low;
const BAND_START = { x: 0.5, y: 0 } as const;
const BAND_END = { x: 0.5, y: 1 } as const;

export const BottomBoard = memo(
  forwardRef<View, ScoreBugProps>(function BottomBoard(props, ref) {
    const s = props.scale;
    const C = props.palette ?? DEFAULT_PALETTE;
    const logo = useBrandLogoSource(props.logoUrl, props.onAssetLoad);
    const clockOn = props.finished || props.showClock !== false;
    // Bant taşmayı kırptığı için logo bant yüksekliğini aşmaz.
    const logoSize = Math.min(s * L.bandH, s * L.logo * ((props.logoScale ?? 100) / 100));

    const crest = (uri?: string | null) => (
      <View style={{ width: s * L.crest, height: s * L.crest, alignItems: "center", justifyContent: "center" }}>
        {uri ? <Image source={{ uri }} onLoad={props.onAssetLoad} style={{ width: s * L.crest, height: s * L.crest }} resizeMode="contain" /> : null}
      </View>
    );
    const name = (text: string, align: "left" | "right") => (
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        style={{
          flexShrink: 1,
          fontFamily: fonts.bold,
          fontSize: s * 21,
          lineHeight: s * 26,
          letterSpacing: s * 1,
          color: C.white,
          textAlign: align,
        }}
      >
        {text.toLocaleUpperCase("tr-TR")}
      </Text>
    );
    const score = (value: number) => (
      <View style={[styles.cell, { width: s * L.scoreW, backgroundColor: C.p900 }]}>
        <Text allowFontScaling={false} style={{ fontFamily: fonts.bold, fontSize: s * 50, lineHeight: s * 56, letterSpacing: -s * 1, color: C.white }}>
          {value}
        </Text>
      </View>
    );
    const lowerColor =
      props.event?.kind === "goal" ? C.lowerGoal : props.event?.kind === "red" ? C.lowerRed : props.event?.kind === "yellow" ? C.lowerCard : C.v700;

    return (
      <View ref={ref} collapsable={false} style={[styles.root, { width: s * L.width }]}>
        {props.event ? (
          <View style={{ flexDirection: "row", alignItems: "stretch", marginBottom: s * 6, borderRadius: s * 6, overflow: "hidden" }}>
            <View style={{ backgroundColor: lowerColor, paddingHorizontal: s * 14, justifyContent: "center" }}>
              <Text allowFontScaling={false} style={{ fontFamily: fonts.bold, fontSize: s * 16, lineHeight: s * 34, color: C.white }}>
                {props.event.label}
              </Text>
            </View>
            {props.event.player ? (
              <View style={{ backgroundColor: C.p900, paddingHorizontal: s * 16, justifyContent: "center" }}>
                <Text allowFontScaling={false} style={{ fontFamily: fonts.bold, fontSize: s * 17, lineHeight: s * 34, color: C.white }}>
                  {props.event.player}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={{ alignSelf: "stretch", height: s * L.bandH, borderTopLeftRadius: s * L.radius, borderTopRightRadius: s * L.radius, overflow: "hidden" }}>
          <LinearGradient colors={[C.barTop, C.barBottom]} start={BAND_START} end={BAND_END} style={StyleSheet.absoluteFill} />
          <View style={styles.row}>
            <View style={[styles.team, { width: s * L.teamW, justifyContent: "flex-end", paddingHorizontal: s * 24, gap: s * 16 }]}>
              {crest(props.homeLogo)}
              {name(props.homeName, "right")}
            </View>
            {score(props.homeScore)}
            <View style={[styles.cell, { width: s * L.medalW, backgroundColor: C.p900 }]}>
              <View style={[styles.divider, { left: 0, top: s * 22, bottom: s * 22, backgroundColor: C.hair }]} />
              <View style={[styles.divider, { right: 0, top: s * 22, bottom: s * 22, backgroundColor: C.hair }]} />
              <Image source={logo.source} onError={logo.onError} onLoad={logo.onLoad} style={{ width: logoSize, height: logoSize }} resizeMode="contain" />
            </View>
            {score(props.awayScore)}
            <View style={[styles.team, { width: s * L.teamW, justifyContent: "flex-start", paddingHorizontal: s * 24, gap: s * 16 }]}>
              {name(props.awayName, "left")}
              {crest(props.awayLogo)}
            </View>
          </View>
          {/* Alt şerit: takım renkleri */}
          <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: s * 3, flexDirection: "row" }}>
            <View style={{ flex: 1, backgroundColor: props.homeColor || C.homeBright }} />
            <View style={{ flex: 1, backgroundColor: props.awayColor || C.awayBright }} />
          </View>
        </View>

        {clockOn ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s * 10,
              height: s * L.clockH,
              paddingHorizontal: s * 26,
              borderBottomLeftRadius: s * L.radius,
              borderBottomRightRadius: s * L.radius,
              backgroundColor: props.finished ? C.p900 : C.v800,
            }}
          >
            {props.finished ? null : <View style={{ width: s * 7, height: s * 7, borderRadius: s * 4, backgroundColor: C.live }} />}
            <Text allowFontScaling={false} style={{ fontFamily: fonts.bold, fontSize: s * 13, lineHeight: s * 18, letterSpacing: s * 2.6, color: C.white }}>
              {props.finished ? "MAÇ SONU" : `${periodLabel(props.period)} · ${clockText(props.clockMs)}`}
            </Text>
          </View>
        ) : null}
      </View>
    );
  })
);

const styles = StyleSheet.create({
  root: { alignItems: "center", backgroundColor: "transparent" },
  row: { ...StyleSheet.absoluteFillObject, flexDirection: "row", alignItems: "stretch", justifyContent: "center" },
  team: { flexDirection: "row", alignItems: "center" },
  cell: { alignItems: "center", justifyContent: "center" },
  divider: { position: "absolute", width: StyleSheet.hairlineWidth },
});
