/**
 * EmptyState — "burada henüz bir şey yok" ekranı (§4.18).
 *
 * NEDEN ÖNEMLİ: bu uygulamada boş liste normaldir (bugün maç yok, favori
 * eklenmemiş, ceza kaydı yok). Boş ekran bir HATA gibi görünmemeli; sakin bir
 * ikon, tek cümlelik açıklama ve varsa TEK bir çıkış yolu sunmalı.
 *
 * NEDEN İKON DAİRE İÇİNDE: koyu zeminde yalnız başına duran ince çizgili bir
 * ikon "yüzer" ve kazara bırakılmış gibi durur. 56px'lik `surface2` daire ona
 * bir yer verir; ikon rengi `textDisabled`'dır — dikkat çekmesi değil, boşluğu
 * açıklaması istenir.
 *
 * ESKİ API KORUNUR: `components/States.tsx` içindeki EmptyState `icon/title/body`
 * imzasıyla çağrılıyor; buradaki bileşen aynı üç prop'la sorunsuz çalışır,
 * eylem ve varyantlar isteğe bağlı eklerdir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import {
  colors,
  elevate,
  fonts,
  glowStyle,
  hairline,
  radius,
  space,
  textScale,
  type,
} from "@/theme";
import { Button, type ButtonProps } from "./Button";
import { Touchable } from "./Pressable";

export interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  /** Özel görsel (illüstrasyon) — verilirse ikon yerine bu çizilir. */
  illustration?: React.ReactNode;
  title: string;
  body?: string;
  /**
   * Birincil eylem — ekranda tek tane olmalı. `haptic` verilmezse düğmenin
   * kendi varsayılanı (birincil → orta şiddet) çalışır; "Tekrar dene" gibi
   * düzeltici eylemlerde `light` tercih edilir (§5.3).
   */
  action?: { label: string; onPress: () => void; haptic?: ButtonProps["haptic"] };
  /** İkincil metin bağlantı. */
  secondaryAction?: { label: string; onPress: () => void };
  /** Liste içinde mi tam ekran mı — dikey boşluk farkı. */
  variant?: "screen" | "inline";
  /** Daha da dar: sekme içi küçük bölümler için. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const EmptyState = React.memo(function EmptyState({
  icon = "calendar-outline",
  illustration,
  title,
  body,
  action,
  secondaryAction,
  variant = "screen",
  compact = false,
  style,
}: EmptyStateProps) {
  return (
    <View
      style={[
        styles.container,
        variant === "screen" ? styles.screen : styles.inline,
        compact ? styles.compact : null,
        style,
      ]}
    >
      {illustration ?? (
        /* YÖRÜNGE: ikon kutusu iki ince halkanın ortasında durur — boş durum
           "kırık" değil, sakin ve kasıtlı görünür. Halkalar durağandır. */
        <View style={[styles.orbit, compact ? styles.orbitCompact : null]}>
          {compact ? null : <View style={styles.ringOuter} />}
          <View style={[styles.ringInner, compact ? styles.ringInnerCompact : null]} />
          <View style={[styles.iconTile, glowStyle(colors.glow, 1)]}>
            {/* Gece teması: ikon kutusu imza degradesiyle parlar. */}
            <LinearGradient
              colors={colors.gradientSignature}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[StyleSheet.absoluteFill, styles.iconFill]}
            />
            <Ionicons name={icon} size={24} color={colors.textOnBrand} />
          </View>
        </View>
      )}

      <Text style={styles.title} {...textScale.dense}>
        {title}
      </Text>

      {body ? (
        <Text style={styles.body} {...textScale.long}>
          {body}
        </Text>
      ) : null}

      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          variant="secondary"
          size="md"
          haptic={action.haptic}
          style={styles.action}
        />
      ) : null}

      {secondaryAction ? (
        <Touchable
          feedback="icon"
          haptic="light"
          onPress={secondaryAction.onPress}
          accessibilityRole="button"
          accessibilityLabel={secondaryAction.label}
          style={styles.secondary}
        >
          <Text style={styles.secondaryLabel} {...textScale.dense}>
            {secondaryAction.label}
          </Text>
        </Touchable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xl,
    gap: space.s,
  },
  /*
   * BOŞLUK ÖLÇÜLERİ — punto ölçeğiyle birlikte küçüldü.
   *
   * Eskiden `screen` 32+32, `inline` 48+48 dikey boşluk taşıyordu ve ikon
   * 42px'ti; başlık 15px, gövde 13px iken bu oran doğruydu. Ölçek 12/11'e
   * inince aynı boşluklar "yok" mesajını ekranın üçte birine yayar oldu:
   * takım sayfasında iki boş bölüm arka arkaya gelince 300px hiçbir şey
   * söylemeyen alan çıkıyordu. Boşluk metinle birlikte küçülür.
   */
  screen: {
    flex: 1,
    paddingVertical: space.xxl,
  },
  /** Liste içinde: akışta kalır, bölümü ezmez. */
  inline: {
    paddingVertical: space.xxl,
  },
  /** `compact` bayrağı: kart içindeki dar yuvalar. */
  compact: {
    paddingVertical: space.md,
  },
  /**
   * ARENA İKON KAROSU: beyaz kâğıt + hairline kenarlık, köşeli (`radius.lg`).
   * Eski gri daire (surface2 üstünde textDisabled ikon) gri kâğıtta neredeyse
   * görünmüyordu; boş durumun TEK görseli olduğu için okunur olmalı ama renk
   * taşımamalı — renk yalnız bir şey söylediğinde kullanılır.
   */
  iconFill: {
    borderRadius: radius.lg,
  },
  iconTile: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    ...elevate(1),
  },
  orbit: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.xs,
  },
  orbitCompact: {
    width: 84,
    height: 84,
    marginBottom: 0,
  },
  ringOuter: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.glassLine,
  },
  ringInner: {
    position: "absolute",
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandBorder,
    backgroundColor: colors.brandDim,
  },
  ringInnerCompact: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
  },
  title: {
    ...type.h2,
    color: colors.textPrimary,
    textAlign: "center",
  },
  /** 300px tavanı: uzun açıklama ekranın iki kenarına yapışmasın. */
  body: {
    ...type.body,
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 300,
  },
  action: {
    marginTop: space.md,
    alignSelf: "center",
  },
  secondary: {
    marginTop: space.s,
    alignSelf: "center",
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  secondaryLabel: {
    ...type.label,
    fontFamily: fonts.semibold,
    color: colors.brandAccent,
  },
});
