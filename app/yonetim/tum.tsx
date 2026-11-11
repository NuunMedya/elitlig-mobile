/**
 * TÜM YÖNETİM SAYFALARI — `/yonetim/tum`.
 *
 * Web yönetim panelindeki her sayfanın (yetkiye göre) yerel karşılığı, gruplu
 * ve aranabilir tek listede. Kayıt defteri: lib/adminModules.ts.
 *
 * Yönetim ana ekranı en çok kullanılan uygulamaları öne çıkarır; burası
 * "her şey nerede?" sorusunun yanıtıdır: arama kutusu açılışta odaklıdır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter, type Href } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AdminScreen } from "@/components/admin";
import { EmptyState, Input, ListRow, Touchable } from "@/components/ui";
import { searchModules, visibleModuleGroups, type AdminModule } from "@/lib/adminModules";
import { useAuth } from "@/providers/AuthProvider";
import { colors, space, textScale, type, upperTR } from "@/theme";

type GroupPosition = "single" | "first" | "middle" | "last";

function groupPosition(index: number, count: number): GroupPosition {
  if (count === 1) return "single";
  if (index === 0) return "first";
  if (index === count - 1) return "last";
  return "middle";
}

export default function AllAdminPagesScreen() {
  const auth = useAuth();
  const router = useRouter();
  const groups = useMemo(() => visibleModuleGroups(auth.user), [auth.user]);
  const [query, setQuery] = useState("");
  const hits = useMemo(() => searchModules(auth.user, query), [auth.user, query]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = useCallback((key: string) => setCollapsed((current) => ({ ...current, [key]: !current[key] })), []);
  const open = useCallback((module: AdminModule) => router.push(module.route as Href), [router]);

  return (
    <AdminScreen title="Tüm sayfalar" subtitle="Yetkine açık yönetim sayfaları">
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
          <View>
            {hits.map((module, index) => (
              <ListRow
                key={module.route}
                leading={{ icon: module.icon }}
                title={module.title}
                subtitle={module.description}
                chevron
                position={groupPosition(index, hits.length)}
                onPress={() => open(module)}
              />
            ))}
          </View>
        ) : (
          <EmptyState icon="search-outline" title="Eşleşen sayfa yok" body="Başka bir sözcükle dene." variant="inline" compact />
        )
      ) : (
        groups.map((group) => (
          <View key={group.key} style={styles.group}>
            <Touchable
              onPress={() => toggle(group.key)}
              style={styles.groupHead}
              accessibilityRole="button"
              accessibilityState={{ expanded: !collapsed[group.key] }}
            >
              <Ionicons name={group.icon} size={16} color={colors.textTertiary} />
              <Text style={styles.groupTitle} {...textScale.dense}>
                {upperTR(group.title)}
              </Text>
              <Text style={styles.groupCount} {...textScale.dense}>
                {group.modules.length}
              </Text>
              <Ionicons name={collapsed[group.key] ? "chevron-down" : "chevron-up"} size={16} color={colors.textTertiary} />
            </Touchable>
            {collapsed[group.key] ? null : (
              <View>
                {group.modules.map((module, index) => (
                  <ListRow
                    key={module.key}
                    leading={{ icon: module.icon }}
                    title={module.title}
                    subtitle={module.description}
                    chevron
                    position={groupPosition(index, group.modules.length)}
                    onPress={() => open(module)}
                    testID={`admin-module-${module.key}`}
                  />
                ))}
              </View>
            )}
          </View>
        ))
      )}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: space.sm,
  },
  groupHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.xxs,
    paddingVertical: space.xs,
  },
  groupTitle: {
    ...type.overline,
    color: colors.textTertiary,
  },
  groupCount: {
    ...type.caption,
    color: colors.textTertiary,
    marginLeft: "auto",
  },
});
