/**
 * PitchLineup — dokunarak diziliş kuran saha görünümü.
 *
 * NEDEN VAR: mobilde diziliş düzenlemesi hiç yoktu; Kadro Yönetimi ekranı
 * "İlk 8 düzenlemesi şimdilik elitlig.com panelinden yapılır" diyordu. Web
 * panelindeki saha, mobilde de kurulabilecek en doğrudan arayüz: bir liste
 * "3. sıradaki oyuncu DEF2'de" der, saha ise onu GÖSTERİR.
 *
 * NEREDE KULLANILIR — iki yerde, aynı bileşen:
 *   · /takimim/kadro        Takımın İDEAL kadrosu (genel tercih).
 *   · /takimim/mac/[id]     Tek bir maçın kadrosu (maça özel).
 * İki ekranın da slot sözlüğü sunucudaki `constants/formations.js` ile birebir
 * aynıdır (lib/api/team.ts → FORMATIONS); saha yalnız o slotları çizer,
 * kendisi hiçbir diziliş kuralı bilmez.
 *
 * ETKİLEŞİM MODELİ (iki dokunuş, sürükleme yok):
 *   1. Boş bir yuvaya dokun → yuva "seçili" olur, altındaki havuz açılır.
 *   2. Havuzdan bir oyuncuya dokun → oyuncu o yuvaya yerleşir.
 *   Dolu bir yuvaya dokunmak oyuncuyu havuza geri gönderir.
 * NEDEN SÜRÜKLEME DEĞİL: sürükle-bırak, listeyle sahanın aynı anda ekranda
 * olmasını gerektirir ve telefonda 8 yuvalı saha + havuz aynı ekrana ancak
 * ikisi de küçültülerek sığar. İki dokunuş modeli her ikisini de tam boyda
 * bırakır ve erişilebilirlik açısından da (ekran okuyucu) çalışır.
 *
 * ORAN: saha 3:4 (en:boy) dikey durur. Gerçek oranı (68:105) telefonda çok
 * uzun bir dikdörtgen üretiyor ve yuvalar birbirine yapışıyordu; 3:4 hem
 * "saha" okunuyor hem de 8 yuvayı rahat taşıyor.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, hairline, radius, space, textScale, type } from "@/theme";
import { Touchable } from "./ui";

/** Saha gradyanının yönü: üstten alta. `PitchView` ile aynı dil. */
const GRADIENT_START = { x: 0.5, y: 0 } as const;
const GRADIENT_END = { x: 0.5, y: 1 } as const;

/** Slot kimliğinden hat: "DEF2" → "DEF". */
export const slotLine = (slot: string): string => slot.replace(/\d+$/, "");

/** Hat etiketleri — boş yuvada ne yazacağı. */
const LINE_LABEL: Record<string, string> = {
  GK: "Kale",
  DEF: "Defans",
  MID: "Orta",
  FWD: "Hücum",
};

/** Hatların dikey konumu (yüzde). Kale altta, hücum üstte. */
const LINE_Y: Record<string, number> = { GK: 88, DEF: 66, MID: 42, FWD: 16 };

export interface PitchPlayer {
  id: number;
  name: string;
  jerseyNumber?: number | null;
}

