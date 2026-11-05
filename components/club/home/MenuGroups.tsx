/**
 * KULÜP MENÜSÜ — web üye panelinin "Takım Yönetimi" menü gruplarının
 * birebir karşılığı (PlayerTeamPanel SCOPE_NAV.team). Her satır yerel bir
 * ekranı açar; iş varsa sağda sayı rozeti.
 *
 * Gruplar katlanabilir: ilk açılışta yalnız ilk iki grup açıktır, kalanların
 * başlığında satır sayısı ve toplam bekleyen iş yazar. Katlama durumu bu
 * ekranın oturumu boyunca korunur (kalıcı değil — bir sonraki açılış temiz).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { PanelCard, PanelRow } from "@/components/club/Panel";
import { Touchable, type Tone } from "@/components/ui";
import { colors, layout, space, textScale, type, upperTR } from "@/theme";

export interface MenuItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  href: string;
  tone?: Tone;
  count?: number;
}

export interface MenuGroup {
  key: string;
  title: string;
  items: MenuItem[];
}

export const MenuGroups = React.memo(function MenuGroups({
  groups,
  go,
  initiallyOpen = 2,
}: {
  groups: MenuGroup[];
  go: (href: string) => void;
  initiallyOpen?: number;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(groups.slice(0, initiallyOpen).map((group) => group.key)));
  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <View style={styles.wrap}>
      {groups.map((group) => {
        const expanded = open.has(group.key);
        const pending = group.items.reduce((sum, item) => sum + (item.count ?? 0), 0);
        return (
          <View key={group.key} style={styles.group}>
            <Touchable
              onPress={() => toggle(group.key)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={`${group.title}, ${group.items.length} bölüm${pending ? `, ${pending} bekleyen` : ""}`}
              style={styles.head}
            >
              <Text style={styles.title} numberOfLines={1} {...textScale.badge}>
                {upperTR(group.title)}
              </Text>
              {!expanded ? (
                <Text style={styles.meta} {...textScale.badge}>
                  {pending ? `${pending} iş` : `${group.items.length}`}
                </Text>
              ) : null}
              <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={colors.textTertiary} />
            </Touchable>
            {expanded ? (
              <PanelCard padded={false}>
                {group.items.map((item, index) => (
                  <PanelRow
                    key={item.key}
                    icon={item.icon}
                    tone={item.tone ?? "brand"}
                    title={item.label}
                    hint={item.hint}
                    count={item.count}
                    onPress={() => go(item.href)}
                    last={index === group.items.length - 1}
                  />
                ))}
              </PanelCard>
            ) : null}
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: layout.screenPadding, gap: space.md },
  group: { gap: space.sm },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 28 },
  title: { ...type.overline, color: colors.textTertiary, flex: 1 },
  meta: { ...type.overline, color: colors.brandAccent },
});
