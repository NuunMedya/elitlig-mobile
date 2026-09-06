/**
 * KADRO KURUCU — oyuncu transfer etme ve sezon kadrosuna oyuncu girme,
 * takım yönetimi ekranının içinde, TEK görünümde ve en az dokunuşla.
 *
 * Önceden mobilde başkanın oyuncu transfer edebileceği hiçbir yol yoktu
 * (`createInvite` tanımlıydı ama hiç çağrılmıyordu; teklif oluşturma ekranı
 * yoktu) ve sezon kadrosu üç ayrı sorgu + ham üye satırlarının takım
 * kadrosuyla elle eşlenmesiyle kuruluyordu. Burada sunucunun karar veren
 * `/api/team-management/squad-builder` katmanı kullanılır:
 *
 *   OYUNCU EKLE   Ad yaz → aday satırında TEK eylem. Serbest + hesaplı oyuncu
 *                 "Davet et", takımlı/hesapsız oyuncu "Teklif gönder" (alt
 *                 sayfada bonservis/bitiş/mesaj, gerisi varsayılan). Kadrodaki
 *                 ve bekleyen oyuncular rozetle ayrılır; hangi akışın uygun
 *                 olduğuna SUNUCU karar verir (`action`).
 *   SEZON KADROSU TASLAK → YÖNETİME GÖNDER → ONAY. Takım oyuncuları tek
 *                 listede; "Kadroya al" / "Çıkar" ve lisans anahtarı yalnızca
 *                 taslağı günceller, hiçbir hamle transfer hakkı tüketmez.
 *                 "Yönetime gönder" ile taslak onaya gider; onaylanınca fark
 *                 uygulanır ve yalnızca net eklemeler kadar hak düşer.
 *                 Gönderilmeden geri alınan hamlelerin izi kalmaz.
 *
 * Sunucu sözleşmesi: elitlig-server/docs/team-roster-management-api.md
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefreshControlProps } from "react-native";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  Input,
  MetricGrid,
  MetricTile,
  SectionHeader,
  SegmentedControl,
  SkeletonListRow,
  Toggle,
  Touchable,
  useToast,
  withAlpha,
} from "@/components/ui";
import {
  SQUAD_BUILDER_ERRORS,
  capLabel,
  getSquadBuilder,
  positionLabel,
  recruitPlayer,
  resetRosterDraft,
  saveRosterDraft,
  searchSquadCandidates,
  submitRosterDraft,
  withdrawRosterDraft,
  type RosterDraft,
  type RosterDraftMember,
  type SquadBuilderOverview,
  type SquadCandidate,
  type SquadPendingItem,
} from "@/lib/api/team";
import { mediaUrl } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { colors, elevate, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

/** Takım paneli önbelleğiyle paylaşılan anahtar — kadro değişince diğer ekranlar da tazelenir. */
export const SQUAD_BUILDER_KEY = ["takim", "squad-builder"] as const;

const SEARCH_DEBOUNCE_MS = 350;
const MIN_QUERY = 2;

/** Sunucu hata kodunu Türkçe cümleye çevirir; tanınmazsa sunucu mesajı. */
function describeError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return (error.code && SQUAD_BUILDER_ERRORS[error.code]) || error.userMessage || fallback;
  }
  return fallback;
}

function transferRightsLabel(status: SquadBuilderOverview["seasonStatus"]): string {
  if (!status?.applies) return "Sınırsız";
  const rights = status.transferRights;
  if (!rights) return "—";
  if (rights.unlimited) return "Limitsiz";
  if (rights.none) return "Yok";
  return `${rights.available ?? 0} kalan`;
}

type DraftChange = "add" | "remove" | "license" | null;

/** Taslak listesinde gösterilen satır: takım oyuncusu ∪ kiralık ∪ eski üye ∪ taslaktaki diğerleri. */
interface DraftRowModel {
  id: number;
  name: string;
  image: string | null;
  position: string | null;
  jerseyNumber: number | null;
  kind: "own" | "loan";
  ownTeamName: string | null;
  leftTeam: boolean;
  pendingSeasonApproval: boolean;
  inDraft: boolean;
  inActive: boolean;
  isLicensed: boolean;
  change: DraftChange;
}