export interface PitchLineupProps {
  /** Dizilişin slot listesi — FORMATIONS[formation]. */
  slots: string[];
  /** slot → oyuncu. Boş yuvalar sözlükte bulunmaz. */
  assignments: Record<string, PitchPlayer | undefined>;
  /** Şu an oyuncu bekleyen yuva (havuz açık). */
  activeSlot?: string | null;
  /** Boş yuvaya dokunuldu — ekran `activeSlot`'u bu değere çeker. */
  onSelectSlot: (slot: string) => void;
  /** Dolu yuvaya dokunuldu — oyuncu havuza döner. */
  onClearSlot: (slot: string) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Yuvaların yüzde koordinatları.
 *
 * Aynı hattaki yuvalar sahaya eşit aralıklarla dağıtılır: n yuva için
 * i. yuvanın merkezi (i+1)/(n+1) oranındadır. Bu, kenarlara yapışmayı önler
 * ve hat kalabalıklaştıkça aralığı kendiliğinden daraltır.
 */
function computeCoords(slots: string[]): Record<string, { x: number; y: number }> {
  const byLine = new Map<string, string[]>();
  slots.forEach((slot) => {
    const line = slotLine(slot);
    const group = byLine.get(line);
    if (group) group.push(slot);
    else byLine.set(line, [slot]);
  });

  const coords: Record<string, { x: number; y: number }> = {};
  byLine.forEach((group, line) => {
    group.forEach((slot, index) => {
      coords[slot] = {
        x: ((index + 1) / (group.length + 1)) * 100,
        y: LINE_Y[line] ?? 50,
      };
    });
  });
  return coords;
}

/** Adın ilk kelimesi — yuvaya tam ad sığmaz. */
const shortName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

const Slot = React.memo(function Slot({
  slot,
  player,
  active,
  x,
  y,
  onSelect,
  onClear,
}: {
  slot: string;
  player?: PitchPlayer;
  active: boolean;
  x: number;
  y: number;
  onSelect: (slot: string) => void;
  onClear: (slot: string) => void;
}) {
  const handlePress = React.useCallback(() => {
    if (player) onClear(slot);
    else onSelect(slot);
  }, [onClear, onSelect, player, slot]);

  const label = LINE_LABEL[slotLine(slot)] ?? slot;

  return (
    <Touchable
      onPress={handlePress}
      feedback="icon"
      haptic="selection"
      accessibilityRole="button"
      accessibilityLabel={
        player
          ? `${label}: ${player.name}. Kaldırmak için dokun.`
          : `${label} boş. Oyuncu seçmek için dokun.`
      }
      style={[
        styles.slot,
        // Yüzde konum: yuvanın MERKEZİ verilen noktaya gelsin diye yarısı kadar
        // geri çekilir (RN'de `transform: translate(-50%)` yok).
        { left: `${x}%`, top: `${y}%`, marginLeft: -SLOT_SIZE / 2, marginTop: -SLOT_SIZE / 2 },
        player ? styles.slotFilled : null,
        active ? styles.slotActive : null,
      ]}
    >
      {player ? (
        <>
          <Text style={styles.slotNumber} {...textScale.badge}>
            {player.jerseyNumber ?? "•"}
          </Text>
          <Text style={styles.slotName} numberOfLines={1} {...textScale.badge}>
            {shortName(player.name)}
          </Text>
        </>
      ) : (
        <>
          <Ionicons
            name="add"
            size={20}
            color={active ? colors.brand : colors.onPitch}
          />
          <Text
            style={[styles.slotName, active ? styles.slotNameActive : styles.slotNameEmpty]}
            numberOfLines={1}
            {...textScale.badge}
          >
            {label}
          </Text>
        </>
      )}
    </Touchable>
  );
});

export const PitchLineup = React.memo(function PitchLineup({
  slots,
  assignments,
  activeSlot,
  onSelectSlot,
  onClearSlot,
  style,
  testID,
}: PitchLineupProps) {
  const coords = useMemo(() => computeCoords(slots), [slots]);

  return (
    <View style={[styles.pitch, style]} testID={testID}>
      <LinearGradient
        colors={colors.gradientPitch}
        start={GRADIENT_START}
        end={GRADIENT_END}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Saha çizgileri — dekoratif; ekran okuyucudan gizli. */}
      <View style={styles.touchline} pointerEvents="none" />
      <View style={styles.halfway} pointerEvents="none" />
      <View style={styles.centerCircle} pointerEvents="none" />
      <View style={styles.centerSpot} pointerEvents="none" />
      <View style={[styles.penaltyBox, styles.penaltyBottom]} pointerEvents="none" />
      <View style={[styles.penaltyBox, styles.penaltyTop]} pointerEvents="none" />
      <View style={[styles.goalBox, styles.goalBottom]} pointerEvents="none" />
      <View style={[styles.goalBox, styles.goalTop]} pointerEvents="none" />

      {slots.map((slot) => {
        const point = coords[slot] ?? { x: 50, y: 50 };
        return (
          <Slot
            key={slot}
            slot={slot}
            player={assignments[slot]}
            active={activeSlot === slot}
            x={point.x}
            y={point.y}
            onSelect={onSelectSlot}
            onClear={onClearSlot}
          />
        );
      })}
    </View>
  );
});

