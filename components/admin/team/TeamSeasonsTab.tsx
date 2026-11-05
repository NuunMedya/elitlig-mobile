/**
 * Takım profili → Sezonlar ve sezon kadroları (web TeamSeasonsSection +
 * TeamProfileAdmin "seasons" sekmesi).
 *
 * Bir takım birden fazla lig ve sezonda mücadele edebilir: katılım eklenir /
 * kaldırılır. Seçili sezonun kadrosunda üye sayısı, lisanslı sayısı ve
 * transfer hakkı kural durumuyla görünür; yönetim doğrudan ekler / çıkarır.
 * Takımın gönderdiği taslak onay bekliyorsa Kadrolar ekranına yönlendirir.
 */

import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  FormSheet,
  Panel,
  RecordCard,
  StatRow,
  confirmAction,
  useAdminMutation,
  type FormValues,
} from "@/components/admin";
import { Button, Chip, ChipGroup, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/admin/format";
import { leagueOptionsLoader, seasonOptionsLoader } from "@/lib/api/admin/lookups";
import { positionLabel } from "@/lib/api/admin/players";
import {
  MEMBERSHIP_STATUS_LABELS,
  addSeasonRosterPlayer,
  addTeamSeason,
  capText,
  removeSeasonRosterPlayer,
  removeTeamSeason,
  type TeamOverview,
} from "@/lib/api/admin/teams";
import type { AuthUser } from "@/lib/types";
import { colors, space, textScale, type } from "@/theme";

export function TeamSeasonsTab({
  data,
  user,
  invalidate,
}: {
  data: TeamOverview;
  user: AuthUser | null;
  invalidate: readonly (readonly unknown[])[];
}) {
  const router = useRouter();
  const team = data.team;
  const [seasonId, setSeasonId] = useState<number | null>(data.seasons[0]?.season_id ?? null);
  const [adding, setAdding] = useState(false);
  const [formLeague, setFormLeague] = useState<number | null>(null);

  useEffect(() => {
    if (!data.seasons.some((s) => s.season_id === seasonId)) setSeasonId(data.seasons[0]?.season_id ?? null);
  }, [data.seasons, seasonId]);

  const season = data.seasons.find((s) => s.season_id === seasonId) ?? null;
  const memberIds = useMemo(() => new Set((season?.members ?? []).map((m) => m.player_id)), [season]);
  const outside = data.players.filter((p) => !memberIds.has(p.id));
  const status = season?.status;
  const rights = !status?.applies
    ? "Sınırsız"
    : status.transferRights?.unlimited
      ? "Limitsiz"
      : status.transferRights?.none
        ? "Yok"
        : String(status.transferRights?.available ?? 0);
  const draftText =
    season?.draft?.status === "submitted"
      ? "Onay bekliyor"
      : season?.draft?.last_decision === "approved"
        ? "Onaylandı"
        : season?.draft?.last_decision === "rejected"
          ? "Reddedildi"
          : "—";

  const addSeason = useAdminMutation(
    (v: FormValues) => addTeamSeason(team.id, Number(v.season_id), v.league_id ? Number(v.league_id) : null),
    { success: "Takım sezona eklendi.", invalidate: [...invalidate], onSuccess: (_, v) => setSeasonId(Number(v.season_id)) }
  );
  const removeSeason = useAdminMutation((id: number) => removeTeamSeason(team.id, id), {
    success: "Sezon katılımı kaldırıldı.",
    invalidate: [...invalidate],
  });
  const addMember = useAdminMutation(
    ({ playerId, licensed }: { playerId: number; licensed: boolean }) => addSeasonRosterPlayer(team.id, seasonId!, playerId, licensed),
    { success: "Oyuncu sezon kadrosuna eklendi.", invalidate: [...invalidate] }
  );
  const removeMember = useAdminMutation((playerId: number) => removeSeasonRosterPlayer(team.id, seasonId!, playerId), {
    success: "Oyuncu sezon kadrosundan çıkarıldı.",
    invalidate: [...invalidate],
  });

  const askRemoveSeason = async () => {
    if (!season) return;
    const ok = await confirmAction({
      title: "Sezon katılımı kaldırılsın mı?",
      message: `${team.team_name}, ${season.season?.season_name ?? "bu sezon"} katılımından çıkarılacak.`,
      confirmLabel: "Kaldır",
      destructive: true,
    });
    if (ok) removeSeason.mutate(season.season_id);
  };

  const askRemoveMember = async (playerId: number, name: string) => {
    const ok = await confirmAction({
      title: "Sezon kadrosundan çıkarılsın mı?",
      message: `${name} sezon kadrosundan çıkarılacak. Kullanılan transfer hakkı iade edilmez.`,
      confirmLabel: "Çıkar",
      destructive: true,
    });
    if (ok) removeMember.mutate(playerId);
  };

  return (
    <View style={styles.stack}>
      <Button label="Lig / sezon ekle" icon="add" variant="secondary" size="sm" onPress={() => setAdding(true)} />
      {!data.seasons.length ? (
        <EmptyState icon="calendar-outline" variant="inline" title="Sezon katılımı yok" body="Takımı bir lig ve sezona ekle." />
      ) : (
        <>
          <ChipGroup scrollable contentPadding={0}>
            {data.seasons.map((s) => (
              <Chip
                key={s.season_id}
                label={`${s.season?.season_name ?? `Sezon #${s.season_id}`}${s.season?.league_name ? ` · ${s.season.league_name}` : ""}`}
                size="sm"
                selected={s.season_id === seasonId}
                icon={s.draft?.status === "submitted" ? "hourglass-outline" : undefined}
                onPress={() => setSeasonId(s.season_id)}
              />
            ))}
          </ChipGroup>

          {season ? (
            <>
              <StatRow
                items={[
                  {
                    label: "Kadroda",
                    value: `${season.members.filter((m) => m.membership_status === "active").length}${status?.applies ? ` / ${capText(status.general)}` : ""}`,
                  },
                  { label: "Lisanslı", value: `${season.members.filter((m) => m.is_licensed).length}${status?.applies ? ` / ${capText(status.licensed)}` : ""}` },
                  { label: "Transfer hakkı", value: rights },
                  { label: "Taslak", value: draftText, tone: season.draft?.status === "submitted" ? "warn" : undefined },
                ]}
              />
              {season.draft?.status === "submitted" ? (
                <RecordCard
                  title="Kadro taslağı onay bekliyor"
                  subtitle="Takımın gönderdiği taslağı Kadrolar ekranında incele."
                  icon="hourglass-outline"
                  iconTone="warn"
                  onPress={() => router.push(`/yonetim/kadrolar?taslak=${season.draft!.id}`)}
                />
              ) : null}

              <Panel title="SEZON KADROSU" action={{ label: "Katılımı kaldır", onPress: () => void askRemoveSeason() }}>
                {season.members.length ? (
                  season.members.map((m) => (
                    <RecordCard
                      key={m.id}
                      title={m.name}
                      subtitle={[positionLabel(m.position) || "Mevki yok", m.joined_at ? `Giriş: ${formatDate(m.joined_at)}` : null].filter(Boolean).join(" · ")}
                      avatar={{ name: m.name, image: m.image }}
                      badges={[
                        m.is_licensed && { label: "Lisanslı", tone: "info" },
                        m.membership_kind === "loan" && { label: "Kiralık", tone: "warn" },
                        m.membership_status !== "active" && { label: MEMBERSHIP_STATUS_LABELS[m.membership_status] ?? m.membership_status },
                      ]}
                      onPress={() => router.push(`/yonetim/oyuncular/${m.player_id}`)}
                      onLongPress={() => void askRemoveMember(m.player_id, m.name)}
                    />
                  ))
                ) : (
                  <Text style={styles.muted} {...textScale.long}>
                    Bu sezon kadrosunda oyuncu yok.
                  </Text>
                )}
                {season.members.length ? (
                  <Text style={styles.muted} {...textScale.dense}>
                    Kadrodan çıkarmak için oyuncuya basılı tut.
                  </Text>
                ) : null}
              </Panel>

              {outside.length ? (
                <Panel title="SEZON KADROSUNDA OLMAYAN TAKIM OYUNCULARI">
                  {outside.map((p) => (
                    <RecordCard
                      key={p.id}
                      title={p.name}
                      subtitle={positionLabel(p.position) || "Mevki yok"}
                      avatar={{ name: p.name, image: p.image }}
                      badges={[p.is_loan && { label: "Kiralık", tone: "warn" }]}
                      trailing={
                        <View style={styles.addBtns}>
                          <Button label="Ekle" size="sm" variant="secondary" onPress={() => addMember.mutate({ playerId: p.id, licensed: false })} />
                          <Button label="Lisanslı" size="sm" variant="ghost" onPress={() => addMember.mutate({ playerId: p.id, licensed: true })} />
                        </View>
                      }
                    />
                  ))}
                </Panel>
              ) : null}
            </>
          ) : null}
        </>
      )}

      <FormSheet
        visible={adding}
        onClose={() => {
          setAdding(false);
          setFormLeague(null);
        }}
        title="Lig / sezon ekle"
        intro="Takım birden fazla lig ve sezonda yer alabilir."
        fields={[
          {
            key: "league_id",
            label: "Lig",
            kind: "select",
            required: true,
            loadOptions: leagueOptionsLoader(user),
            queryKey: ["admin", "leagues", "options"],
            onChange: (v) => {
              setFormLeague((v as number) ?? null);
              return { season_id: null };
            },
          },
          {
            key: "season_id",
            label: "Sezon",
            kind: "select",
            required: true,
            loadOptions: seasonOptionsLoader(user, { leagueId: formLeague }),
            queryKey: ["admin", "seasons", "options", formLeague],
            hidden: (v) => !v.league_id,
          },
        ]}
        submitLabel="Ekle"
        onSubmit={(v) => addSeason.mutateAsync(v)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.sm },
  muted: { ...type.bodySm, color: colors.textTertiary },
  addBtns: { flexDirection: "row", gap: space.xs },
});
