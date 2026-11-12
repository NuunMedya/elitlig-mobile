/**
 * KULÜP SAYFASI İÇERİĞİ (web "Takım Detayları Yönetimi") — Teams.details.
 *
 * Slogan, tarihçe, gol müziği, sosyal medya hesapları, takım kaptanı ve
 * ziyaretçi takım sayfasında hangi bölümlerin görüneceği. Ad / logo / il gibi
 * kimlik alanları "Takım bilgileri" formundadır; buradakiler takım sayfasının
 * içeriğidir ve doğrudan yazılır (PATCH /api/admin/teams/:id/details).
 *
 * Başarılar listesi burada yalnız sayısıyla görünür ve kayıtta KORUNUR
 * (gövdede gönderilmez); satır satır düzenleme takım panelindedir.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { FormSheet, type FieldDef, type FormValues } from "@/components/admin";
import { ErrorState, GradientBar, Skeleton, useToast } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { formatDate } from "@/lib/admin/format";
import {
  TEAM_HOMEPAGE_FIELDS,
  TEAM_SOCIAL_FIELDS,
  getTeamDetails,
  updateTeamDetails,
  type TeamPlayerRow,
} from "@/lib/api/admin/teams";
import { ApiError } from "@/lib/http";
import { colors, space, textScale, type } from "@/theme";

import { FactRow, GroupCard } from "./ManageKit";

/** Doğrulama hatasında alan alan gerekçe (fieldErrors) tek cümleye iner. */
function detailsErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    const fields = (error.detail as { fieldErrors?: Record<string, string> } | null)?.fieldErrors;
    const lines = fields ? Object.entries(fields).map(([key, text]) => `${key}: ${text}`) : [];
    if (lines.length) return lines.join(" ");
  }
  return errorText(error);
}

