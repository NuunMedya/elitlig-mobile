/**
 * ARAÇ PANOSU — Kulübüm ve Kariyerim ana sayfalarının ORTAK araç düzeni.
 *
 * İKİ KATMAN:
 *   1. KISAYOLLAR (`ShortcutGrid`) — haftada birçok kez açılan işler. Üç
 *      sütunlu karo: ikon + ad + GERÇEK VERİDEN tek satır durum ("18 oyuncu",
 *      "Cmt 21:00", "2 yanıt bekliyor"). Karo yalnız kapı değil, aynı zamanda
 *      göstergedir: çoğu zaman açmadan ne durumda olduğu okunur. İş varsa
 *      sağ üstte sayı rozeti; `primary` karo marka dolguludur (tek tane).
 *   2. ARAÇLAR (`ToolBoard`) — kalan her şey, anlamına göre gruplanmış dört
 *      sütunlu ikon ızgarası. Grup başlığı küçük etikettir; gruplar tek kartta
 *      kıl çizgisiyle ayrılır (iç içe kart yok). Hepsi AÇIK durur: eski
 *      katlanır menüde bir aracı bulmak için önce grubunu tahmin edip açmak
 *      gerekiyordu.
 *
 * Her şey ana sayfadan TEK dokunuşta; rozetler `brand` (okunmamış/iş sayısı
 * rengi — docs/arena-tasarim-dili.md §6), kırmızı yalnız süre baskısı taşıyan
 * işte (`urgent`).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Touchable, toneColors, type Tone } from "@/components/ui";
import { colors, hairline, radius, space, textScale, type, upperTR } from "@/theme";

type IconName = keyof typeof Ionicons.glyphMap;

/* ══════════════════════════ KISAYOLLAR ══════════════════════════ */

export interface Shortcut {
  key: string;
  icon: IconName;
  label: string;
  /** Tek satır durum — gerçek veriden; bilinmiyorsa kısa bir açıklama. */
  status?: string | null;
  href: string;
  tone: Tone;
  count?: number;
  /** Süre baskısı: rozet kırmızı çizilir. */
  urgent?: boolean;
  /** Marka dolgulu vurgulu karo (ızgarada en fazla bir tane). */
  primary?: boolean;
}

export const ShortcutGrid = React.memo(function ShortcutGrid({
  items,
  go,
}: {
  items: Shortcut[];
  go: (href: string) => void;
}) {
  return (
    <View style={styles.shortcuts}>
      {items.map((item) => {
        const tc = toneColors(item.tone);
        return (
          <Touchable
            key={item.key}
            onPress={() => go(item.href)}
            feedback="card"
            haptic="selection"
            accessibilityRole="button"
            accessibilityLabel={[item.label, item.status, item.count ? `${item.count} bekleyen` : null].filter(Boolean).join(", ")}
            style={[styles.shortcut, item.primary && styles.shortcutPrimary]}
          >
            <View style={styles.shortcutTop}>
              <View style={[styles.shortcutIcon, { backgroundColor: item.primary ? colors.glassBorder : tc.dim }]}>
                <Ionicons name={item.icon} size={18} color={item.primary ? colors.textOnBrand : tc.fg} />
              </View>
              {item.count ? (
                <View style={[styles.badge, item.urgent && styles.badgeUrgent, item.primary && styles.badgeOnPrimary]}>
                  <Text
                    style={[styles.badgeText, item.urgent && styles.badgeTextUrgent, item.primary && styles.badgeTextOnPrimary]}
                    {...textScale.badge}
                  >
                    {item.count > 99 ? "99+" : item.count}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.shortcutLabel, item.primary && styles.onPrimary]} numberOfLines={1} {...textScale.dense}>
              {item.label}
            </Text>
            <Text style={[styles.shortcutStatus, item.primary && styles.onPrimaryMuted]} numberOfLines={1} {...textScale.dense}>
              {item.status || " "}
            </Text>
          </Touchable>
        );
      })}
    </View>
  );
});

/* ══════════════════════════ ARAÇLAR ══════════════════════════ */

