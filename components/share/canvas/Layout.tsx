/**
 * Şablon iskeleti: zemin + üst marka bandı + içerik sütunu + alt bant.
 * Her şablon bunu kullanır ki logo, lig künyesi ve elitlig.com her
 * görselde aynı yerde dursun (seri halinde paylaşılan görseller tek bir
 * yayın gibi görünür).
 */

import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Backdrop, BrandHeader, Footer, type BackdropMood } from "./Primitives";
import type { ShareFrame } from "./types";

export interface PosterProps {
  f: ShareFrame;
  mood?: BackdropMood;
  /** Üst bant sağı: lig adı ve künye. */
  title?: string | null;
  meta?: string | null;
  /** Alt bant sağı. */
  footer?: string | null;
  /** Zemin üstüne, içerikten önce çizilecek süsler (diyagonal bölme vb.). */
  decor?: React.ReactNode;
  watermark?: boolean;
  grid?: boolean;
  streaks?: boolean;
  bodyStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export function Poster({
  f,
  mood = "top",
  title,
  meta,
  footer,
  decor,
  watermark = true,
  grid = true,
  streaks = true,
  bodyStyle,
  children,
}: PosterProps) {
  const { u } = f;
  return (
    <View style={{ width: f.W, height: f.H, overflow: "hidden", backgroundColor: f.t.bgBottom }}>
      <Backdrop f={f} mood={mood} watermark={watermark} grid={grid} streaks={streaks} />
      {decor ? <View style={StyleSheet.absoluteFill} pointerEvents="none">{decor}</View> : null}
      <View style={StyleSheet.absoluteFill}>
        <BrandHeader f={f} title={title} meta={meta} />
        <View
          style={[
            {
              flex: 1,
              paddingHorizontal: u(22),
              paddingTop: u(f.story ? 14 : 8),
              paddingBottom: u(f.story ? 50 : 34),
            },
            bodyStyle,
          ]}
        >
          {children}
        </View>
      </View>
      <Footer f={f} right={footer} />
    </View>
  );
}

/** Esnek boşluk — dikey ritim için. */
export function Spacer({ grow = 1, min = 0, f }: { grow?: number; min?: number; f: ShareFrame }) {
  return <View style={{ flexGrow: grow, minHeight: f.u(min) }} />;
}