export function TeamDetailsPanel({ teamId, players }: { teamId: number; players: TeamPlayerRow[] }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const key = useMemo(() => ["admin", "teams", "details", teamId] as const, [teamId]);
  const query = useQuery({ queryKey: key, queryFn: () => getTeamDetails(teamId), retry: false });
  const details = query.data?.details;

  const fields = useMemo<FieldDef[]>(
    () => [
      { key: "motto", label: "Slogan", kind: "text", maxLength: 160 },
      { key: "history", label: "Tarihçe", kind: "multiline", maxLength: 8000 },
      {
        key: "captain_player_id",
        label: "Takım kaptanı",
        kind: "select",
        clearable: true,
        options: players.filter((p) => !p.is_loan || p.own_team_id === teamId).map((p) => ({ value: p.id, label: p.name, hint: p.position })),
        hint: "Kaptan takımın kendi oyuncularından seçilir.",
      },
      { key: "goal_music_title", label: "Gol müziği adı", kind: "text", maxLength: 120 },
      { key: "goal_music_url", label: "Gol müziği bağlantısı", kind: "url", placeholder: "https://…" },
      ...TEAM_SOCIAL_FIELDS.map<FieldDef>((f) => ({
        key: `social_${f.key}`,
        label: f.label,
        kind: f.key === "whatsapp" ? "phone" : "url",
        placeholder: f.key === "whatsapp" ? "05xx xxx xx xx" : "https://…",
      })),
      ...TEAM_HOMEPAGE_FIELDS.map<FieldDef>((f) => ({ key: `home_${f.key}`, label: `Takım sayfasında göster: ${f.label}`, kind: "toggle" })),
    ],
    [players, teamId]
  );

  const initial = useMemo<FormValues>(() => {
    if (!details) return {};
    const values: FormValues = {
      motto: details.motto ?? "",
      history: details.history ?? "",
      captain_player_id: details.captain_player_id ?? null,
      goal_music_title: details.goal_music_title ?? "",
      goal_music_url: details.goal_music_url ?? "",
    };
    for (const f of TEAM_SOCIAL_FIELDS) values[`social_${f.key}`] = details.social?.[f.key] ?? "";
    for (const f of TEAM_HOMEPAGE_FIELDS) values[`home_${f.key}`] = details.homepage?.[f.key] !== false;
    return values;
  }, [details]);

  const submit = async (values: FormValues) => {
    try {
      const result = await updateTeamDetails(teamId, {
        motto: String(values.motto ?? ""),
        history: String(values.history ?? ""),
        captain_player_id: values.captain_player_id ? Number(values.captain_player_id) : null,
        goal_music_title: String(values.goal_music_title ?? ""),
        goal_music_url: String(values.goal_music_url ?? ""),
        social: Object.fromEntries(TEAM_SOCIAL_FIELDS.map((f) => [f.key, String(values[`social_${f.key}`] ?? "").trim()])),
        homepage: Object.fromEntries(TEAM_HOMEPAGE_FIELDS.map((f) => [f.key, values[`home_${f.key}`] !== false])),
      });
      queryClient.setQueryData(key, result);
      toast.show({ message: result.message || "Takım detayları kaydedildi.", tone: "success" });
    } catch (error) {
      throw new Error(detailsErrorText(error));
    }
  };

  const socialCount = details ? TEAM_SOCIAL_FIELDS.filter((f) => details.social?.[f.key]).length : 0;
  const hidden = details ? TEAM_HOMEPAGE_FIELDS.filter((f) => details.homepage?.[f.key] === false).map((f) => f.label) : [];

  /* Doluluk: slogan, tarihçe, kaptan, gol müziği, sosyal medya, başarılar. */
  const filled = details
    ? [details.motto, details.history, query.data?.captain, details.goal_music_title || details.goal_music_url, socialCount, details.achievements?.length].filter(Boolean).length
    : 0;

  return (
    <>
      <GroupCard title="Kulüp sayfası" icon="globe-outline" tone="cyan" action={details ? { label: "Düzenle", onPress: () => setEditing(true) } : undefined}>
        {query.isLoading ? (
          <Skeleton height={120} radius="md" />
        ) : query.isError || !details ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} variant="inline" />
        ) : (
          <>
            <View style={styles.fill}>
              <View style={styles.fillHead}>
                <Text style={styles.fillLabel} {...textScale.dense}>
                  Sayfa doluluğu
                </Text>
                <Text style={styles.fillValue} {...textScale.badge}>
                  {filled}
                  <Text style={styles.fillOf}> / 6</Text>
                </Text>
              </View>
              <GradientBar value={filled / 6} />
            </View>
            {details.motto ? (
              <Text style={styles.motto} numberOfLines={2} {...textScale.long}>
                “{details.motto}”
              </Text>
            ) : null}
            <View>
              <FactRow icon="book-outline" label="Tarihçe" value={details.history ? `${details.history.length} karakter` : null} />
              <FactRow icon="ribbon-outline" label="Kaptan" value={query.data?.captain?.name || null} />
              <FactRow icon="musical-notes-outline" label="Gol müziği" value={details.goal_music_title || (details.goal_music_url ? "Bağlantı var" : null)} />
              <FactRow icon="share-social-outline" label="Sosyal medya" value={socialCount ? `${socialCount} hesap` : null} />
              <FactRow icon="trophy-outline" label="Başarılar" value={details.achievements?.length ? `${details.achievements.length} kayıt` : null} />
              <FactRow icon="eye-off-outline" label="Gizlenen" value={hidden.length ? hidden.join(", ") : "Yok"} last={!details.updated_at} />
              {details.updated_at ? <FactRow icon="time-outline" label="Son güncelleme" value={formatDate(details.updated_at)} last /> : null}
            </View>
          </>
        )}
      </GroupCard>

      <FormSheet
        visible={editing}
        onClose={() => setEditing(false)}
        title="Kulüp sayfası"
        intro="Bu bilgiler ziyaretçilerin gördüğü takım sayfasında yer alır. WhatsApp numarası herkese açık gösterilmez."
        fields={fields}
        initial={initial}
        onSubmit={submit}
      />
    </>
  );
}

const styles = StyleSheet.create({
  fill: { gap: space.s },
  fillHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  fillLabel: { ...type.labelSm, color: colors.textSecondary },
  fillValue: { ...type.scoreXs, color: colors.textPrimary },
  fillOf: { ...type.numSm, color: colors.textTertiary },
  motto: { ...type.bodyLg, color: colors.textPrimary, fontFamily: type.h3.fontFamily },
});
