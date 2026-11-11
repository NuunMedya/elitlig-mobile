/**
 * 2. ADIM — KADRO (web MatchLineupStep).
 *
 * İki takımın kadrosu: takımın kalıcı kadrosu (/oyuncu-takimlari/:takım) +
 * kadroya sonradan eklenen oyuncular. Her oyuncu için rol (İlk 11 / Yedek),
 * forma no, mevki ve kaptan. Kadroda olmayan oyuncu adla aranıp eklenir; hiç
 * kaydı yoksa maçın takımına bağlı yeni oyuncu oluşturulur.
 *
 * KAYIT: sunucu kadroyu iki takım birlikte yazar (POST /api/maclar/:id/kadro);
 * rolü olmayan oyuncular kadroya girmez. Kalıcı takımı başka olan oyuncu bu
 * maç için misafir sayılır (isGuest).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";

import { ChipsField, ToggleField, confirmAction, useAdminMutation } from "@/components/admin";
import {
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  Input,
  SkeletonListRow,
  Touchable,
  useToast,
} from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { errorText } from "@/lib/admin/errors";
import {
  createRosterPlayer,
  getLineup,
  getTeamRoster,
  rosterPlayerId,
  saveLineup,
  searchPlayers,
  type AdminMatch,
  type LineupPayloadRow,
  type RosterPlayer,
} from "@/lib/api/admin/matches";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { POSITIONS, type Side } from "./model";
import { Note, SidePicker } from "./parts";

type Role = "" | "starter" | "bench";

interface Pick {
  id: string;
  name: string;
  /** Kalıcı takımı (misafir tespiti için). */
  teamId: number | null;
  role: Role;
  number: string;
  position: string;
  captain: boolean;
  /** Takımın kalıcı kadrosundan değil, sonradan eklendi. */
  extra: boolean;
  guestFlag?: boolean;
}

type SideState = Record<string, Pick>;

const nameOf = (p: RosterPlayer) => String(p.player_name ?? "").trim();
const numberOf = (p: RosterPlayer) => String(p.jersey_number ?? p.player_number ?? "").trim();
const positionOf = (p: RosterPlayer) => String(p.team_position ?? p.player_position ?? "").trim();

