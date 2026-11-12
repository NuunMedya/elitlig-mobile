/**
 * 2. ADIM — KADRO (web MatchLineupStep).
 *
 * İki takımın kadrosu: takımın kalıcı kadrosu (/oyuncu-takimlari/:takım) +
 * kadroya sonradan eklenen oyuncular. Her oyuncu için rol (İlk 11 / Yedek),
 * forma no, mevki ve kaptan. Kadroda olmayan oyuncu adla aranıp eklenir; hiç
 * kaydı yoksa maçın takımına bağlı yeni oyuncu oluşturulur.
 *
 * HIZLI GİRİŞ: rol satırda tek dokunuş; seçilen oyuncunun altında mevki
 * (KAL / DEF / ORT / FOR) ve kaptan düğmeleri açılır (web PlayerRow). "Son
 * maçın kadrosu" takımın önceki maçındaki kadroyu getirir; "Saha önizleme"
 * İlk 11'i mevki hatlarına dizer ve dizilişi (4-4-2) gösterir. Oyuncu
 * ayrıntısında forma no ve fotoğraf güncellenir (PATCH /oyuncular/updateImage).
 *
 * KAYIT: sunucu kadroyu iki takım birlikte yazar (POST /api/maclar/:id/kadro);
 * rolü olmayan oyuncular kadroya girmez. Kalıcı takımı başka olan oyuncu bu
 * maç için misafir sayılır (isGuest). Sunucu kadroyu silip yeniden yazdığı
 * için kayıtlı oyuncu puanları gövdede geri gönderilir (yoksa silinirdi).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";

import { ChipsField, ToggleField, confirmAction, useAdminMutation } from "@/components/admin";
import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  Input,
  SkeletonListRow,
  GradientBar,
  Touchable,
  useToast,
} from "@/components/ui";
import { LinearGradient } from "expo-linear-gradient";
import { hasAnyPermission } from "@/lib/admin/access";
import { errorText } from "@/lib/admin/errors";
import {
  createRosterPlayer,
  LAST_LINEUP_SCAN,
  findLastLineup,
  getLineup,
  getTeamRoster,
  rosterPlayerId,
  saveLineup,
  searchPlayers,
  type AdminMatch,
  type LineupPayloadRow,
  type RosterPlayer,
} from "@/lib/api/admin/matches";
import { uploadPlayerImage } from "@/lib/api/admin/players";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { POSITIONS, dayOf, shortDay, type Side } from "./model";
import { Note, StepSaveBar } from "./parts";

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
  img?: string | null;
  /** Maç sonunda verilmiş puan — kadro yeniden kaydedilirken korunur. */
  puan?: number | null;
}

const POS_SHORT: Record<string, string> = { Kaleci: "KAL", Defans: "DEF", "Orta Saha": "ORT", Forvet: "FOR" };

/** Serbest yazılmış mevkiyi dört hattan birine indirger (web previewLineOf). */
function lineOf(position: string): string {
  const v = position.toLocaleLowerCase("tr-TR");
  if (!v) return "";
  if (v.includes("kaleci") || v === "gk") return "Kaleci";
  if (v.includes("defans") || v.includes("stoper") || v.includes("bek")) return "Defans";
  if (v.includes("orta") || v.includes("kanat")) return "Orta Saha";
  if (v.includes("forvet") || v.includes("santrafor")) return "Forvet";
  return "";
}

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || "Oyuncu";
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}

