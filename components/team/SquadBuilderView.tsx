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
 *   SEZON KADROSU Takım oyuncuları tek listede; "Ekle" tek dokunuşla ekler,
 *                 eksiklerin tümü tek tuşla eklenir, lisans satırdan
 *                 değiştirilir. Kural seti varsa ekleme Alert ile onaylanır
 *                 (1 transfer hakkı tüketir; çıkarma iade etmez).
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
  SkeletonListRow,
  Toggle,
  Touchable,
  useToast,
} from "@/components/ui";
import {
  SQUAD_BUILDER_ERRORS,
  addSquadSeasonPlayers,
  capLabel,
  getSquadBuilder,
  positionLabel,
  recruitPlayer,
  removeSquadSeasonPlayer,
  searchSquadCandidates,
  setSquadSeasonLicense,
  type SquadBuilderOverview,
  type SquadCandidate,
  type SquadPendingItem,
  type SquadRosterEntry,
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
  const [licensedDefault, setLicensedDefault] = useState(false);
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

  /* — Sezon kadrosu — */
  const activeSeasonId = data?.selectedSeasonId ?? null;
  const status = data?.seasonStatus ?? null;
  const rulesApply = Boolean(status?.applies);
  const season = useMemo(
    () => data?.seasons.find((item) => item.id === activeSeasonId) ?? null,
    [activeSeasonId, data?.seasons],
  );
  const missing = useMemo(
    () => (data?.roster ?? []).filter((row) => !row.inSeasonRoster && !row.pendingSeasonApproval),
    [data?.roster],
  );

  const addMutation = useMutation({
    mutationFn: (playerIds: number[]) =>
      addSquadSeasonPlayers(activeSeasonId as number, { playerIds, isLicensed: licensedDefault }),
    onSuccess: (result) => {
      toast.show({ message: result.message, tone: result.failed.length ? "warn" : "success", haptic: "success" });
      invalidate();
    },
    onError: (error) => {
      toast.show({ message: describeError(error, "Oyuncu eklenemedi."), tone: "danger" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (playerId: number) => removeSquadSeasonPlayer(activeSeasonId as number, playerId),
    onSuccess: () => {
      toast.show({ message: "Oyuncu sezon kadrosundan çıkarıldı.", tone: "success" });
      invalidate();
    },
    onError: (error) => {
      toast.show({ message: describeError(error, "Oyuncu çıkarılamadı."), tone: "danger" });
    },
  });

  const licenseMutation = useMutation({
    mutationFn: ({ playerId, isLicensed }: { playerId: number; isLicensed: boolean }) =>
      setSquadSeasonLicense(activeSeasonId as number, playerId, isLicensed),
    onSuccess: (result) => {
      toast.show({ message: result.message, tone: "success" });
      invalidate();
    },
    onError: (error) => {
      toast.show({ message: describeError(error, "Lisans güncellenemedi."), tone: "danger" });
    },
  });

  const busy =
    recruitMutation.isPending || addMutation.isPending || removeMutation.isPending || licenseMutation.isPending;

  const confirmAdd = useCallback(
    (ids: number[], title: string, body: string) => {
      if (!rulesApply) {
        addMutation.mutate(ids);
        return;
      }
      const rights = transferRightsLabel(status);
      Alert.alert(title, `${body}\n\nHer ekleme 1 transfer hakkı tüketir; çıkarma hakkı geri vermez. Transfer hakkı: ${rights}.`, [
        { text: "Vazgeç", style: "cancel" },
        { text: "Ekle", onPress: () => addMutation.mutate(ids) },
      ]);
    },
    [addMutation, rulesApply, status],
  );

  const addOne = useCallback(
    (row: SquadRosterEntry) =>
      confirmAdd([row.id], "Sezon kadrosuna ekle", `${row.name} ${season?.name ?? "seçili sezon"} kadrosuna eklenecek.`),
    [confirmAdd, season?.name],
  );

  const addMissing = useCallback(() => {
    if (!missing.length) return;
    confirmAdd(
      missing.map((row) => row.id),
      "Eksik oyuncuların tümünü ekle",
      `${missing.length} oyuncu ${season?.name ?? "seçili sezon"} kadrosuna eklenecek. Limit dolarsa kalanlar eklenmez; sonuç özetlenir.`,
    );
  }, [confirmAdd, missing, season?.name]);

  const remove = useCallback(
    (row: SquadRosterEntry) => {
      Alert.alert(
        "Sezon kadrosundan çıkar",
        `${row.name} bu sezonun kadrosundan çıkarılacak. Oyuncu takım kadronda kalır${rulesApply ? "; tüketilen transfer hakkı GERİ GELMEZ" : ""}.`,
        [
          { text: "Vazgeç", style: "cancel" },
          { text: "Çıkar", style: "destructive", onPress: () => removeMutation.mutate(row.id) },
        ],
      );
    },
    [removeMutation, rulesApply],
  );

  const toggleLicense = useCallback(
    (row: SquadRosterEntry, isLicensed: boolean) => licenseMutation.mutate({ playerId: row.id, isLicensed }),
    [licenseMutation],
  );

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
            label="Sezon kadrosunda"
            value={rulesApply ? `${data.summary.inSeasonRoster} / ${capLabel(status?.general)}` : String(data.summary.inSeasonRoster)}
            hint={season?.name}
            icon="calendar-outline"
          />
          <MetricTile
            label="Lisanslı"
            value={rulesApply ? `${status?.licensed?.used ?? 0} / ${capLabel(status?.licensed)}` : String(status?.roster?.licensedCount ?? 0)}
            icon="id-card-outline"
          />
          <MetricTile
            label="Transfer hakkı"
            value={transferRightsLabel(status)}
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

        {/* ── Sezon kadrosu ── */}
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
        ) : (
          <>
            {missing.length > 0 ? (
              <Button
                label={`Eksik ${missing.length} oyuncuyu ekle`}
                icon="people"
                onPress={addMissing}
                disabled={busy}
                fullWidth
              />
            ) : null}
            <View style={styles.licensedRow}>
              <View style={styles.licensedTexts}>
                <Text style={styles.licensedTitle} {...textScale.dense}>
                  Yeni eklenenleri lisanslı işaretle
                </Text>
                <Text style={styles.hint} {...textScale.long}>
                  Lisanslı oyuncuların ayrı limiti vardır; satırdan sonradan da değiştirebilirsin.
                </Text>
              </View>
              <Toggle value={licensedDefault} onValueChange={setLicensedDefault} accessibilityLabel="Yeni eklenenleri lisanslı işaretle" />
            </View>

            {data.roster.length === 0 ? (
              <Text style={styles.hint} {...textScale.long}>
                Takımda henüz oyuncu yok. Yukarıdan oyuncu ara ve kadrona kat.
              </Text>
            ) : (
              data.roster.map((row) => (
                <RosterRow
                  key={row.id}
                  row={row}
                  disabled={busy}
                  onAdd={addOne}
                  onRemove={remove}
                  onLicense={toggleLicense}
                />
              ))
            )}
            {data.formerMembers.map((row) => (
              <RosterRow key={`former-${row.id}`} row={row} disabled={busy} onAdd={addOne} onRemove={remove} onLicense={toggleLicense} />
            ))}
          </>
        )}
      </ScrollView>

      {offerTarget ? (
        <QuickOfferSheet
          candidate={offerTarget}
          busy={recruitMutation.isPending}
          onClose={closeOffer}
          onSubmit={(terms) => recruitMutation.mutate({ playerId: offerTarget.id, ...terms })}
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

/** Takım oyuncusu: sezon kadrosunda mı? Tek dokunuşla ekle / çıkar, lisans anahtarı. */
const RosterRow = React.memo(function RosterRow({
  row,
  disabled,
  onAdd,
  onRemove,
  onLicense,
}: {
  row: SquadRosterEntry;
  disabled: boolean;
  onAdd: (row: SquadRosterEntry) => void;
  onRemove: (row: SquadRosterEntry) => void;
  onLicense: (row: SquadRosterEntry, isLicensed: boolean) => void;
}) {
  const handleAdd = useCallback(() => onAdd(row), [onAdd, row]);
  const handleRemove = useCallback(() => onRemove(row), [onRemove, row]);
  const handleLicense = useCallback((value: boolean) => onLicense(row, value), [onLicense, row]);
  const meta = [
    row.jerseyNumber != null ? `#${row.jerseyNumber}` : null,
    positionLabel(row.position) || row.position || null,
    row.leftTeam ? "Takımdan ayrıldı" : null,
    row.pendingSeasonApproval ? "Onay bekliyor" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={[styles.row, row.inSeasonRoster ? styles.rowIn : null]}>
      <Avatar name={row.name} image={mediaUrl(row.image)} size={36} jersey={row.jerseyNumber} />
      <View style={styles.rowTexts}>
        <Text style={styles.rowTitle} numberOfLines={1} {...textScale.dense}>
          {row.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1} {...textScale.dense}>
          {meta || "Mevki yok"}
        </Text>
      </View>
      {row.inSeasonRoster ? (
        <>
          <View style={styles.licenseCell}>
            <Text style={styles.licenseLabel} {...textScale.badge}>
              {upperTR("Lisans")}
            </Text>
            <Toggle value={row.isLicensed} onValueChange={handleLicense} disabled={disabled} accessibilityLabel={`${row.name} lisanslı`} />
          </View>
          <Touchable
            feedback="icon"
            haptic="light"
            onPress={handleRemove}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`${row.name} sezon kadrosundan çıkar`}
            style={styles.iconAction}
          >
            <Ionicons name="checkmark-circle" size={24} color={colors.win} />
          </Touchable>
        </>
      ) : (
        <Button
          label="Ekle"
          size="sm"
          variant="secondary"
          icon="add"
          onPress={handleAdd}
          disabled={disabled || Boolean(row.pendingSeasonApproval) || Boolean(row.leftTeam)}
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
  onClose,
  onSubmit,
}: {
  candidate: SquadCandidate;
  busy: boolean;
  onClose: () => void;
  onSubmit: (terms: { transferFee: string | null; contractEndDate: string | null; message: string | null }) => void;
}) {
  const [fee, setFee] = useState("");
  const [endDate, setEndDate] = useState("");
  const [message, setMessage] = useState("");
  const dateOk = endDate.trim() === "" || /^\d{4}-\d{2}-\d{2}$/.test(endDate.trim());

  const submit = useCallback(() => {
    if (!dateOk) return;
    onSubmit({
      transferFee: fee.trim() ? fee.trim().replace(",", ".") : null,
      contractEndDate: endDate.trim() || null,
      message: message.trim() || null,
    });
  }, [dateOk, endDate, fee, message, onSubmit]);

  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={`${candidate.name} için teklif`}
      footer={
        <View style={styles.sheetFooter}>
          <Button label="Vazgeç" variant="ghost" onPress={onClose} disabled={busy} />
          <Button label="Teklifi gönder" icon="paper-plane" onPress={submit} loading={busy} disabled={!dateOk} />
        </View>
      }
    >
      <View style={styles.sheetBody}>
        <Text style={styles.hint} {...textScale.long}>
          {candidate.isFreeAgent
            ? "Serbest oyuncu; panel hesabı olmadığı için teklif lig yönetimi onayıyla sonuçlanır."
            : `${candidate.teamName ?? "Mevcut takımı"} kadrosunda. Oyuncu kabul ederse kadrona geçer.`}{" "}
          Sözleşme bugün başlar, teklif 14 gün geçerlidir; diğer şartlar varsayılan.
        </Text>
        <Input
          label="Bonservis (₺)"
          value={fee}
          onChangeText={setFee}
          placeholder="0"
          keyboardType="decimal-pad"
          hint="Boş bırakılırsa bonservissiz"
        />
        <Input
          label="Sözleşme bitişi"
          value={endDate}
          onChangeText={setEndDate}
          placeholder="YYYY-AA-GG"
          keyboardType="numbers-and-punctuation"
          autoCorrect={false}
          hint="Boş bırakılırsa süresiz"
          error={dateOk ? undefined : "Tarih YYYY-AA-GG biçiminde olmalı."}
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
  licensedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.s,
  },
  licensedTexts: {
    flex: 1,
    gap: 2,
  },
  licensedTitle: {
    ...type.h3,
    color: colors.textPrimary,
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
