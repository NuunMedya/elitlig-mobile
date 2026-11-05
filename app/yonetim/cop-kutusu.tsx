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

import { ActionSheet, AdminList, AdminScreen, RecordCard, StatRow, confirmAction, useAdminMutation } from "@/components/admin";
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
              <StatRow
                items={[
                  { label: "Kayıt", value: query.data.total },
                  { label: "Başlık", value: groups.length },
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
              <Text style={styles.section} {...textScale.dense}>
                {item.groupLabel.toLocaleUpperCase("tr-TR")} · {groups.find((g) => g.key === item.groupKey)?.count ?? 0}
              </Text>
            ) : null}
            <RecordCard
              title={item.label}
              subtitle={item.summary}
              meta={[item.deletedByName ? `Silen: ${item.deletedByName}` : null, item.deletedAt ? formatDateTime(item.deletedAt) : null].filter(Boolean).join(" · ")}
              icon="trash-outline"
              badges={[item.relatedCount > 0 ? { label: `${item.relatedCount} bağlı kayıt`, tone: "info" } : null]}
              onPress={canRestore || canPurge ? () => setActive(item) : undefined}
            />
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

const styles = StyleSheet.create({
  gap: { gap: space.sm },
  section: { ...type.overline, color: colors.textTertiary, marginTop: space.sm },
  notice: {
    flexDirection: "row",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.infoDim,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  noticeText: { ...type.caption, color: colors.textSecondary, flex: 1 },
});
