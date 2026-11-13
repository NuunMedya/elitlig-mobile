/**
 * GRUP / ETAP GEZİNMESİ — puan durumunun üstündeki iki katlı sekme düzeni.
 *
 * WEB İLE AYNI SEKMELER (bkz. `cups.ts` → `buildStandingsTabs`, web
 * `HomeAltStandings`): "Genel" (yönetici kapatabilir) · lig usulü gruplar ·
 * kupalar · bağımsız etaplar; sıra ve varsayılan seçim webdekiyle birebir.
 * Mobilde bu düz liste İKİ KATA bölünür, çünkü telefon genişliğinde
 * "Genel + 4 grup + 2 kupa" tek şeritte okunmuyordu:
 *
 *   ┌ Genel │ Gruplar │ ALTIN KUPA │ GÜMÜŞ KUPA ┐  1. kat: Tabs (bölümler)
 *   │ [1. LİG] [2. LİG] [3. LİG] [4. LİG]       │  2. kat: bölümün sekmeleri
 *   └ ▦ 1. LİG · 10 takım · lig usulü   1/4    ┘  bağlam kartı
 *
 *   · Tek gruplu bölüm (ör. yalnız "LİG AŞAMASI") ikinci kat açmaz; 1. kattaki
 *     sekme doğrudan grubun adını taşır.
 *   · Tek bölüm varsa (ör. Genel kapalı, yalnız gruplar) 1. kat çizilmez.
 *
 * AĞAÇ GÖRÜNÜMÜ (`group_display_mode = "agac"`): web bu kipte sekme yerine
 * soldan sağa eleme şeması + genel tabloyu gösterir. Telefonda şema yukarıdan
 * aşağı "Turnuva yolu" kartıdır (`StageFlow`): derinlik sırasıyla adımlar,
 * her adımda o turun grupları/etapları; dokununca ilgili sekme açılır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  Chip,
  ChipGroup,
  IconTile,
  SegmentedControl,
  Tabs,
  Touchable,
  type IconTileTone,
} from "@/components/ui";
import type { SeasonGroup } from "@/lib/api/seasonGroups";
import { formatNumber } from "@/lib/format";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

import type { StandingsTab } from "./cups";

/* ═══════════════════════════════ BÖLÜMLER ═══════════════════════════════ */

interface Section {
  key: string;
  label: string;
  tabs: StandingsTab[];
}

const GROUPS_KEY = "bolum-gruplar";
const STAGES_KEY = "bolum-etaplar";

/** Düz sekme listesini (web sırası) bölümlere ayırır; sıra korunur. */
function buildSections(tabs: StandingsTab[]): Section[] {
  const out: Section[] = [];
  const groups = tabs.filter((tab) => tab.kind === "group");
  const stages = tabs.filter((tab) => tab.kind === "stage");
  let groupsAdded = false;
  let stagesAdded = false;
  for (const tab of tabs) {
    if (tab.kind === "overall") out.push({ key: tab.key, label: tab.label, tabs: [tab] });
    else if (tab.kind === "cup") out.push({ key: tab.key, label: tab.label, tabs: [tab] });
    else if (tab.kind === "group" && !groupsAdded) {
      groupsAdded = true;
      out.push({ key: GROUPS_KEY, label: groups.length === 1 ? tab.label : "Gruplar", tabs: groups });
    } else if (tab.kind === "stage" && !stagesAdded) {
      stagesAdded = true;
      out.push({ key: STAGES_KEY, label: stages.length === 1 ? tab.label : "Etaplar", tabs: stages });
    }
  }
  return out;
}

const KIND_ICON: Record<StandingsTab["kind"], keyof typeof Ionicons.glyphMap> = {
  overall: "podium-outline",
  group: "grid-outline",
  cup: "trophy-outline",
  stage: "git-network-outline",
};

const KIND_TONE: Record<StandingsTab["kind"], IconTileTone> = {
  overall: "violet",
  group: "cyan",
  cup: "gold",
  stage: "pink",
};

/** Etabın oynanmış eşleşme sayısı (skoru girilmiş maç). */
function playedCount(group: SeasonGroup): number {
  return (group.matchups ?? []).filter(
    (matchup) => matchup.match?.home_score != null && matchup.match?.away_score != null,
  ).length;
}

function teamCount(group: SeasonGroup): number {
  return Number(group.team_count ?? group.teams?.length ?? 0) || 0;
}

