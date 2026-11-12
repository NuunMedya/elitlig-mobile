/**
 * HAFTANIN ENLERİ — haftanın oyuncusu, mevki enleri, takımı ve kadrosu.
 *
 * Web: pages/management/weeklyAwards/WeeklyAwards.js. Liste (durum süzgeci +
 * arama) → sete dokununca dört adımlı düzenleyici
 * (components/admin/weeklyAwards/AwardSetEditor). Basılı tutunca hızlı
 * eylemler: yayından al (piyasa değeri korunur), taslağa al (etki geri alınır),
 * yeniden yayınla, sil (yalnız taslak / arşiv; weekly_awards.delete).
 */

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";

import { ActionSheet, AdminList, AdminScreen, confirmAction, useAdminMutation } from "@/components/admin";
import { StatusTiles, toneColor } from "@/components/admin/matches/opsKit";
import { AwardSetEditor } from "@/components/admin/weeklyAwards/AwardSetEditor";
import { Badge, FAB, GradientBar, Touchable, useToast, type Tone } from "@/components/ui";
import { colors, hairline, radius, space, textScale, type } from "@/theme";
import { hasAnyPermission } from "@/lib/admin/access";
import { errorText } from "@/lib/admin/errors";
import { formatDate } from "@/lib/admin/format";
import {
  deleteAwardSet,
  emptyAwardForm,
  formFromSet,
  getAwardSet,
  listAwardSets,
  publishAwardSet,
  SET_STATUS_LABELS,
  unpublishAwardSet,
  withdrawAwardSet,
  type AdminAwardSet,
  type AwardForm,
} from "@/lib/api/admin/weeklyAwards";
import { useAuth } from "@/providers/AuthProvider";

const PERMS = ["weekly_awards.view", "weekly_awards.update"] as const;

const FILTERS = [
  { key: "ALL", label: "Tümü" },
  { key: "DRAFT", label: "Taslak" },
  { key: "PUBLISHED", label: "Yayında" },
  { key: "UNPUBLISHED", label: "Yayından alındı" },
];

