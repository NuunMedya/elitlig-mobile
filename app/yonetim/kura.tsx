/**
 * KURA ÇEKİMİ — grup ve eleme ağacı kuraları, torba prensibiyle.
 *
 * Web: pages/management/draws/DrawAdmin.js. Liste (arama + durum süzgeci)
 * → kuraya dokununca üç adımlı düzenleyici (components/admin/draws/DrawEditor).
 * Çekiliş tohumla kaydedilir; aynı kura gerektiğinde birebir yeniden üretilir.
 * Silme yetkisi ayrıdır (draws.delete) ve onay ister.
 */

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { AdminList, AdminScreen, ActionSheet, confirmAction, useAdminMutation } from "@/components/admin";
import { InfoPill, StatusTiles, toneColor } from "@/components/admin/matches/opsKit";
import { DrawEditor } from "@/components/admin/draws/DrawEditor";
import { Badge, FAB, GradientBar, IconTile, SkeletonCard, TeamLogo, Touchable, useToast, type Tone } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { hasAnyPermission } from "@/lib/admin/access";
import { timeAgo } from "@/lib/admin/format";
import { deleteDraw, DRAW_STATUS_LABELS, getDraw, listDraws, type Draw } from "@/lib/api/admin/draws";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

const PERMS = ["draws.view", "draws.run"] as const;

const STATUS_FILTERS = [
  { key: "ALL", label: "Tümü" },
  { key: "SETUP", label: "Kurulum" },
  { key: "READY", label: "Çekilişe hazır" },
  { key: "COMPLETED", label: "Tamamlandı" },
];

export default function DrawsScreen() {
  const auth = useAuth();
  const canCreate = hasAnyPermission(auth.user, ["draws.create"]);
  const canDelete = hasAnyPermission(auth.user, ["draws.delete"]);
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<{ draw: Draw | null } | null>(null);
  const [opening, setOpening] = useState(false);
  const [menu, setMenu] = useState<Draw | null>(null);
  const toast = useToast();

  const query = useQuery({ queryKey: ["admin", "draws", "list", status, search], queryFn: () => listDraws({ status, search }), enabled: !editor });
  const remove = useAdminMutation((id: number) => deleteDraw(id), { success: "Kura silindi.", invalidate: [["admin", "draws", "list"]] });

  const open = async (id: number) => {
    setOpening(true);
    try {
      setEditor({ draw: await getDraw(id) });
    } catch (error) {
      toast.show({ message: errorText(error), tone: "danger" });
    } finally {
      setOpening(false);
    }
  };

  if (editor) {
    return (
      <AdminScreen title={editor.draw?.name || "Yeni kura"} subtitle="Kura çekimi" permission={PERMS}>
        <DrawEditor initial={editor.draw} onClose={() => setEditor(null)} />
      </AdminScreen>
    );
  }

  return (
    <AdminScreen
      title="Kura çekimi"
      subtitle="Torbalar, grup ve eleme kuraları"
      permission={PERMS}
      scroll={false}
      overlay={canCreate ? <FAB icon="add" label="Yeni kura" extended onPress={() => setEditor({ draw: null })} accessibilityLabel="Yeni kura" /> : null}
    >
      {opening ? (
        <ScrollView contentContainerStyle={styles.loading}>
          <SkeletonCard />
        </ScrollView>
      ) : (
        <AdminList
          data={query.data?.items}
          loading={query.isLoading}
          error={query.error}
          onRetry={query.refetch}
          refreshing={query.isRefetching}
          onRefresh={query.refetch}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Kura adı"
          filters={STATUS_FILTERS}
          filter={status}
          onFilter={setStatus}
          emptyIcon="shuffle-outline"
          emptyTitle="Kura yok"
          emptyBody="Grup ve eleme ağacı kuralarını torba prensibine göre çek."
          keyExtractor={(d) => String(d.id)}
          extraHeader={
            status === "ALL" && query.data?.items?.length ? (
              <StatusTiles
                items={(["SETUP", "READY", "COMPLETED"] as const).map((key) => ({
                  key,
                  label: key === "SETUP" ? "Kurulum" : key === "READY" ? "Hazır" : "Çekildi",
                  value: (query.data?.items ?? []).filter((d) => d.status === key).length,
                  tone: STATUS_TONE[key],
                  icon: key === "SETUP" ? ("construct-outline" as const) : key === "READY" ? ("shuffle-outline" as const) : ("checkmark-done-outline" as const),
                }))}
                value={null}
                onChange={(k) => k && setStatus(k)}
              />
            ) : null
          }
          renderItem={({ item }) => (
            <DrawCard draw={item} onPress={() => void open(item.id)} onLongPress={canDelete ? () => setMenu(item) : undefined} />
          )}
        />
      )}
      <ActionSheet
        visible={menu != null}
        onClose={() => setMenu(null)}
        title={menu?.name}
        actions={[
          { label: "Aç", icon: "open-outline", onPress: () => menu && void open(menu.id) },
          {
            label: "Kurayı sil",
            icon: "trash-outline",
            danger: true,
            onPress: async () => {
              const d = menu;
              if (!d) return;
              if (await confirmAction({ title: "Kura silinsin mi?", message: `“${d.name}” torbaları ve sonucuyla birlikte silinecek.`, confirmLabel: "Sil", destructive: true })) remove.mutate(d.id);
            },
          },
        ]}
      />
    </AdminScreen>
  );
}

const STATUS_TONE: Record<string, Tone> = { SETUP: "neutral", READY: "accent", COMPLETED: "win" };
const STAGES = ["SETUP", "READY", "COMPLETED"] as const;