const SLOT_SIZE = 58;

const styles = StyleSheet.create({
  pitch: {
    // 3:4 dikey — bkz. dosya başlığı.
    aspectRatio: 3 / 4,
    width: "100%",
    // Gradyan yüklenemezse düz derin yeşil altta durur.
    backgroundColor: colors.pitchGreen,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  /** Kenar çizgisi — sahayı çerçeveler, yuvaların dışarı taşmadığını okutur. */
  touchline: {
    position: "absolute",
    left: 10,
    right: 10,
    top: 10,
    bottom: 10,
    borderWidth: 1,
    borderColor: colors.chalk,
  },
  halfway: {
    position: "absolute",
    left: 10,
    right: 10,
    top: "50%",
    height: 1,
    backgroundColor: colors.chalk,
  },
  centerCircle: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 84,
    height: 84,
    marginLeft: -42,
    marginTop: -42,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.chalk,
  },
  centerSpot: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 5,
    height: 5,
    marginLeft: -2.5,
    marginTop: -2.5,
    borderRadius: 2.5,
    backgroundColor: colors.chalk,
  },
  penaltyBox: {
    position: "absolute",
    left: "21%",
    right: "21%",
    height: "15%",
    borderWidth: 1,
    borderColor: colors.chalk,
  },
  penaltyBottom: {
    bottom: 10,
    borderBottomWidth: 0,
  },
  penaltyTop: {
    top: 10,
    borderTopWidth: 0,
  },
  /** Kale alanı — ceza sahasının içindeki küçük dikdörtgen. */
  goalBox: {
    position: "absolute",
    left: "36%",
    right: "36%",
    height: "6.5%",
    borderWidth: 1,
    borderColor: colors.chalk,
  },
  goalBottom: {
    bottom: 10,
    borderBottomWidth: 0,
  },
  goalTop: {
    top: 10,
    borderTopWidth: 0,
  },

  slot: {
    position: "absolute",
    width: SLOT_SIZE,
    height: SLOT_SIZE,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    // Boş yuva: sahayı karartan yarı saydam disk + tebeşir çerçeve.
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.chalk,
  },
  slotFilled: {
    backgroundColor: colors.brand,
    borderColor: colors.brandStrong,
  },
  /**
   * Seçili yuva: "havuzdan seçtiğin buraya gidecek".
   *
   * SEÇİM MERCANDIR, MAVİ DEĞİL. Mavi bu üründe yalnız VERİ rengidir; seçili
   * durum bir aksiyonun devamıdır. Dolu yuvadan ayrışması için dolgu değil
   * TİNT + kalın mercan çerçeve kullanılır: dolu yuva mercanla DOLU, bekleyen
   * yuva mercanla ÇERÇEVELİ.
   */
  slotActive: {
    backgroundColor: colors.brandDim,
    borderColor: colors.brand,
    borderWidth: 2,
  },
  slotNumber: {
    ...type.tableNumStrong,
    color: colors.textOnBrand,
  },
  slotName: {
    ...type.micro,
    color: colors.textOnBrand,
    maxWidth: SLOT_SIZE - 8,
    textAlign: "center",
    letterSpacing: 0,
  },
  /* Boş yuvanın etiketi derin sahanın üstünde durur: ikincil GRİ değil,
     kısılmış BEYAZ olmalı — gri, koyu yeşilin üstünde okunmuyordu. */
  slotNameEmpty: {
    color: colors.onDarkMuted,
  },
  slotNameActive: {
    color: colors.brand,
  },
});

/* ══════════════════════════════════════════════════════════════════════════
   Havuz — sahanın altındaki seçilebilir oyuncu şeridi
   ══════════════════════════════════════════════════════════════════════════ */

