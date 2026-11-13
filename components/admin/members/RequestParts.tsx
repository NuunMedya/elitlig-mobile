/**
 * Talep ayrıntısı parçaları (web requests/RequestShared.js + LinkExisting.js).
 *
 *   PersonPanel   talep eden üye: il, iletişim, bağlı profil, talep geçmişi
 *   TeamPanel     takım: il, kadro, lig / sezon, mevcut yönetici
 *   PlayerPanel   oyuncu: takım, mevki, doğum yılı, maç / gol, bağlı üye
 *   Warnings      dikkat edilmesi gerekenler
 *   DecisionBlock yönetici notu + reddet / onayla; sonuçlanmışta karar özeti
 *   DiffList      içerik değişikliği "şu an → istenen"
 *   LinkExisting  yeni kayıt talebini mevcut oyuncu / takıma bağlama
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { DangerNote, FactRow, GroupCard, ListLine, PositionAvatar } from "@/components/admin/team/ManageKit";
import { Avatar, Badge, Button, Input, SkeletonListRow, TeamLogo, Touchable, type Tone } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/admin/format";
import {
  personName,
  REVIEW_STATUS_LABELS,
  searchPlayerCandidates,
  searchTeamCandidates,
  type ChangeDiffRow,
  type RequestPerson,
  type RequestPlayer,
  type RequestTeam,
} from "@/lib/api/admin/users";
import { colors, hairline, radius, space, textScale, type, upperTR } from "@/theme";

import { openExternal } from "./contact";

export const REVIEW_TONE: Record<string, Tone> = { pending: "warn", approved: "win", rejected: "danger", cancelled: "neutral" };

export function StatusBadge({ status }: { status: string }) {
  return <Badge label={REVIEW_STATUS_LABELS[status] ?? status} tone={REVIEW_TONE[status] ?? "neutral"} size="xs" />;
}

export function PersonPanel({ user, title = "Talep eden üye" }: { user?: RequestPerson | null; title?: string }) {
  if (!user) return null;
  const h = user.history ?? {};
  return (
    <GroupCard title={title} icon="person" tone="violet">
      <View style={styles.identity}>
        <Avatar name={personName(user)} size={48} ring="brand" />
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
            {personName(user)}
          </Text>
          <Text style={styles.muted} numberOfLines={1} {...textScale.dense}>
            @{user.username || "—"} · Üye #{user.id}
          </Text>
        </View>
      </View>
      {h.total ? (
        <View style={styles.history} accessible accessibilityLabel={`Toplam ${h.total} talep`}>
          {[
            { label: "Talep", value: h.total, color: colors.textPrimary },
            { label: "Onay", value: h.approved || 0, color: colors.win },
            { label: "Ret", value: h.rejected || 0, color: colors.danger },
            { label: "Bekleyen", value: h.pending || 0, color: colors.warn },
          ].map((c) => (
            <View key={c.label} style={styles.histCell}>
              <Text style={[styles.histValue, { color: c.color }]} {...textScale.badge}>
                {c.value}
              </Text>
              <Text style={styles.histLabel} {...textScale.badge}>
                {upperTR(c.label)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <View>
        <FactRow icon="location-outline" label="İl" value={user.city || null} />
        <FactRow
          icon="call-outline"
          label="Telefon"
          value={
            user.phone ? (
              <Touchable onPress={() => void openExternal(`tel:${user.phone}`)} accessibilityRole="link" feedback="none">
                <Text style={styles.link} {...textScale.dense}>
                  {user.phone}
                </Text>
              </Touchable>
            ) : null
          }
        />
        <FactRow icon="mail-outline" label="E-posta" value={user.email || null} />
        <FactRow icon="calendar-outline" label="Üyelik" value={user.member_since ? formatDate(user.member_since) : null} />
        <FactRow icon="football-outline" label="Oyuncu profili" value={user.player ? `${user.player.player_name || "Oyuncu"} #${user.player.id}` : "Yok"} />
        <FactRow icon="shield-half-outline" label="Yönettiği takım" value={user.team ? `${user.team.team_name || "Takım"} #${user.team.id}` : "Yok"} last />
      </View>
    </GroupCard>
  );
}

export function TeamPanel({ team, title = "Takım" }: { team?: RequestTeam | null; title?: string }) {
  if (!team) return null;
  return (
    <GroupCard title={title} icon="shield-half" tone="cyan">
      <View style={styles.identity}>
        <TeamLogo name={team.team_name} logo={team.logo} size={48} />
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={2} {...textScale.dense}>
            {team.team_name}
          </Text>
          <Text style={styles.muted} numberOfLines={1} {...textScale.dense}>
            Takım #{team.id}
          </Text>
        </View>
      </View>
      <View>
        <FactRow icon="location-outline" label="İl" value={team.city || null} />
        <FactRow icon="people-outline" label="Kadro" value={team.roster_size != null ? `${team.roster_size} oyuncu` : null} />
        <FactRow icon="trophy-outline" label="Lig / sezon" value={[team.current_league, team.current_season].filter(Boolean).join(" · ") || null} />
        <FactRow
          icon="person-outline"
          label="Mevcut yönetici"
          value={team.manager ? `${personName(team.manager)} (@${team.manager.username || "—"})` : "Yok"}
          tone={team.manager ? "warn" : undefined}
          last
        />
      </View>
    </GroupCard>
  );
}

export function PlayerPanel({ player, title = "Oyuncu" }: { player?: RequestPlayer | null; title?: string }) {
  if (!player) return null;
  return (
    <GroupCard title={title} icon="football" tone="mint">
      <View style={styles.identity}>
        <PositionAvatar name={player.player_name} image={player.player_img} position={player.player_position} size={44} />
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={2} {...textScale.dense}>
            {player.player_name}
          </Text>
          <Text style={styles.muted} numberOfLines={1} {...textScale.dense}>
            Oyuncu #{player.id}
            {player.birth_year ? ` · ${player.birth_year}` : ""}
          </Text>
        </View>
        <View style={styles.mini}>
          <Text style={styles.miniValue} {...textScale.badge}>
            {player.total_matches || 0}
          </Text>
          <Text style={styles.histLabel} {...textScale.badge}>
            MAÇ
          </Text>
        </View>
        <View style={styles.mini}>
          <Text style={styles.miniValue} {...textScale.badge}>
            {player.total_goals || 0}
          </Text>
          <Text style={styles.histLabel} {...textScale.badge}>
            GOL
          </Text>
        </View>
      </View>
      <View>
        <FactRow icon="shield-half-outline" label="Takım" value={player.teams?.length ? player.teams.map((t) => t.team_name).filter(Boolean).join(", ") : "Takımsız"} />
        <FactRow icon="body-outline" label="Mevki" value={player.player_position || null} />
        <FactRow
          icon="person-outline"
          label="Bağlı üye"
          value={player.owner ? `${personName(player.owner)} (@${player.owner.username || "—"})` : "Yok"}
          tone={player.owner ? "warn" : undefined}
          last
        />
      </View>
    </GroupCard>
  );
}

export function Warnings({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return <DangerNote tone="warn" title="Dikkat edilmesi gerekenler" body={items.map((t) => `• ${t}`).join("\n")} />;
}

export function Outcome({ text }: { text?: string | null }) {
  if (!text) return null;
  return <DangerNote tone="info" icon="information-circle" title="Onaylanırsa" body={text} />;
}

export function DecisionBlock({
  item,
  note,
  setNote,
  busy,
  canDecide,
  onDecide,
  approveLabel = "Onayla",
}: {
  item: { status: string; reviewer?: RequestPerson | null; reviewed_at?: string | null; review_note?: string | null };
  note: string;
  setNote: (v: string) => void;
  busy: boolean;
  canDecide: boolean;
  onDecide: (decision: "approved" | "rejected") => void;
  approveLabel?: string;
}) {
  if (item.status !== "pending") {
    const tone = REVIEW_TONE[item.status] ?? "neutral";
    return (
      <GroupCard title="Karar" icon={item.status === "approved" ? "checkmark-circle" : item.status === "rejected" ? "close-circle" : "remove-circle"} tone={tone === "win" ? "mint" : tone === "danger" ? "red" : "neutral"}>
        <View style={styles.decided}>
          <StatusBadge status={item.status} />
          <Text style={styles.muted} numberOfLines={2} {...textScale.dense}>
            {[item.reviewer ? personName(item.reviewer) : null, item.reviewed_at ? formatDateTime(item.reviewed_at) : null].filter(Boolean).join(" · ") || "—"}
          </Text>
        </View>
        {item.review_note ? (
          <View style={styles.quoteBox}>
            <Text style={styles.quote} {...textScale.long}>
              “{item.review_note}”
            </Text>
          </View>
        ) : null}
      </GroupCard>
    );
  }
  if (!canDecide) return null;
  return (
    <GroupCard title="Karar" icon="checkmark-done" tone="gold">
      <Input
        label="Yönetici notu"
        hint="Üyeye bildirimle gider; ret için gerekçe yaz."
        value={note}
        onChangeText={setNote}
        multiline
        numberOfLines={3}
        placeholder="Örn. Takım başkanı olduğunuzu doğruladık."
      />
      <View style={styles.row}>
        <Button label="Reddet" icon="close" variant="secondary" size="lg" onPress={() => onDecide("rejected")} disabled={busy} style={styles.grow} />
        <Button label={approveLabel} icon="checkmark" size="lg" onPress={() => onDecide("approved")} loading={busy} style={styles.grow} />
      </View>
    </GroupCard>
  );
}

function DiffValue({ row, value, after }: { row: ChangeDiffRow; value: unknown; after?: boolean }) {
  if (value === null || value === undefined || value === "") return <Text style={styles.empty}>Boş</Text>;
  if (row.kind === "image") return <Image source={{ uri: String(value) }} style={styles.diffImage} resizeMode="cover" />;
  return (
    <Text style={[styles.diffText, after ? styles.diffAfter : styles.diffBefore]} selectable numberOfLines={4} {...textScale.dense}>
      {String(value)}
    </Text>
  );
}

export function DiffList({ diff }: { diff: ChangeDiffRow[] }) {
  const [showAll, setShowAll] = useState(false);
  const changed = diff.filter((d) => d.changed);
  const rows = showAll || !changed.length ? diff : changed;
  const hidden = diff.length - changed.length;
  return (
    <GroupCard
      title={`İstenen değişiklikler · ${changed.length}`}
      icon="git-compare"
      tone="violet"
      action={hidden > 0 && changed.length ? { label: showAll ? "Yalnız değişenler" : `+${hidden} değişmeyen`, onPress: () => setShowAll((v) => !v) } : undefined}
    >
      {rows.map((row, i) => (
        <View key={row.field} style={[styles.diffRow, i ? styles.diffDivided : null]}>
          <Text style={styles.diffLabel} {...textScale.dense}>
            {upperTR(row.label)}
            {row.changed ? "" : " · DEĞİŞMİYOR"}
          </Text>
          <View style={styles.diffPair}>
            <View style={[styles.diffSide, styles.diffSideBefore]}>
              <Text style={styles.diffTag} {...textScale.badge}>
                ŞU AN
              </Text>
              <DiffValue row={row} value={row.before} />
            </View>
            <Ionicons name="arrow-forward" size={14} color={row.changed ? colors.brandAccent : colors.textTertiary} />
            <View style={[styles.diffSide, row.changed ? styles.diffSideAfter : styles.diffSideBefore]}>
              <Text style={[styles.diffTag, row.changed ? { color: colors.brandAccent } : null]} {...textScale.badge}>
                İSTENEN
              </Text>
              <DiffValue row={row} value={row.after} after={row.changed} />
            </View>
          </View>
        </View>
      ))}
    </GroupCard>
  );
}

/** Yeni oyuncu / takım talebinde mevcut kayda bağla (öneriler + elle arama). */
export function LinkExisting({
  kind,
  suggestions = [],
  initialQuery,
  busy,
  onLink,
}: {
  kind: "player" | "team";
  suggestions?: (RequestPlayer | RequestTeam)[];
  initialQuery?: string;
  busy: boolean;
  onLink: (record: RequestPlayer | RequestTeam) => void;
}) {
  const isTeam = kind === "team";
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  const search = useQuery({
    queryKey: ["admin", "members", "candidates", kind, q],
    queryFn: (): Promise<(RequestPlayer | RequestTeam)[]> => (isTeam ? searchTeamCandidates(q) : searchPlayerCandidates(q)),
    enabled: q.length >= 2,
  });
  const suggestedIds = new Set(suggestions.map((s) => s.id));
  const results = (search.data ?? []).filter((r) => !suggestedIds.has(r.id));

  const row = (record: RequestPlayer | RequestTeam) => {
    const taken = isTeam ? (record as RequestTeam).managed : (record as RequestPlayer).owned;
    const name = isTeam ? (record as RequestTeam).team_name : (record as RequestPlayer).player_name;
    const image = isTeam ? (record as RequestTeam).logo : (record as RequestPlayer).player_img;
    const sub = isTeam
      ? [(record as RequestTeam).city || "İl yok", `${(record as RequestTeam).roster_size || 0} oyuncu`].join(" · ")
      : [
          (record as RequestPlayer).teams?.map((t) => t.team_name).filter(Boolean).join(", ") || "Takımsız",
          (record as RequestPlayer).birth_year ? String((record as RequestPlayer).birth_year) : null,
          `${(record as RequestPlayer).total_matches || 0} maç`,
        ]
          .filter(Boolean)
          .join(" · ");
    return (
      <ListLine
        key={record.id}
        leading={isTeam ? <TeamLogo name={name} logo={image} size={38} /> : <Avatar name={name} image={image} size={38} />}
        title={name}
        subtitle={`${sub} · #${record.id}`}
        pills={[!!taken && { label: isTeam ? "Yönetimi tanımlı" : "Başka üyeye bağlı", tone: "warn" }]}
        trailing={<Button label={isTeam ? "Sahiplendir" : "Bağla"} size="sm" variant="secondary" disabled={busy || Boolean(taken)} onPress={() => onLink(record)} />}
      />
    );
  };

  return (
    <GroupCard title={isTeam ? "Mevcut bir takım mı?" : "Mevcut bir oyuncu mu?"} icon="git-merge" tone="gold">
      <Text style={styles.note} {...textScale.long}>
        {isTeam
          ? "Takım zaten varsa yeni takım açma; o takımı sahiplendir. Maç ve puan geçmişi bölünmez."
          : "Kişi zaten kayıtlıysa yeni profil açma; o kayda bağla. Aynı adlı farklı kişiler olabilir; takım, doğum yılı ve maç bilgisine bak."}
      </Text>
      {suggestions.length ? (
        <View style={styles.listBox}>
          <Text style={[styles.sub, styles.listHead]} {...textScale.dense}>
            BENZER KAYITLAR · {suggestions.length}
          </Text>
          {suggestions.map(row)}
        </View>
      ) : (
        <Text style={styles.note} {...textScale.dense}>
          Adı tutan bir kayıt bulunamadı.
        </Text>
      )}
      <Input
        variant="search"
        leadingIcon="search"
        value={text}
        onChangeText={setText}
        placeholder={initialQuery ? `Örn. ${initialQuery}` : isTeam ? "Takım adı" : "Ad soyad"}
        autoCorrect={false}
      />
      {q.length >= 2 ? (
        search.isLoading ? (
          <SkeletonListRow count={2} />
        ) : results.length ? (
          <View style={styles.listBox}>{results.map(row)}</View>
        ) : (
          <Text style={styles.note} {...textScale.dense}>
            Eşleşen başka kayıt yok.
          </Text>
        )
      ) : null}
    </GroupCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  identity: { flexDirection: "row", alignItems: "center", gap: space.md },
  name: { ...type.h3, color: colors.textPrimary },
  muted: { ...type.caption, color: colors.textTertiary, marginTop: 1 },
  link: { ...type.label, color: colors.brandAccent, textAlign: "right" },
  note: { ...type.caption, color: colors.textSecondary },
  sub: { ...type.overline, color: colors.textTertiary },
  history: { flexDirection: "row", borderRadius: radius.lg, backgroundColor: colors.surface2, paddingVertical: space.sm },
  histCell: { flex: 1, alignItems: "center", gap: 1 },
  histValue: { ...type.scoreSm },
  histLabel: { ...type.micro, color: colors.textTertiary },
  mini: { alignItems: "center", minWidth: 36 },
  miniValue: { ...type.scoreSm, color: colors.textPrimary },
  decided: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  quoteBox: { padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface2, borderLeftWidth: 3, borderLeftColor: colors.brandAccent },
  quote: { ...type.bodySm, color: colors.textSecondary },
  row: { flexDirection: "row", gap: space.sm },
  grow: { flex: 1 },
  listBox: { borderRadius: radius.lg, borderWidth: hairline, borderColor: colors.border, overflow: "hidden", marginHorizontal: -space.xs },
  listHead: { paddingHorizontal: space.lg, paddingTop: space.md },
  empty: { ...type.caption, color: colors.textTertiary },
  diffRow: { gap: space.s, paddingVertical: space.sm },
  diffDivided: { borderTopWidth: hairline, borderTopColor: colors.separator },
  diffLabel: { ...type.micro, color: colors.textTertiary },
  diffPair: { flexDirection: "row", alignItems: "center", gap: space.sm },
  diffSide: { flex: 1, padding: space.sm, borderRadius: radius.md, gap: 2 },
  diffSideBefore: { backgroundColor: colors.surface2 },
  diffSideAfter: { backgroundColor: colors.brandDim, borderWidth: hairline, borderColor: colors.brandBorder },
  diffTag: { ...type.nano, color: colors.textTertiary },
  diffText: { ...type.bodySm, color: colors.textPrimary },
  diffBefore: { color: colors.textSecondary },
  diffAfter: { fontFamily: type.label.fontFamily, color: colors.textPrimary },
  diffImage: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.surface2 },
});