/**
 * Kura kartı: biçim simgesi + ad, torba topları (her torbanın doluluğu),
 * kadro doluluk çubuğu, üç duraklı durum şeridi (Kurulum → Hazır → Çekildi).
 * Çekilmiş grup kurasında grupların ilk takımları logolarla önizlenir.
 */
function DrawCard({ draw, onPress, onLongPress }: { draw: Draw; onPress: () => void; onLongPress?: () => void }) {
  const tone = STATUS_TONE[draw.status] ?? "neutral";
  const stage = Math.max(0, STAGES.indexOf(draw.status as (typeof STAGES)[number]));
  const filled = draw.selectedTeamCount ?? draw.pots?.reduce((n, p) => n + (p.teams?.length ?? 0), 0) ?? 0;
  const groups = draw.result?.groups ?? [];
  return (
    <Touchable
      feedback="card"
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={`${draw.name}, ${DRAW_STATUS_LABELS[draw.status] || draw.status}, ${draw.teamCount} takım`}
      accessibilityHint={onLongPress ? "Silmek için basılı tut" : undefined}
    >
      <View style={[styles.rail, { backgroundColor: toneColor(tone) }]} />
      <View style={styles.head}>
        <IconTile icon={draw.format === "GROUP" ? "grid" : "git-network"} tone={draw.format === "GROUP" ? "violet" : "cyan"} size={42} />
        <View style={styles.flex}>
          <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
            {draw.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
            {draw.format === "GROUP" ? `Grup kurası · ${draw.groupCount ?? "?"} grup` : "Eleme ağacı"}
            {draw.updatedAt ? ` · ${timeAgo(draw.updatedAt)}` : ""}
          </Text>
        </View>
        <Badge label={DRAW_STATUS_LABELS[draw.status] || draw.status} tone={tone} size="xs" />
      </View>

      {/* Torba topları: her torba bir top; içindeki sayı takım/kapasite. */}
      <View style={styles.pots}>
        {(draw.pots ?? []).map((pot) => {
          const full = (pot.teams?.length ?? 0) >= pot.capacity;
          return (
            <View key={pot.potNumber} style={[styles.pot, full ? styles.potFull : null]}>
              <Text style={[styles.potNo, full ? styles.potNoFull : null]} {...textScale.badge}>
                {pot.potNumber}
              </Text>
              <Text style={styles.potCount} {...textScale.badge}>
                {pot.teams?.length ?? 0}/{pot.capacity}
              </Text>
            </View>
          );
        })}
        <View style={styles.flex} />
        <InfoPill icon="people-outline" label={`${filled}/${draw.teamCount} takım`} tone={filled >= draw.teamCount ? "win" : "warn"} />
      </View>
      <GradientBar value={draw.teamCount ? filled / draw.teamCount : 0} height={4} />

      {groups.length ? (
        <View style={styles.groups}>
          {groups.slice(0, 4).map((g) => (
            <View key={g.index} style={styles.group}>
              <Text style={styles.groupName} numberOfLines={1} {...textScale.badge}>
                {g.name}
              </Text>
              <View style={styles.groupLogos}>
                {g.teams.slice(0, 4).map((t) => (
                  <TeamLogo key={t.teamId} name={t.teamName} logo={t.teamLogo} size={18} />
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* Durum şeridi */}
      <View style={styles.stages}>
        {STAGES.map((key, i) => {
          const done = i <= stage;
          return (
            <View key={key} style={styles.stage}>
              <View style={[styles.stageDot, done ? { backgroundColor: toneColor(i === stage ? tone : "win") } : null]}>
                {done ? <Ionicons name={i < stage || draw.status === "COMPLETED" ? "checkmark" : "ellipse"} size={9} color={colors.textOnStatus} /> : null}
              </View>
              <Text style={[styles.stageText, done ? styles.stageTextOn : null]} numberOfLines={1} {...textScale.badge}>
                {key === "SETUP" ? "Kurulum" : key === "READY" ? "Hazır" : "Çekildi"}
              </Text>
              {i < STAGES.length - 1 ? <View style={[styles.stageLine, i < stage ? styles.stageLineOn : null]} /> : null}
            </View>
          );
        })}
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  loading: { padding: layout.screenPadding, gap: space.md },
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
  title: { ...type.h3, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textTertiary, marginTop: space.xxs },
  pots: { flexDirection: "row", alignItems: "center", gap: space.s },
  pot: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  potFull: { backgroundColor: colors.brandDim, borderColor: colors.brandBorder },
  potNo: { ...type.numSmStrong, color: colors.textSecondary, lineHeight: 13 },
  potNoFull: { color: colors.brandAccent },
  potCount: { ...type.nano, color: colors.textTertiary },
  groups: { flexDirection: "row", gap: space.xs },
  group: {
    flex: 1,
    minWidth: 0,
    gap: space.xs,
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
  },
  groupName: { ...type.overline, color: colors.brandAccent },
  groupLogos: { flexDirection: "row", gap: 2, flexWrap: "wrap" },
  stages: { flexDirection: "row", alignItems: "center" },
  stage: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.xs },
  stageDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface3,
  },
  stageText: { ...type.labelXs, color: colors.textTertiary },
  stageTextOn: { color: colors.textPrimary },
  stageLine: { flex: 1, height: 2, borderRadius: 1, backgroundColor: colors.surface3, marginHorizontal: space.xs },
  stageLineOn: { backgroundColor: colors.win },
});