const isGuestOf = (p: Pick, teamId: number | null) => p.guestFlag === true || !p.teamId || p.teamId !== teamId;

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
  const [preview, setPreview] = useState(false);
  const [copying, setCopying] = useState(false);

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
          img: p.player_img ?? null,
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
          img: base?.img ?? row.playerImg ?? null,
          puan: row.puan ?? null,
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
        const guest = isGuestOf(p, tid);
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
          ...(p.puan != null ? { puan: p.puan } : {}),
        };
      });
  };

  const save = useAdminMutation(
    () => saveLineup(matchId, { home: buildPayload("home"), away: buildPayload("away") }),
    {
      success: (res) => res?.message || "Kadro kaydedildi.",
      invalidate: [["admin", "matches"], ["studio"]],
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
          img: p.player_img ?? null,
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

  /* ───────── toplu yardımcılar ───────── */
  const clearSide = async () => {
    if (!counts[side].starters && !counts[side].bench) return;
    const ok = await confirmAction({
      title: "Seçimi temizle",
      message: `${teamName} için İlk 11 ve yedek seçimleri kaldırılsın mı? Kaydedene kadar sunucudaki kadro değişmez.`,
      confirmLabel: "Temizle",
      destructive: true,
    });
    if (!ok) return;
    setDirty(true);
    setState((prev) => ({
      ...prev,
      [side]: Object.fromEntries(Object.entries(prev[side]).map(([k, v]) => [k, { ...v, role: "" as Role, captain: false }])),
    }));
  };

  /** Takımın önceki maçındaki kadroyu bu maça uygular (kaydetmez). */
  const copyLast = async () => {
    if (!teamId) return;
    setCopying(true);
    try {
      const found = await findLastLineup(teamId, matchId, dayOf(match.date));
      if (!found) {
        Alert.alert("Önceki kadro bulunamadı", `${teamName} takımının son 120 gündeki son ${LAST_LINEUP_SCAN} maçında girilmiş kadro yok.`);
        return;
      }
      const label = `${found.match.first_team_name} – ${found.match.second_team_name} (${shortDay(found.match.date)})`;
      const ok = await confirmAction({
        title: "Son maçın kadrosunu getir",
        message: `${label} maçındaki ${found.rows.length} oyuncu ${teamName} için seçilecek. Şu anki seçimler değişir; kaydetmeden önce düzenleyebilirsin.`,
        confirmLabel: "Kadroyu getir",
      });
      if (!ok) return;
      const other: Side = side === "home" ? "away" : "home";
      // Rakip kadroda seçili oyuncu iki takımda birden oynayamaz; atlanır.
      const skipped = found.rows.filter((row) => state[other][String(row.playerId ?? row.oyuncu_id ?? "")]?.role).length;
      setDirty(true);
      setState((prev) => {
        const next: SideState = Object.fromEntries(Object.entries(prev[side]).map(([k, v]) => [k, { ...v, role: "" as Role, captain: false }]));
        for (const row of found.rows) {
          const id = String(row.playerId ?? row.oyuncu_id ?? "");
          if (!id) continue;
          if (prev[other][id]?.role) continue;
          const base = next[id];
          next[id] = {
            id,
            name: base?.name ?? row.guestName ?? row.playerName ?? `Oyuncu #${id}`,
            teamId: base ? base.teamId : row.isGuest ? null : teamId,
            role: row.role === "starter" ? "starter" : "bench",
            number: row.number === "" || row.number == null ? base?.number ?? "" : String(row.number),
            position: row.position || base?.position || "",
            captain: Boolean(row.captain),
            extra: base ? base.extra : true,
            guestFlag: base ? base.guestFlag : row.isGuest,
            img: base?.img ?? row.playerImg ?? null,
            puan: base?.puan ?? null,
          };
        }
        return { ...prev, [side]: next };
      });
      toast.show({
        message: skipped ? `Kadro getirildi; ${skipped} oyuncu rakip kadroda seçili olduğu için atlandı.` : "Kadro getirildi. Kontrol edip kaydet.",
        tone: skipped ? "warn" : "success",
      });
    } catch (error) {
      Alert.alert("Kadro getirilemedi", errorText(error));
    } finally {
      setCopying(false);
    }
  };

  /* ───────── fotoğraf ───────── */
  const [photoBusy, setPhotoBusy] = useState(false);
  const pickPhoto = async (p: Pick) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("İzin gerekli", "Oyuncu fotoğrafı seçmek için fotoğraflarına erişim izni ver.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const mime = asset.mimeType ?? "image/jpeg";
    setPhotoBusy(true);
    try {
      const res = await uploadPlayerImage(Number(p.id), {
        uri: asset.uri,
        name: asset.fileName ?? `oyuncu-${p.id}-${Date.now()}.${mime.split("/")[1]?.replace("jpeg", "jpg") || "jpg"}`,
        type: mime,
      });
      const url = res?.photoUrl || res?.url || asset.uri;
      // Fotoğraf oyuncu kaydına yazılır; kadro taslağını "kaydedilmemiş" yapmaz.
      setState((prev) => ({
        home: prev.home[p.id] ? { ...prev.home, [p.id]: { ...prev.home[p.id], img: url } } : prev.home,
        away: prev.away[p.id] ? { ...prev.away, [p.id]: { ...prev.away[p.id], img: url } } : prev.away,
      }));
      setEditing((e) => (e && e.id === p.id ? { ...e, img: url } : e));
      toast.show({ message: "Oyuncu fotoğrafı güncellendi.", tone: "success" });
    } catch (error) {
      Alert.alert("Fotoğraf yüklenemedi", errorText(error));
    } finally {
      setPhotoBusy(false);
    }
  };

  /* ───────── saha önizleme ───────── */
  const starters = useMemo(() => Object.values(state[side]).filter((p) => p.role === "starter"), [state, side]);
  const lines = useMemo(() => {
    const groups: Record<string, Pick[]> = { Forvet: [], "Orta Saha": [], Defans: [], Kaleci: [], "": [] };
    for (const p of starters) groups[lineOf(p.position)].push(p);
    const formation = [groups.Defans.length, groups["Orta Saha"].length, groups.Forvet.length].filter(Boolean).join("-") || "–";
    return { groups, formation };
  }, [starters]);
  const captains = Object.values(state[side]).filter((p) => p.role && p.captain).length;

  const loading = lineupQuery.isLoading || homeRoster.isLoading || awayRoster.isLoading;
  const pickedTotal = counts.home.starters + counts.home.bench + counts.away.starters + counts.away.bench;

  return (
    <View style={styles.stack}>
      {!homeTeamId || !awayTeamId ? (
        <Note tone="warn" text="Maçın takım kimlikleri eksik. Kadro girmek için Maç öncesi adımında iki takımı da seç." />
      ) : null}

      {/* Takım seçici: iki takım kartı — İlk 11 doluluğu (n/11) degrade çubukla, yedek sayısı ve kaptan durumu. */}
      <View style={styles.sides} accessibilityRole="radiogroup">
        {(["home", "away"] as const).map((key) => {
          const on = side === key;
          const name = key === "home" ? match.first_team_name || "Ev sahibi" : match.second_team_name || "Deplasman";
          const c = counts[key];
          return (
            <Touchable
              key={key}
              feedback="card"
              haptic="selection"
              onPress={() => {
                setSide(key);
                setQ("");
              }}
              style={[styles.sideCard, on ? styles.sideCardOn : null]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${name}: İlk 11 ${c.starters}, yedek ${c.bench}`}
            >
              <View style={styles.sideHead}>
                <Text style={styles.sideTag} {...textScale.badge}>
                  {key === "home" ? "EV SAHİBİ" : "DEPLASMAN"}
                </Text>
                {on ? <Ionicons name="checkmark-circle" size={14} color={colors.brandAccent} /> : null}
              </View>
              <Text style={[styles.sideName, on ? styles.sideNameOn : null]} numberOfLines={1} {...textScale.dense}>
                {name}
              </Text>
              <View style={styles.sideNums}>
                <Text style={styles.sideBig} {...textScale.badge}>
                  {c.starters}
                  <Text style={styles.sideOf}>/11</Text>
                </Text>
                <Text style={styles.sideBench} {...textScale.badge}>
                  +{c.bench} yedek
                </Text>
              </View>
              <GradientBar value={Math.min(1, c.starters / 11)} height={4} gradient={c.starters >= 11 ? [colors.win, colors.win] : undefined} />
            </Touchable>
          );
        })}
      </View>

      {/* Seçili takımın özeti: diziliş, kaptan ve seçili toplam. */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel} {...textScale.badge}>DİZİLİŞ</Text>
          <Text style={styles.summaryValue} numberOfLines={1} {...textScale.badge}>{lines.formation}</Text>
        </View>
        <View style={[styles.summaryCell, styles.summaryDivided]}>
          <Text style={styles.summaryLabel} {...textScale.badge}>KAPTAN</Text>
          <View style={styles.summaryInline}>
            <Ionicons name={captains ? "checkmark-circle" : counts[side].starters ? "alert-circle" : "remove-circle-outline"} size={14} color={captains ? colors.win : counts[side].starters ? colors.warn : colors.textTertiary} />
            <Text style={[styles.summaryValueSm, captains ? null : counts[side].starters ? { color: colors.warn } : null]} numberOfLines={1} {...textScale.dense}>
              {captains ? "Seçildi" : counts[side].starters ? "Seçilmedi" : "—"}
            </Text>
          </View>
        </View>
        <View style={[styles.summaryCell, styles.summaryDivided]}>
          <Text style={styles.summaryLabel} {...textScale.badge}>KADRODA</Text>
          <Text style={styles.summaryValue} numberOfLines={1} {...textScale.badge}>{counts[side].starters + counts[side].bench}</Text>
        </View>
      </View>

      <Input variant="search" leadingIcon="search" value={q} onChangeText={setQ} placeholder="Kadroda ara (ad, forma no)" autoCorrect={false} />
      <ChipGroup scrollable={false} contentPadding={0}>
        <Chip label="Yalnız seçilenler" selected={onlyPicked} onPress={() => setOnlyPicked((v) => !v)} size="sm" icon="checkmark-done-outline" />
        <Chip label="Saha önizleme" selected={preview} onPress={() => setPreview((v) => !v)} size="sm" icon="grid-outline" />
        {canEdit ? <Chip label="Oyuncu ekle" icon="person-add-outline" onPress={() => setAdding(true)} size="sm" /> : null}
        {canEdit ? (
          <Chip label={copying ? "Getiriliyor…" : "Son maçın kadrosu"} icon="copy-outline" onPress={() => void copyLast()} disabled={copying || !teamId} size="sm" />
        ) : null}
        {canEdit && (counts[side].starters || counts[side].bench) ? (
          <Chip label="Seçimi temizle" icon="close-circle-outline" onPress={() => void clearSide()} size="sm" />
        ) : null}
      </ChipGroup>

      {preview ? (
        <View style={styles.pitch} accessibilityLabel={`${teamName} ilk 11 saha önizlemesi, diziliş ${lines.formation}`}>
          <LinearGradient colors={colors.gradientPitch} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
          {/* Tebeşir çizgileri: orta saha çizgisi ve yuvarlak, ceza sahası. */}
          <View style={styles.chalkMid} pointerEvents="none" />
          <View style={styles.chalkCircle} pointerEvents="none" />
          <View style={styles.chalkBox} pointerEvents="none" />
          <View style={styles.pitchHead}>
            <Text style={styles.pitchTitle} {...textScale.dense}>
              SAHA ÖNİZLEME
            </Text>
            <View style={styles.pitchFormationPill}>
              <Text style={styles.pitchFormation} {...textScale.badge}>
                {lines.formation}
              </Text>
            </View>
            <Text style={styles.pitchCount} {...textScale.dense}>
              {starters.length}/11
            </Text>
          </View>
          {(["Forvet", "Orta Saha", "Defans", "Kaleci"] as const).map((line) => (
            <View key={line} style={styles.pitchLine}>
              {lines.groups[line].length ? (
                lines.groups[line].map((p) => (
                  <View key={p.id} style={styles.pitchMan}>
                    <View style={[styles.pitchShirt, line === "Kaleci" ? styles.pitchShirtKeeper : null]}>
                      <Text style={styles.pitchShirtNo} {...textScale.badge}>
                        {p.number || "–"}
                      </Text>
                      {p.captain ? (
                        <View style={styles.pitchCaptain}>
                          <Text style={styles.pitchCaptainText} {...textScale.badge}>K</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.pitchChipText} numberOfLines={1} {...textScale.dense}>
                      {shortName(p.name)}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.pitchEmpty} {...textScale.dense}>
                  {POS_SHORT[line]} · boş
                </Text>
              )}
            </View>
          ))}
          {lines.groups[""].length ? (
            <Text style={styles.pitchLoose} {...textScale.long}>
              Mevki seçilmedi: {lines.groups[""].map((p) => shortName(p.name)).join(", ")}
            </Text>
          ) : null}
        </View>
      ) : null}

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
          {list.map((p, index) => (
            <PlayerLine
              key={p.id}
              first={index === 0}
              player={p}
              guest={isGuestOf(p, teamId)}
              disabled={!canEdit}
              onRole={(role) => update(side, p.id, { role: p.role === role ? "" : role, ...(p.role === role ? { captain: false } : {}) })}
              onPosition={(position) => update(side, p.id, { position: p.position === position ? "" : position })}
              onCaptain={() => update(side, p.id, { captain: !p.captain })}
              onOpen={() => setEditing(p)}
            />
          ))}
        </View>
      )}

      <StepSaveBar
        visible={canEdit}
        label={dirty ? "Kadroyu kaydet" : "Kadro kayıtlı"}
        note={dirty ? `Kaydedilmedi · ${match.first_team_name} ${counts.home.starters}+${counts.home.bench} · ${match.second_team_name} ${counts.away.starters}+${counts.away.bench}` : undefined}
        onPress={() => void askSave()}
        loading={save.isPending}
        disabled={!dirty || !pickedTotal}
      />

      <PlayerEditSheet
        player={editing}
        onClose={() => setEditing(null)}
        onChange={(patchValue) => {
          if (!editing) return;
          update(side, editing.id, patchValue);
          setEditing((e) => (e ? { ...e, ...patchValue } : e));
        }}
        onRemove={editing?.extra ? () => removeExtra(editing) : undefined}
        onPhoto={editing ? () => void pickPhoto(editing) : undefined}
        photoBusy={photoBusy}
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
  guest,
  disabled,
  first,
  onRole,
  onPosition,
  onCaptain,
  onOpen,
}: {
  player: Pick;
  guest: boolean;
  disabled?: boolean;
  first?: boolean;
  onRole: (role: "starter" | "bench") => void;
  onPosition: (position: string) => void;
  onCaptain: () => void;
  onOpen: () => void;
}) {
  const picked = player.role !== "";
  const starter = player.role === "starter";
  return (
    <View style={[styles.row, !first ? styles.rowDivider : null, picked ? styles.rowOn : null]}>
      {picked ? <LinearGradient colors={starter ? colors.gradientSignature : [colors.info, colors.info]} style={styles.rowRail} /> : null}
      <View style={styles.rowTop}>
        <Touchable
          onPress={onOpen}
          disabled={disabled}
          style={styles.rowMain}
          accessibilityRole="button"
          accessibilityLabel={`${player.name} ayrıntıları: forma no, fotoğraf`}
        >
          {/* Forma pulu: numara Archivo; İlk 11'de imza degradesi, yedekte camgöbeği çerçeve. */}
          <View style={[styles.number, starter ? styles.numberStarter : player.role === "bench" ? styles.numberBench : null]}>
            {starter ? <LinearGradient colors={colors.gradientSignature} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.numberFill]} /> : null}
            <Text style={[styles.numberText, starter ? styles.numberTextOn : null]} {...textScale.badge}>
              {player.number || "–"}
            </Text>
          </View>
          <View style={styles.rowText}>
            <View style={styles.nameLine}>
              <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
                {player.name}
              </Text>
              {player.captain ? <Badge label="K" tone="warn" size="xs" dot={false} accessibilityLabel="Kaptan" /> : null}
              {guest ? <Badge label="Misafir" tone="info" size="xs" dot={false} /> : null}
            </View>
            <Text style={[styles.meta, !player.position && picked ? { color: colors.warn } : null]} numberOfLines={1} {...textScale.dense}>
              {[player.position || "Mevki yok", player.extra ? "Sonradan eklendi" : null].filter(Boolean).join(" · ")}
            </Text>
          </View>
        </Touchable>
        {/* Rol anahtarı: iki parçalı kapsül — İlk 11 / Yedek. */}
        <View style={styles.roles} accessibilityRole="radiogroup">
          {(["starter", "bench"] as const).map((role) => {
            const on = player.role === role;
            return (
              <Touchable
                key={role}
                onPress={() => onRole(role)}
                disabled={disabled}
                haptic="selection"
                feedback="none"
                style={[styles.roleBtn, on ? (role === "starter" ? styles.roleStarter : styles.roleBench) : null]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled }}
                accessibilityLabel={role === "starter" ? "İlk 11" : "Yedek"}
              >
                <Text style={[styles.roleText, on ? styles.roleTextOn : null]} {...textScale.badge}>
                  {role === "starter" ? "İlk 11" : "Yedek"}
                </Text>
              </Touchable>
            );
          })}
        </View>
      </View>
      {picked ? (
        <View style={styles.quick}>
          {POSITIONS.map((pos) => {
            const on = lineOf(player.position) === pos.key;
            return (
              <Touchable
                key={pos.key}
                onPress={() => onPosition(pos.key)}
                disabled={disabled}
                haptic="selection"
                style={[styles.quickBtn, on ? styles.quickOn : null]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`Mevki: ${pos.label}`}
              >
                <Text style={[styles.quickText, on ? styles.quickTextOn : null]} {...textScale.badge}>
                  {POS_SHORT[pos.key]}
                </Text>
              </Touchable>
            );
          })}
          <Touchable
            onPress={onCaptain}
            disabled={disabled}
            haptic="selection"
            style={[styles.quickBtn, styles.quickWide, player.captain ? styles.quickCaptain : null]}
            accessibilityRole="button"
            accessibilityState={{ selected: player.captain }}
            accessibilityLabel="Kaptan"
          >
            <Ionicons name={player.captain ? "star" : "star-outline"} size={12} color={player.captain ? colors.warn : colors.textTertiary} />
            <Text style={[styles.quickText, player.captain ? styles.quickTextOn : null]} {...textScale.badge}>
              Kaptan
            </Text>
          </Touchable>
        </View>
      ) : null}
    </View>
  );
});

function PlayerEditSheet({
  player,
  onClose,
  onChange,
  onRemove,
  onPhoto,
  photoBusy,
}: {
  player: Pick | null;
  onClose: () => void;
  onChange: (patch: Partial<Pick>) => void;
  onRemove?: () => void;
  onPhoto?: () => void;
  photoBusy?: boolean;
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
          <View style={styles.photoRow}>
            <Avatar name={player.name} image={player.img ?? null} size={56} />
            <View style={styles.rowText}>
              <Text style={styles.meta} {...textScale.long}>
                Fotoğraf oyuncunun profiline yazılır; kadro görsellerinde ve yayında kullanılır.
              </Text>
              {onPhoto ? <Button label="Fotoğrafı güncelle" icon="camera-outline" variant="secondary" size="sm" onPress={onPhoto} loading={photoBusy} /> : null}
            </View>
          </View>
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
  sides: { flexDirection: "row", gap: space.sm },
  sideCard: {
    flex: 1,
    minWidth: 0,
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  sideCardOn: { backgroundColor: colors.brandDim, borderColor: colors.brandBorder, borderWidth: 1 },
  sideHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sideTag: { ...type.overline, color: colors.textTertiary },
  sideName: { ...type.h4, color: colors.textSecondary },
  sideNameOn: { color: colors.textPrimary },
  sideNums: { flexDirection: "row", alignItems: "baseline", gap: space.s, marginBottom: space.xxs },
  sideBig: { ...type.metricSm, color: colors.textPrimary },
  sideOf: { ...type.numSm, color: colors.textTertiary },
  sideBench: { ...type.numSm, color: colors.textSecondary },
  summaryRow: {
    flexDirection: "row",
    borderRadius: radius.lg,
    backgroundColor: colors.glass,
    borderWidth: hairline,
    borderColor: colors.glassLine,
    paddingVertical: space.sm,
  },
  summaryCell: { flex: 1, alignItems: "center", gap: space.xxs },
  summaryDivided: { borderLeftWidth: hairline, borderLeftColor: colors.separator },
  summaryLabel: { ...type.overline, color: colors.textTertiary },
  summaryValue: { ...type.scoreXs, color: colors.textPrimary },
  summaryValueSm: { ...type.labelSm, color: colors.textPrimary },
  summaryInline: { flexDirection: "row", alignItems: "center", gap: space.xs, height: 19 },
  list: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.glassLine,
    overflow: "hidden",
  },
  row: {
    gap: space.sm,
    paddingVertical: space.m,
    paddingHorizontal: space.md,
  },
  rowDivider: { borderTopWidth: hairline, borderTopColor: colors.separator },
  rowOn: { backgroundColor: colors.brandDim },
  rowRail: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: space.sm },
  nameLine: { flexDirection: "row", alignItems: "center", gap: space.xs },
  quick: { flexDirection: "row", gap: space.xs, paddingLeft: 44 },
  quickBtn: {
    flex: 1,
    flexDirection: "row",
    gap: space.xxs,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  quickWide: { flex: 1.4 },
  quickOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  quickCaptain: { backgroundColor: colors.warnDim, borderColor: colors.warn },
  quickText: { ...type.labelXs, color: colors.textSecondary },
  quickTextOn: { color: colors.textPrimary },
  photoRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  pitch: {
    gap: space.md,
    padding: space.md,
    paddingBottom: space.lg,
    borderRadius: radius.xxl,
    overflow: "hidden",
    backgroundColor: colors.pitch,
  },
  chalkMid: { position: "absolute", left: 0, right: 0, top: "50%", height: 1, backgroundColor: colors.chalk, opacity: 0.25 },
  chalkCircle: {
    position: "absolute",
    alignSelf: "center",
    top: "50%",
    marginTop: -36,
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: colors.chalk,
    opacity: 0.25,
  },
  chalkBox: {
    position: "absolute",
    bottom: 0,
    left: "25%",
    right: "25%",
    height: 54,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.chalk,
    opacity: 0.25,
  },
  pitchHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  pitchTitle: { ...type.overline, color: colors.onPitch, flex: 1 },
  pitchFormationPill: { paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.pill, backgroundColor: colors.inkPill },
  pitchFormation: { ...type.tableNumStrong, color: colors.onDark },
  pitchCount: { ...type.numSmStrong, color: colors.onPitch },
  pitchLine: { flexDirection: "row", justifyContent: "space-evenly", alignItems: "flex-start", minHeight: 52 },
  pitchMan: { alignItems: "center", gap: space.xxs, width: 62 },
  pitchShirt: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
    borderWidth: 2,
    borderColor: colors.chalk,
  },
  pitchShirtKeeper: { backgroundColor: colors.warn },
  pitchShirtNo: { ...type.numSmStrong, color: colors.onDark },
  pitchCaptain: {
    position: "absolute",
    right: -6,
    top: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.warn,
    alignItems: "center",
    justifyContent: "center",
  },
  pitchCaptainText: { ...type.nano, color: colors.textOnStatus },
  pitchChipText: { ...type.meta, color: colors.onPitch, textAlign: "center" },
  pitchEmpty: { ...type.caption, color: colors.onPitch, opacity: 0.6, alignSelf: "center" },
  pitchLoose: { ...type.caption, color: colors.onPitch },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.m },
  number: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface3,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  numberStarter: {},
  numberFill: { borderRadius: 17 },
  numberBench: { borderWidth: 1.5, borderColor: colors.info },
  numberText: { ...type.numSmStrong, color: colors.textPrimary },
  numberTextOn: { color: colors.onDark },
  rowText: { flex: 1, gap: 2 },
  name: { ...type.h4, color: colors.textPrimary, flexShrink: 1 },
  meta: { ...type.caption, color: colors.textTertiary },
  roles: {
    flexDirection: "row",
    padding: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
  },
  roleBtn: { minHeight: 32, paddingHorizontal: space.m, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  roleStarter: { backgroundColor: colors.brand },
  roleBench: { backgroundColor: colors.info },
  roleText: { ...type.labelXs, color: colors.textSecondary },
  roleTextOn: { color: colors.textOnBrand },
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