export function LineupStep({ match, onDirtyChange }: { match: AdminMatch; onDirtyChange?: (dirty: boolean) => void }) {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const matchId = Number(match.id);
  const homeTeamId = Number(match.home_team_id) || null;
  const awayTeamId = Number(match.away_team_id) || null;
  const canEdit = hasAnyPermission(auth.user, ["matches.lineup"]);

  const lineupQuery = useQuery({
    queryKey: ["admin", "matches", "lineup", matchId],
    queryFn: () => getLineup(matchId),
  });
  const homeRoster = useQuery({
    queryKey: ["admin", "matches", "roster", homeTeamId],
    queryFn: () => getTeamRoster(homeTeamId as number),
    enabled: Boolean(homeTeamId),
    staleTime: 60_000,
  });
  const awayRoster = useQuery({
    queryKey: ["admin", "matches", "roster", awayTeamId],
    queryFn: () => getTeamRoster(awayTeamId as number),
    enabled: Boolean(awayTeamId),
    staleTime: 60_000,
  });

  const [side, setSide] = useState<Side>("home");
  const [state, setState] = useState<Record<Side, SideState>>({ home: {}, away: {} });
  const [hydrated, setHydrated] = useState(false);
  const [q, setQ] = useState("");
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [editing, setEditing] = useState<Pick | null>(null);
  const [adding, setAdding] = useState(false);
  const [dirty, setDirty] = useState(false);

  /* Kalıcı kadro + kayıtlı maç kadrosu tek durumda birleşir. */
  useEffect(() => {
    if (!lineupQuery.data || homeRoster.isLoading || awayRoster.isLoading) return;
    if (hydrated && dirty) return;
    const build = (roster: RosterPlayer[] | undefined, saved: typeof lineupQuery.data.home, teamId: number | null) => {
      const out: SideState = {};
      for (const p of roster ?? []) {
        const id = rosterPlayerId(p);
        if (!id) continue;
        out[id] = {
          id: String(id),
          name: nameOf(p) || `Oyuncu #${id}`,
          teamId: Number(p.team_id) || teamId,
          role: "",
          number: numberOf(p),
          position: positionOf(p),
          captain: false,
          extra: false,
        };
      }
      for (const row of saved) {
        const id = String(row.playerId ?? row.oyuncu_id ?? row.id ?? "");
        if (!id) continue;
        const base = out[id];
        out[id] = {
          id,
          name: row.guestName || row.playerName || base?.name || `Oyuncu #${id}`,
          teamId: base?.teamId ?? (row.isGuest ? null : teamId),
          role: row.role === "starter" || row.role === "bench" ? row.role : "",
          number: row.number === "" || row.number == null ? base?.number ?? "" : String(row.number),
          position: row.position || base?.position || "",
          captain: Boolean(row.captain),
          extra: !base,
          guestFlag: row.isGuest,
        };
      }
      return out;
    };
    setState({
      home: build(homeRoster.data, lineupQuery.data.home ?? [], homeTeamId),
      away: build(awayRoster.data, lineupQuery.data.away ?? [], awayTeamId),
    });
    setHydrated(true);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineupQuery.data, homeRoster.data, awayRoster.data, homeRoster.isLoading, awayRoster.isLoading]);

  /* Kaydedilmemiş kadro değişikliği üst ekrana bildirilir: adım değişirken uyarılır. */
  useEffect(() => {
    onDirtyChange?.(dirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  const teamId = side === "home" ? homeTeamId : awayTeamId;
  const teamName = side === "home" ? match.first_team_name : match.second_team_name;

  const update = useCallback((s: Side, id: string, patchValue: Partial<Pick>) => {
    setDirty(true);
    setState((prev) => {
      const current = prev[s][id];
      if (!current) return prev;
      let next: SideState = { ...prev[s], [id]: { ...current, ...patchValue } };
      // Takım başına tek kaptan.
      if (patchValue.captain) {
        next = Object.fromEntries(Object.entries(next).map(([k, v]) => [k, k === id ? v : { ...v, captain: false }]));
      }
      return { ...prev, [s]: next };
    });
  }, []);

  const counts = useMemo(() => {
    const c = (s: Side) => {
      const list = Object.values(state[s]);
      return { starters: list.filter((p) => p.role === "starter").length, bench: list.filter((p) => p.role === "bench").length };
    };
    return { home: c("home"), away: c("away") };
  }, [state]);

  const list = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr-TR");
    const weight = (p: Pick) => (p.role === "starter" ? 0 : p.role === "bench" ? 1 : 2);
    return Object.values(state[side])
      .filter((p) => (onlyPicked ? p.role !== "" : true))
      .filter((p) => (needle ? `${p.name} ${p.number}`.toLocaleLowerCase("tr-TR").includes(needle) : true))
      .sort((a, b) => weight(a) - weight(b) || a.name.localeCompare(b.name, "tr"));
  }, [state, side, q, onlyPicked]);

  /* ───────── kaydet ───────── */
  const buildPayload = (s: Side): LineupPayloadRow[] => {
    const tid = s === "home" ? homeTeamId : awayTeamId;
    return Object.values(state[s])
      .filter((p): p is Pick & { role: "starter" | "bench" } => p.role === "starter" || p.role === "bench")
      .map((p) => {
        const guest = p.guestFlag === true || !p.teamId || p.teamId !== tid;
        const n = Number(p.number);
        return {
          playerId: Number(p.id),
          oyuncu_id: Number(p.id),
          role: p.role,
          position: p.position,
          number: p.number === "" || !Number.isFinite(n) ? "" : n,
          captain: p.captain,
          isGuest: guest,
          ...(guest ? { guestName: p.name } : {}),
        };
      });
  };

  const save = useAdminMutation(
    () => saveLineup(matchId, { home: buildPayload("home"), away: buildPayload("away") }),
    {
      success: (res) => res?.message || "Kadro kaydedildi.",
      invalidate: [["admin", "matches"]],
      onSuccess: () => setDirty(false),
    }
  );

  const askSave = async () => {
    if (!homeTeamId || !awayTeamId) {
      Alert.alert("Kadro kaydedilemez", "Maçın ev sahibi / deplasman takımı seçili değil. Önce Maç öncesi adımında takımları seç.");
      return;
    }
    const home = buildPayload("home").length;
    const away = buildPayload("away").length;
    if (!home && !away) {
      Alert.alert("Kadro boş", "En az bir oyuncuyu İlk 11 ya da Yedek olarak seç.");
      return;
    }
    if (!home || !away) {
      const ok = await confirmAction({
        title: "Bir takımın kadrosu boş",
        message: `${!home ? match.first_team_name : match.second_team_name} için oyuncu seçilmedi. Yine de kaydedilsin mi?`,
        confirmLabel: "Kaydet",
      });
      if (!ok) return;
    }
    save.mutate(undefined);
  };

  /* ───────── oyuncu ekle ───────── */
  const addPlayer = (p: RosterPlayer) => {
    const id = rosterPlayerId(p);
    if (!id) return;
    const other: Side = side === "home" ? "away" : "home";
    if (state[other][String(id)]?.role) {
      Alert.alert("Oyuncu diğer takımda", "Bu oyuncu rakip takımın kadrosunda seçili. Aynı oyuncu iki takımda oynayamaz.");
      return;
    }
    setDirty(true);
    setState((prev) => ({
      ...prev,
      [side]: {
        ...prev[side],
        [id]: prev[side][id] ?? {
          id: String(id),
          name: nameOf(p) || `Oyuncu #${id}`,
          teamId: Number(p.team_id) || null,
          role: "starter",
          number: numberOf(p),
          position: positionOf(p),
          captain: false,
          extra: true,
        },
      },
    }));
    setAdding(false);
    toast.show({ message: `${nameOf(p) || "Oyuncu"} ${teamName} kadrosuna eklendi.`, tone: "success" });
  };

  const removeExtra = (p: Pick) => {
    setDirty(true);
    setState((prev) => {
      const next = { ...prev[side] };
      delete next[p.id];
      return { ...prev, [side]: next };
    });
    setEditing(null);
  };

  const loading = lineupQuery.isLoading || homeRoster.isLoading || awayRoster.isLoading;

  return (
    <View style={styles.stack}>
      {!homeTeamId || !awayTeamId ? (
        <Note tone="warn" text="Maçın takım kimlikleri eksik. Kadro girmek için Maç öncesi adımında iki takımı da seç." />
      ) : null}

      <SidePicker
        value={side}
        onChange={(s) => {
          setSide(s);
          setQ("");
        }}
        homeName={`${match.first_team_name || "Ev sahibi"} (${counts.home.starters}+${counts.home.bench})`}
        awayName={`${match.second_team_name || "Deplasman"} (${counts.away.starters}+${counts.away.bench})`}
      />

      <Text style={styles.summary} {...textScale.dense}>
        {teamName}: İlk 11 {counts[side].starters} · Yedek {counts[side].bench}
      </Text>

      <Input variant="search" leadingIcon="search" value={q} onChangeText={setQ} placeholder="Kadroda ara (ad, forma no)" autoCorrect={false} />
      <ChipGroup scrollable={false} contentPadding={0}>
        <Chip label="Yalnız seçilenler" selected={onlyPicked} onPress={() => setOnlyPicked((v) => !v)} size="sm" icon="checkmark-done-outline" />
        {canEdit ? <Chip label="Oyuncu ekle" icon="person-add-outline" onPress={() => setAdding(true)} size="sm" /> : null}
      </ChipGroup>

      {loading ? (
        <SkeletonListRow count={6} />
      ) : list.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={q || onlyPicked ? "Eşleşen oyuncu yok" : "Kadroda oyuncu yok"}
          body={q || onlyPicked ? "Süzgeci değiştir." : "Takımın kalıcı kadrosu boş. Oyuncu ekle ile aratıp kadroya al."}
          action={canEdit && !q ? { label: "Oyuncu ekle", onPress: () => setAdding(true) } : undefined}
          variant="inline"
        />
      ) : (
        <View style={styles.list}>
          {list.map((p) => (
            <PlayerLine
              key={p.id}
              player={p}
              disabled={!canEdit}
              onRole={(role) => update(side, p.id, { role: p.role === role ? "" : role })}
              onOpen={() => setEditing(p)}
            />
          ))}
        </View>
      )}

      {canEdit ? (
        <Button
          label={dirty ? "Kadroyu kaydet" : "Kadro kayıtlı"}
          icon="save-outline"
          onPress={askSave}
          loading={save.isPending}
          disabled={!dirty}
          haptic="success"
          fullWidth
        />
      ) : null}

      <PlayerEditSheet
        player={editing}
        onClose={() => setEditing(null)}
        onChange={(patchValue) => {
          if (!editing) return;
          update(side, editing.id, patchValue);
          setEditing((e) => (e ? { ...e, ...patchValue } : e));
        }}
        onRemove={editing?.extra ? () => removeExtra(editing) : undefined}
      />

      <AddPlayerSheet
        visible={adding}
        onClose={() => setAdding(false)}
        teamName={teamName}
        existing={state[side]}
        onPick={addPlayer}
        onCreate={async (name) => {
          if (!teamId) return;
          try {
            const res = await createRosterPlayer(matchId, { playerName: name, teamId, side });
            const created = { ...res.player, team_id: res.player.team_id ?? teamId };
            void queryClient.invalidateQueries({ queryKey: ["admin", "matches", "roster", teamId] });
            addPlayer(created);
          } catch (error) {
            Alert.alert("Oyuncu eklenemedi", errorText(error));
          }
        }}
      />
    </View>
  );
}

