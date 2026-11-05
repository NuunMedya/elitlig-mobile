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

import { InfoLine, Panel, RecordCard } from "@/components/admin";
import { Badge, Button, Input, SkeletonListRow, Touchable, type Tone } from "@/components/ui";
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
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { openExternal } from "./contact";

export const REVIEW_TONE: Record<string, Tone> = { pending: "warn", approved: "win", rejected: "danger", cancelled: "neutral" };

export function StatusBadge({ status }: { status: string }) {
  return <Badge label={REVIEW_STATUS_LABELS[status] ?? status} tone={REVIEW_TONE[status] ?? "neutral"} size="xs" />;
}

export function PersonPanel({ user, title = "Talep eden üye" }: { user?: RequestPerson | null; title?: string }) {
  if (!user) return null;
  const h = user.history ?? {};
  return (
    <Panel title={title}>
      <Text style={styles.name} {...textScale.dense}>
        {personName(user)} <Text style={styles.muted}>@{user.username || "—"} · Üye #{user.id}</Text>
      </Text>
      <InfoLine label="İl" value={user.city || "—"} />
      <InfoLine
        label="Telefon"
        value={
          user.phone ? (
            <Touchable onPress={() => void openExternal(`tel:${user.phone}`)} accessibilityRole="link" style={styles.flex}>
              <Text style={styles.link} {...textScale.dense}>
                {user.phone}
              </Text>
            </Touchable>
          ) : (
            "—"
          )
        }
      />
      <InfoLine label="E-posta" value={user.email || "—"} />
      <InfoLine label="Üyelik tarihi" value={user.member_since ? formatDate(user.member_since) : "—"} />
      <InfoLine label="Oyuncu profili" value={user.player ? `${user.player.player_name || "Oyuncu"} (#${user.player.id})` : "Yok"} />
      <InfoLine label="Yönettiği takım" value={user.team ? `${user.team.team_name || "Takım"} (#${user.team.id})` : "Yok"} />
      {h.total ? (
        <Text style={styles.note} {...textScale.dense}>
          Toplam {h.total} talebi var: {h.approved || 0} onaylandı · {h.rejected || 0} reddedildi · {h.pending || 0} bekliyor.
        </Text>
      ) : null}
    </Panel>
  );
}

export function TeamPanel({ team, title = "Takım" }: { team?: RequestTeam | null; title?: string }) {
  if (!team) return null;
  return (
    <Panel title={title}>
      <RecordCard title={team.team_name} subtitle={`Takım #${team.id}`} avatar={{ name: team.team_name, image: team.logo }} style={styles.flat} />
      <InfoLine label="İl" value={team.city || "—"} />
      <InfoLine label="Kadro" value={team.roster_size != null ? `${team.roster_size} oyuncu` : "—"} />
      <InfoLine label="Lig / sezon" value={[team.current_league, team.current_season].filter(Boolean).join(" · ") || "—"} />
      <InfoLine label="Mevcut yönetici" value={team.manager ? `${personName(team.manager)} (@${team.manager.username || "—"})` : "Yok"} />
    </Panel>
  );
}

export function PlayerPanel({ player, title = "Oyuncu" }: { player?: RequestPlayer | null; title?: string }) {
  if (!player) return null;
  return (
    <Panel title={title}>
      <RecordCard title={player.player_name} subtitle={`Oyuncu #${player.id}`} avatar={{ name: player.player_name, image: player.player_img }} style={styles.flat} />
      <InfoLine label="Takım" value={player.teams?.length ? player.teams.map((t) => t.team_name).filter(Boolean).join(", ") : "Takımsız"} />
      <InfoLine label="Mevki" value={player.player_position || "—"} />
      <InfoLine label="Doğum yılı" value={player.birth_year ? String(player.birth_year) : "—"} />
      <InfoLine label="Maç / gol" value={`${player.total_matches || 0} maç · ${player.total_goals || 0} gol`} />
      <InfoLine label="Bağlı üye" value={player.owner ? `${personName(player.owner)} (@${player.owner.username || "—"})` : "Yok"} />
    </Panel>
  );
}

export function Warnings({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return (
    <View style={styles.warn}>
      <View style={styles.warnHead}>
        <Ionicons name="warning-outline" size={16} color={colors.warn} />
        <Text style={styles.warnTitle} {...textScale.dense}>
          Dikkat edilmesi gerekenler
        </Text>
      </View>
      {items.map((text) => (
        <Text key={text} style={styles.warnText} {...textScale.long}>
          • {text}
        </Text>
      ))}
    </View>
  );
}

export function Outcome({ text }: { text?: string | null }) {
  if (!text) return null;
  return (
    <View style={styles.outcome}>
      <Ionicons name="information-circle-outline" size={16} color={colors.info} />
      <Text style={styles.outcomeText} {...textScale.long}>
        <Text style={styles.bold}>Onaylanırsa: </Text>
        {text}
      </Text>
    </View>
  );
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
    return (
      <Panel title="Karar">
        <InfoLine label="Durum" value={<StatusBadge status={item.status} />} />
        <InfoLine label="Karar veren" value={item.reviewer ? personName(item.reviewer) : "—"} />
        <InfoLine label="Karar tarihi" value={item.reviewed_at ? formatDateTime(item.reviewed_at) : "—"} />
        {item.review_note ? (
          <Text style={styles.quote} {...textScale.long}>
            “{item.review_note}”
          </Text>
        ) : null}
      </Panel>
    );
  }
  if (!canDecide) return null;
  return (
    <Panel title="Karar">
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
        <Button label="Reddet" icon="close" variant="danger" onPress={() => onDecide("rejected")} disabled={busy} />
        <Button label={approveLabel} icon="checkmark" onPress={() => onDecide("approved")} loading={busy} style={styles.grow} />
      </View>
    </Panel>
  );
}

