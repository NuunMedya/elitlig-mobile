/**
 * ELİTLİG PANORAMA — YouTube programının yayın kaplamasını telefondan sür.
 *
 * Web: pages/management/panorama/PanoramaAdmin.js. Liste → yayına dokununca
 * reji kumandası (components/admin/broadcast/PanoramaControl): sahne seç,
 * gereken kaydı seç, YAYINA VER. Yeni yayın alt sayfadan açılır; Türkiye
 * geneli yönetici yayının ilini seçer, il yetkilisi kendi iline açar.
 * Ayrıntı 15 sn'de bir tazelenir: başka bir rejinin bastığı sahne görünür.
 */

import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AdminList, AdminScreen, FormSheet, useAdminMutation, type FieldDef } from "@/components/admin";
import { CountTiles } from "@/components/admin/system/SysKit";
import { PanoramaControl } from "@/components/admin/broadcast/PanoramaControl";
import { Badge, EmptyState, FAB, GlowRim, LiveBadge, SkeletonCard, Touchable } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { timeAgo } from "@/lib/admin/format";
import { createBroadcast, getPanoramaCatalog, listBroadcasts } from "@/lib/api/admin/broadcast";
import { isNationwideUser } from "@/lib/api/admin/staff";
import { getCities } from "@/lib/api/meta";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

const PERMS = ["panorama.view", "panorama.broadcast"] as const;