const PlayerLine = React.memo(function PlayerLine({
  player,
  disabled,
  onRole,
  onOpen,
}: {
  player: Pick;
  disabled?: boolean;
  onRole: (role: "starter" | "bench") => void;
  onOpen: () => void;
}) {
  return (
    <View style={[styles.row, player.role ? styles.rowOn : null]}>
      <Touchable onPress={onOpen} disabled={disabled} style={styles.rowMain} accessibilityRole="button" accessibilityLabel={`${player.name} ayrıntıları`}>
        <View style={styles.number}>
          <Text style={styles.numberText} {...textScale.badge}>
            {player.number || "–"}
          </Text>
        </View>
        <View style={styles.rowText}>
          <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
            {player.name}
            {player.captain ? "  (K)" : ""}
          </Text>
          <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
            {[player.position || "Mevki yok", player.extra ? "Sonradan eklendi" : null].filter(Boolean).join(" · ")}
          </Text>
        </View>
      </Touchable>
      <View style={styles.roles}>
        <Chip label="İlk 11" size="sm" tone="brand" selected={player.role === "starter"} onPress={() => onRole("starter")} disabled={disabled} />
        <Chip label="Yedek" size="sm" tone="info" selected={player.role === "bench"} onPress={() => onRole("bench")} disabled={disabled} />
      </View>
    </View>
  );
});

