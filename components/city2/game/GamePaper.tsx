/**
 * KULÜP ŞEHRİ · PARŞÖMEN KİTİ — şehir pencerelerinin İÇ içeriği için uygulama
 * bileşenlerinin oyun karşılıkları (aynı props, oyun görünüşü):
 *
 *   · GameSheet    BottomSheet yerine: karartılmış şehrin üstünde ahşap
 *                  çerçeveli parşömen pencere (GameModal).
 *   · GameButton   Button yerine: kalın dudaklı parlak düğme (GlossyButton).
 *   · GameSegment  SegmentedControl yerine: tahta sekmeler (altın seçili);
 *                  `stretch={false}` ile yatay kayan şeritte de durur.
 *   · GameEmpty    EmptyState yerine: parşömen üstünde ikon madalyonu + metin.
 *   · GameError    ErrorState yerine: aynı hata cümlesi + "TEKRAR DENE".
 *   · GameLoading  iskelet yerine: parşömen bloklar + dönen top.
 *   · GameMedal    sıra madalyası (1-2-3 altın/gümüş/bronz, sonrası tahta).
 *   · GameStatBar  tahta istatistik şeridi (değer + etiket, aralarında çizgi).
 *
 * Renkler oyun dünyasınındır (iki temada aynı): lib/puzzle/cityGamePalette.ts.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { BottomSheet, Touchable, errorMessage, type BottomSheetProps } from "@/components/ui";
import { CG, CP, PODIUM, type CityBtnTone } from "@/lib/puzzle/cityGamePalette";
import { fonts, radius, space, textScale, type } from "@/theme";

import { BOTTOM, GlossyButton, TOP, upper } from "./CityGameKit";
import { GameModal } from "./GameModal";

type IconName = keyof typeof Ionicons.glyphMap;

/* ═══════════════════════ PENCERE ═══════════════════════ */

/** BottomSheet ile aynı çağrı; şehirde ahşap çerçeveli oyun penceresi açar. */
export function GameSheet({
  visible,
  onClose,
  title,
  footer,
  surface = "paper",
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** BottomSheet uyumu için; oyun penceresi içeriğe göre boylanır. */
  snap?: "content" | "half" | "full";
  footer?: React.ReactNode;
  /** "page": temaya uyan iç sayfa (uygulama bileşenlerini taşıyan ortak pencereler). */
  surface?: "paper" | "page";
  children: React.ReactNode;
}) {
  return (
    <GameModal visible={visible} onClose={onClose} title={title ?? ""} surface={surface} footer={footer}>
      {children}
    </GameModal>
  );
}

/**
 * Uygulamanın başka ekranlarıyla ORTAK pencereler (günlük ödül, yıldız
 * rehberi, maç yıldızı) için: `variant="game"` şehrin oyun penceresi
 * (ahşap çerçeve, kurdele; içerik temaya uyan sayfada), yoksa alttan sayfa.
 */
export function CitySheet({ variant = "app", ...props }: BottomSheetProps & { variant?: "app" | "game" }) {
  if (variant === "game") {
    return (
      <GameSheet visible={props.visible} onClose={props.onClose} title={props.title} footer={props.footer} surface="page">
        {props.children}
      </GameSheet>
    );
  }
  return <BottomSheet {...props} />;
}

/* ═══════════════════════ DÜĞME ═══════════════════════ */

const VARIANT_TONE: Record<string, CityBtnTone> = { primary: "green", secondary: "blue", ghost: "grey", danger: "red" };

/** Button ile aynı çağrı; parlak oyun düğmesi çizer. */
export function GameButton({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  loading,
  disabled,
  fullWidth,
  tone,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  iconPosition?: "left" | "right";
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Varyantın tonunu ezer (altın, mor, …). */
  tone?: CityBtnTone;
  haptic?: "none" | "light" | "medium" | "success";
  onDark?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  return (
    <GlossyButton
      label={upper(label)}
      icon={icon}
      tone={tone ?? VARIANT_TONE[variant] ?? "green"}
      small={size === "sm"}
      busy={loading}
      disabled={disabled}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[fullWidth ? null : styles.btnAuto, style]}
    />
  );
}

/* ═══════════════════════ SEKMELER ═══════════════════════ */

export interface GameSegmentItem<K extends string> {
  key: K;
  label: string;
  icon?: IconName;
  dot?: boolean;
}