export default function PanoramaScreen() {
  const auth = useAuth();
  const canCreate = hasAnyPermission(auth.user, ["panorama.create"]);
  const nationwide = isNationwideUser(auth.user);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const catalog = useQuery({ queryKey: ["admin", "panorama", "catalog"], queryFn: getPanoramaCatalog, staleTime: 600_000 });
  const list = useQuery({ queryKey: ["admin", "panorama", "list"], queryFn: () => listBroadcasts() });
  const cities = useQuery({ queryKey: ["admin", "panorama", "cities"], queryFn: getCities, enabled: nationwide, staleTime: 300_000 });

  const create = useAdminMutation((body: Parameters<typeof createBroadcast>[0]) => createBroadcast(body), {
    success: (b) => `“${b.name}” yayını oluşturuldu.`,
    invalidate: [["admin", "panorama", "list"]],
    onSuccess: (b) => setOpenId(b.id),
  });

  const sceneLabel = (key: string) => catalog.data?.scenes.find((s) => s.key === key)?.label ?? key;
  const items = (list.data ?? []).filter((b) => !q.trim() || [b.name, b.episodeTitle].join(" ").toLocaleLowerCase("tr-TR").includes(q.trim().toLocaleLowerCase("tr-TR")));

  const fields: FieldDef[] = [
    { key: "name", label: "Yayın adı", kind: "text", required: true, placeholder: "Örn. Elitlig Panorama", group: "Program" },
    { key: "episodeTitle", label: "Bölüm başlığı", kind: "text" },
    ...(nationwide
      ? [{ key: "cityId", label: "İl", kind: "select" as const, required: true, options: (cities.data ?? []).map((c) => ({ value: c.id, label: c.label })) }]
      : []),
    {
      key: "layout",
      label: "Düzen",
      kind: "segment",
      group: "Ekran düzeni",
      options: (catalog.data?.layouts ?? [{ value: "duo", label: "İkili" }]).map((l) => ({ value: l.value, label: l.label })),
    },
  ];

  if (openId != null) {
    return (
      <AdminScreen title="Panorama reji" subtitle="Yayın ekranı ve sahneler" permission={PERMS}>
        {catalog.data ? <PanoramaControl id={openId} catalog={catalog.data} onClose={() => setOpenId(null)} /> : catalog.isLoading ? <SkeletonCard /> : <EmptyState icon="tv-outline" title="Sahne kataloğu alınamadı" action={{ label: "Tekrar dene", onPress: () => void catalog.refetch() }} variant="inline" />}
      </AdminScreen>
    );
  }

  return (
    <AdminScreen
      title="Elitlig Panorama"
      subtitle="Yayın ekranı ve sahneler"
      permission={PERMS}
      scroll={false}
      overlay={canCreate ? <FAB icon="add" label="Yeni yayın" extended onPress={() => setCreating(true)} accessibilityLabel="Yeni yayın" /> : null}
    >
      <AdminList
        data={items}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        refreshing={list.isRefetching}
        onRefresh={list.refetch}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Yayın ara"
        emptyIcon="tv-outline"
        emptyTitle="Henüz yayın yok"
        emptyBody="Programın yayın kaplamasını buradan kur ve sahneleri telefondan yönet."
        keyExtractor={(b) => String(b.id)}
        extraHeader={
          list.data?.length ? (
            <CountTiles
              items={[
                { key: "all", label: "Yayın", value: list.data.length, icon: "tv-outline", tone: "brand" },
                { key: "live", label: "Yayında", value: list.data.filter((b) => b.isLive).length, icon: "radio-outline", tone: "live" },
                { key: "guests", label: "Konuk", value: list.data.reduce((n, b) => n + (b.guests?.length || 0), 0), icon: "mic-outline", tone: "accent" },
              ]}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <Touchable feedback="card" onPress={() => setOpenId(item.id)} style={styles.card} accessibilityRole="button" accessibilityLabel={`${item.name}, ${item.isLive ? "yayın açık" : "kapalı"}`}>
            {item.isLive ? <GlowRim radius={radius.xl} /> : null}
            {/* Mini monitör: yayın ekranının o anki sahnesi. */}
            <View style={styles.monitor}>
              <LinearGradient colors={item.isLive ? colors.gradientLive : colors.gradientInk} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <View style={styles.monitorTop}>
                {item.isLive ? <LiveBadge size="sm" /> : <Text style={styles.offAir} {...textScale.badge}>KAPALI</Text>}
              </View>
              <Text style={styles.scene} numberOfLines={2} {...textScale.dense}>
                {sceneLabel(item.scene.type)}
              </Text>
              <View style={styles.ticker}>
                <Text style={styles.tickerText} numberOfLines={1} {...textScale.badge}>
                  {item.tickerVisible && item.tickerText ? item.tickerText : item.brandTitle || "ElitLig Panorama"}
                </Text>
              </View>
            </View>
            <View style={styles.body}>
              <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
                {item.name}
              </Text>
              {item.episodeTitle ? (
                <Text style={styles.sub} numberOfLines={2} {...textScale.dense}>
                  {item.episodeTitle}
                </Text>
              ) : null}
              <View style={styles.badges}>
                <Badge label={catalog.data?.layouts.find((l) => l.value === item.layout)?.label ?? item.layout} tone="brand" icon="grid-outline" size="xs" />
                {item.guests?.length ? <Badge label={`${item.guests.length} konuk`} icon="mic-outline" size="xs" /> : null}
                {nationwide ? <Badge label={cities.data?.find((c) => c.id === item.cityId)?.label ?? `İl #${item.cityId}`} icon="location-outline" size="xs" /> : null}
              </View>
              {item.updatedAt ? (
                <Text style={styles.meta} {...textScale.dense}>
                  Son sahne {timeAgo(item.updatedAt)}
                </Text>
              ) : null}
            </View>
          </Touchable>
        )}
      />
      <FormSheet
        visible={creating}
        onClose={() => setCreating(false)}
        title="Yeni yayın"
        submitLabel="Oluştur"
        fields={fields}
        initial={{ layout: "duo" }}
        onSubmit={(v) =>
          create.mutateAsync({
            name: String(v.name ?? "").trim(),
            episodeTitle: String(v.episodeTitle ?? ""),
            layout: (v.layout as "solo" | "duo" | "trio") ?? "duo",
            ...(nationwide && v.cityId ? { cityId: Number(v.cityId) } : {}),
          })
        }
      />
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", gap: space.md, padding: space.sm, paddingRight: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  monitor: { width: 128, aspectRatio: 16 / 10, borderRadius: radius.lg, overflow: "hidden", padding: space.sm, justifyContent: "space-between" },
  monitorTop: { flexDirection: "row" },
  offAir: { ...type.nano, color: colors.onDarkMuted, paddingHorizontal: 5, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.inkPill },
  scene: { ...type.labelSm, color: colors.onDark },
  ticker: { marginHorizontal: -space.sm, marginBottom: -space.sm, paddingHorizontal: space.sm, paddingVertical: 2, backgroundColor: colors.inkPill },
  tickerText: { ...type.nano, color: colors.onDark },
  body: { flex: 1, minWidth: 0, gap: 3, paddingVertical: space.xs },
  title: { ...type.h4, color: colors.textPrimary },
  sub: { ...type.caption, color: colors.textSecondary },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  meta: { ...type.micro, color: colors.textTertiary },
});
