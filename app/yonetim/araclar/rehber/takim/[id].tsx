/**
 * REHBER → TAKIM KARTI (web RehberTeams.js TeamDetail)
 *
 * Üstte kimlik: logo, takım adı, il · lig · sezon, G-B-M, maç / gol, hesaplı
 * oyuncu sayısı. Eylemler: takımla grup sohbeti kur, WhatsApp bağlantıları,
 * telefonları kopyala, vCard / CSV paylaş, takım sayfası.
 * Başkanlar her zaman görünür (tek dokunuşla ara / WhatsApp / e-posta /
 * mesaj / rehberime ekle); altında Kadro · Maçlar · Sezonlar.
 * Kaynak: GET /api/tools/contacts/teams/:id (users.view + il kapsamı).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ActionSheet, AdminScreen, Panel, StatRow, useAdminMutation } from "@/components/admin";
import { ContactButtons } from "@/components/admin/contacts/ContactButtons";
import { pushRecentTeam } from "@/components/admin/contacts/recentTeams";
import { RecordPills } from "@/components/admin/contacts/TeamDirectoryCard";
import { useContactActions } from "@/components/admin/contacts/useContactActions";
import { shareCsv, shareVcard } from "@/components/admin/sheets/shareFile";
import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  EmptyState,
  ErrorState,
  SegmentedControl,
  SkeletonCard,
  SkeletonListRow,
  TeamLogo,
  Touchable,
} from "@/components/ui";
import {
  createContact,
  exportFileName,
  getTeamCard,
  prettyPhone,
  teamCsv,
  teamPeople,
  teamVcard,
  waNumber,
  type PersonCard,
  type TeamMatch,
} from "@/lib/api/admin/contacts";
import { mediaUrl } from "@/lib/format";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

type Tab = "kadro" | "maclar" | "sezonlar";

export default function TeamCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const teamId = Number(id);
  const router = useRouter();
  const actions = useContactActions();
  const [tab, setTab] = useState<Tab>("kadro");
  const [waOpen, setWaOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const query = useQuery({
    queryKey: ["admin", "contacts", "team", teamId],
    queryFn: () => getTeamCard(teamId),
    enabled: Number.isFinite(teamId),
  });
  const card = query.data;

  useEffect(() => {
    if (card) void pushRecentTeam({ team_id: card.team.team_id, team_name: card.team.team_name, logo: card.team.logo, city: card.team.city });
  }, [card]);

  const add = useAdminMutation(
    (person: PersonCard) => createContact({ name: person.name, member_user_id: person.id, tags: card ? [card.team.team_name] : [], favorite: false }),
    { success: (_r, p) => `${p.name} rehberine eklendi.`, invalidate: [["admin", "contacts"]] }
  );

  const people = teamPeople(card);
  const withPhone = people.filter((p) => p.phone);
  const accounts = card?.players.filter((p) => p.account).length ?? 0;
  const t = card?.team;
  const fileName = t ? exportFileName(t.team_name) : "takim";

  const copyPhones = () => {
    const phones = [...new Set(withPhone.map((p) => prettyPhone(p.phone)).filter(Boolean))];
    void actions.copy(phones.join("\n"), `${phones.length} telefon numarası kopyalandı.`);
  };

  const personRow = (p: PersonCard, sub: string, key: string) => (
    <View key={key} style={styles.person}>
      <Avatar name={p.name} size={36} />
      <View style={styles.personMain}>
        <Text style={styles.personName} numberOfLines={1} {...textScale.dense}>
          {p.name}
        </Text>
        <Text style={styles.personSub} numberOfLines={1} {...textScale.dense}>
          {sub}
        </Text>
      </View>
      <ContactButtons name={p.name} phone={p.phone} email={p.email} userId={p.id} actions={actions} only={["tel", "wa", "mail", "chat"]} />
      <Touchable
        onPress={() => add.mutate(p)}
        disabled={add.isPending}
        hitSlop={6}
        feedback="icon"
        accessibilityLabel={`${p.name} rehberime ekle`}
        style={styles.addBtn}
      >
        <Ionicons name="person-add-outline" size={16} color={colors.textSecondary} />
      </Touchable>
    </View>
  );

  return (
    <AdminScreen
      app="rehber"
      title={t?.team_name ?? "Takım kartı"}
      subtitle="Takım kartı"
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      actions={card ? [{ icon: "ellipsis-horizontal", onPress: () => setMoreOpen(true), accessibilityLabel: "Diğer eylemler" }] : undefined}
    >
      {query.isLoading ? (
        <>
          <SkeletonCard />
          <SkeletonListRow count={5} />
        </>
      ) : query.error || !card || !t ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} variant="inline" />
      ) : (
        <>
          <View style={styles.hero}>
            <TeamLogo name={t.team_name} logo={mediaUrl(t.logo)} size={72} />
            <View style={styles.heroMain}>
              <Text style={styles.teamName} {...textScale.dense}>
                {t.team_name}
              </Text>
              <Text style={styles.teamMeta} {...textScale.dense}>
                {[t.city, t.league, t.season].filter(Boolean).join(" · ") || "İl ve lig bilgisi yok"}
              </Text>
              <View style={styles.heroBadges}>
                <RecordPills record={t.record} />
                {!t.active ? <Badge label="Pasif" size="xs" /> : null}
              </View>
            </View>
          </View>

          <StatRow
            items={[
              { label: "maç", value: t.total_matches },
              { label: "gol (A:Y)", value: `${t.record.goals_for ?? 0}:${t.record.goals_against ?? 0}` },
              { label: "hesaplı oyuncu", value: `${accounts}/${card.players.length}` },
              { label: "telefonu olan", value: withPhone.length },
            ]}
          />

          <View style={styles.actions}>
            <Button
              label="Takımla grup kur"
              icon="people"
              size="sm"
              onPress={() => void actions.group(t.team_name, people.map((p) => p.id))}
              loading={actions.busy === "group"}
              disabled={!people.length}
              style={styles.flex}
            />
            <Button
              label="WhatsApp"
              icon="logo-whatsapp"
              size="sm"
              variant="secondary"
              onPress={() => setWaOpen(true)}
              disabled={!withPhone.length}
              style={styles.flex}
            />
          </View>

          <Panel title={`BAŞKANLAR · ${card.captains.length}`}>
            {card.captains.length === 0 ? (
              <Text style={styles.muted} {...textScale.dense}>
                Bu takıma bağlı başkan hesabı yok.
              </Text>
            ) : (
              card.captains.map((c) =>
                personRow(c, [`@${c.username}`, c.city, c.phone ? prettyPhone(c.phone) : null].filter(Boolean).join(" · "), `c${c.id}`)
              )
            )}
          </Panel>

          <SegmentedControl<Tab>
            items={[
              { key: "kadro", label: `Kadro (${card.players.length})` },
              { key: "maclar", label: `Maçlar (${card.last_matches.length + card.next_matches.length})` },
              { key: "sezonlar", label: `Sezonlar (${card.seasons.length})` },
            ]}
            value={tab}
            onChange={setTab}
            size="sm"
          />

          {tab === "kadro" ? (
            <Panel>
              {card.players.length === 0 ? (
                <Text style={styles.muted} {...textScale.dense}>
                  Kadroda oyuncu yok.
                </Text>
              ) : (
                card.players.map((p) =>
                  p.account ? (
                    personRow(p.account, [p.position || "Mevki yok", p.account.phone ? prettyPhone(p.account.phone) : null].filter(Boolean).join(" · "), `p${p.player_id}`)
                  ) : (
                    <View key={`p${p.player_id}`} style={[styles.person, styles.noAccount]}>
                      <Avatar name={p.name} size={36} />
                      <View style={styles.personMain}>
                        <Text style={styles.personName} numberOfLines={1} {...textScale.dense}>
                          {p.name}
                        </Text>
                        <Text style={styles.personSub} numberOfLines={1} {...textScale.dense}>
                          {p.position || "Mevki yok"}
                        </Text>
                      </View>
                      <Badge label="hesabı yok" size="xs" />
                    </View>
                  )
                )
              )}
            </Panel>
          ) : tab === "maclar" ? (
            <>
              <Panel title="GELECEK MAÇLAR">
                {card.next_matches.length === 0 ? (
                  <Text style={styles.muted} {...textScale.dense}>
                    Planlanmış maç yok.
                  </Text>
                ) : (
                  card.next_matches.map((m) => <MatchLine key={m.id} m={m} onPress={() => router.push(`/mac/${m.id}` as never)} />)
                )}
              </Panel>
              <Panel title="SON MAÇLAR">
                {card.last_matches.length === 0 ? (
                  <Text style={styles.muted} {...textScale.dense}>
                    Oynanmış maç yok.
                  </Text>
                ) : (
                  card.last_matches.map((m) => <MatchLine key={m.id} m={m} played onPress={() => router.push(`/mac/${m.id}` as never)} />)
                )}
              </Panel>
            </>
          ) : card.seasons.length === 0 ? (
            <EmptyState icon="calendar-outline" title="Sezon kaydı yok" variant="inline" compact />
          ) : (
            <View style={styles.seasons}>
              {card.seasons.map((s) => (
                <View key={s.name} style={styles.season}>
                  <Text style={styles.seasonName} numberOfLines={1} {...textScale.dense}>
                    {s.name}
                  </Text>
                  <Text style={styles.seasonCount} {...textScale.dense}>
                    {s.played} maç
                  </Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      <BottomSheet visible={waOpen} onClose={() => setWaOpen(false)} title="WhatsApp bağlantıları">
        <View>
          {withPhone.map((p, i) => (
            <Touchable key={p.id} onPress={() => void actions.whatsapp(p.phone!)} style={[styles.waRow, i ? styles.waBorder : null]} accessibilityLabel={`${p.name} WhatsApp`}>
              <Ionicons name="logo-whatsapp" size={20} color={colors.win} />
              <View style={styles.personMain}>
                <Text style={styles.personName} {...textScale.dense}>
                  {p.name}
                </Text>
                <Text style={styles.personSub} {...textScale.dense}>
                  {`${p.label} · ${prettyPhone(p.phone)} · wa.me/${waNumber(p.phone)}`}
                </Text>
              </View>
            </Touchable>
          ))}
        </View>
      </BottomSheet>

      <ActionSheet
        visible={moreOpen}
        onClose={() => setMoreOpen(false)}
        title={t?.team_name}
        actions={[
          { label: "Telefonları kopyala", icon: "call-outline", onPress: copyPhones, disabled: !withPhone.length },
          { label: "Telefon rehberi (vCard)", icon: "id-card-outline", onPress: () => card && void shareVcard(fileName, teamVcard(card)), disabled: !people.length },
          { label: "CSV olarak paylaş", icon: "document-text-outline", onPress: () => card && void shareCsv(fileName, teamCsv(card)), disabled: !people.length },
          { label: "Takım sayfası", icon: "open-outline", onPress: () => router.push(`/takim/${teamId}` as never) },
        ]}
      />
    </AdminScreen>
  );
}

function MatchLine({ m, played, onPress }: { m: TeamMatch; played?: boolean; onPress: () => void }) {
  const hasScore = m.home_score != null && m.away_score != null;
  const mine = m.is_home ? m.home_score : m.away_score;
  const theirs = m.is_home ? m.away_score : m.home_score;
  const tone = !played || !hasScore ? null : (mine ?? 0) > (theirs ?? 0) ? colors.win : (mine ?? 0) < (theirs ?? 0) ? colors.loss : colors.draw;
  const day = m.date ? new Date(`${m.date}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) : "—";
  return (
    <Touchable onPress={onPress} style={styles.match} accessibilityLabel={`${m.home} - ${m.away}`}>
      {tone ? <View style={[styles.matchBar, { backgroundColor: tone }]} /> : null}
      <View style={styles.matchWhen}>
        <Text style={styles.matchDay} {...textScale.dense}>
          {day}
        </Text>
        {m.time ? (
          <Text style={styles.matchTime} {...textScale.dense}>
            {m.time}
          </Text>
        ) : null}
      </View>
      <View style={styles.personMain}>
        <Text style={[styles.matchTeams, m.is_home ? styles.me : null]} numberOfLines={1} {...textScale.dense}>
          {m.home}
        </Text>
        <Text style={[styles.matchTeams, !m.is_home ? styles.me : null]} numberOfLines={1} {...textScale.dense}>
          {m.away}
        </Text>
        {m.field || m.season ? (
          <Text style={styles.personSub} numberOfLines={1} {...textScale.dense}>
            {[m.field, m.season].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
      </View>
      <Text style={styles.score} {...textScale.dense}>
        {hasScore ? `${m.home_score} - ${m.away_score}` : "vs"}
      </Text>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", gap: space.md, alignItems: "center" },
  heroMain: { flex: 1, gap: space.xxs },
  teamName: { ...type.display, color: colors.textPrimary },
  teamMeta: { ...type.bodySm, color: colors.textSecondary },
  heroBadges: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.xs },
  actions: { flexDirection: "row", gap: space.sm },
  flex: { flex: 1 },
  muted: { ...type.bodySm, color: colors.textTertiary },
  person: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs },
  noAccount: { opacity: 0.7 },
  personMain: { flex: 1, gap: 2 },
  personName: { ...type.label, color: colors.textPrimary },
  personSub: { ...type.caption, color: colors.textTertiary },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface3,
  },
  match: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm, overflow: "hidden" },
  matchBar: { width: 3, alignSelf: "stretch", borderRadius: radius.xs },
  matchWhen: { width: 52 },
  matchDay: { ...type.labelSm, color: colors.textPrimary },
  matchTime: { ...type.caption, color: colors.textTertiary },
  matchTeams: { ...type.bodySm, color: colors.textSecondary },
  me: { ...type.label, color: colors.textPrimary },
  score: { ...type.tableNumStrong, color: colors.textPrimary },
  seasons: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  season: {
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    gap: 2,
    minWidth: 110,
  },
  seasonName: { ...type.label, color: colors.textPrimary },
  seasonCount: { ...type.caption, color: colors.textTertiary },
  waRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
  waBorder: { borderTopWidth: hairline, borderTopColor: colors.separator },
});
