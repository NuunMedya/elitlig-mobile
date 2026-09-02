/**
 * Form çipleri — son maçların G/B/M dizisi.
 *
 * NEDEN KARE ÇİP: puan tablosunda ve takım hero'sunda dar bir sütuna 5 sonuç
 * sığdırmak gerekiyor; harfli kare çip hem tarayıcı gözle (renk) hem okuyarak
 * (harf) çalışır. Harfler TÜRKÇE: G(alibiyet) / B(eraberlik) / M(ağlubiyet).
 *
 * VERİ BİÇİMİ: sunucu bazen "WDLWW" (İngilizce kısaltma) bazen dizi gönderiyor;
 * ikisi de kabul edilir, Türkçe harfler (G/B/M) de çözülür. Eksik maçlar boş
 * slot olarak gösterilir ki 5'li ızgara her satırda aynı hizada dursun.
 */

import { memo, useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, textScale, touchSlop, type } from "@/theme";
import { haptics } from "@/lib/haptics";

export type FormResult = "W" | "D" | "L";

export interface FormChipsProps {
  /** "WDLWW" veya ["W","D","L"] — sunucudan gelen biçim */
  form: string | FormResult[];
  /** En fazla kaç maç (varsayılan 5), sondan alınır */
  limit?: number;
  /** 13 / 18 */
  size?: "xs" | "sm";
  /** Basınca ilgili maça git — index, en eskiden en yeniye sıralı dizideki sıradır */
  onPressItem?: (index: number) => void;
  /** Soldan sağa: en eski → en yeni (varsayılan) */
  order?: "oldestFirst" | "newestFirst";
}

const LETTER: Record<FormResult, string> = { W: "G", D: "B", L: "M" };
const SPEECH: Record<FormResult, string> = { W: "Galibiyet", D: "Beraberlik", L: "Mağlubiyet" };

/** Hem "W/D/L" hem "G/B/M" hem de küçük harf gelebiliyor. */
function toResult(raw: string): FormResult | null {
  switch (raw.trim().toLocaleUpperCase("tr-TR")) {
    case "W":
    case "G":
      return "W";
    case "D":
    case "B":
    case "E":
      return "D";
    case "L":
    case "M":
    case "K":
      return "L";
    default:
      return null;
  }
}

interface Slot {
  result: FormResult | null;
  /** Kaynak dizideki sıra; boş slotta -1 */
  index: number;
}

export const FormChips = memo(function FormChips({
  form,
  limit = 5,
  size = "sm",
  onPressItem,
  order = "oldestFirst",
}: FormChipsProps) {
  const slots = useMemo<Slot[]>(() => {
    const raw = Array.isArray(form) ? form : String(form ?? "").split("");
    const parsed = raw.map(toResult).filter((value): value is FormResult => value !== null);
    const trimmed = parsed.slice(-limit);

    const filled: Slot[] = trimmed.map((result, index) => ({ result, index }));
    // Eksik maçlar başa boş slot olarak eklenir — ızgara hizası bozulmasın.
    while (filled.length < limit) filled.unshift({ result: null, index: -1 });

    return order === "newestFirst" ? [...filled].reverse() : filled;
  }, [form, limit, order]);

  const handlePress = useCallback(
    (index: number) => {
      if (index < 0 || !onPressItem) return;
      haptics.select();
      onPressItem(index);
    },
    [onPressItem],
  );

  return (
    <View
      style={styles.row}
      accessible={!onPressItem}
      accessibilityRole="text"
      accessibilityLabel={`Son ${limit} maç formu`}
    >
      {slots.map((slot, position) => (
        <Chip
          key={`${position}-${slot.index}`}
          slot={slot}
          size={size}
          pressable={Boolean(onPressItem) && slot.index >= 0}
          onPress={handlePress}
        />
      ))}
    </View>
  );
});

const Chip = memo(function Chip({
  slot,
  size,
  pressable,
  onPress,
}: {
  slot: Slot;
  size: "xs" | "sm";
  pressable: boolean;
  onPress: (index: number) => void;
}) {
  const handlePress = useCallback(() => onPress(slot.index), [onPress, slot.index]);

  const body = (
    <View
      style={[
        styles.chip,
        size === "xs" ? styles.chipXs : styles.chipSm,
        slot.result ? TONE_STYLE[slot.result] : styles.chipEmpty,
      ]}
    >
      <Text
        style={[styles.letter, size === "xs" ? styles.letterXs : null, !slot.result && styles.letterEmpty]}
        {...textScale.badge}
      >
        {slot.result ? LETTER[slot.result] : "—"}
      </Text>
    </View>
  );

  if (!pressable) return body;

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={touchSlop(size === "xs" ? 14 : 18)}
      accessibilityRole="button"
      accessibilityLabel={slot.result ? `${SPEECH[slot.result]} — maçı aç` : "Maç yok"}
    >
      {body}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 3,
    alignItems: "center",
  },
  /*
   * KARE ÇİP, 4px KÖŞE (maket ".form i"). Yarıçap ölçeğinin en küçük tokenı
   * (radius.xs = 6) 13px'lik bir karenin yarısına yaklaşıyor ve çipi DAİREYE
   * çeviriyordu; puan tablosundaki form dizisi nokta nokta okunuyordu. 4px,
   * kareyi kare bırakır — çıplak sayı yalnız bu sınırda (≤4) serbesttir.
   */
  chip: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  chipXs: { width: 13, height: 13 },
  chipSm: { width: 18, height: 18 },
  chipWin: { backgroundColor: colors.win },
  chipDraw: { backgroundColor: colors.draw },
  chipLoss: { backgroundColor: colors.loss },
  chipEmpty: { backgroundColor: colors.surface3 },
  /** Harf Archivo kalın: kare içinde dar ve dik durur, Inter'in yuvarlak G'si taşıyordu. */
  letter: {
    ...type.micro,
    fontFamily: fonts.bold,
    color: colors.textOnStatus,
    letterSpacing: 0,
  },
  letterXs: {
    fontSize: 8,
    lineHeight: 10,
  },
  letterEmpty: {
    color: colors.textTertiary,
  },
});

const TONE_STYLE = { W: styles.chipWin, D: styles.chipDraw, L: styles.chipLoss } as const;
