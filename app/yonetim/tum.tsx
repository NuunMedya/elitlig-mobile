/**
 * TÜM YÖNETİM SAYFALARI — `/yonetim/tum`.
 *
 * Web yönetim panelindeki her sayfanın (yetkiye göre) yerel karşılığı, gruplu
 * ve aranabilir tek listede. Kayıt defteri: lib/adminModules.ts.
 *
 * Yönetim ana ekranı en çok kullanılan uygulamaları öne çıkarır; burası
 * "her şey nerede?" sorusunun yanıtıdır.
 *
 * KURGU (ikinci tur): arama → özet satırı ("86 sayfa · 10 grup") → grup
 * çipleri (tek gruba odaklan) → her grup kendi başlığıyla (renkli IconTile +
 * ad + açıklama + sayı, dokununca katlanır) ve tek kart içinde satırlar:
 * grup tonunda küçük IconTile + ad + açıklama + chevron.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter, type Href } from "expo-router";
import { memo, useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AdminScreen } from "@/components/admin";
import { Chip, ChipGroup, EmptyState, IconTile, Input, Reveal, Touchable, type IconTileTone } from "@/components/ui";
import { searchModules, visibleModuleGroups, type AdminModule } from "@/lib/adminModules";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

/** Grup → IconTile tonu (Lig yönetimi ekranıyla aynı renk sözlüğü). */
const GROUP_TONE: Record<string, IconTileTone> = {
  "is-akisi": "gold",
  maclar: "violet",
  ligler: "signature",
  takimlar: "cyan",
  oyuncular: "mint",
  disiplin: "red",
  icerik: "gold",
  uyeler: "pink",
  yonetim: "neutral",
  araclar: "cyan",
};

export default function AllAdminPagesScreen() {
  const auth = useAuth();
  const router = useRouter();
  const groups = useMemo(() => visibleModuleGroups(auth.user), [auth.user]);
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<string>("");
  const hits = useMemo(() => searchModules(auth.user, query), [auth.user, query]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = useCallback((key: string) => setCollapsed((current) => ({ ...current, [key]: !current[key] })), []);
  const open = useCallback((module: AdminModule) => router.push(module.route as Href), [router]);

  const total = useMemo(() => groups.reduce((sum, g) => sum + g.modules.length, 0), [groups]);
  const shown = focus ? groups.filter((g) => g.key === focus) : groups;
  const toneOfModule = useMemo(() => {
    const map = new Map<string, IconTileTone>();
    for (const g of groups) for (const m of g.modules) if (!map.has(m.route)) map.set(m.route, GROUP_TONE[g.key] ?? "violet");
    return map;
  }, [groups]);

  return (
    <AdminScreen title="Tüm sayfalar" subtitle={`${total} sayfa · ${groups.length} grup`}>
      <Input
        variant="search"
        leadingIcon="search"
        value={query}
        onChangeText={setQuery}
        placeholder="Sayfa ara: ceza, transfer, kura, personel…"
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />

      {query.trim() ? (
        hits.length ? (
          <>
            <Text style={styles.resultMeta} {...textScale.dense}>
              {hits.length} sonuç
            </Text>
            <View style={styles.card}>
              {hits.map((module, index) => (
                <ModuleRow
                  key={module.route}
                  module={module}
                  tone={toneOfModule.get(module.route) ?? "violet"}
                  last={index === hits.length - 1}
                  onPress={open}
                />
              ))}
            </View>
          </>
        ) : (
          <EmptyState
            icon="search-outline"
            title="Eşleşen sayfa yok"
            body="Başka bir sözcükle dene: “kadro”, “kasa”, “haber”…"
            action={{ label: "Aramayı temizle", onPress: () => setQuery("") }}
            variant="inline"
            compact
          />
        )
      ) : (
        <>
          <ChipGroup scrollable contentPadding={0}>
            <Chip label="Tümü" size="sm" count={total} selected={!focus} onPress={() => setFocus("")} />
            {groups.map((group) => (
              <Chip
                key={group.key}
                label={group.title}
                icon={group.icon}
                size="sm"
                count={group.modules.length}
                selected={focus === group.key}
                onPress={() => setFocus(focus === group.key ? "" : group.key)}
              />
            ))}
          </ChipGroup>

          {shown.map((group, groupIndex) => {
            const tone = GROUP_TONE[group.key] ?? "violet";
            const closed = Boolean(collapsed[group.key]) && !focus;
            return (
              <Reveal key={group.key} index={groupIndex} style={styles.group}>
                <Touchable
                  feedback="row"
                  onPress={() => toggle(group.key)}
                  style={styles.groupHead}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: !closed }}
                  accessibilityLabel={`${group.title}, ${group.modules.length} sayfa`}
                >
                  <IconTile icon={group.icon} tone={tone} size={32} glow={false} />
                  <View style={styles.flex}>
                    <Text style={styles.groupTitle} numberOfLines={1} {...textScale.dense}>
                      {group.title}
                    </Text>
                    {group.description ? (
                      <Text style={styles.groupDesc} numberOfLines={1} {...textScale.dense}>
                        {group.description}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.groupCount}>
                    <Text style={styles.groupCountText} {...textScale.badge}>
                      {group.modules.length}
                    </Text>
                  </View>
                  <Ionicons name={closed ? "chevron-down" : "chevron-up"} size={16} color={colors.textTertiary} />
                </Touchable>
                {closed ? null : (
                  <View style={styles.card}>
                    {group.modules.map((module, index) => (
                      <ModuleRow
                        key={module.key}
                        module={module}
                        tone={tone}
                        last={index === group.modules.length - 1}
                        onPress={open}
                        testID={`admin-module-${module.key}`}
                      />
                    ))}
                  </View>
                )}
              </Reveal>
            );
          })}
        </>
      )}
    </AdminScreen>
  );
}

const ModuleRow = memo(function ModuleRow({
  module,
  tone,
  last,
  onPress,
  testID,
}: {
  module: AdminModule;
  tone: IconTileTone;
  last: boolean;
  onPress: (module: AdminModule) => void;
  testID?: string;
}) {
  return (
    <Touchable
      feedback="row"
      haptic="selection"
      onPress={() => onPress(module)}
      style={[styles.row, last ? null : styles.rowDivided]}
      accessibilityRole="button"
      accessibilityLabel={`${module.title}. ${module.description}`}
      testID={testID}
    >
      <IconTile icon={module.icon} tone={tone} size={36} glow={false} />
      <View style={styles.flex}>
        <Text style={styles.rowTitle} numberOfLines={1} {...textScale.dense}>
          {module.title}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1} {...textScale.dense}>
          {module.description}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
    </Touchable>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  resultMeta: { ...type.labelSm, color: colors.textSecondary, paddingHorizontal: space.xxs },
  group: {
    gap: space.sm,
    marginTop: space.sm,
  },
  groupHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.xxs,
    paddingVertical: space.xs,
  },
  groupTitle: { ...type.h3, color: colors.textPrimary },
  groupDesc: { ...type.caption, color: colors.textTertiary },
  groupCount: {
    minWidth: 24,
    height: 22,
    paddingHorizontal: space.s,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface3,
  },
  groupCountText: { ...type.numSmStrong, color: colors.textSecondary },
  card: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 60,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  rowDivided: {
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  rowTitle: { ...type.h4, color: colors.textPrimary },
  rowSub: { ...type.caption, color: colors.textTertiary },
});