function buildDraftRows(data: SquadBuilderOverview, draft: RosterDraft | null): DraftRowModel[] {
  const draftBy = new Map((draft?.members ?? []).map((m) => [Number(m.player_id), m]));
  const activeBy = new Map((draft?.active ?? []).map((m) => [Number(m.player_id), m]));
  const out = new Map<number, DraftRowModel>();
  const push = (p: { id: number; name?: string; image?: string | null; position?: string | null; jerseyNumber?: number | null; isLicensed?: boolean; isLoan?: boolean; ownTeamName?: string | null; leftTeam?: boolean; pendingSeasonApproval?: boolean }) => {
    const id = Number(p.id);
    if (out.has(id)) return;
    const d = draftBy.get(id);
    const a = activeBy.get(id);
    const inDraft = Boolean(d);
    const inActive = Boolean(a);
    let change: DraftChange = null;
    if (inDraft && !inActive) change = "add";
    else if (!inDraft && inActive) change = "remove";
    else if (d && a && Boolean(d.is_licensed) !== Boolean(a.is_licensed)) change = "license";
    out.set(id, {
      id,
      name: p.name ?? `Oyuncu #${id}`,
      image: p.image ?? null,
      position: p.position ?? null,
      jerseyNumber: p.jerseyNumber ?? null,
      kind: d?.kind ?? a?.kind ?? (p.isLoan ? "loan" : "own"),
      ownTeamName: p.ownTeamName ?? null,
      leftTeam: Boolean(p.leftTeam),
      pendingSeasonApproval: Boolean(p.pendingSeasonApproval),
      inDraft,
      inActive,
      isLicensed: inDraft ? Boolean(d?.is_licensed) : Boolean(a?.is_licensed ?? p.isLicensed),
      change,
    });
  };
  data.roster.forEach((p) => push(p));
  (data.loanMembers ?? []).forEach((p) => push({ ...p, isLoan: true }));
  data.formerMembers.forEach((p) => push(p));
  (draft?.members ?? []).forEach((m) => push({ id: m.player_id, name: m.name, image: m.image, position: m.position, isLoan: m.kind === "loan" }));
  (draft?.active ?? []).forEach((m) => push({ id: m.player_id, name: m.name, image: m.image, position: m.position, isLoan: m.kind === "loan" }));
  return [...out.values()].sort((x, y) => Number(y.inDraft) - Number(x.inDraft) || x.name.localeCompare(y.name, "tr"));
}

const toMembers = (draft: RosterDraft | null): RosterDraftMember[] =>
  (draft?.members ?? []).map((m) => ({ player_id: Number(m.player_id), is_licensed: Boolean(m.is_licensed), kind: m.kind === "loan" ? "loan" : "own", name: m.name, image: m.image, position: m.position }));

const shortDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("tr-TR", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" }) : "";

/* ══════════════════════════════════════════════════════════════════════════
   Görünüm
   ══════════════════════════════════════════════════════════════════════════ */

export function SquadBuilderView({
  refreshControl,
}: {
  refreshControl?: React.ReactElement<RefreshControlProps>;
}) {
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "in" | "out" | "changed">("all");
  const [term, setTerm] = useState("");
  const [offerTarget, setOfferTarget] = useState<SquadCandidate | null>(null);

  const overviewQuery = useQuery({
    queryKey: [...SQUAD_BUILDER_KEY, seasonId],
    queryFn: () => getSquadBuilder(seasonId),
    staleTime: 30_000,
    retry: false,
  });
  const data = overviewQuery.data;

  /* Arama: 350 ms bekler, eski isteği iptal eder, 2 harften kısa sorgu gitmez. */
  const [results, setResults] = useState<SquadCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = term.trim();
    abortRef.current?.abort();
    if (q.length < MIN_QUERY) {
      setResults(null);
      setSearching(false);
      return undefined;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setSearching(true);
    const timer = setTimeout(() => {
      searchSquadCandidates(q, controller.signal)
        .then((res) => {
          if (!controller.signal.aborted) setResults(res.items ?? []);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          toast.show({ message: describeError(error, "Arama yapılamadı."), tone: "danger" });
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, toast]);

  const refreshSearch = useCallback(() => {
    const q = term.trim();
    if (q.length < MIN_QUERY) return;
    searchSquadCandidates(q)
      .then((res) => setResults(res.items ?? []))
      .catch(() => undefined);
  }, [term]);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: SQUAD_BUILDER_KEY });
    void queryClient.invalidateQueries({ queryKey: ["takim", "roster"] });
    void queryClient.invalidateQueries({ queryKey: ["takim", "dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["takim", "join-requests"] });
    void queryClient.invalidateQueries({ queryKey: ["takim", "offers-outbox"] });
  }, [queryClient]);

  /* — Transfer / davet — */
  const recruitMutation = useMutation({
    mutationFn: recruitPlayer,
    onSuccess: (result) => {
      toast.show({ message: result.message, tone: "success", haptic: "success" });
      setOfferTarget(null);
      invalidate();
      refreshSearch();
    },
    onError: (error) => {
      toast.show({ message: describeError(error, "İşlem tamamlanamadı."), tone: "danger" });
    },
  });

  const invite = useCallback(
    (candidate: SquadCandidate) => {
      Alert.alert(
        "Kadroya davet et",
        `${candidate.name} kadrona davet edilecek. Oyuncu daveti kabul ettiğinde kadrona otomatik eklenir.`,
        [
          { text: "Vazgeç", style: "cancel" },
          { text: "Daveti gönder", onPress: () => recruitMutation.mutate({ playerId: candidate.id }) },
        ],
      );
    },
    [recruitMutation],
  );

  const openOffer = useCallback((candidate: SquadCandidate) => setOfferTarget(candidate), []);
  const closeOffer = useCallback(() => setOfferTarget(null), []);

  const openPending = useCallback(
    (item: SquadPendingItem) => {
      if (item.kind === "offer" && item.publicId) router.push(`/teklif/${item.publicId}`);
      else router.push("/davetler?tab=gonderilen");
    },
    [router],
  );

  /* — Sezon kadrosu taslağı — */
  const activeSeasonId = data?.selectedSeasonId ?? null;
  const status = data?.seasonStatus ?? null;
  const rulesApply = Boolean(status?.applies);
  const draft = data?.draft ?? null;
  const locked = draft?.status === "submitted";
  const season = useMemo(
    () => data?.seasons.find((item) => item.id === activeSeasonId) ?? null,
    [activeSeasonId, data?.seasons],
  );
  const rows = useMemo(() => (data ? buildDraftRows(data, draft) : []), [data, draft]);
  const counts = useMemo(
    () => ({
      add: rows.filter((r) => r.change === "add").length,
      remove: rows.filter((r) => r.change === "remove").length,
      license: rows.filter((r) => r.change === "license").length,
      inDraft: rows.filter((r) => r.inDraft).length,
      licensed: rows.filter((r) => r.inDraft && r.isLicensed).length,
      changed: rows.filter((r) => r.change).length,
    }),
    [rows],
  );
  const visibleRows = useMemo(
    () => rows.filter((r) => filter === "all" || (filter === "in" && r.inDraft) || (filter === "out" && !r.inDraft) || (filter === "changed" && r.change)),
    [rows, filter],
  );
  const missingCount = useMemo(() => rows.filter((r) => !r.inDraft && !r.leftTeam && !r.pendingSeasonApproval).length, [rows]);

  /** Taslağı sunucuya yazar; dönen taslak görünümü önbelleğe işlenir (iyimser güncelleme + geri alma). */
  const applyDraft = useCallback(
    (next: RosterDraft) => {
      queryClient.setQueryData<SquadBuilderOverview>([...SQUAD_BUILDER_KEY, seasonId], (old) => (old ? { ...old, draft: next } : old));
    },
    [queryClient, seasonId],
  );
  const saveMutation = useMutation({
    mutationFn: (members: RosterDraftMember[]) => saveRosterDraft(activeSeasonId as number, { members }),
    onMutate: (members) => {
      if (draft) applyDraft({ ...draft, members });
    },
    onSuccess: (result) => applyDraft(result.draft),
    onError: (error) => {
      toast.show({ message: describeError(error, "Taslak kaydedilemedi."), tone: "danger" });
      void queryClient.invalidateQueries({ queryKey: SQUAD_BUILDER_KEY });
    },
  });
  const flowMutation = useMutation({
    mutationFn: (action: "submit" | "withdraw" | "reset") =>
      action === "submit"
        ? submitRosterDraft(activeSeasonId as number)
        : action === "withdraw"
          ? withdrawRosterDraft(activeSeasonId as number)
          : resetRosterDraft(activeSeasonId as number),
    onSuccess: (result) => {
      toast.show({ message: result.message, tone: "success", haptic: "success" });
      applyDraft(result.draft);
      invalidate();
    },
    onError: (error) => {
      toast.show({ message: describeError(error, "İşlem tamamlanamadı."), tone: "danger" });
    },
  });

  const busy = recruitMutation.isPending || saveMutation.isPending || flowMutation.isPending;

  const toggleRow = useCallback(
    (row: DraftRowModel, add: boolean) => {
      if (locked) return;
      const list = toMembers(draft).filter((m) => m.player_id !== row.id);
      if (add) list.push({ player_id: row.id, is_licensed: false, kind: row.kind, name: row.name, image: row.image, position: row.position });
      saveMutation.mutate(list);
    },
    [draft, locked, saveMutation],
  );
  const toggleLicense = useCallback(
    (row: DraftRowModel, isLicensed: boolean) => {
      if (locked) return;
      saveMutation.mutate(toMembers(draft).map((m) => (m.player_id === row.id ? { ...m, is_licensed: isLicensed } : m)));
    },
    [draft, locked, saveMutation],
  );
  const addMissing = useCallback(() => {
    if (locked || !missingCount) return;
    const list = toMembers(draft);
    const have = new Set(list.map((m) => m.player_id));
    rows
      .filter((r) => !r.inDraft && !r.leftTeam && !r.pendingSeasonApproval && !have.has(r.id))
      .forEach((r) => list.push({ player_id: r.id, is_licensed: false, kind: r.kind, name: r.name, image: r.image, position: r.position }));
    saveMutation.mutate(list);
  }, [draft, locked, missingCount, rows, saveMutation]);

  const submitDraft = useCallback(() => {
    const rights = draft?.rules.transfer_rights;
    const rightsLine =
      draft?.rules.applies && rights && !rights.unlimited
        ? `Onaylanırsa ${draft.rules.rights_needed} transfer hakkı düşer (kalan ${rights.available ?? 0} → ${draft.rules.rights_after ?? 0}).`
        : "Bu sezon için transfer hakkı sınırı yok.";
    Alert.alert(
      "Kadroyu yönetime gönder",
      `${counts.add} ekleme, ${counts.remove} çıkarma, ${counts.license} lisans değişikliği yönetime iletilecek.\n\n${rightsLine}\n\nOnay gelene kadar taslak kilitlenir; geri çekip düzenleyebilirsin.`,
      [
        { text: "Vazgeç", style: "cancel" },
        { text: "Yönetime gönder", onPress: () => flowMutation.mutate("submit") },
      ],
    );
  }, [counts, draft, flowMutation]);
  const withdrawDraft = useCallback(() => {
    Alert.alert("Gönderimi geri çek", "Onay bekleyen taslak geri çekilecek; yeniden düzenleyebilirsin. Aktif kadro ve transfer hakkı değişmez.", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Geri çek", onPress: () => flowMutation.mutate("withdraw") },
    ]);
  }, [flowMutation]);
  const resetDraft = useCallback(() => {
    Alert.alert("Taslağı sıfırla", "Gönderilmemiş tüm değişiklikler silinecek; taslak aktif kadroya döndürülecek.", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Sıfırla", style: "destructive", onPress: () => flowMutation.mutate("reset") },
    ]);
  }, [flowMutation]);

  /* — Çizim — */
  if (overviewQuery.isLoading && !data) {
    return (
      <View style={styles.loading}>
        <SkeletonListRow count={6} avatar />
      </View>
    );
  }

  if (!data) {
    return (
      <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl}>
        <EmptyState
          icon="cloud-offline-outline"
          title="Kadro bilgileri alınamadı"
          body={describeError(overviewQuery.error, "Aşağı çekerek yeniden deneyebilirsin.")}
          variant="inline"
          action={{ label: "Tekrar dene", onPress: () => void overviewQuery.refetch() }}
        />
      </ScrollView>
    );
  }

  const pendingList = data.pending;

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={refreshControl}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Özet */}
        <MetricGrid columns={2}>
          <MetricTile label="Takım oyuncusu" value={String(data.summary.teamPlayers)} icon="people-outline" />
          <MetricTile
            label="Taslak kadro"
            value={rulesApply ? `${counts.inDraft} / ${capLabel(status?.general)}` : String(counts.inDraft)}
            hint={season?.name}
            icon="calendar-outline"
          />
          <MetricTile
            label="Lisanslı"
            value={rulesApply ? `${counts.licensed} / ${capLabel(status?.licensed)}` : String(counts.licensed)}
            icon="id-card-outline"
          />
          <MetricTile
            label="Transfer hakkı"
            value={transferRightsLabel(status)}
            hint={rulesApply && counts.add > 0 && draft?.rules.rights_after != null ? `Onayda → ${draft.rules.rights_after}` : undefined}
            tone={rulesApply && status?.transferRights?.available === 0 ? "warn" : "accent"}
            icon="swap-horizontal-outline"
          />
        </MetricGrid>

        {/* ── Oyuncu ekle ── */}
        <SectionHeader title="Oyuncu ekle" meta="davet ya da teklif" />
        <Input
          variant="search"
          value={term}
          onChangeText={setTerm}
          placeholder="Oyuncu adı yaz…"
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
          accessibilityLabel="Oyuncu ara"
        />
        {results === null ? (
          <Text style={styles.hint} {...textScale.long}>
            En az {MIN_QUERY} harf yaz. Her oyuncu için yapılacak tek işlem hazır gelir: serbest oyuncuya davet,
            takımlı oyuncuya transfer teklifi.
          </Text>
        ) : searching && results.length === 0 ? (
          <SkeletonListRow count={3} avatar />
        ) : results.length === 0 ? (
          <Text style={styles.hint} {...textScale.long}>
            “{term.trim()}” ile eşleşen oyuncu bulunamadı.
          </Text>
        ) : (
          results.map((item) => (
            <CandidateRow key={item.id} item={item} disabled={busy} onInvite={invite} onOffer={openOffer} />
          ))
        )}

        {pendingList.length > 0 ? (
          <>
            <SectionHeader title="Bekleyen işlemler" meta={`${pendingList.length}`} />
            {pendingList.map((item) => (
              <PendingRow key={`${item.kind}-${item.id}`} item={item} onPress={openPending} />
            ))}
          </>
        ) : null}

        {/* ── Sezon kadrosu taslağı ── */}
        <SectionHeader title="Sezon kadrosu" meta={season ? season.name : undefined} />
        {data.seasons.length > 1 ? (
          <ChipGroup>
            {data.seasons.map((item) => (
              <SeasonChip key={item.id} id={item.id} label={item.name} selected={item.id === activeSeasonId} onPress={setSeasonId} />
            ))}
          </ChipGroup>
        ) : null}

        {!season ? (
          <EmptyState
            icon="calendar-outline"
            title="Sezon kaydı yok"
            body="Takımın henüz bir sezona kayıtlı görünmüyor. Fikstüre maç işlendiğinde sezon burada listelenir."
            variant="inline"
          />
        ) : !draft ? (
          <Text style={styles.hint} {...textScale.long}>
            Taslak bilgisi alınamadı. Aşağı çekerek yeniden dene.
          </Text>
        ) : (
          <>
            <Text style={styles.hint} {...textScale.long}>
              Önce taslakta düzenle, sonra yönetime gönder. Gönderene kadar hiçbir hamle transfer hakkı düşürmez.
            </Text>

            {locked ? (
              <View style={[styles.banner, styles.bannerSubmitted]}>
                <Ionicons name="hourglass-outline" size={18} color={colors.warn} />
                <View style={styles.bannerTexts}>
                  <Text style={styles.bannerTitle} {...textScale.dense}>Yönetim onayı bekleniyor</Text>
                  <Text style={styles.bannerBody} {...textScale.long}>
                    {draft.submitted_at ? `${shortDate(draft.submitted_at)} tarihinde gönderildi. ` : ""}Onaylanınca değişiklikler uygulanır; düzenlemek için geri çek.
                  </Text>
                </View>
                <Button label="Geri çek" size="sm" variant="secondary" icon="arrow-undo" onPress={withdrawDraft} disabled={busy} />
              </View>
            ) : draft.last_decision ? (
              <View style={[styles.banner, draft.last_decision === "approved" ? styles.bannerApproved : styles.bannerRejected]}>
                <Ionicons name={draft.last_decision === "approved" ? "checkmark-circle" : "close-circle"} size={18} color={draft.last_decision === "approved" ? colors.win : colors.danger} />
                <View style={styles.bannerTexts}>
                  <Text style={styles.bannerTitle} {...textScale.dense}>
                    {draft.last_decision === "approved" ? "Son gönderim onaylandı" : "Son gönderim reddedildi"}
                  </Text>
                  <Text style={styles.bannerBody} {...textScale.long}>
                    {draft.last_decision_at ? `${shortDate(draft.last_decision_at)}. ` : ""}
                    {draft.last_decision_note || (draft.last_decision === "approved" ? "Değişiklikler aktif kadroya işlendi." : "Düzenleyip yeniden gönderebilirsin.")}
                  </Text>
                </View>
              </View>
            ) : null}

            {draft.errors.length > 0 ? (
              <View style={[styles.banner, styles.bannerRejected]}>
                <Ionicons name="warning-outline" size={18} color={colors.danger} />
                <View style={styles.bannerTexts}>
                  {draft.errors.map((e, index) => (
                    <Text key={`${e.code}-${e.player_id ?? index}`} style={styles.bannerBody} {...textScale.long}>
                      {e.message}
                    </Text>
                  ))}
                </View>
              </View>
            ) : null}

            <SegmentedControl
              size="sm"
              value={filter}
              onChange={setFilter}
              items={[
                { key: "all", label: `Tümü ${rows.length}` },
                { key: "in", label: `Kadroda ${counts.inDraft}` },
                { key: "out", label: `Dışarı ${rows.length - counts.inDraft}` },
                { key: "changed", label: `Değişen ${counts.changed}`, dot: counts.changed > 0 },
              ]}
            />

            {!locked && missingCount > 0 ? (
              <Button label={`Eksik ${missingCount} oyuncuyu taslağa al`} icon="people" variant="secondary" onPress={addMissing} disabled={busy} fullWidth />
            ) : null}

            {rows.length === 0 ? (
              <Text style={styles.hint} {...textScale.long}>
                Takımda henüz oyuncu yok. Yukarıdan oyuncu ara ve kadrona kat.
              </Text>
            ) : visibleRows.length === 0 ? (
              <Text style={styles.hint} {...textScale.long}>
                Bu filtrede oyuncu yok.
              </Text>
            ) : (
              visibleRows.map((row) => (
                <RosterRow key={row.id} row={row} disabled={busy} locked={locked} onToggle={toggleRow} onLicense={toggleLicense} />
              ))
            )}

            {!locked ? (
              <View style={styles.draftFoot}>
                <View style={styles.draftSummary}>
                  {counts.changed > 0 ? (
                    <>
                      <Badge label={`+${counts.add}`} tone="win" />
                      <Badge label={`−${counts.remove}`} tone="danger" />
                      <Badge label={`Lisans ${counts.license}`} tone="info" />
                      <Text style={styles.hint} {...textScale.dense}>
                        {rulesApply && draft.rules.transfer_rights && !draft.rules.transfer_rights.unlimited ? `Onayda ${counts.add} hak düşer.` : "Gönderilmedi."}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.hint} {...textScale.long}>
                      Taslak aktif kadroyla aynı; değişiklik yapınca burada özetlenir.
                    </Text>
                  )}
                </View>
                <View style={styles.draftActions}>
                  <Button label="Sıfırla" size="sm" variant="ghost" icon="arrow-undo" onPress={resetDraft} disabled={busy || counts.changed === 0} />
                  <Button label="Yönetime gönder" size="sm" icon="paper-plane" onPress={submitDraft} disabled={busy || !draft.can_submit} />
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      {offerTarget ? (
        <QuickOfferSheet
          candidate={offerTarget}
          busy={recruitMutation.isPending}
          onClose={closeOffer}
          onSubmit={(terms) => recruitMutation.mutate({ playerId: offerTarget.id, ...terms })}
          allowLoan={!offerTarget.isFreeAgent}
        />
      ) : null}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Satırlar
   ══════════════════════════════════════════════════════════════════════════ */

const SeasonChip = React.memo(function SeasonChip({
  id,
  label,
  selected,
  onPress,
}: {
  id: number;
  label: string;
  selected: boolean;
  onPress: (id: number) => void;
}) {
  const handlePress = useCallback(() => onPress(id), [id, onPress]);
  return <Chip label={label} selected={selected} onPress={handlePress} size="sm" />;
});

/** Arama sonucu: sunucunun seçtiği TEK eylem sağda. */
const CandidateRow = React.memo(function CandidateRow({
  item,
  disabled,
  onInvite,
  onOffer,
}: {
  item: SquadCandidate;
  disabled: boolean;
  onInvite: (item: SquadCandidate) => void;
  onOffer: (item: SquadCandidate) => void;
}) {
  const handleInvite = useCallback(() => onInvite(item), [item, onInvite]);
  const handleOffer = useCallback(() => onOffer(item), [item, onOffer]);
  const meta = [
    positionLabel(item.position) || null,
    item.isFreeAgent ? "Serbest oyuncu" : item.teamName || "Takımlı",
    item.city,
  ]
    .filter(Boolean)
    .join(" · ");

  let trailing: React.ReactNode;
  if (item.action === "own") trailing = <Badge label="Kadronda" tone="win" icon="checkmark" />;
  else if (item.action === "pending") trailing = <Badge label={item.offerPublicId ? "Teklif bekliyor" : "Davet bekliyor"} tone="warn" />;
  else if (item.action === "invite") trailing = <Button label="Davet et" size="sm" icon="mail" onPress={handleInvite} disabled={disabled} />;
  else trailing = <Button label="Teklif gönder" size="sm" icon="swap-horizontal" onPress={handleOffer} disabled={disabled} />;

  return (
    <View style={styles.row}>
      <Avatar name={item.name} image={mediaUrl(item.image)} size={36} />
      <View style={styles.rowTexts}>
        <Text style={styles.rowTitle} numberOfLines={1} {...textScale.dense}>
          {item.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1} {...textScale.dense}>
          {meta}
        </Text>
        {item.action === "offer" && item.requiresAdminApproval ? (
          <Text style={styles.rowWarn} numberOfLines={2} {...textScale.dense}>
            Panel hesabı yok; teklif lig yönetimi onayıyla sonuçlanır.
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
});

const PendingRow = React.memo(function PendingRow({
  item,
  onPress,
}: {
  item: SquadPendingItem;
  onPress: (item: SquadPendingItem) => void;
}) {
  const handlePress = useCallback(() => onPress(item), [item, onPress]);
  const subtitle =
    item.kind === "invite"
      ? "Davet gönderildi · oyuncunun yanıtı bekleniyor"
      : item.awaitingAdminApproval
        ? "Teklif · lig yönetimi onayı bekleniyor"
        : "Transfer teklifi gönderildi";
  return (
    <Touchable feedback="row" haptic="selection" onPress={handlePress} accessibilityRole="button" style={styles.row}>
      <Avatar name={item.player?.name} image={mediaUrl(item.player?.image)} size={36} />
      <View style={styles.rowTexts}>
        <Text style={styles.rowTitle} numberOfLines={1} {...textScale.dense}>
          {item.player?.name ?? "Oyuncu"}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1} {...textScale.dense}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Touchable>
  );
});

/** Taslak satırı: kadroya al / çıkar, lisans anahtarı; aktif kadroya göre değişiklik rozeti. */
const CHANGE_LABEL: Record<Exclude<DraftChange, null>, { label: string; tone: "win" | "danger" | "info" }> = {
  add: { label: "Eklenecek", tone: "win" },
  remove: { label: "Çıkarılacak", tone: "danger" },
  license: { label: "Lisans değişecek", tone: "info" },
};

const RosterRow = React.memo(function RosterRow({
  row,
  disabled,
  locked,
  onToggle,
  onLicense,
}: {
  row: DraftRowModel;
  disabled: boolean;
  locked: boolean;
  onToggle: (row: DraftRowModel, add: boolean) => void;
  onLicense: (row: DraftRowModel, isLicensed: boolean) => void;
}) {
  const handleAdd = useCallback(() => onToggle(row, true), [onToggle, row]);
  const handleRemove = useCallback(() => onToggle(row, false), [onToggle, row]);
  const handleLicense = useCallback((value: boolean) => onLicense(row, value), [onLicense, row]);
  const meta = [
    row.jerseyNumber != null ? `#${row.jerseyNumber}` : null,
    positionLabel(row.position) || row.position || null,
    row.kind === "loan" ? `Kiralık${row.ownTeamName ? ` · ${row.ownTeamName}` : ""}` : null,
    row.leftTeam ? "Takımdan ayrıldı" : null,
    row.pendingSeasonApproval ? "Onay bekliyor" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const change = row.change ? CHANGE_LABEL[row.change] : null;

  return (
    <View style={[styles.row, row.inDraft ? styles.rowIn : null]}>
      <Avatar name={row.name} image={mediaUrl(row.image)} size={36} jersey={row.jerseyNumber} />
      <View style={styles.rowTexts}>
        <Text style={styles.rowTitle} numberOfLines={1} {...textScale.dense}>
          {row.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1} {...textScale.dense}>
          {meta || "Mevki yok"}
        </Text>
        {change ? <Badge label={change.label} tone={change.tone} /> : null}
      </View>
      {row.inDraft ? (
        <>
          <View style={styles.licenseCell}>
            <Text style={styles.licenseLabel} {...textScale.badge}>
              {upperTR("Lisans")}
            </Text>
            <Toggle value={row.isLicensed} onValueChange={handleLicense} disabled={disabled || locked} accessibilityLabel={`${row.name} lisanslı`} />
          </View>
          <Touchable
            feedback="icon"
            haptic="light"
            onPress={handleRemove}
            disabled={disabled || locked}
            accessibilityRole="button"
            accessibilityLabel={`${row.name} sezon kadrosundan çıkar`}
            style={styles.iconAction}
          >
            <Ionicons name="checkmark-circle" size={24} color={locked ? colors.textTertiary : colors.win} />
          </Touchable>
        </>
      ) : (
        <Button
          label="Kadroya al"
          size="sm"
          variant="secondary"
          icon="add"
          onPress={handleAdd}
          disabled={disabled || locked || row.pendingSeasonApproval}
          accessibilityLabel={`${row.name} sezon kadrosuna ekle`}
        />
      )}
    </View>
  );
});

/* ══════════════════════════════════════════════════════════════════════════
   Hızlı teklif alt sayfası — üç alan, gerisi sunucu varsayılanı
   ══════════════════════════════════════════════════════════════════════════ */

function QuickOfferSheet({
  candidate,
  busy,
  allowLoan,
  onClose,
  onSubmit,
}: {
  candidate: SquadCandidate;
  busy: boolean;
  /** Takımlı oyuncuya kiralık teklif de verilebilir; serbest oyuncu kiralanamaz. */
  allowLoan: boolean;
  onClose: () => void;
  onSubmit: (terms: { transferType: "sale" | "loan"; transferFee: string | null; contractEndDate: string | null; message: string | null }) => void;
}) {
  const [transferType, setTransferType] = useState<"sale" | "loan">("sale");
  const [fee, setFee] = useState("");
  const [endDate, setEndDate] = useState("");
  const [message, setMessage] = useState("");
  const isLoan = transferType === "loan";
  const dateFormatOk = endDate.trim() === "" || /^\d{4}-\d{2}-\d{2}$/.test(endDate.trim());
  const dateOk = dateFormatOk && (!isLoan || endDate.trim() !== "");

  const submit = useCallback(() => {
    if (!dateOk) return;
    onSubmit({
      transferType,
      transferFee: fee.trim() ? fee.trim().replace(",", ".") : null,
      contractEndDate: endDate.trim() || null,
      message: message.trim() || null,
    });
  }, [dateOk, endDate, fee, message, onSubmit, transferType]);

  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={`${candidate.name} için teklif`}
      footer={
        <View style={styles.sheetFooter}>
          <Button label="Vazgeç" variant="ghost" onPress={onClose} disabled={busy} />
          <Button label={isLoan ? "Kiralık teklifi gönder" : "Teklifi gönder"} icon="paper-plane" onPress={submit} loading={busy} disabled={!dateOk} />
        </View>
      }
    >
      <View style={styles.sheetBody}>
        {allowLoan ? (
          <SegmentedControl
            value={transferType}
            onChange={setTransferType}
            items={[
              { key: "sale", label: "Kalıcı transfer", icon: "document-text-outline" },
              { key: "loan", label: "Kiralık", icon: "swap-horizontal-outline" },
            ]}
          />
        ) : null}
        <Text style={styles.hint} {...textScale.long}>
          {isLoan
            ? `Oyuncu ${candidate.teamName ?? "kendi takımında"} kalır; belirlediğin tarihe kadar senin için de oynar. Bir oyuncu en çok iki takımda kiralık olabilir.`
            : candidate.isFreeAgent
              ? "Serbest oyuncu; panel hesabı olmadığı için teklif lig yönetimi onayıyla sonuçlanır."
              : `${candidate.teamName ?? "Mevcut takımı"} kadrosunda. Oyuncu kabul ederse kadrona geçer.`}{" "}
          Sözleşme bugün başlar, teklif 14 gün geçerlidir; diğer şartlar varsayılan.
        </Text>
        <Input
          label={isLoan ? "Kiralama bedeli (₺)" : "Bonservis (₺)"}
          value={fee}
          onChangeText={setFee}
          placeholder="0"
          keyboardType="decimal-pad"
          hint="Boş bırakılırsa bedelsiz"
        />
        <Input
          label={isLoan ? "Kiralık bitişi" : "Sözleşme bitişi"}
          value={endDate}
          onChangeText={setEndDate}
          placeholder="YYYY-AA-GG"
          keyboardType="numbers-and-punctuation"
          autoCorrect={false}
          hint={isLoan ? "Kiralıkta zorunlu; oyuncu bu tarihe kadar sende oynar." : "Boş bırakılırsa süresiz"}
          error={!dateFormatOk ? "Tarih YYYY-AA-GG biçiminde olmalı." : isLoan && endDate.trim() === "" ? "Kiralık teklifte bitiş tarihi zorunlu." : undefined}
        />
        <Input
          label="Mesaj (isteğe bağlı)"
          value={message}
          onChangeText={setMessage}
          placeholder="Oyuncuya kısa bir not…"
          maxLength={300}
        />
      </View>
    </BottomSheet>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Stiller
   ══════════════════════════════════════════════════════════════════════════ */

const styles = StyleSheet.create({
  loading: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    paddingBottom: space.huge,
    gap: space.sm,
  },
  hint: {
    ...type.caption,
    color: colors.textTertiary,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: layout.listRowHeight,
    paddingHorizontal: space.md,
    paddingVertical: space.s,
    borderRadius: radius.md,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    ...elevate(1),
  },
  rowIn: {
    backgroundColor: colors.surface2,
  },
  rowTexts: {
    flex: 1,
    gap: 1,
  },
  rowTitle: {
    ...type.label,
    color: colors.textPrimary,
  },
  rowMeta: {
    ...type.caption,
    color: colors.textTertiary,
  },
  rowWarn: {
    ...type.caption,
    color: colors.warn,
  },
  licenseCell: {
    alignItems: "center",
    gap: 2,
  },
  licenseLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
  iconAction: {
    padding: space.xs,
  },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
  },
  bannerSubmitted: {
    backgroundColor: withAlpha(colors.warn, 0.12),
    borderColor: withAlpha(colors.warn, 0.4),
  },
  bannerApproved: {
    backgroundColor: withAlpha(colors.win, 0.12),
    borderColor: withAlpha(colors.win, 0.4),
  },
  bannerRejected: {
    backgroundColor: withAlpha(colors.danger, 0.12),
    borderColor: withAlpha(colors.danger, 0.4),
  },
  bannerTexts: {
    flex: 1,
    gap: 2,
  },
  bannerTitle: {
    ...type.label,
    color: colors.textPrimary,
  },
  bannerBody: {
    ...type.caption,
    color: colors.textSecondary,
  },
  draftFoot: {
    gap: space.sm,
    paddingTop: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
  },
  draftSummary: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.xs,
  },
  draftActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: space.sm,
  },
  sheetBody: {
    gap: space.md,
    paddingBottom: space.md,
  },
  sheetFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: space.sm,
  },
});