/** SegmentedControl ile aynı çağrı; tahta sekme şeridi. */
export function GameSegment<K extends string>({
  items,
  value,
  onChange,
  stretch = true,
  style,
  onDark,
}: {
  items: GameSegmentItem<K>[];
  value: K;
  onChange: (k: K) => void;
  stretch?: boolean;
  size?: "sm" | "md";
  style?: StyleProp<ViewStyle>;
  /** Gece mavisi pencere başlığının üstünde (koyu tahta). */
  onDark?: boolean;
}) {
  const row = (
    <View style={[styles.tabs, onDark ? styles.tabsDark : null, stretch ? null : styles.tabsFree, style]} accessibilityRole="tablist">
      {items.map((t) => {
        const on = t.key === value;
        return (
          <Touchable
            key={t.key}
            onPress={() => onChange(t.key)}
            haptic="selection"
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.label}
            style={[styles.tab, stretch ? styles.tabStretch : styles.tabFree, on ? styles.tabOn : null]}
          >
            {on ? <LinearGradient colors={CG.btn.gold.fill} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} /> : null}
            {t.icon ? <Ionicons name={t.icon} size={14} color={on ? CG.btn.gold.ink : onDark ? CG.white : CG.inkSoft} /> : null}
            <Text style={[styles.tabText, onDark ? styles.tabTextDark : null, on ? styles.tabTextOn : null]} numberOfLines={1} {...textScale.badge}>
              {t.label}
            </Text>
            {t.dot ? <View style={styles.tabDot} /> : null}
          </Touchable>
        );
      })}
    </View>
  );
  if (stretch) return row;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
      {row}
    </ScrollView>
  );
}

/* ═══════════════════════ BOŞ / HATA / YÜKLENİYOR ═══════════════════════ */

/** EmptyState ile aynı çağrı; parşömen üstünde madalyon + metin + düğme. */
export function GameEmpty({
  icon = "sparkles-outline",
  title,
  body,
  action,
  compact,
  style,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void; haptic?: string };
  variant?: "screen" | "inline";
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.empty, compact ? styles.emptyCompact : null, style]}>
      <LinearGradient colors={CG.rivet} start={TOP} end={BOTTOM} style={[styles.emptyMedal, compact ? styles.emptyMedalSm : null]}>
        <Ionicons name={icon} size={compact ? 22 : 30} color={CG.btn.gold.ink} />
      </LinearGradient>
      <Text style={styles.emptyTitle} {...textScale.dense}>
        {title}
      </Text>
      {body ? (
        <Text style={styles.emptyBody} {...textScale.long}>
          {body}
        </Text>
      ) : null}
      {action ? <GameButton label={action.label} onPress={action.onPress} size="sm" style={styles.emptyBtn} /> : null}
    </View>
  );
}

/** ErrorState ile aynı çağrı; uygulamanın hata cümlesi parşömende. */
export function GameError({ error, onRetry, offline, style }: { error: unknown; onRetry?: () => void; offline?: boolean; variant?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <GameEmpty
      icon={offline ? "cloud-offline-outline" : "alert-circle-outline"}
      title={offline ? "Bağlantı yok" : "Yüklenemedi"}
      body={errorMessage(error, offline)}
      action={onRetry ? { label: "Tekrar dene", onPress: onRetry } : undefined}
      style={style}
    />
  );
}

/** İskelet yerine: sabit parşömen bloklar (sonsuz parıltı yok) + dönen top. */
export function GameLoading({ lines = 4, style }: { lines?: number; avatar?: boolean; count?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.loading, style]} accessibilityRole="progressbar" accessibilityLabel="Yükleniyor">
      <ActivityIndicator color={CG.inkSoft} />
      {Array.from({ length: Math.max(1, Math.min(8, lines)) }, (_, i) => (
        <View key={i} style={[styles.loadingRow, { opacity: 1 - i * 0.09 }]} />
      ))}
    </View>
  );
}

/* ═══════════════════════ MADALYA, ŞERİT ═══════════════════════ */

/** Sıra madalyası: ilk üçte altın/gümüş/bronz, sonrası tahta pul. */
export function GameMedal({ rank, mine, size = 34 }: { rank: number | null | undefined; mine?: boolean; size?: number }) {
  const podium = rank === 1 || rank === 2 || rank === 3 ? PODIUM[rank] : null;
  const label = rank == null ? "–" : String(rank);
  return (
    <View style={{ width: size, height: size + 3 }} accessibilityLabel={rank != null ? `${rank}. sıra` : "Sırasız"}>
      <View style={[styles.medalLip, { width: size, height: size, borderRadius: size / 2, backgroundColor: podium ? podium.lip : CG.woodLip }]} />
      <LinearGradient
        colors={podium ? podium.fill : mine ? CG.league : [CG.wood[0], CG.wood[2]]}
        start={TOP}
        end={BOTTOM}
        style={[styles.medal, { width: size, height: size, borderRadius: size / 2 }]}
      >
        <Text style={[styles.medalText, { color: podium ? podium.ink : CG.white }, label.length > 3 ? styles.medalTextLong : null]} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
          {label}
        </Text>
      </LinearGradient>
    </View>
  );
}

