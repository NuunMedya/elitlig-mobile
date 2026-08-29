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
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import {
  colors,
  fonts,
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
        <View style={styles.iconCircle}>
          <Ionicons name={icon} size={19} color={colors.textDisabled} />
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
          variant="primary"
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
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.xs,
  },
  title: {
    ...type.h3,
    color: colors.textPrimary,
    textAlign: "center",
  },
  /** 300px tavanı: uzun açıklama ekranın iki kenarına yapışmasın. */
  body: {
    ...type.bodySm,
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 280,
  },
  /*
   * `alignSelf: "center"` ŞART: `Button` kendi tabanında `alignSelf:
   * "flex-start"` taşır ve bu, kapsayıcının `alignItems: "center"` kuralını
   * ezip düğmeyi sola yapıştırıyordu — ortalanmış bir metin bloğunun altında
   * sola kaçmış bir düğme, ekranın tek bozuk hizasıydı.
   */
  action: {
    marginTop: space.md,
    alignSelf: "center",
    borderRadius: radius.pill,
  },
  secondary: {
    marginTop: space.s,
    alignSelf: "center",
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  secondaryLabel: {
    ...type.bodySm,
    fontFamily: fonts.bold,
    color: colors.brandAccent,
  },
});