function PlayerEditSheet({
  player,
  onClose,
  onChange,
  onRemove,
}: {
  player: Pick | null;
  onClose: () => void;
  onChange: (patch: Partial<Pick>) => void;
  onRemove?: () => void;
}) {
  return (
    <BottomSheet
      visible={player != null}
      onClose={onClose}
      title={player?.name}
      snap="content"
      footer={<Button label="Tamam" onPress={onClose} fullWidth />}
    >
      {player ? (
        <View style={styles.stack}>
          <ChipsField<string>
            label="Rol"
            value={player.role || null}
            options={[
              { key: "starter", label: "İlk 11" },
              { key: "bench", label: "Yedek" },
            ]}
            onChange={(v) => onChange({ role: (typeof v === "string" ? v : "") as Role })}
          />
          <Input
            label="Forma no"
            value={player.number}
            onChangeText={(t) => onChange({ number: t.replace(/\D/g, "").slice(0, 3) })}
            keyboardType="number-pad"
            placeholder="Ör. 10"
          />
          <ChipsField<string>
            label="Mevki"
            value={player.position || null}
            options={POSITIONS}
            onChange={(v) => onChange({ position: typeof v === "string" ? v : "" })}
          />
          <ToggleField label="Kaptan" hint="Takımda tek kaptan olur; seçilince diğerinden kalkar." value={player.captain} onChange={(v) => onChange({ captain: v })} />
          {onRemove ? <Button label="Listeden çıkar" variant="ghost" icon="close-circle-outline" onPress={onRemove} /> : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}

function AddPlayerSheet({
  visible,
  onClose,
  teamName,
  existing,
  onPick,
  onCreate,
}: {
  visible: boolean;
  onClose: () => void;
  teamName: string;
  existing: SideState;
  onPick: (p: RosterPlayer) => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (visible) {
      setQ("");
      setDebounced("");
    }
  }, [visible]);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  const results = useQuery({
    queryKey: ["admin", "matches", "player-search", debounced],
    queryFn: () => searchPlayers(debounced),
    enabled: visible && debounced.length >= 2,
    staleTime: 30_000,
  });

  const rows = (results.data ?? []).filter((p) => {
    const id = rosterPlayerId(p);
    return id && !existing[id];
  });

  const create = async () => {
    const name = q.trim().replace(/\s+/g, " ");
    if (name.length < 3 || !name.includes(" ")) {
      Alert.alert("Ad soyad gerekli", "Yeni oyuncu için ad ve soyadı birlikte yaz.");
      return;
    }
    const ok = await confirmAction({
      title: "Yeni oyuncu oluştur",
      message: `"${name}" adlı oyuncu oluşturulup ${teamName} kadrosuna bağlanacak.${rows.length ? "\n\nBenzer adlı oyuncular listede; aradığın onlardan biri olmadığından emin ol." : ""}`,
      confirmLabel: "Oluştur",
    });
    if (!ok) return;
    setCreating(true);
    try {
      await onCreate(name);
    } finally {
      setCreating(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={`${teamName} · oyuncu ekle`} snap="full" scrollable={false}>
      <View style={styles.sheetBody}>
        <Input variant="search" leadingIcon="search" value={q} onChangeText={setQ} placeholder="Oyuncu adı ara (en az 2 harf)" autoCorrect={false} autoFocus />
        <FlatList
          data={rows}
          keyExtractor={(p) => String(rosterPlayerId(p))}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            q.trim().length >= 3 ? (
              <Touchable onPress={create} disabled={creating} style={styles.createRow} accessibilityRole="button">
                <Ionicons name="person-add-outline" size={18} color={colors.brandAccent} />
                <Text style={styles.createText} numberOfLines={2} {...textScale.dense}>
                  {creating ? "Oluşturuluyor…" : `"${q.trim()}" adıyla yeni oyuncu oluştur`}
                </Text>
              </Touchable>
            ) : null
          }
          ListEmptyComponent={
            results.isLoading ? (
              <SkeletonListRow count={4} />
            ) : (
              <EmptyState
                icon="search-outline"
                title={debounced.length < 2 ? "Aramaya başla" : "Oyuncu bulunamadı"}
                body={debounced.length < 2 ? "Kadroda olmayan oyuncuyu adıyla bul." : "Kayıtlı değilse yukarıdan yeni oyuncu oluştur."}
                variant="inline"
                compact
              />
            )
          }
          renderItem={({ item }) => (
            <Touchable onPress={() => onPick(item)} style={styles.searchRow} haptic="selection" accessibilityRole="button">
              <View style={styles.rowText}>
                <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
                  {nameOf(item)}
                </Text>
                <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
                  {[item.team_name || "Takımsız", positionOf(item)].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <Ionicons name="add-circle-outline" size={22} color={colors.brandAccent} />
            </Touchable>
          )}
        />
        {results.isError ? (
          <Text style={styles.error} {...textScale.long}>
            {errorText(results.error)}
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  summary: { ...type.caption, color: colors.textTertiary },
  list: { gap: space.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  rowOn: { borderColor: colors.brandBorder },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm },
  number: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.surface3,
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: { ...type.labelSm, color: colors.textPrimary },
  rowText: { flex: 1, gap: 2 },
  name: { ...type.label, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textTertiary },
  roles: { flexDirection: "row", gap: space.xs },
  sheetBody: { flex: 1, gap: space.sm },
  createRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.md,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  createText: { ...type.label, color: colors.brandAccent, flex: 1 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  error: { ...type.bodySm, color: colors.danger },
});