export default function WeeklyAwardsAdminScreen() {
  const auth = useAuth();
  const toast = useToast();
  const canCreate = hasAnyPermission(auth.user, ["weekly_awards.create"]);
  const canPublish = hasAnyPermission(auth.user, ["weekly_awards.publish"]);
  const canUnpublish = hasAnyPermission(auth.user, ["weekly_awards.unpublish"]);
  const canDelete = hasAnyPermission(auth.user, ["weekly_awards.delete"]);
  const [status, setStatus] = useState("ALL");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<AwardForm | null>(null);
  const [menu, setMenu] = useState<AdminAwardSet | null>(null);

  const list = useQuery({ queryKey: ["admin", "weeklyAwards", "list"], queryFn: () => listAwardSets(), enabled: !editing });
  const invalidate = [["admin", "weeklyAwards", "list"]];
  const withdraw = useAdminMutation((s: AdminAwardSet) => withdrawAwardSet(s.id), { success: "Yayından alındı. Oyuncuların piyasa değeri korunuyor.", invalidate });
  const unpublish = useAdminMutation((s: AdminAwardSet) => unpublishAwardSet(s.id), { success: "Taslağa alındı. Ödülün piyasa değeri etkisi geri alındı.", invalidate });
  const republish = useAdminMutation((s: AdminAwardSet) => publishAwardSet(s.id), {
    success: (r) => (r.warnings?.length ? `Yeniden yayınlandı · ${r.warnings.length} doğrulama uyarısı var.` : "Yeniden yayınlandı. Anasayfada tekrar görünecek."),
    invalidate,
  });
  const remove = useAdminMutation((s: AdminAwardSet) => deleteAwardSet(s.id), { success: "Ödül seti silindi.", invalidate });

  const open = async (id: number) => {
    try {
      setEditing(formFromSet(await getAwardSet(id)));
    } catch (e) {
      toast.show({ message: errorText(e), tone: "danger" });
    }
  };

  if (editing) {
    return (
      <AdminScreen title={editing.id ? editing.title || "Ödül seti" : "Yeni ödül seti"} subtitle="Haftanın enleri" permission={PERMS}>
        <AwardSetEditor initial={editing} onClose={() => setEditing(null)} />
      </AdminScreen>
    );
  }

  const nameOf = (s: AdminAwardSet) => s.title || `${formatDate(s.start_date)} – ${formatDate(s.end_date)}`;
  const items = (list.data ?? []).filter((s) => (status === "ALL" || s.status === status) && (!q.trim() || nameOf(s).toLocaleLowerCase("tr-TR").includes(q.trim().toLocaleLowerCase("tr-TR"))));

  return (
    <AdminScreen
      title="Haftanın enleri"
      subtitle="Haftanın oyuncusu, kadrosu ve ödüller"
      permission={PERMS}
      scroll={false}
      overlay={canCreate ? <FAB icon="add" label="Yeni set" extended onPress={() => setEditing(emptyAwardForm())} accessibilityLabel="Yeni ödül seti" /> : null}
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
        searchPlaceholder="Set ara"
        filters={FILTERS.map((f) => ({ ...f, count: f.key === "ALL" ? list.data?.length : list.data?.filter((s) => s.status === f.key).length }))}
        filter={status}
        onFilter={setStatus}
        emptyIcon="ribbon-outline"
        emptyTitle="Ödül seti yok"
        emptyBody="Haftanın oyuncusunu, mevki enlerini ve kadroyu seçip yayınla."
        keyExtractor={(s) => String(s.id)}
        extraHeader={
          list.data?.length ? (
            <StatusTiles
              items={[
                { key: "DRAFT", label: "Taslak", value: list.data.filter((s) => s.status === "DRAFT").length, tone: "neutral", icon: "create-outline" },
                { key: "PUBLISHED", label: "Yayında", value: list.data.filter((s) => s.status === "PUBLISHED").length, tone: "win", icon: "megaphone-outline" },
                { key: "UNPUBLISHED", label: "Alındı", value: list.data.filter((s) => s.status === "UNPUBLISHED").length, tone: "warn", icon: "eye-off-outline" },
              ]}
              value={status === "ALL" ? null : (status as "DRAFT")}
              onChange={(k) => setStatus(k ?? "ALL")}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <AwardCard set={item} name={nameOf(item)} onPress={() => void open(item.id)} onLongPress={() => setMenu(item)} />
        )}
      />
      <ActionSheet
        visible={menu != null}
        onClose={() => setMenu(null)}
        title={menu ? nameOf(menu) : undefined}
        actions={[
          { label: "Düzenle", icon: "create-outline", onPress: () => menu && void open(menu.id) },
          { label: "Yayından al", hint: "Piyasa değeri korunur", icon: "eye-off-outline", hidden: !canUnpublish || menu?.status !== "PUBLISHED", onPress: () => menu && withdraw.mutate(menu) },
          {
            label: "Taslağa al",
            hint: "Piyasa değeri etkisi geri alınır",
            icon: "arrow-undo-outline",
            hidden: !canUnpublish || (menu?.status !== "PUBLISHED" && menu?.status !== "UNPUBLISHED"),
            onPress: async () => {
              const s = menu;
              if (s && (await confirmAction({ title: "Taslağa alınsın mı?", message: "Piyasa değeri etkisi geri alınır.", confirmLabel: "Taslağa al", destructive: true }))) unpublish.mutate(s);
            },
          },
          { label: "Yeniden yayınla", icon: "megaphone-outline", hidden: !canPublish || menu?.status !== "UNPUBLISHED", onPress: () => menu && republish.mutate(menu) },
          {
            label: "Sil",
            icon: "trash-outline",
            danger: true,
            hidden: !canDelete || menu?.status === "PUBLISHED" || menu?.status === "UNPUBLISHED",
            onPress: async () => {
              const s = menu;
              if (s && (await confirmAction({ title: `“${nameOf(s)}” silinsin mi?`, confirmLabel: "Sil", destructive: true }))) remove.mutate(s);
            },
          },
        ]}
      />
    </AdminScreen>
  );
}

const STATUS_TONE: Record<string, Tone> = { DRAFT: "neutral", PUBLISHED: "win", UNPUBLISHED: "warn", ARCHIVED: "neutral" };