function DiffValue({ row, value }: { row: ChangeDiffRow; value: unknown }) {
  if (value === null || value === undefined || value === "") return <Text style={styles.empty}>Boş</Text>;
  if (row.kind === "image") return <Image source={{ uri: String(value) }} style={styles.diffImage} resizeMode="cover" />;
  return (
    <Text style={styles.diffText} selectable {...textScale.dense}>
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
    <Panel title="İstenen değişiklikler" action={hidden > 0 && changed.length ? { label: showAll ? "Yalnız değişenler" : `+${hidden} değişmeyen`, onPress: () => setShowAll((v) => !v) } : undefined}>
      {rows.map((row) => (
        <View key={row.field} style={[styles.diffRow, row.changed ? styles.diffChanged : null]}>
          <Text style={styles.diffLabel} {...textScale.dense}>
            {row.label}
            {row.changed ? "" : " · değişmiyor"}
          </Text>
          <View style={styles.diffPair}>
            <View style={styles.diffSide}>
              <DiffValue row={row} value={row.before} />
            </View>
            <Ionicons name="arrow-forward" size={14} color={colors.textTertiary} />
            <View style={styles.diffSide}>
              <DiffValue row={row} value={row.after} />
            </View>
          </View>
        </View>
      ))}
    </Panel>
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
      <RecordCard
        key={record.id}
        title={name}
        subtitle={sub}
        meta={`${isTeam ? "Takım" : "Oyuncu"} #${record.id}`}
        avatar={{ name, image }}
        badges={taken ? [{ label: isTeam ? "Yönetimi tanımlı" : "Başka üyeye bağlı", tone: "warn" }] : undefined}
        trailing={<Button label={isTeam ? "Sahiplendir" : "Bağla"} size="sm" variant="secondary" disabled={busy || Boolean(taken)} onPress={() => onLink(record)} />}
      />
    );
  };

  return (
    <Panel title={isTeam ? "Mevcut bir takım mı?" : "Mevcut bir oyuncu mu?"}>
      <Text style={styles.note} {...textScale.long}>
        {isTeam
          ? "Takım zaten varsa yeni takım açma; o takımı sahiplendir. Maç ve puan geçmişi bölünmez."
          : "Kişi zaten kayıtlıysa yeni profil açma; o kayda bağla. Aynı adlı farklı kişiler olabilir; takım, doğum yılı ve maç bilgisine bak."}
      </Text>
      {suggestions.length ? (
        <View style={styles.list}>
          <Text style={styles.sub} {...textScale.dense}>
            Benzer kayıtlar
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
          <View style={styles.list}>{results.map(row)}</View>
        ) : (
          <Text style={styles.note} {...textScale.dense}>
            Eşleşen başka kayıt yok.
          </Text>
        )
      ) : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  name: { ...type.label, color: colors.textPrimary },
  muted: { ...type.caption, color: colors.textTertiary },
  link: { ...type.bodySm, color: colors.brandAccent },
  note: { ...type.caption, color: colors.textSecondary },
  sub: { ...type.overline, color: colors.textTertiary },
  bold: { ...type.label },
  flat: { padding: 0, borderWidth: 0, backgroundColor: colors.surface1 },
  warn: { padding: space.md, borderRadius: radius.md, backgroundColor: colors.warnDim, gap: space.xs },
  warnHead: { flexDirection: "row", alignItems: "center", gap: space.xs },
  warnTitle: { ...type.label, color: colors.textPrimary },
  warnText: { ...type.bodySm, color: colors.textPrimary },
  outcome: { flexDirection: "row", gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.infoDim },
  outcomeText: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  quote: { ...type.bodySm, color: colors.textSecondary },
  row: { flexDirection: "row", gap: space.sm },
  grow: { flex: 1 },
  list: { gap: space.sm },
  empty: { ...type.caption, color: colors.textTertiary },
  diffRow: { gap: space.xs, paddingVertical: space.sm, borderBottomWidth: hairline, borderBottomColor: colors.separator },
  diffChanged: {},
  diffLabel: { ...type.caption, color: colors.textTertiary },
  diffPair: { flexDirection: "row", alignItems: "center", gap: space.sm },
  diffSide: { flex: 1 },
  diffText: { ...type.bodySm, color: colors.textPrimary },
  diffImage: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.surface2 },
});