export interface GameStat {
  key: string;
  value: string;
  label: string;
  icon?: IconName;
  tint?: string;
  onPress?: () => void;
  node?: React.ReactNode;
}

/** Tahta istatistik şeridi: kalın değerler, altında küçük etiket. */
export function GameStatBar({ items, style }: { items: GameStat[]; style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient colors={CG.wood} start={TOP} end={BOTTOM} style={[styles.stats, style]}>
      {items.map((s, i) => {
        const body = (
          <>
            {s.node ?? (
              <View style={styles.statLine}>
                {s.icon ? <Ionicons name={s.icon} size={14} color={s.tint ?? CG.star} /> : null}
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit {...textScale.dense}>
                  {s.value}
                </Text>
              </View>
            )}
            <Text style={styles.statLabel} numberOfLines={1} {...textScale.dense}>
              {s.label}
            </Text>
          </>
        );
        return (
          <React.Fragment key={s.key}>
            {i > 0 ? <View style={styles.statRule} /> : null}
            {s.onPress ? (
              <Touchable onPress={s.onPress} haptic="selection" style={styles.stat} accessibilityRole="button" accessibilityLabel={`${s.value} ${s.label}`}>
                {body}
              </Touchable>
            ) : (
              <View style={styles.stat}>{body}</View>
            )}
          </React.Fragment>
        );
      })}
    </LinearGradient>
  );
}

/** Pencere içeriğinin (kaydırılan sayfa) ortak dolgusu. */
export const paperContent = { paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.giant * 2, gap: space.md } as const;

const shadowText = { textShadowColor: CG.inkShadow, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 };

const styles = StyleSheet.create({
  btnAuto: { alignSelf: "flex-start" },

  tabs: { flexDirection: "row", gap: space.xs, padding: 3, borderRadius: radius.lg, backgroundColor: CG.paperDeep, borderWidth: 2, borderColor: CP.border },
  tabsDark: { backgroundColor: CG.inkShadow, borderColor: CG.woodEdge },
  tabsFree: { alignSelf: "flex-start" },
  tabsScroll: { paddingHorizontal: space.md },
  tab: { height: 34, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderRadius: radius.md, overflow: "hidden" },
  tabStretch: { flex: 1, paddingHorizontal: space.xxs },
  tabFree: { paddingHorizontal: space.md },
  tabOn: { borderWidth: 2, borderColor: CG.white },
  tabText: { ...type.labelXs, fontFamily: fonts.bold, color: CG.inkSoft },
  tabTextDark: { color: CG.white },
  tabTextOn: { color: CG.btn.gold.ink },
  tabDot: { position: "absolute", top: 4, right: 6, width: 9, height: 9, borderRadius: radius.pill, backgroundColor: CG.badge },

  empty: { alignItems: "center", gap: space.sm, paddingVertical: space.xl, paddingHorizontal: space.md },
  emptyCompact: { paddingVertical: space.md },
  emptyMedal: { width: 64, height: 64, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: CG.white },
  emptyMedalSm: { width: 46, height: 46 },
  emptyTitle: { ...type.h3, fontFamily: fonts.bold, color: CP.textPrimary, textAlign: "center" },
  emptyBody: { ...type.bodySm, color: CP.textSecondary, textAlign: "center" },
  emptyBtn: { alignSelf: "center", minWidth: 160, marginTop: space.xs },

  loading: { gap: space.sm, paddingVertical: space.md },
  loadingRow: { height: 56, borderRadius: radius.lg, backgroundColor: CP.surface2, borderWidth: 2, borderColor: CP.border },

  medalLip: { position: "absolute", top: 3, left: 0 },
  medal: { alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: CG.white },
  medalText: { ...type.label, fontFamily: fonts.bold },
  medalTextLong: { ...type.micro, fontFamily: fonts.bold },

  stats: { flexDirection: "row", alignItems: "stretch", paddingVertical: space.sm, borderRadius: radius.lg, borderWidth: 2, borderColor: CG.woodEdge },
  stat: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2, paddingHorizontal: space.xxs },
  statLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  statValue: { ...type.h3, fontFamily: fonts.bold, color: CG.white, ...shadowText },
  statLabel: { ...type.micro, fontFamily: fonts.bold, color: CG.paper[1] },
  statRule: { width: 2, borderRadius: 1, backgroundColor: CG.woodLip, opacity: 0.6 },
});