/** Ödül rafı: yedi kategori pulu (dolu = seçildi) + 11 kişilik kadro. */
const SHELF: { type: string; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { type: "WEEKLY_PLAYER", icon: "star", label: "Oyuncu" },
  { type: "WEEKLY_GOALKEEPER", icon: "hand-left", label: "Kaleci" },
  { type: "WEEKLY_DEFENDER", icon: "shield", label: "Defans" },
  { type: "WEEKLY_MIDFIELDER", icon: "swap-horizontal", label: "Orta" },
  { type: "WEEKLY_FORWARD", icon: "football", label: "Forvet" },
  { type: "WEEKLY_FAIR_PLAY", icon: "heart", label: "Fair play" },
  { type: "WEEKLY_TEAM", icon: "people", label: "Takım" },
];

/**
 * Ödül seti kartı: solda hafta pulu (başlık numarası + tarih aralığı), sağda
 * durum; altında ödül rafı ve kadro doluluk çubuğu. Basılı tutunca eylemler.
 */
function AwardCard({ set, name, onPress, onLongPress }: { set: AdminAwardSet; name: string; onPress: () => void; onLongPress: () => void }) {
  const items = set.items ?? [];
  const has = (t: string) => items.some((i) => i.award_type === t && (i.player_id || i.team_id));
  const squad = items.filter((i) => i.award_type === "WEEKLY_SQUAD_PLAYER" && i.player_id).length;
  const filled = SHELF.filter((x) => has(x.type)).length;
  const tone = STATUS_TONE[set.status] ?? "neutral";
  const week = (set.title ?? "").match(/\d+/)?.[0];
  return (
    <Touchable
      feedback="card"
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${SET_STATUS_LABELS[set.status] ?? set.status}, ${filled} ödül, kadroda ${squad} oyuncu`}
      accessibilityHint="Eylemler için basılı tut"
    >
      <View style={[styles.rail, { backgroundColor: toneColor(tone) }]} />
      <View style={styles.head}>
        <View style={styles.week}>
          <Text style={styles.weekNo} {...textScale.badge}>
            {week ?? "—"}
          </Text>
          <Text style={styles.weekLabel} {...textScale.badge}>
            HAFTA
          </Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
            {name}
          </Text>
          <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
            {formatDate(set.start_date)} – {formatDate(set.end_date)}
            {set.formation ? ` · ${set.formation}` : ""}
          </Text>
        </View>
        <Badge label={SET_STATUS_LABELS[set.status] ?? set.status} tone={tone} size="xs" dot={set.status === "PUBLISHED"} />
      </View>
      <View style={styles.shelf}>
        {SHELF.map((x) => {
          const on = has(x.type);
          return (
            <View key={x.type} style={styles.award} accessibilityLabel={`${x.label}: ${on ? "seçildi" : "boş"}`}>
              <View style={[styles.medal, on ? styles.medalOn : null]}>
                <Ionicons name={on ? x.icon : (`${x.icon}-outline` as keyof typeof Ionicons.glyphMap)} size={14} color={on ? colors.onDark : colors.textDisabled} />
              </View>
              <Text style={[styles.awardLabel, on ? styles.awardLabelOn : null]} numberOfLines={1} {...textScale.badge}>
                {x.label}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={styles.squad}>
        <Text style={styles.squadLabel} {...textScale.badge}>
          KADRO
        </Text>
        <GradientBar value={squad / 11} height={5} style={styles.flex} />
        <Text style={styles.squadValue} {...textScale.badge}>
          {squad}/11
        </Text>
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.glassLine,
    overflow: "hidden",
  },
  rail: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  week: {
    width: 46,
    height: 46,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandDim,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
  },
  weekNo: { ...type.scoreSm, color: colors.brandAccent },
  weekLabel: { ...type.nano, color: colors.textTertiary },
  title: { ...type.h3, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textTertiary, marginTop: space.xxs },
  shelf: { flexDirection: "row", justifyContent: "space-between" },
  award: { alignItems: "center", gap: space.xxs, width: 44 },
  medal: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
  },
  medalOn: { backgroundColor: colors.brand, borderStyle: "solid", borderColor: colors.brandBorder },
  awardLabel: { ...type.nano, color: colors.textDisabled },
  awardLabelOn: { color: colors.textSecondary },
  squad: { flexDirection: "row", alignItems: "center", gap: space.sm },
  squadLabel: { ...type.overline, color: colors.textTertiary },
  squadValue: { ...type.numSmStrong, color: colors.textPrimary },
});