export interface PitchBenchProps {
  players: PitchPlayer[];
  /** Yuva seçili değilken havuz pasiftir; başlık bunu anlatır. */
  activeSlot?: string | null;
  onPick: (player: PitchPlayer) => void;
  /** Oyuncu altındaki küçük gri satır (mevki, forma no). */
  subtitleOf?: (player: PitchPlayer) => string | undefined;
  emptyLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Havuz — sahaya yerleştirilmemiş oyuncular.
 *
 * NEDEN AYRI BİLEŞEN: saha kendi yüksekliğini oranla belirliyor (aspectRatio);
 * havuz ise içeriği kadar uzuyor. İkisi tek bileşende olsaydı saha, havuzun
 * uzunluğuna göre ezilirdi.
 */
export const PitchBench = React.memo(function PitchBench({
  players,
  activeSlot,
  onPick,
  subtitleOf,
  emptyLabel = "Tüm oyuncular sahada.",
  style,
}: PitchBenchProps) {
  const armed = Boolean(activeSlot);

  return (
    <View style={[benchStyles.box, style]}>
      <Text style={benchStyles.title} {...textScale.dense}>
        {armed
          ? `“${LINE_LABEL[slotLine(activeSlot as string)] ?? activeSlot}” için oyuncu seç`
          : "Yedek havuzu"}
      </Text>
      <Text style={benchStyles.hint} {...textScale.dense}>
        {armed
          ? "Bir oyuncuya dokun; seçtiğin yuvaya yerleşir."
          : "Önce sahada boş bir yuvaya dokun, sonra buradan oyuncu seç."}
      </Text>

      {players.length ? (
        <View style={benchStyles.list}>
          {players.map((player) => (
            <BenchItem
              key={player.id}
              player={player}
              subtitle={subtitleOf?.(player)}
              disabled={!armed}
              onPick={onPick}
            />
          ))}
        </View>
      ) : (
        <Text style={benchStyles.empty} {...textScale.dense}>
          {emptyLabel}
        </Text>
      )}
    </View>
  );
});

const BenchItem = React.memo(function BenchItem({
  player,
  subtitle,
  disabled,
  onPick,
}: {
  player: PitchPlayer;
  subtitle?: string;
  disabled: boolean;
  onPick: (player: PitchPlayer) => void;
}) {
  const handlePress = React.useCallback(() => onPick(player), [onPick, player]);
  return (
    <Touchable
      onPress={handlePress}
      disabled={disabled}
      feedback="card"
      haptic="selection"
      accessibilityRole="button"
      accessibilityLabel={player.name}
      style={[benchStyles.item, disabled ? benchStyles.itemDisabled : null]}
    >
      <View style={benchStyles.itemNumber}>
        <Text style={benchStyles.itemNumberText} {...textScale.badge}>
          {player.jerseyNumber ?? "•"}
        </Text>
      </View>
      <View style={benchStyles.itemTexts}>
        <Text style={benchStyles.itemName} numberOfLines={1} {...textScale.dense}>
          {player.name}
        </Text>
        {subtitle ? (
          <Text style={benchStyles.itemSub} numberOfLines={1} {...textScale.dense}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Touchable>
  );
});

const benchStyles = StyleSheet.create({
  box: {
    gap: space.xs,
  },
  title: {
    ...type.h2,
    color: colors.textPrimary,
  },
  hint: {
    ...type.bodySm,
    color: colors.textTertiary,
  },
  list: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    paddingTop: space.m,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    paddingVertical: space.m,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface1,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  /** Yuva seçili değilken havuz pasif: dokunuş "hiçbir şey yapmadı" hissi vermesin. */
  itemDisabled: {
    opacity: 0.45,
  },
  itemNumber: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.surface3,
    alignItems: "center",
    justifyContent: "center",
  },
  itemNumberText: {
    ...type.tableNumStrong,
    color: colors.textSecondary,
  },
  itemTexts: {
    gap: 2,
  },
  itemName: {
    ...type.h4,
    color: colors.textPrimary,
    maxWidth: 170,
  },
  itemSub: {
    ...type.bodySm,
    color: colors.textTertiary,
    maxWidth: 170,
  },
  empty: {
    ...type.body,
    color: colors.textTertiary,
    paddingTop: space.m,
  },
});
