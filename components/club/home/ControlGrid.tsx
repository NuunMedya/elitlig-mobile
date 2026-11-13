/**
 * KONTROL IZGARASI — Kulübüm'ün kısayol ve araç düzeni (gece teması).
 *
 *   <ControlGrid>  haftalık döngünün işleri: 3 sütunlu cam karo — degrade
 *                  ikon kutusu (IconTile), ad, GERÇEK VERİDEN tek satır durum
 *                  ("13 oyuncu", "15 Kas 21:00"). İş varsa sağ üstte sayaç.
 *                  `primary` karo imza degradeyle dolar (en fazla bir tane).
 *   <ToolDeck>     kalan her şey: gruplar tek kartta, her grup versal etiket +
 *                  4 sütunlu IconTile ızgarası. Hepsi AÇIK; katlama yok.
 *
 * Kariyerim aynı veri biçimini (`Shortcut`, `BoardSection`) kullanır ama kendi
 * `ToolBoard`unu çizer; tipler ToolBoard.tsx'ten gelir, iki ekran aynı
 * modelle konuşur.
 */

import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { BoardSection, Shortcut } from "@/components/club/home/ToolBoard";
import { TILE_TONE } from "@/components/team/ClubKit";
import { IconTile, Reveal, Touchable } from "@/components/ui";
import { colors, glowStyle, hairline, radius, space, textScale, type, upperTR } from "@/theme";

/* ══════════════════════════ KISAYOLLAR ══════════════════════════ */

export const ControlGrid = React.memo(function ControlGrid({ items, go }: { items: Shortcut[]; go: (href: string) => void }) {
  return (
    <View style={styles.grid}>
      {items.map((item, index) => (
        <View key={item.key} style={styles.cell}>
          <Reveal index={index} distance={8} scaleFrom={0.94}>
            <Touchable
              onPress={() => go(item.href)}
              feedback="card"
              haptic="selection"
              accessibilityRole="button"
              accessibilityLabel={[item.label, item.status, item.count ? `${item.count} bekleyen` : null].filter(Boolean).join(", ")}
              style={[styles.tile, item.primary && [styles.tilePrimary, glowStyle(colors.auroraViolet, 2)]]}
            >
              {item.primary ? (
                <LinearGradient
                  colors={colors.gradientSignature}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[StyleSheet.absoluteFill, styles.primaryFill]}
                />
              ) : null}
              <View style={styles.tileTop}>
                <IconTile icon={item.icon} tone={item.primary ? "neutral" : TILE_TONE[item.tone]} size={38} glow={!item.primary} />
                {item.count ? (
                  <View style={[styles.count, item.urgent && styles.countUrgent, item.primary && styles.countOnPrimary]}>
                    <Text style={[styles.countText, item.primary && styles.countTextOnPrimary]} {...textScale.badge}>
                      {item.count > 99 ? "99+" : item.count}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.label, item.primary && styles.onPrimary]} numberOfLines={1} {...textScale.dense}>
                {item.label}
              </Text>
              <Text style={[styles.status, item.primary && styles.onPrimaryMuted]} numberOfLines={1} {...textScale.dense}>
                {item.status || " "}
              </Text>
            </Touchable>
          </Reveal>
        </View>
      ))}
    </View>
  );
});

/* ══════════════════════════ ARAÇLAR ══════════════════════════ */

export const ToolDeck = React.memo(function ToolDeck({ sections, go }: { sections: BoardSection[]; go: (href: string) => void }) {
  return (
    <View style={styles.deck}>
      {sections.map((section, sectionIndex) => {
        const pending = section.tools.reduce((sum, tool) => sum + (tool.count ?? 0), 0);
        return (
          <View key={section.key} style={[styles.group, sectionIndex > 0 && styles.groupDivider]}>
            <View style={styles.groupHead}>
              <Text style={styles.groupTitle} numberOfLines={1} {...textScale.badge}>
                {upperTR(section.title)}
              </Text>
              {pending ? (
                <View style={styles.groupMeta}>
                  <Text style={styles.groupMetaText} {...textScale.badge}>
                    {`${pending} İŞ`}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.tools}>
              {section.tools.map((tool) => (
                <Touchable
                  key={tool.key}
                  style={styles.tool}
                  onPress={() => go(tool.href)}
                  feedback="icon"
                  haptic="selection"
                  accessibilityRole="button"
                  accessibilityLabel={tool.count ? `${tool.label}, ${tool.count} bekleyen` : tool.label}
                >
                  <View>
                    <IconTile icon={tool.icon} tone={TILE_TONE[tool.tone ?? "brand"]} size={44} glow={false} />
                    {tool.count ? (
                      <View style={[styles.toolBadge, tool.urgent && styles.countUrgent]}>
                        <Text style={styles.countText} {...textScale.badge}>
                          {tool.count > 9 ? "9+" : tool.count}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.toolLabel} numberOfLines={2} {...textScale.badge}>
                    {tool.label}
                  </Text>
                </Touchable>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -space.xs },
  cell: { width: "33.333%", padding: space.xs },
  tile: {
    padding: space.md,
    gap: space.xxs,
    minHeight: 112,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  tilePrimary: { borderColor: colors.brand, backgroundColor: colors.brand },
  primaryFill: { borderRadius: radius.xl },
  tileTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: space.sm },
  label: { ...type.h4, color: colors.textPrimary },
  status: { ...type.caption, color: colors.textTertiary },
  onPrimary: { color: colors.onDark },
  onPrimaryMuted: { color: colors.onDarkMuted },
  count: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: space.s,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
  },
  countUrgent: { backgroundColor: colors.danger },
  countOnPrimary: { backgroundColor: colors.inkTile },
  countText: { ...type.micro, color: colors.textOnBrand, letterSpacing: 0 },
  countTextOnPrimary: { color: colors.onDark },

  deck: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  group: { paddingTop: space.md, paddingBottom: space.xs },
  groupDivider: { borderTopWidth: hairline, borderTopColor: colors.separator },
  groupHead: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, marginBottom: space.xs },
  groupTitle: { ...type.overline, color: colors.textTertiary, flexShrink: 1 },
  groupMeta: { paddingHorizontal: space.s, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: colors.brandDim },
  groupMetaText: { ...type.nano, color: colors.brandAccent },
  tools: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: space.xs },
  tool: { width: "25%", alignItems: "center", gap: space.s, paddingVertical: space.sm, paddingHorizontal: space.xxs },
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
