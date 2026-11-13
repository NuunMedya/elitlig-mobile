/**
 * JUNIOR CUP — özel lig sayfaları (lig portalları).
 *
 * Web: pages/management/leaguePortals/LeaguePortalsAdmin.js. Liste →
 * sayfaya dokununca düzenleyici (genel, ligler, renkler, üst menü, anasayfa,
 * görünüm). Sayfa elitlig.com/<adres> altında yayınlanır; listeden adres
 * açılır ya da kopyalanır. Silme onay ister ve geri alınamaz.
 */

import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";

import { ActionSheet, AdminList, AdminScreen, confirmAction, useAdminMutation } from "@/components/admin";
import { InfoPill, StatusTiles } from "@/components/admin/matches/opsKit";
import { PortalEditor } from "@/components/admin/portals/PortalEditor";
import { Badge, Button, FAB, TeamLogo, Touchable, useToast } from "@/components/ui";
import { colors, hairline, radius, space, textScale, type } from "@/theme";
import { hasAnyPermission } from "@/lib/admin/access";
import { timeAgo } from "@/lib/admin/format";
import { WEB_BASE_URL } from "@/lib/config";
import { mediaUrl } from "@/lib/format";
import {
  createPortal,
  deletePortal,
  emptyPortal,
  getPortalCatalog,
  listPortals,
  portalPayload,
  updatePortal,
  type LeaguePortal,
  type PortalPayload,
} from "@/lib/api/admin/portals";
import { useAuth } from "@/providers/AuthProvider";

const PERMS = ["league_portals.view", "league_portals.manage"] as const;

