/**
 * ScopeChip — başlık satırının İÇİNDE yaşayan kapsam göstergesi.
 *
 * NEDEN VAR: eski `<ScopeBar />` beş ekranda tekrar eden, üç çipli, kalıcı
 * olarak ~48px dikey alan yiyen bir şeritti. Kapsam bilgisi ekranda sürekli
 * durması gereken bir VERİ değil, ara sıra değiştirilen bir AYAR'dır: tek satır
 * özet + dokununca açılan alt sayfa yeterli. Çip başlık satırına girdiği için
 * ek dikey alan maliyeti sıfırdır.
 *
 * Dokununca ScopeProvider'daki tek örnek ScopeSheet açılır (her ekran kendi
 * modalını yaratmaz).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Touchable } from "@/components/ui";
import { useHeaderTone } from "@/components/ui/HeaderTone";
import { useScope, type ScopeStep } from "@/providers/ScopeProvider";
import { colors, radius, space, textScale, touchSlop, type, upperTR } from "@/theme";

export interface ScopeChipProps {
  /**
   * "full" = şehir · lig · sezon, "city" = yalnız şehir, "context" = şehir ·
   * sezon. Varsayılan "full".
   *
   * "context" LİG ADININ BAŞLIK OLDUĞU ekranlar içindir (Lig merkezi): lig
   * adı başlıkta zaten büyük yazılıyor; üst satır yalnız onu konumlandıran
   * bağlamı (il, sezon) söyler. Kâğıtta da üst başlık dilinde (versal,
   * geniş aralık, marka rengi = dokunulur) çizilir.
   */
  variant?: "full" | "city" | "context";
  /** Verilmezse kapsam sayfası açılır. */
  onPress?: () => void;
  /** Alt sayfanın açılacağı adım (varsayılan "city"). */
  step?: ScopeStep;
  /**
   * "ink": çip mor başlık bloğunun İÇİNDE, başlığın üst satırı olarak durur —
   * lavanta versal, tıpkı maketteki "İstanbul · Süper Amatör" üst başlığı gibi.
   * Kâğıttaki ayrı kapsam satırı kalktı: aynı bilgi bloğun altında bir kez
   * daha yazılıyordu ve ekranın tepesinde ikinci bir şerit oluşturuyordu.
   */
  tone?: "paper" | "ink";
  testID?: string;
}

/**
 * "2025/26" → "25/26", "2025-2026" → "25/26".
 * Sezon etiketi çipin en az bilgi taşıyan ama en uzun parçasıdır; kısaltılınca
 * lig adı için yer açılır.
 */
function shortSeason(label: string): string {
  const match = label.trim().match(/^(\d{2})?(\d{2})\s*[/\-–]\s*(\d{2})?(\d{2})$/);
  if (!match) return label.trim();
  return `${match[2]}/${match[4]}`;
}

/** "1. Lig" → "1.Lig": tek satırda kalması için ligdeki nokta boşluğu atılır. */
function shortLeague(label: string): string {
  return label.trim().replace(/^(\d+)\.\s+/, "$1.");
}

export const ScopeChip = React.memo(function ScopeChip({
  variant = "full",
  onPress,
  tone: toneProp,
  step = "city",
  testID,
}: ScopeChipProps) {
  const tone = useHeaderTone(toneProp ?? "paper");
  const scope = useScope();
  const { openScopeSheet } = scope;

  const handlePress = useCallback(() => {
    if (onPress) {
      onPress();
      return;
    }
    openScopeSheet(step);
  }, [onPress, openScopeSheet, step]);

  const label = useMemo(() => {
    const city = scope.cityLabel || "Şehir";
    if (variant === "city") return city;
    if (variant === "context") {
      return scope.seasonLabel ? `${city} · ${shortSeason(scope.seasonLabel)}` : city;
    }
    const parts = [city];
    if (scope.leagueLabel) parts.push(shortLeague(scope.leagueLabel));
    if (scope.seasonLabel) parts.push(shortSeason(scope.seasonLabel));
    return parts.join(" · ");
  }, [variant, scope.cityLabel, scope.leagueLabel, scope.seasonLabel]);

  /* Üst başlık dili: mürekkep blokta her zaman, kâğıtta "context" kipinde. */
  const overline = tone === "ink" || variant === "context";

  return (
    <Touchable
      feedback="chip"
      haptic="selection"
      onPress={handlePress}
      style={[styles.chip, variant === "context" ? styles.chipContext : null]}
      hitSlop={touchSlop(variant === "context" ? 20 : 32)}
      accessibilityRole="button"
      accessibilityLabel={`Kapsam: ${label}`}
      accessibilityHint="Şehir, lig ve sezon seçmek için dokunun"
      testID={testID}
    >
      <View style={styles.inner}>
        {variant === "context" ? (
          <Ionicons
            name="location"
            size={11}
            color={tone === "ink" ? colors.brandOnDark : colors.brandAccent}
          />
        ) : null}
        <Text
          style={[
            styles.label,
            overline ? styles.labelOverline : null,
            tone === "ink" ? styles.labelInk : null,
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
          {...(overline ? textScale.badge : textScale.dense)}
        >
          {overline ? upperTR(label) : label}
        </Text>
        <Ionicons
          name="chevron-down"
          size={12}
          color={
            tone === "ink"
              ? colors.brandOnDark
              : variant === "context"
                ? colors.brandAccent
                : colors.textSecondary
          }
        />
      </View>
    </Touchable>
  );
});

const styles = StyleSheet.create({
  chip: {
    height: 28,
    justifyContent: "center",
    borderRadius: radius.md,
    // Çerçevesiz: başlıkla aynı zemine oturur, kutu çizmez.
    paddingHorizontal: 0,
  },
  /* Üst satır yüksekliğinde: başlık bloğunu büyütmez, dokunma alanı hitSlop'ta. */
  chipContext: {
    height: 20,
    alignSelf: "flex-start",
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  label: {
    ...type.label,
    color: colors.textSecondary,
    // İki satıra taşmasın diye: uzun kapsam adı sonundan kırpılır.
    flexShrink: 1,
    maxWidth: 220,
  },
  /* Üst başlık dili (versal, geniş aralık): kâğıtta marka metni. */
  labelOverline: {
    ...type.overline,
    color: colors.brandAccent,
    maxWidth: 280,
  },
  /* Sahnede: lavanta. */
  labelInk: {
    color: colors.brandOnDark,
  },
});