/** Bağlam kartının alt satırı. */
function contextMeta(tab: StandingsTab, groupCount: number, cupCount: number): string {
  switch (tab.kind) {
    case "overall":
      return [
        "Sezonun tamamı",
        groupCount ? `${groupCount} grup` : null,
        cupCount ? `${cupCount} kupa` : null,
      ]
        .filter(Boolean)
        .join(" · ");
    case "group": {
      const teams = teamCount(tab.group);
      return [teams ? `${formatNumber(teams)} takım` : null, "lig usulü", tab.group.double_round ? "çift devre" : null]
        .filter(Boolean)
        .join(" · ");
    }
    case "cup":
      return tab.cup.stages.map((stage) => stage.label).join(" → ") || "Eleme turları";
    case "stage": {
      const total = tab.group.matchups?.length ?? 0;
      return total ? `${total} eşleşme · ${playedCount(tab.group)} oynandı` : "Eşleşmeler belirlenmedi";
    }
  }
}

/* ═══════════════════════════════ GEZİNME ═══════════════════════════════ */

export const StageNav = memo(function StageNav({
  tabs,
  activeKey,
  onChange,
}: {
  tabs: StandingsTab[];
  activeKey: string;
  onChange: (key: string) => void;
}) {
  const sections = useMemo(() => buildSections(tabs), [tabs]);
  const activeSection = sections.find((section) => section.tabs.some((tab) => tab.key === activeKey)) ?? sections[0];
  const activeTab = activeSection?.tabs.find((tab) => tab.key === activeKey) ?? activeSection?.tabs[0];
  if (!activeSection || !activeTab || tabs.length <= 1) return null;

  const groupCount = tabs.filter((tab) => tab.kind === "group" || tab.kind === "stage").length;
  const cupCount = tabs.filter((tab) => tab.kind === "cup").length;
  const inner = activeSection.tabs;
  const position = inner.length > 1 ? inner.findIndex((tab) => tab.key === activeTab.key) + 1 : 0;
  /* Kısa ve az sekme → kayan başparmaklı segment; aksi hâlde kayan çip şeridi. */
  const segmented = inner.length > 1 && inner.length <= 4 && inner.every((tab) => tab.label.length <= 12);

  /* Bölüm değişince bölümün İLK sekmesine geçilir (web'de de sekme listesinin
     o bölümdeki ilk öğesi). */
  const selectSection = (key: string) => {
    const section = sections.find((item) => item.key === key);
    if (section && section.key !== activeSection.key) onChange(section.tabs[0].key);
  };

  return (
    <View style={styles.wrap} testID="standings-groups">
      {sections.length > 1 ? (
        <View style={styles.tabsWrap}>
          <Tabs
            tone="paper"
            items={sections.map((section) => ({ key: section.key, label: section.label }))}
            value={activeSection.key}
            onChange={selectSection}
          />
        </View>
      ) : null}

      {inner.length > 1 ? (
        segmented ? (
          <SegmentedControl
            items={inner.map((tab) => ({ key: tab.key, label: tab.label }))}
            value={activeTab.key}
            onChange={onChange}
            size="sm"
          />
        ) : (
          <ChipGroup style={styles.chips}>
            {inner.map((tab) => (
              <Chip
                key={tab.key}
                label={tab.label}
                size="sm"
                icon={tab.kind === "stage" ? "git-network-outline" : undefined}
                selected={tab.key === activeTab.key}
                onPress={() => onChange(tab.key)}
              />
            ))}
          </ChipGroup>
        )
      ) : null}

      {/* Bağlam kartı: seçili tablonun ne olduğu tek satırda. */}
      <View style={styles.context}>
        <IconTile icon={KIND_ICON[activeTab.kind]} tone={KIND_TONE[activeTab.kind]} size={36} glow={false} />
        <View style={styles.contextText}>
          <Text style={styles.contextTitle} numberOfLines={1} {...textScale.dense}>
            {activeTab.kind === "overall" ? "Genel puan durumu" : activeTab.label}
          </Text>
          <Text style={styles.contextMeta} numberOfLines={2} {...textScale.dense}>
            {contextMeta(activeTab, groupCount, cupCount)}
          </Text>
        </View>
        {position > 0 ? (
          <View style={styles.counter}>
            <Text style={styles.counterText} {...textScale.badge}>
              {`${position}/${inner.length}`}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
});

/* ═══════════════════════════════ TURNUVA YOLU ═══════════════════════════════ */

/**
 * Ağaç kipinin telefon karşılığı: grupları/etapları derinliğe (kaynak
 * zinciri) göre adım adım dizer. Her öğe ait olduğu sekmeyi açar: grup →
 * kendi tablosu, kupaya giren etap → kupa sekmesi, bağımsız etap → eşleşmeler.
 */
export const StageFlow = memo(function StageFlow({
  groups,
  tabs,
  onOpenTab,
}: {
  groups: SeasonGroup[];
  tabs: StandingsTab[];
  onOpenTab: (key: string) => void;
}) {
  const steps = useMemo(() => {
    const visible = groups.filter((group) => group.show_in_bracket !== false && !group.is_default);
    const byDepth = new Map<number, SeasonGroup[]>();
    for (const group of visible) {
      const depth = Number(group.depth ?? 0) || 0;
      byDepth.set(depth, [...(byDepth.get(depth) ?? []), group]);
    }
    return [...byDepth.entries()].sort((a, b) => a[0] - b[0]).map(([, list]) => list);
  }, [groups]);

  /* Grup → sekme anahtarı. */
  const tabFor = (group: SeasonGroup): string | null => {
    for (const tab of tabs) {
      if ((tab.kind === "group" || tab.kind === "stage") && Number(tab.group.id) === Number(group.id)) return tab.key;
      if (tab.kind === "cup" && tab.cup.groupIds.includes(Number(group.id))) return tab.key;
    }
    return null;
  };

  if (steps.length === 0) return null;

  return (
    <View style={styles.flowCard}>
      <View style={styles.flowHead}>
        <IconTile icon="git-merge-outline" tone="signature" size={36} />
        <View style={styles.contextText}>
          <Text style={styles.flowTitle} {...textScale.dense}>
            Turnuva yolu
          </Text>
          <Text style={styles.contextMeta} numberOfLines={1} {...textScale.dense}>
            {`${steps.length} aşama · adıma dokununca açılır`}
          </Text>
        </View>
      </View>
      {steps.map((list, stepIndex) => (
        <View key={stepIndex} style={styles.step}>
          {/* Ray: düğüm + adımlar arası degrade çizgi. */}
          <View style={styles.rail}>
            {stepIndex < steps.length - 1 ? (
              <LinearGradient
                colors={colors.gradientSignature}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.railLine}
              />
            ) : null}
            <View style={styles.node}>
              <Text style={styles.nodeText} {...textScale.badge}>
                {stepIndex + 1}
              </Text>
            </View>
          </View>
          <View style={styles.stepItems}>
            {list.map((group) => {
              const key = tabFor(group);
              const stage = group.group_kind === "etap";
              const total = group.matchups?.length ?? 0;
              const meta = stage
                ? `${total} eşleşme${total ? ` · ${playedCount(group)} oynandı` : ""}`
                : `${formatNumber(teamCount(group))} takım`;
              return (
                <Touchable
                  key={group.id}
                  feedback="row"
                  haptic="selection"
                  disabled={!key}
                  onPress={() => key && onOpenTab(key)}
                  style={styles.stepItem}
                  accessibilityRole="button"
                  accessibilityLabel={`${group.group_name}, ${meta}`}
                >
                  <Ionicons
                    name={stage ? "git-network-outline" : "grid-outline"}
                    size={14}
                    color={stage ? colors.accentText : colors.brandAccent}
                  />
                  <View style={styles.contextText}>
                    <Text style={styles.stepName} numberOfLines={1} {...textScale.dense}>
                      {group.group_name}
                    </Text>
                    <Text style={styles.stepMeta} numberOfLines={1} {...textScale.dense}>
                      {meta}
                    </Text>
                  </View>
                  {key ? <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} /> : null}
                </Touchable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
});

const NODE = 24;

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  /* Sekme şeridi ekran kenarına kadar uzanır (liste dolgusunu geri alır). */
  tabsWrap: { marginHorizontal: -layout.screenPadding },
  chips: { marginHorizontal: -layout.screenPadding },
  context: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  contextText: { flex: 1, minWidth: 0 },
  contextTitle: { ...type.h4, color: colors.textPrimary },
  contextMeta: { ...type.caption, color: colors.textTertiary },
  counter: {
    paddingHorizontal: space.s,
    height: 22,
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.brandDim,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
  },
  counterText: { ...type.numSmStrong, color: colors.brandAccent },

  flowCard: {
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  flowHead: { flexDirection: "row", alignItems: "center", gap: space.m, paddingBottom: space.xs },
  flowTitle: { ...type.h3, color: colors.textPrimary },
  step: { flexDirection: "row", gap: space.sm },
  rail: { width: NODE, alignItems: "center", paddingTop: space.sm },
  railLine: {
    position: "absolute",
    top: space.sm + NODE / 2,
    bottom: -space.sm,
    width: 2,
    borderRadius: radius.pill,
  },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandDim,
    borderWidth: 1,
    borderColor: colors.brandBorder,
  },
  nodeText: { ...type.numSmStrong, color: colors.brandAccent },
  stepItems: { flex: 1, gap: space.xs, paddingVertical: space.xs },
  stepItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 48,
    paddingHorizontal: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
  },
  stepName: { ...type.label, color: colors.textPrimary },
  stepMeta: { ...type.caption, color: colors.textTertiary },
});
