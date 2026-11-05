/**
 * TAKIM REHBERİ (web /editor/takim-rehberi — editor_pages/TeamsDirectory.js)
 *
 * Profil oluşturmuş tüm takımlar: logo, ad, yetkilisinin adı ve iletişim
 * bilgisi, kayıt türü (yetkili oluşturdu / sahiplendi / yetkilisi yok) ve
 * kayıt tarihi; en yeniden en eskiye. İl editörü yalnız kendi ilini görür
 * (sunucu kapsamı). İllere göre gruplanabilir.
 *
 * Takım notu yetkisi (teams.notes) olanlar karttaki "Notlar" ile iletişim
 * bilgisini düzenler ve iç not ekler; düzenlenen iletişim yetkilinin
 * bilgisinin önüne geçer. Uç: GET /api/admin/teams-directory.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ActionSheet, AdminList, AdminScreen, OptionSheet, StatRow } from "@/components/admin";
import { TeamNotesSheet } from "@/components/admin/contacts/TeamNotesSheet";
import { useContactActions, type ContactActions } from "@/components/admin/contacts/useContactActions";
import { Badge, Chip, ChipGroup, TeamLogo, Touchable, type Tone } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { formatDate } from "@/lib/admin/format";
import {
  effectiveTeamContact,
  listAdminTeamsDirectory,
  ORIGIN_LABELS,
  type AdminDirectoryTeam,
  type TeamOrigin,
} from "@/lib/api/admin/contacts";
import { mediaUrl } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

const PERMS = ["teams.directory"];
const ORIGIN_TONE: Record<TeamOrigin, Tone> = { created: "win", claimed: "info", unmanaged: "neutral" };

type Row = { kind: "header"; key: string; label: string; count: number } | { kind: "team"; key: string; team: AdminDirectoryTeam };

export default function TeamsDirectoryScreen() {
  const auth = useAuth();
  const router = useRouter();
  const actions = useContactActions();
  const [q, setQ] = useState("");
  const [city, setCity] = useState<string | null>(null);
  const [origin, setOrigin] = useState<TeamOrigin | null>(null);
  const [grouped, setGrouped] = useState(true);
  const [cityOpen, setCityOpen] = useState(false);
  const [menu, setMenu] = useState<AdminDirectoryTeam | null>(null);
  const [notesFor, setNotesFor] = useState<AdminDirectoryTeam | null>(null);

  const query = useQuery({
    queryKey: ["admin", "teams-directory", { q, city, origin }],
    queryFn: () => listAdminTeamsDirectory({ q, city: city ?? undefined, origin: origin ?? undefined }),
  });
  const data = query.data;
  const items = useMemo(() => data?.items ?? [], [data]);
  const canNotes = Boolean(data?.can_manage_notes);

  const counts = useMemo(
    () => ({
      created: items.filter((i) => i.origin === "created").length,
      claimed: items.filter((i) => i.origin === "claimed").length,
      unmanaged: items.filter((i) => i.origin === "unmanaged").length,
    }),
    [items]
  );

  const rows = useMemo<Row[]>(() => {
    if (!grouped) return items.map((t) => ({ kind: "team", key: `t${t.id}`, team: t }));
    const map = new Map<string, AdminDirectoryTeam[]>();
    items.forEach((t) => {
      const key = t.city || "İl belirtilmemiş";
      map.set(key, [...(map.get(key) ?? []), t]);
    });
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "tr"))
      .flatMap(([label, list]) => [
        { kind: "header" as const, key: `h-${label}`, label, count: list.length },
        ...list.map((t) => ({ kind: "team" as const, key: `t${t.id}`, team: t })),
      ]);
  }, [items, grouped]);

  const scopeText = data?.scope && !data.scope.nationwide ? `Yalnız ${data.scope.city || "ilinin"} takımları listelenir.` : null;

  const header = (
    <View style={styles.extra}>
      <StatRow
        items={[
          { label: "takım", value: items.length },
          { label: "oluşturdu", value: counts.created, tone: "win", onPress: () => setOrigin(origin === "created" ? null : "created") },
          { label: "sahiplendi", value: counts.claimed, tone: "info", onPress: () => setOrigin(origin === "claimed" ? null : "claimed") },
          { label: "yetkilisiz", value: counts.unmanaged, onPress: () => setOrigin(origin === "unmanaged" ? null : "unmanaged") },
        ]}
      />
      <ChipGroup scrollable contentPadding={0}>
        {(Object.keys(ORIGIN_LABELS) as TeamOrigin[]).map((key) => (
          <Chip key={key} label={ORIGIN_LABELS[key]} size="sm" selected={origin === key} onPress={() => setOrigin(origin === key ? null : key)} />
        ))}
        {data?.scope?.nationwide ? (
          <Chip
            label={city ?? "Tüm iller"}
            icon="location-outline"
            size="sm"
            selected={Boolean(city)}
            onPress={() => setCityOpen(true)}
            onDismiss={city ? () => setCity(null) : undefined}
          />
        ) : null}
        <Chip label="İllere göre grupla" icon="layers-outline" size="sm" selected={grouped} onPress={() => setGrouped((v) => !v)} />
      </ChipGroup>
      {scopeText ? (
        <Text style={styles.scope} {...textScale.dense}>
          {scopeText}
        </Text>
      ) : null}
    </View>
  );

  const canRehber = hasAnyPermission(auth.user, ["users.view"]);

  return (
    <AdminScreen title="Takım rehberi" subtitle="Takım yetkilileri ve iletişim" permission={PERMS} scroll={false}>
      <AdminList<Row>
        data={rows}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        refreshing={query.isRefetching}
        onRefresh={() => void query.refetch()}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Takım adı ara"
        extraHeader={header}
        emptyIcon="shield-outline"
        emptyTitle="Eşleşen takım yok"
        keyExtractor={(r) => r.key}
        renderItem={({ item }) =>
          item.kind === "header" ? (
            <View style={styles.groupHead}>
              <Ionicons name="location-outline" size={14} color={colors.textTertiary} />
              <Text style={styles.groupTitle} {...textScale.dense}>
                {item.label}
              </Text>
              <Text style={styles.groupCount} {...textScale.dense}>
                {item.count}
              </Text>
            </View>
          ) : (
            <DirectoryRow team={item.team} actions={actions} canNotes={canNotes} onPress={() => setMenu(item.team)} onNotes={() => setNotesFor(item.team)} />
          )
        }
      />

      <OptionSheet<string>
        visible={cityOpen}
        onClose={() => setCityOpen(false)}
        title="İl"
        options={(data?.cities ?? []).map((c) => ({ value: c, label: c }))}
        value={city}
        clearable
        searchable
        onSelect={(v) => setCity((v as string | null) ?? null)}
      />

      <ActionSheet
        visible={menu != null}
        onClose={() => setMenu(null)}
        title={menu?.team_name}
        actions={[
          { label: "Notlar ve iletişim bilgisi", icon: "document-text-outline", onPress: () => setNotesFor(menu), hidden: !canNotes },
          { label: "Rehber takım kartı", icon: "call-outline", hint: "Başkanlar, kadro, maçlar", onPress: () => menu && router.push(`/yonetim/araclar/rehber/takim/${menu.id}` as never), hidden: !canRehber },
          { label: "Takım sayfası", icon: "open-outline", onPress: () => menu && router.push(`/takim/${menu.id}` as never) },
          {
            label: "Takımı düzenle",
            icon: "create-outline",
            hint: "Takım yönetimi",
            onPress: () => router.push("/yonetim/takimlar" as never),
            hidden: !hasAnyPermission(auth.user, ["teams.update"]),
          },
          { label: "Yetkiliye mesaj", icon: "paper-plane-outline", onPress: () => menu?.manager && void actions.message(menu.manager.id), hidden: !menu?.manager },
        ]}
      />

      <TeamNotesSheet team={notesFor} onClose={() => setNotesFor(null)} />
    </AdminScreen>
  );
}

const DirectoryRow = React.memo(function DirectoryRow({
  team,
  actions,
  canNotes,
  onPress,
  onNotes,
}: {
  team: AdminDirectoryTeam;
  actions: ContactActions;
  canNotes: boolean;
  onPress: () => void;
  onNotes: () => void;
}) {
  const contact = effectiveTeamContact(team);
  const league = team.current_league && team.current_league !== "0" ? team.current_league : null;
  const lines: { key: string; icon: keyof typeof Ionicons.glyphMap; text: string; onPress: () => void; tone?: string }[] = [];
  if (contact.phone) lines.push({ key: "p1", icon: "call-outline", text: contact.phone, onPress: () => void actions.call(contact.phone) });
  if (contact.phone2) lines.push({ key: "p2", icon: "call-outline", text: contact.phone2, onPress: () => void actions.call(contact.phone2) });
  if (contact.whatsapp || contact.phone) {
    const wa = contact.whatsapp || contact.phone;
    lines.push({ key: "wa", icon: "logo-whatsapp", text: contact.whatsapp || "WhatsApp", onPress: () => void actions.whatsapp(wa), tone: colors.win });
  }
  if (contact.email) lines.push({ key: "em", icon: "mail-outline", text: contact.email, onPress: () => void actions.email(contact.email) });

  return (
    <Touchable onPress={onPress} style={styles.card} feedback="card" accessibilityLabel={`${team.team_name} işlemleri`}>
      <View style={styles.top}>
        <TeamLogo name={team.team_name} logo={mediaUrl(team.logo)} size={44} />
        <View style={styles.main}>
          <Text style={styles.name} numberOfLines={2} {...textScale.dense}>
            {team.team_name}
          </Text>
          <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
            {[team.city, league, team.created_at ? formatDate(team.created_at) : null].filter(Boolean).join(" · ")}
          </Text>
          <View style={styles.badges}>
            <Badge label={team.origin_label || ORIGIN_LABELS[team.origin]} tone={ORIGIN_TONE[team.origin]} size="xs" />
            {team.contact ? <Badge label="düzenlendi" tone="accent" size="xs" /> : null}
            {!team.active ? <Badge label="Pasif" size="xs" /> : null}
          </View>
        </View>
        {canNotes ? (
          <Touchable onPress={onNotes} hitSlop={8} feedback="icon" style={styles.notesBtn} accessibilityLabel={`${team.team_name} notları ve iletişim bilgisi`}>
            <Ionicons name="document-text-outline" size={18} color={colors.textSecondary} />
            {team.notes?.length ? (
              <Text style={styles.notesCount} {...textScale.badge}>
                {team.notes.length}
              </Text>
            ) : null}
          </Touchable>
        ) : null}
      </View>

      <View style={styles.manager}>
        <Ionicons name="person-outline" size={14} color={colors.textTertiary} />
        <Text style={styles.managerText} numberOfLines={1} {...textScale.dense}>
          {team.manager ? `${team.manager.name}${team.manager.username ? ` · @${team.manager.username}` : ""}` : "Yetkilisi yok"}
          {team.contact?.contact_name && team.contact.contact_name !== team.manager?.name ? ` · İletişim: ${team.contact.contact_name}` : ""}
        </Text>
      </View>

      {lines.length ? (
        <View style={styles.lines}>
          {lines.map((l) => (
            <Touchable key={l.key} onPress={l.onPress} style={styles.line} feedback="chip" accessibilityLabel={l.text}>
              <Ionicons name={l.icon} size={14} color={l.tone ?? colors.brandAccent} />
              <Text style={styles.lineText} numberOfLines={1} {...textScale.dense}>
                {l.text}
              </Text>
            </Touchable>
          ))}
        </View>
      ) : (
        <Text style={styles.muted} {...textScale.dense}>
          İletişim bilgisi yok
        </Text>
      )}

      {team.notes?.length ? (
        <View style={styles.notes}>
          {team.notes.slice(0, 2).map((n) => (
            <View key={n.id} style={styles.noteLine}>
              <Ionicons name={n.pinned ? "pin" : "document-text-outline"} size={12} color={n.pinned ? colors.brandAccent : colors.textTertiary} />
              <Text style={styles.noteText} numberOfLines={2} {...textScale.dense}>
                {n.body}
              </Text>
            </View>
          ))}
          {team.notes.length > 2 ? (
            <Text style={styles.muted} {...textScale.dense}>
              +{team.notes.length - 2} not daha
            </Text>
          ) : null}
        </View>
      ) : null}
    </Touchable>
  );
});

const styles = StyleSheet.create({
  extra: { gap: space.sm },
  scope: { ...type.caption, color: colors.textTertiary },
  groupHead: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingTop: space.sm },
  groupTitle: { ...type.overline, color: colors.textTertiary, flex: 1 },
  groupCount: { ...type.caption, color: colors.textTertiary },
  card: {
    padding: space.md,
    gap: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  top: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  main: { flex: 1, gap: space.xxs },
  name: { ...type.h3, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textTertiary },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: space.xxs },
  notesBtn: { flexDirection: "row", alignItems: "center", gap: space.xxs, padding: space.xs },
  notesCount: { ...type.numSmStrong, color: colors.textSecondary },
  manager: { flexDirection: "row", alignItems: "center", gap: space.xs },
  managerText: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
  lines: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
    maxWidth: "100%",
  },
  lineText: { ...type.labelSm, color: colors.textPrimary, flexShrink: 1 },
  muted: { ...type.caption, color: colors.textTertiary },
  notes: { gap: space.xs, paddingTop: space.xs, borderTopWidth: hairline, borderTopColor: colors.separator },
  noteLine: { flexDirection: "row", gap: space.xs, alignItems: "flex-start" },
  noteText: { ...type.caption, color: colors.textSecondary, flex: 1 },
});