export default function LeaguePortalsScreen() {
  const auth = useAuth();
  const toast = useToast();
  const canManage = hasAnyPermission(auth.user, ["league_portals.manage"]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<LeaguePortal | "new" | null>(null);
  const [menu, setMenu] = useState<LeaguePortal | null>(null);

  const catalog = useQuery({ queryKey: ["admin", "portals", "catalog"], queryFn: getPortalCatalog, staleTime: 600_000 });
  const list = useQuery({ queryKey: ["admin", "portals", "list"], queryFn: listPortals });

  // Düzenleyicide lig adları için: sayfalarda görülen ligler.
  const knownLeagues = useMemo(() => {
    const map: Record<number, { label: string; cityId: number | null }> = {};
    (list.data ?? []).forEach((p) => (p.leagues ?? []).forEach((l) => (map[l.id] = { label: l.label, cityId: l.cityId })));
    return map;
  }, [list.data]);

  const invalidate = [["admin", "portals", "list"]];
  const save = useAdminMutation(
    (body: PortalPayload) => (editing && editing !== "new" ? updatePortal(editing.id, body) : createPortal(body)),
    {
      success: (r) => r.message,
      invalidate,
      onSuccess: (r) => setEditing(r.portal),
    }
  );
  const toggle = useAdminMutation((p: LeaguePortal) => updatePortal(p.id, { active: !p.active }), {
    success: (r) => (r.portal.active ? `${r.portal.name} yayına alındı.` : `${r.portal.name} yayından kaldırıldı.`),
    invalidate,
  });
  const remove = useAdminMutation((p: LeaguePortal) => deletePortal(p.id), { success: (r) => r.message, invalidate });

  const urlOf = (p: LeaguePortal) => `${WEB_BASE_URL}/${p.slug}`;
  const askDelete = async (p: LeaguePortal) => {
    const ok = await confirmAction({
      title: "Lig sayfası silinsin mi?",
      message: `“${p.name}” sayfası ve tüm görünüm ayarları silinecek; elitlig.com/${p.slug} adresi çalışmayacak. Ligler ve sezonlar silinmez.`,
      confirmLabel: "Sil",
      destructive: true,
    });
    if (ok) {
      remove.mutate(p);
      setEditing(null);
    }
  };

  if (editing) {
    const isNew = editing === "new";
    return (
      <AdminScreen
        title={isNew ? "Yeni lig sayfası" : editing.name}
        subtitle={isNew ? "Junior Cup" : `elitlig.com/${editing.slug}`}
        permission={PERMS}
        actions={!isNew ? [{ icon: "open-outline", onPress: () => void Linking.openURL(urlOf(editing)), accessibilityLabel: "Sayfayı aç" }] : undefined}
      >
        <Button label="Sayfa listesi" icon="chevron-back" variant="ghost" size="sm" onPress={() => setEditing(null)} />
        <PortalEditor
          key={isNew ? "new" : `${editing.id}-${editing.updatedAt}`}
          initial={isNew ? emptyPortal(catalog.data) : portalPayload(editing)}
          catalog={catalog.data}
          knownLeagues={knownLeagues}
          canManage={canManage}
          isNew={isNew}
          onSave={(body) => save.mutateAsync(body)}
        />
        {!isNew && canManage ? <Button label="Sayfayı sil" icon="trash-outline" variant="danger" onPress={() => void askDelete(editing)} /> : null}
      </AdminScreen>
    );
  }

  const items = (list.data ?? []).filter((p) => !q.trim() || [p.name, p.slug, p.shortName].join(" ").toLocaleLowerCase("tr-TR").includes(q.trim().toLocaleLowerCase("tr-TR")));

  return (
    <AdminScreen
      title="Junior Cup"
      subtitle="Lig portalları ve turnuva sayfaları"
      permission={PERMS}
      scroll={false}
      overlay={canManage ? <FAB icon="add" label="Yeni sayfa" extended onPress={() => setEditing("new")} accessibilityLabel="Yeni lig sayfası" /> : null}
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
        searchPlaceholder="Sayfa ara"
        emptyIcon="star-outline"
        emptyTitle="Henüz lig sayfası yok"
        emptyBody="Seçtiğin ligleri kendi logosu, renkleri ve düzeniyle kısa bir adreste yayınla."
        keyExtractor={(p) => String(p.id)}
        extraHeader={
          list.data?.length ? (
            <StatusTiles
              items={[
                { key: "live", label: "Yayında", value: list.data.filter((p) => p.active).length, tone: "win", icon: "globe-outline" },
                { key: "off", label: "Kapalı", value: list.data.filter((p) => !p.active).length, tone: "neutral", icon: "eye-off-outline" },
                { key: "leagues", label: "Bağlı lig", value: list.data.reduce((n, p) => n + p.leagueIds.length, 0), tone: "info", icon: "trophy-outline" },
              ]}
            />
          ) : null
        }
        renderItem={({ item }) => <PortalCard portal={item} onPress={() => setEditing(item)} onLongPress={() => setMenu(item)} />}
      />
      <ActionSheet
        visible={menu != null}
        onClose={() => setMenu(null)}
        title={menu?.name}
        actions={[
          { label: "Düzenle", icon: "create-outline", onPress: () => menu && setEditing(menu) },
          { label: "Sayfayı aç", icon: "open-outline", onPress: () => menu && void Linking.openURL(urlOf(menu)) },
          {
            label: "Adresi kopyala",
            icon: "copy-outline",
            onPress: async () => {
              if (!menu) return;
              await Clipboard.setStringAsync(urlOf(menu));
              toast.show({ message: "Adres kopyalandı.", tone: "success" });
            },
          },
          { label: menu?.active ? "Yayından kaldır" : "Yayına al", icon: "power-outline", hidden: !canManage, onPress: () => menu && toggle.mutate(menu) },
          { label: "Sil", icon: "trash-outline", danger: true, hidden: !canManage, onPress: () => menu && void askDelete(menu) },
        ]}
      />
    </AdminScreen>
  );
}

/**
 * Lig sayfası kartı — küçük bir tarayıcı penceresi gibi: üstte adres çubuğu
 * (kilit + elitlig.com/adres + yayın ışığı), gövdede logo, ad ve bağlı ligler.
 * Basılı tutunca eylem menüsü açılır.
 */
function PortalCard({ portal, onPress, onLongPress }: { portal: LeaguePortal; onPress: () => void; onLongPress: () => void }) {
  const leagues = portal.leagues ?? [];
  return (
    <Touchable
      feedback="card"
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.card, portal.active ? null : styles.cardOff]}
      accessibilityRole="button"
      accessibilityLabel={`${portal.name}, elitlig.com/${portal.slug}, ${portal.active ? "yayında" : "kapalı"}`}
      accessibilityHint="Eylemler için basılı tut"
    >
      <View style={styles.bar}>
        <View style={styles.dots}>
          <View style={[styles.dot, { backgroundColor: colors.danger }]} />
          <View style={[styles.dot, { backgroundColor: colors.warn }]} />
          <View style={[styles.dot, { backgroundColor: colors.win }]} />
        </View>
        <View style={styles.url}>
          <Ionicons name="lock-closed" size={10} color={colors.textTertiary} />
          <Text style={styles.urlText} numberOfLines={1} {...textScale.badge}>
            elitlig.com/<Text style={styles.urlSlug}>{portal.slug}</Text>
          </Text>
        </View>
        <View style={[styles.liveDot, { backgroundColor: portal.active ? colors.win : colors.textDisabled }]} />
      </View>
      <View style={styles.body}>
        <TeamLogo name={portal.shortName || portal.name} logo={mediaUrl(portal.logoUrl)} size={48} dimmed={!portal.active} />
        <View style={styles.flex}>
          <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
            {portal.name}
          </Text>
          <Text style={styles.meta} numberOfLines={2} {...textScale.dense}>
            {portal.seoDescription || "Açıklama yok"}
          </Text>
        </View>
        <Badge label={portal.active ? "Yayında" : "Kapalı"} tone={portal.active ? "win" : "neutral"} size="xs" dot={portal.active} />
      </View>
      <View style={styles.leagues}>
        {leagues.length ? (
          leagues.slice(0, 3).map((l) => <InfoPill key={l.id} icon="trophy-outline" label={l.label} />)
        ) : (
          <InfoPill icon="alert-circle" label="Lig seçilmedi" tone="warn" />
        )}
        {leagues.length > 3 ? <InfoPill label={`+${leagues.length - 3}`} /> : null}
        <View style={styles.flex} />
        {portal.updatedAt ? (
          <Text style={styles.time} {...textScale.badge}>
            {timeAgo(portal.updatedAt)}
          </Text>
        ) : null}
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.glassLine,
    overflow: "hidden",
  },
  cardOff: { opacity: 0.8 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.s,
    backgroundColor: colors.surface2,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  dots: { flexDirection: "row", gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 4, opacity: 0.7 },
  url: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
  },
  urlText: { ...type.caption, color: colors.textTertiary, flexShrink: 1 },
  urlSlug: { color: colors.textPrimary },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  body: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md },
  title: { ...type.h3, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textTertiary, marginTop: space.xxs },
  leagues: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs, paddingHorizontal: space.md, paddingBottom: space.md },
  time: { ...type.caption, color: colors.textTertiary },
});
