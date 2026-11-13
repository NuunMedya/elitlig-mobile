/**
 * ÇÖP KUTUSU — panelden silinen kayıtlar (web pages/management/TrashBin.js).
 *
 * NE: maç, takım, oyuncu, haber, kural seti, mesaj… türlerine göre başlıklar
 * altında; tür çipleri (yalnız içinde kayıt olanlar), arama (ad, açıklama,
 * silen kişi). Kayda dokununca: çöp kutusundan çıkar (bağlı satırlarıyla geri
 * döner, trash.restore) ya da kalıcı olarak sil (onaylı, trash.purge).
 * Başlıktaki düğme seçili türü ya da tüm çöp kutusunu boşaltır (onaylı).
 *
 * İl kısıtlı yönetici yalnız kendi ilinde silinen kayıtları görür (sunucu).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ActionSheet, AdminList, AdminScreen, confirmAction, useAdminMutation } from "@/components/admin";
import { SysStage } from "@/components/admin/system/SysKit";
import { Badge, Button, IconTile, SectionHeader, Touchable } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { formatDateTime } from "@/lib/admin/format";
import { getTrash, purgeAllTrash, purgeTrash, restoreTrash, systemKeys, type TrashItem } from "@/lib/api/admin/system";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

const PERMS = ["trash.view"];

type Row = TrashItem & { groupLabel: string; groupKey: string };

export default function TrashScreen() {
  const auth = useAuth();
  const canRestore = hasAnyPermission(auth.user, ["trash.restore"]);
  const canPurge = hasAnyPermission(auth.user, ["trash.purge"]);

  const [type_, setType] = useState("all");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<Row | null>(null);

  const query = useQuery({ queryKey: systemKeys.trash, queryFn: () => getTrash() });
  const groups = query.data?.groups ?? [];

  // Süzme istemcide: liste tek istekte bütün gelir, her tuşta sunucuya gidilmez.
  const rows = useMemo<Row[]>(() => {
    const needle = q.trim().toLocaleLowerCase("tr-TR");
    return groups
      .filter((g) => type_ === "all" || g.key === type_)
      .flatMap((g) =>
        g.items
          .filter((it) => !needle || `${it.label} ${it.summary ?? ""} ${it.deletedByName ?? ""}`.toLocaleLowerCase("tr-TR").includes(needle))
          .map((it) => ({ ...it, groupLabel: g.label, groupKey: g.key }))
      );
  }, [groups, type_, q]);

  const invalidate = [systemKeys.trash];
  const restore = useAdminMutation((it: Row) => restoreTrash(it.id), {
    success: (r, it) => r.message || `“${it.label}” geri alındı.`,
    invalidate,
  });
  const purge = useAdminMutation((it: Row) => purgeTrash(it.id), {
    success: (r, it) => r.message || `“${it.label}” kalıcı olarak silindi.`,
    invalidate,
  });
  const purgeAll = useAdminMutation((t: string | undefined) => purgeAllTrash(t), {
    success: (r) => r.message || "Çöp kutusu boşaltıldı.",
    invalidate,
  });

  const askPurge = async (it: Row) => {
    const ok = await confirmAction({
      title: "Kalıcı olarak silinsin mi?",
      message: `“${it.label}” kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
      confirmLabel: "Kalıcı sil",
      destructive: true,
    });
    if (ok) purge.mutate(it);
  };

  const askPurgeAll = async () => {
    const group = type_ !== "all" ? groups.find((g) => g.key === type_) : null;
    const count = group ? group.count : query.data?.total ?? 0;
    const ok = await confirmAction({
      title: group ? `“${group.label}” boşaltılsın mı?` : "Çöp kutusu boşaltılsın mı?",
      message: `${count} kayıt kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
      confirmLabel: "Boşalt",
      destructive: true,
    });
    if (ok) purgeAll.mutate(group ? group.key : undefined);
  };

  return (
    <AdminScreen
      title="Çöp kutusu"
      permission={PERMS}
      scroll={false}
      actions={
        canPurge && (query.data?.total ?? 0) > 0
          ? [{ icon: "trash-bin-outline", tone: "danger", accessibilityLabel: type_ === "all" ? "Çöp kutusunu boşalt" : "Bu başlığı boşalt", onPress: () => void askPurgeAll() }]
          : undefined
      }
    >
      <AdminList
        data={rows}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        refreshing={query.isRefetching}
        onRefresh={query.refetch}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Kayıt adı, açıklama veya silen kişi ara"
        filters={[
          { key: "all", label: "Tümü", count: query.data?.total },
          ...(query.data?.types ?? [])
            .map((t) => ({ t, g: groups.find((g) => g.key === t.key) }))
            .filter((x) => x.g)
            .map(({ t, g }) => ({ key: t.key, label: t.label, count: g!.count })),
        ]}
        filter={type_}
        onFilter={setType}
        extraHeader={
          <View style={styles.gap}>
            {query.data ? (
              <SysStage
                eyebrow="Geri alınabilir"
                title="Silinen kayıtlar burada bekler"
                icon="trash"
                tone="red"
                value={query.data.total}
                valueLabel="kayıt"
                stats={[
                  { label: "Başlık", value: groups.length, icon: "folder-open" },
                  { label: "Bağlı", value: groups.reduce((n, g) => n + g.items.reduce((m, it) => m + (it.relatedCount || 0), 0), 0), icon: "link", tone: "info" },
                ]}
              />
            ) : null}
            {!canRestore && !canPurge ? (
              <View style={styles.notice}>
                <Ionicons name="information-circle-outline" size={16} color={colors.info} />
                <Text style={styles.noticeText} {...textScale.long}>
                  Çöp kutusunu görüntüleyebiliyorsun ancak geri alma veya kalıcı silme yetkin yok.
                </Text>
              </View>
            ) : null}
          </View>
        }
        keyExtractor={(it) => String(it.id)}
        emptyIcon="trash-outline"
        emptyTitle={query.data?.total ? "Aramayla eşleşen kayıt yok" : "Çöp kutusu boş"}
        emptyBody={query.data?.total ? undefined : "Silinen kayıtlar burada görünür."}
        renderItem={({ item, index }) => (
          <View style={styles.gap}>
            {index === 0 || rows[index - 1]?.groupKey !== item.groupKey ? (
              <SectionHeader
                title={item.groupLabel}
                meta={`${groups.find((g) => g.key === item.groupKey)?.count ?? 0} kayıt`}
                icon={trashIcon(item.groupKey)}
                iconTone="neutral"
                size="group"
              />
            ) : null}
            <Touchable
              feedback="card"
              onPress={canRestore || canPurge ? () => setActive(item) : undefined}
              disabled={!canRestore && !canPurge}
              style={styles.card}
              accessibilityRole="button"
              accessibilityLabel={`${item.label}${item.summary ? `, ${item.summary}` : ""}`}
            >
              <View style={styles.cardHead}>
                <IconTile icon={trashIcon(item.groupKey)} tone="neutral" size={40} glow={false} />
                <View style={styles.flex}>
                  <Text style={styles.title} numberOfLines={2} {...textScale.dense}>
                    {item.label}
                  </Text>
                  {item.summary ? (
                    <Text style={styles.sub} numberOfLines={1} {...textScale.dense}>
                      {item.summary}
                    </Text>
                  ) : null}
                  <View style={styles.metaRow}>
                    <Ionicons name="time-outline" size={11} color={colors.textTertiary} />
                    <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
                      {[item.deletedAt ? formatDateTime(item.deletedAt) : null, item.deletedByName ? `Silen: ${item.deletedByName}` : null].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                </View>
                {item.relatedCount > 0 ? <Badge label={`+${item.relatedCount} bağlı`} tone="info" icon="link" size="xs" /> : null}
              </View>
              {canRestore || canPurge ? (
                <View style={styles.actions}>
                  {canRestore ? (
                    <Button label="Geri yükle" icon="arrow-undo" size="sm" variant="secondary" onPress={() => restore.mutate(item)} style={styles.flex} />
                  ) : null}
                  {canPurge ? <Button label="Kalıcı sil" icon="trash-outline" size="sm" variant="danger" onPress={() => void askPurge(item)} style={styles.flex} /> : null}
                </View>
              ) : null}
            </Touchable>
          </View>
        )}
      />

      <ActionSheet
        visible={active != null}
        onClose={() => setActive(null)}
        title={active?.label}
        actions={
          active
            ? [
                {
                  label: "Çöp kutusundan çıkar",
                  hint: "Kayıt bağlı satırlarıyla birlikte geri döner",
                  icon: "arrow-undo-outline",
                  hidden: !canRestore,
                  onPress: () => restore.mutate(active),
                },
                {
                  label: "Kalıcı olarak sil",
                  hint: "Yedek de silinir, dönüşü yoktur",
                  icon: "trash-outline",
                  danger: true,
                  hidden: !canPurge,
                  onPress: () => void askPurge(active),
                },
              ]
            : []
        }
      />
    </AdminScreen>
  );
}

const TRASH_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  team: "shield",
  player: "person",
  news: "newspaper",
  staff: "briefcase",
  match: "football",
  league: "trophy",
  user: "id-card",
};
const trashIcon = (key: string) => TRASH_ICONS[key] ?? "document";

const styles = StyleSheet.create({
  gap: { gap: space.sm },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  card: { gap: space.md, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  title: { ...type.h4, color: colors.textPrimary },
  sub: { ...type.bodySm, color: colors.textSecondary },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { ...type.caption, color: colors.textTertiary, flexShrink: 1 },
  actions: { flexDirection: "row", gap: space.sm, paddingTop: space.sm, borderTopWidth: hairline, borderTopColor: colors.separator },
  section: { ...type.overline, color: colors.textTertiary, marginTop: space.sm },
  notice: {
    flexDirection: "row",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.infoDim,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  noticeText: { ...type.caption, color: colors.textSecondary, flex: 1 },
});
