/**
 * UYGULAMA ÇEKMECESİ — yönetim modunda alt menünün ortasındaki düğmeden açılır.
 *
 * NE (yukarıdan aşağı):
 *   1. ARAMA — uygulama adı ve tanımında anında süzer (Türkçe harf katlamalı).
 *   2. SIK KULLANILANLAR — öne çıkan altı uygulama dört sütunlu ızgarada:
 *      degrade IconTile + kısa ad + rozet. Açılışta simgeler sırayla yaylanarak
 *      "patlar" (Pop); hareket azaltılmışsa doğrudan görünür.
 *   3. KATEGORİLER — "Lig operasyonu" ve "Çalışma araçları" başlıkları altında
 *      cam kart içinde satırlar: IconTile + ad + tek satırlık açıklama.
 *   4. Dipte iki sabit eylem: tüm yönetim sayfaları ve "Üye gözünden gör".
 *
 * Hangi ekranda olunursa olunsun her uygulama İKİ dokunuştur (düğme → simge).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter, type Href } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BottomSheet, EmptyState, Input, Touchable } from "@/components/ui";
import type { AdminCounters } from "@/hooks/useAdminCounters";
import { FEATURED_ADMIN_APPS, MORE_ADMIN_APPS, visibleAdminApps, type AdminApp } from "@/lib/adminApps";
import { useAdminMode } from "@/providers/AdminModeProvider";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type, upperTR } from "@/theme";

import { AppIconTile, AppListRow, Pop, Rise } from "./AppTiles";

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

/** "Diğer" uygulamaların kategorisi — operasyon (lig işi) ya da çalışma aracı. */
const OPS_KEYS = new Set(["talepler", "maclar", "sahalar"]);

const fold = (value: string) =>
  value
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");

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
  const [query, setQuery] = useState("");
  /* Her açılışta ızgara yeniden "patlasın" diye sayaç. */
  const [openCount, setOpenCount] = useState(0);

  useEffect(() => {
    if (visible) {
      setQuery("");
      setOpenCount((n) => n + 1);
    }
  }, [visible]);

  const featured = useMemo(() => visibleAdminApps(auth.user, FEATURED_ADMIN_APPS), [auth.user]);
  const more = useMemo(() => visibleAdminApps(auth.user, MORE_ADMIN_APPS), [auth.user]);
  const ops = useMemo(() => more.filter((app) => OPS_KEYS.has(app.key)), [more]);
  const tools = useMemo(() => more.filter((app) => !OPS_KEYS.has(app.key)), [more]);

  const results = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    return [...featured, ...more].filter((app) => {
      const hay = fold(`${app.title} ${app.shortTitle} ${app.tagline}`);
      return words.every((w) => hay.includes(w));
    });
  }, [featured, more, query]);

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
    <BottomSheet visible={visible} onClose={onClose} title="Uygulamalar" snap="full">
      <View style={styles.body} key={`drawer-${openCount}`}>
        <Input
          variant="search"
          value={query}
          onChangeText={setQuery}
          placeholder="Uygulama ara: muhasebe, ajanda, saha…"
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Uygulamalarda ara"
        />

        {results ? (
          results.length ? (
            <View style={styles.group}>
              {results.map((app, index) => (
                <AppListRow key={app.key} app={app} badge={appBadge(app.key, counters)} onPress={open} last={index === results.length - 1} />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="search-outline"
              title="Eşleşen uygulama yok"
              body="Başka bir kelime dene ya da tüm yönetim sayfalarında ara."
              action={{ label: "Tüm sayfalarda ara", onPress: openAll }}
              variant="inline"
              compact
            />
          )
        ) : (
          <>
            <Overline label="Sık kullanılanlar" />
            <View style={styles.grid}>
              {featured.map((app, index) => (
                <Pop key={app.key} index={index} style={styles.cell}>
                  <AppIconTile app={app} badge={appBadge(app.key, counters)} onPress={open} />
                </Pop>
              ))}
            </View>

            {ops.length ? (
              <Rise index={3}>
                <Overline label="Lig operasyonu" />
                <View style={styles.group}>
                  {ops.map((app, index) => (
                    <AppListRow key={app.key} app={app} badge={appBadge(app.key, counters)} onPress={open} last={index === ops.length - 1} />
                  ))}
                </View>
              </Rise>
            ) : null}

            {tools.length ? (
              <Rise index={5}>
                <Overline label="Çalışma araçları" />
                <View style={styles.group}>
                  {tools.map((app, index) => (
                    <AppListRow key={app.key} app={app} badge={appBadge(app.key, counters)} onPress={open} last={index === tools.length - 1} />
                  ))}
                </View>
              </Rise>
            ) : null}
          </>
        )}

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

function Overline({ label }: { label: string }) {
  return (
    <Text style={styles.overline} {...textScale.dense}>
      {upperTR(label)}
    </Text>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingBottom: space.md,
    gap: space.sm,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: space.lg,
    paddingTop: space.xs,
  },
  /** Dört sütun: 360px telefonda simge + kısa ad rahat sığar. */
  cell: {
    width: "25%",
  },
  group: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  overline: {
    ...type.overline,
    color: colors.textTertiary,
    marginTop: space.md,
    marginBottom: space.xs,
    paddingHorizontal: space.xs,
  },
  actions: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.lg,
  },
  action: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
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
