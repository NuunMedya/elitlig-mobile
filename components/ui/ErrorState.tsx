/**
 * ErrorState — hata gösterimi (§4.19).
 *
 * MESAJ KAYNAĞI: `ApiError.userMessage` (lib/http.ts) zaten Türkçe ve duruma
 * göre yazılmış tek doğru kaynaktır ("Sunucuya şu anda ulaşılamıyor",
 * "Oturumunuzun süresi dolmuş"…). Burada yeni metin uydurulmaz; yalnızca
 * ApiError olmayan hatalar için nötr bir yedek cümle vardır.
 *
 * ÜÇ VARYANT, ÜÇ FARKLI DURUM:
 *  - `screen`  → ekranda hiç veri yok; boş durum düzeni + "Tekrar dene".
 *  - `inline`  → bölüm/kart içi hata; liste akışını bölmeden aynı düzen dar hâlde.
 *  - `banner`  → EKRANDA BAYAT VERİ VAR ama yenileme başarısız. Kullanıcı eski
 *    skorları görmeye devam eder, üstte ince bir şerit durumu söyler. Bu ayrım
 *    önemlidir: canlı skor uygulamasında elindeki veriyi silip hata basmak,
 *    hatanın kendisinden daha büyük bir kayıptır.
 *
 * HAPTİK: yeniden deneme kullanıcı eylemidir → `light` (§5.3). Otomatik
 * yeniden denemede hiçbir titreşim yoktur.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import {
  colors,
  fonts,
  hairline,
  radius,
  space,
  textScale,
  type,
} from "@/theme";
import { ApiError } from "@/lib/http";
import { EmptyState } from "./EmptyState";
import { Touchable } from "./Pressable";

export interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  /** Çevrimdışı özel mesajı — bağlantı yokken sunucu suçlanmaz. */
  offline?: boolean;
  variant?: "screen" | "inline" | "banner";
  style?: StyleProp<ViewStyle>;
}

/** Hatadan kullanıcıya gösterilecek Türkçe cümleyi çıkarır. */
export function errorMessage(error: unknown, offline?: boolean): string {
  if (offline) return "İnternet bağlantısı yok. Bağlanınca kaldığın yerden devam edersin.";
  if (error instanceof ApiError) return error.userMessage;
  if (error instanceof Error && error.message) return error.message;
  // Buraya düşen hata tanınmıyor demektir; yine de NE YAPILACAĞINI söyler.
  return "Veri okunamadı. Tekrar dene; sürerse birkaç dakika sonra yeniden aç.";
}

/** Başlık: çevrimdışı ve sunucu hatası aynı şey değildir, ayrı okunur. */
function errorTitle(error: unknown, offline?: boolean): string {
  if (offline) return "Bağlantı yok";
  if (error instanceof ApiError && error.status === 404) return "Kayıt bulunamadı";
  return "Yüklenemedi";
}

export const ErrorState = React.memo(function ErrorState({
  error,
  onRetry,
  offline,
  variant = "screen",
  style,
}: ErrorStateProps) {
  const message = errorMessage(error, offline);

  if (variant === "banner") {
    return (
      <View
        accessibilityRole="alert"
        accessibilityLabel={message}
        style={[styles.banner, style]}
      >
        <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
        <Text style={styles.bannerText} numberOfLines={1} {...textScale.dense}>
          {message}
        </Text>
        {onRetry ? (
          <Touchable
            feedback="icon"
            haptic="light"
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel="Yenile"
            style={styles.bannerAction}
          >
            <Text style={styles.bannerActionText} {...textScale.badge}>
              Yenile
            </Text>
          </Touchable>
        ) : null}
      </View>
    );
  }

  return (
    <EmptyState
      variant={variant}
      title={errorTitle(error, offline)}
      body={message}
      illustration={
        <View style={styles.iconCircle}>
          <Ionicons name="cloud-offline-outline" size={36} color={colors.danger} />
        </View>
      }
      action={onRetry ? { label: "Tekrar dene", onPress: onRetry, haptic: "light" } : undefined}
      style={style}
    />
  );
});

const styles = StyleSheet.create({
  /** İkon dairesi boş durumla aynı ölçüde ama tonu `danger` — hata olduğu belli. */
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.dangerDim,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.xs,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    height: 40,
    paddingHorizontal: space.md,
    backgroundColor: colors.dangerDim,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  bannerText: {
    ...type.bodySm,
    color: colors.danger,
    flex: 1,
  },
  bannerAction: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
  },
  bannerActionText: {
    ...type.caption,
    fontFamily: fonts.bold,
    color: colors.danger,
  },
});