export interface BoardTool {
  key: string;
  icon: IconName;
  label: string;
  href: string;
  tone?: Tone;
  count?: number;
  urgent?: boolean;
}

export interface BoardSection {
  key: string;
  title: string;
  tools: BoardTool[];
}

export const ToolBoard = React.memo(function ToolBoard({
  sections,
  go,
}: {
  sections: BoardSection[];
  go: (href: string) => void;
}) {
  return (
    <View style={styles.board}>
      {sections.map((section, index) => {
        const pending = section.tools.reduce((sum, tool) => sum + (tool.count ?? 0), 0);
        return (
          <View key={section.key} style={[styles.boardSection, index > 0 && styles.boardDivider]}>
            <View style={styles.boardHead}>
              <Text style={styles.boardTitle} numberOfLines={1} {...textScale.badge}>
                {upperTR(section.title)}
              </Text>
              {pending ? (
                <Text style={styles.boardMeta} {...textScale.badge}>
                  {`${pending} İŞ`}
                </Text>
              ) : null}
            </View>
            <View style={styles.tools}>
              {section.tools.map((tool) => {
                const tc = toneColors(tool.tone ?? "brand");
                return (
                  <Touchable
                    key={tool.key}
                    style={styles.tool}
                    onPress={() => go(tool.href)}
                    feedback="icon"
                    haptic="selection"
                    accessibilityRole="button"
                    accessibilityLabel={tool.count ? `${tool.label}, ${tool.count} bekleyen` : tool.label}
                  >
                    <View style={[styles.toolIcon, { backgroundColor: tc.dim }]}>
                      <Ionicons name={tool.icon} size={18} color={tc.fg} />
                      {tool.count ? (
                        <View style={[styles.toolBadge, tool.urgent && styles.badgeUrgent]}>
                          <Text style={[styles.badgeText, tool.urgent && styles.badgeTextUrgent]} {...textScale.badge}>
                            {tool.count > 9 ? "9+" : tool.count}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.toolLabel} numberOfLines={2} {...textScale.badge}>
                      {tool.label}
                    </Text>
                  </Touchable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
});

/* ══════════════════════════ STİLLER ══════════════════════════ */

const styles = StyleSheet.create({
  shortcuts: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  shortcut: {
    /* Üç sütun: iki 8px aralık düşülür; flexGrow son satırı da doldurur. */
    width: "31%",
    flexGrow: 1,
    padding: space.md,
    gap: space.xxs,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  shortcutPrimary: { backgroundColor: colors.brand, borderColor: colors.brand },
  shortcutTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: space.s },
  shortcutIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  shortcutLabel: { ...type.h4, color: colors.textPrimary },
  shortcutStatus: { ...type.caption, color: colors.textTertiary },
  onPrimary: { color: colors.textOnBrand },
  onPrimaryMuted: { color: colors.textOnBrand, opacity: 0.8 },

  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: space.s,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
  },
  badgeUrgent: { backgroundColor: colors.danger },
  badgeOnPrimary: { backgroundColor: colors.surface1 },
  badgeText: { ...type.micro, color: colors.textOnBrand, letterSpacing: 0 },
  badgeTextUrgent: { color: colors.textOnStatus },
  badgeTextOnPrimary: { color: colors.brandAccent },

  board: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  boardSection: { paddingTop: space.md, paddingBottom: space.sm },
  boardDivider: { borderTopWidth: hairline, borderTopColor: colors.separator },
  boardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    marginBottom: space.xs,
  },
  boardTitle: { ...type.overline, color: colors.textTertiary, flexShrink: 1 },
  boardMeta: { ...type.overline, color: colors.brandAccent },
  tools: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: space.xs },
  tool: { width: "25%", alignItems: "center", gap: space.xs, paddingVertical: space.sm, paddingHorizontal: space.xxs },
  toolIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  toolBadge: {
    position: "absolute",
    top: -space.xs,
    right: -space.s,
    minWidth: 18,
    height: 18,
    paddingHorizontal: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: space.xxs,
    borderColor: colors.surface1,
  },
  toolLabel: { ...type.caption, color: colors.textSecondary, textAlign: "center" },
});
