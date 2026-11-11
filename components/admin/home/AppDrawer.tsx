/**
 * UYGULAMA ÇEKMECESİ — yönetim modunda alt menünün ortasındaki düğmeden açılır.
 *
 * NE: yönetimin bütün "uygulamaları" tek ızgarada: Muhasebe, Yapılacaklar,
 * Projeler, Mesajlar, Lig yönetimi, Yayın stüdyosu ve diğer araçlar. Hangi
 * ekranda olunursa olunsun her uygulama İKİ dokunuştur (düğme → simge).
 *
 * Dipte iki sabit eylem: tüm yönetim sayfalarının listesi ve "Üye gözünden
 * gör" (uygulamayı normal kullanıcının gördüğü hâle çevirir).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter, type Href } from "expo-router";
import React, { useCallback, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BottomSheet, Touchable } from "@/components/ui";
import type { AdminCounters } from "@/hooks/useAdminCounters";
import { FEATURED_ADMIN_APPS, MORE_ADMIN_APPS, visibleAdminApps, type AdminApp } from "@/lib/adminApps";
import { useAdminMode } from "@/providers/AdminModeProvider";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type, upperTR } from "@/theme";

import { AppIconTile, Rise } from "./AppTiles";

/** Uygulama anahtarı → rozet sayısı. */
export function appBadge(key: string, counters: AdminCounters): number | null {
  switch (key) {
    case "gorevler":
      return counters.openTodos;
    case "mesajlar":
      return counters.messages;
    case "talepler":
      return counters.requests;
    default:
      return null;
  }
}

export function AppDrawer({
  visible,
  onClose,
  counters,
}: {
  visible: boolean;
  onClose: () => void;
  counters: AdminCounters;
}) {
  const router = useRouter();
  const auth = useAuth();
  const mode = useAdminMode();

  const featured = useMemo(() => visibleAdminApps(auth.user, FEATURED_ADMIN_APPS), [auth.user]);
  const more = useMemo(() => visibleAdminApps(auth.user, MORE_ADMIN_APPS), [auth.user]);

  const open = useCallback(
    (app: AdminApp) => {
      onClose();
      router.push(app.route as Href);
    },
    [onClose, router],
  );

  const openAll = useCallback(() => {
    onClose();
    router.push("/yonetim/tum" as Href);
  }, [onClose, router]);

  const preview = useCallback(() => {
    onClose();
    mode.enterMember();
  }, [mode, onClose]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Uygulamalar" snap="content">
      <View style={styles.body}>
        <Grid apps={featured} counters={counters} onPress={open} offset={0} wide />

        {more.length ? (
          <>
            <Text style={styles.overline} {...textScale.dense}>
              {upperTR("Diğer araçlar")}
            </Text>
            <Grid apps={more} counters={counters} onPress={open} offset={featured.length} />
          </>
        ) : null}

        <View style={styles.actions}>
          <Touchable feedback="row" haptic="selection" onPress={openAll} style={styles.action} accessibilityRole="button">
            <Ionicons name="apps-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.actionText} numberOfLines={1} {...textScale.dense}>
              Tüm sayfalar
            </Text>
          </Touchable>
          <Touchable
            feedback="row"
            haptic="selection"
            onPress={preview}
            style={[styles.action, styles.actionAccent]}
            accessibilityRole="button"
            accessibilityHint="Uygulamayı normal kullanıcının gördüğü hâle çevirir"
            testID="admin-preview-member"
          >
            <Ionicons name="eye-outline" size={18} color={colors.adminAccentText} />
            <Text style={[styles.actionText, styles.actionAccentText]} numberOfLines={1} {...textScale.dense}>
              Üye gözünden gör
            </Text>
          </Touchable>
        </View>
      </View>
    </BottomSheet>
  );
}

function Grid({
  apps,
  counters,
  onPress,
  offset,
  wide = false,
}: {
  apps: AdminApp[];
  counters: AdminCounters;
  onPress: (app: AdminApp) => void;
  offset: number;
  /** Öne çıkanlar üç sütun (altı uygulama iki tam satır), diğerleri dört. */
  wide?: boolean;
}) {
  return (
    <View style={styles.grid}>
      {apps.map((app, index) => (
        <Rise key={app.key} index={offset + index} style={wide ? styles.cellWide : styles.cell}>
          <AppIconTile app={app} badge={appBadge(app.key, counters)} onPress={onPress} />
        </Rise>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: space.md,
    paddingBottom: space.md,
    gap: space.sm,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: space.md,
  },
  /** Dört sütun: 360px telefonda simge + kısa ad rahat sığar. */
  cell: {
    width: "25%",
  },
  cellWide: {
    width: "33.333%",
  },
  overline: {
    ...type.overline,
    color: colors.textTertiary,
    marginTop: space.sm,
    paddingHorizontal: space.xs,
  },
  actions: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.md,
  },
  action: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface3,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  actionAccent: {
    backgroundColor: colors.adminAccentDim,
    borderColor: colors.adminAccentDim,
  },
  actionText: {
    ...type.labelSm,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  actionAccentText: {
    color: colors.adminAccentText,
  },
});
