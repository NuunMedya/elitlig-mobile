/**
 * HomeSection — Ana Sayfa'nın bölüm kabı: başlık + "Tümü" kapısı + içerik.
 *
 * NEDEN AYRI: Ana Sayfa yedi bölümden oluşur ve her biri aynı ritmi izler —
 * bölümler arası 22px (`layout.sectionGap`), başlık ile içerik arası başlığın
 * kendi alt payı. Ritim tek yerde durursa bölüm eklemek/çıkarmak ekranın
 * dikey düzenini bozmaz. Hiyerarşi kutuyla değil başlıkla kurulur (Arena
 * ilke 3): kap çizgisizdir, yalnız boşluk taşır.
 */

import React from "react";
import { StyleSheet, View } from "react-native";
import { SectionHeader } from "@/components/ui";
import { layout, space } from "@/theme";

export interface HomeSectionProps {
  title: string;
  meta?: string;
  /** Başlığın solunda küçük işaret (canlı nabzı gibi). */
  leading?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  /** İçerik ekran kenarından mı başlasın (şerit) yoksa dolgulu mu (liste). */
  bleed?: boolean;
  children: React.ReactNode;
}

export const HomeSection = React.memo(function HomeSection({
  title,
  meta,
  leading,
  actionLabel,
  onAction,
  bleed = false,
  children,
}: HomeSectionProps) {
  return (
    <View style={styles.section}>
      <SectionHeader
        title={title}
        meta={meta}
        leading={leading}
        action={actionLabel && onAction ? { label: actionLabel, onPress: onAction } : undefined}
        style={styles.header}
      />
      <View style={bleed ? null : styles.pad}>{children}</View>
    </View>
  );
});

const styles = StyleSheet.create({
  /* SectionHeader kendi üst payını (16) taşır; bölüm aralığını 22'ye
     tamamlamak için kaba yalnız fark kadar üst boşluk verilir. */
  section: {
    paddingTop: layout.sectionGap - space.lg,
  },
  header: {
    paddingBottom: space.m,
  },
  pad: {
    paddingHorizontal: layout.screenPadding,
  },
});
