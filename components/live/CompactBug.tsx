/**
 * CompactBug — "kompakt" yayın skorbordu (masaüstü stüdyodaki "Kompakt · dikey
 * istif" çeşidinin telefon karşılığı).
 *
 * İki satır üst üste: [arma][kısa kod][skor]; altında saat · devre şeridi ve
 * marka logosu. Köşe çubuğuna göre daha dar olduğu için görüntünün daha azını
 * kapatır. ScoreBug ile aynı sözleşme: `scale` 1920 px sahneye göre çarpan,
 * kök View `ref` alır ve olduğu gibi PNG'ye çekilip yayına gömülür.
 */

import { LinearGradient } from "expo-linear-gradient";
import React, { forwardRef, memo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { DEFAULT_PALETTE } from "@/lib/live/branding";
import { clockText, periodLabel } from "@/lib/live/scorebug";
import { fonts } from "@/theme";

import { bugCode, useBrandLogoSource, type ScoreBugProps } from "./ScoreBug";

const W = 236;
const ROW_H = 40;
const CLOCK_H = 28;
const BAR_START = { x: 0.5, y: 0 } as const;
const BAR_END = { x: 0.5, y: 1 } as const;

export const CompactBug = memo(
  forwardRef<View, ScoreBugProps>(function CompactBug(props, ref) {
    const s = props.scale;
    const C = props.palette ?? DEFAULT_PALETTE;
    const logo = useBrandLogoSource(props.logoUrl, props.onAssetLoad);
    const clockOn = props.finished || props.showClock !== false;
    const right = props.align === "right";
    const lowerColor =
      props.event?.kind === "goal" ? C.lowerGoal : props.event?.kind === "red" ? C.lowerRed : props.event?.kind === "yellow" ? C.lowerCard : C.v700;

    const row = (name: string, code: string | null | undefined, uri: string | null | undefined, value: number, color: string, first: boolean) => (
      <View style={{ height: s * ROW_H, flexDirection: "row", alignItems: "stretch" }}>
        <View style={{ width: s * 5, backgroundColor: color }} />
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: s * 9, paddingHorizontal: s * 11 }}>
          <View style={{ width: s * 26, height: s * 26, alignItems: "center", justifyContent: "center" }}>
            {uri ? <Image source={{ uri }} onLoad={props.onAssetLoad} style={{ width: s * 26, height: s * 26 }} resizeMode="contain" /> : null}
          </View>
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            style={{ flex: 1, fontFamily: fonts.bold, fontSize: s * 20, lineHeight: s * 24, letterSpacing: s * 0.4, color: C.white }}
          >
            {bugCode(name, code)}
          </Text>
        </View>
        <View style={[styles.cell, { width: s * 50, backgroundColor: C.p900 }]}>
          <Text allowFontScaling={false} style={{ fontFamily: fonts.bold, fontSize: s * 26, lineHeight: s * 30, letterSpacing: -s * 0.8, color: C.white }}>
            {value}
          </Text>
        </View>
        {first ? <View style={{ position: "absolute", left: s * 5, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: C.hair }} /> : null}
      </View>
    );

    return (
      <View ref={ref} collapsable={false} style={[styles.root, right && styles.rootRight]}>
        <View style={{ width: s * W, borderRadius: s * 8, overflow: "hidden" }}>
          <LinearGradient colors={[C.barTop, C.barBottom]} start={BAR_START} end={BAR_END} style={StyleSheet.absoluteFill} />
          {row(props.homeName, props.homeCode, props.homeLogo, props.homeScore, props.homeColor || C.homeBright, true)}
          {row(props.awayName, props.awayCode, props.awayLogo, props.awayScore, props.awayColor || C.awayBright, false)}
          {clockOn ? (
            <View
              style={{
                height: s * CLOCK_H,
                flexDirection: "row",
                alignItems: "center",
                gap: s * 7,
                paddingLeft: s * 12,
                paddingRight: s * 8,
                backgroundColor: props.finished ? C.p900 : C.v700,
              }}
            >
              {props.finished ? null : <View style={{ width: s * 6, height: s * 6, borderRadius: s * 3, backgroundColor: C.live }} />}
              <Text allowFontScaling={false} style={{ fontFamily: fonts.bold, fontSize: s * 16, lineHeight: s * 20, color: C.white }}>
                {props.finished ? "MAÇ SONU" : clockText(props.clockMs)}
              </Text>
              {props.finished ? null : (
                <Text allowFontScaling={false} style={{ fontFamily: fonts.bold, fontSize: s * 11, lineHeight: s * 14, color: C.white, opacity: 0.75 }}>
                  {periodLabel(props.period)}
                </Text>
              )}
              <View style={{ flex: 1 }} />
              <Image source={logo.source} onError={logo.onError} onLoad={logo.onLoad} style={{ width: s * 22, height: s * 22 }} resizeMode="contain" />
            </View>
          ) : null}
        </View>
        {props.event ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "stretch",
              alignSelf: right ? "flex-end" : "flex-start",
              marginTop: s * 4,
              borderRadius: s * 4,
              overflow: "hidden",
            }}
          >
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
  rootRight: { alignSelf: "flex-end" },
  cell: { alignItems: "center", justifyContent: "center" },
});
