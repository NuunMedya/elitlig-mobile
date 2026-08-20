/**
 * MAÇ YÖNETİMİ — seçili kapsamdaki (şehir → lig → sezon) tüm maçlar, taslaklar
 * dahil (`includeDraft=1`).
 *
 * DÜZEN: durum çipleri + arama üstte sabit; liste `MatchRow` satırlarından
 * kurulu bir `SectionList`. CANLI maçlar HER ZAMAN en üstte, kendi bölümünde
 * durur ve o bölüm varken liste hızlı yoklamaya (20 sn) geçer — yönetici skor
 * girerken listeyi elle tazelemek zorunda kalmasın.
 *
 * NEDEN BÖLÜM BAŞLIĞI "GÜN + DURUM": satırın kendisi taslak mı zamanlanmış mı
 * söyleyemez (`MatchRow` üye gözüyle çizer: saat / MS / CANLI). Bu yüzden
 * gruplama (durum, gün) çiftiyle yapılır; başlığın adı GÜN, metası DURUM olur.
 * Bir durum çipi seçiliyken başlıklar saf gün başlığına iner.
 *
 * NEDEN SATIRA DOKUNUNCA ALT SAYFA: skor girişi, durum değişimi ve maç
 * sayfasına geçiş aynı maçın üç farklı işidir; ayrı ekranlara dağıtmak maç
 * gününde her işlem için üç dokunuş ekler. Alt sayfa maçın bağlamını koruyarak
 * üçünü de tek yerde toplar.
 *
 * GERİ ALINAMAYAN EYLEMLER ONAYLI: "Yayınlandı" puan durumunu hesaplatır ve
 * üyeye bildirim düşürür; "Taslak" maçı üye tarafından gizler. İkisi de Alert
 * ile doğrulanır. Skor kaydı da puan durumunu etkilediği için sonuç Toast ile
 * açıkça söylenir.
 *
 * VERİ MANTIĞI KORUNDU: liste tek sorgudur (durum sunucuda değil istemcide
 * süzülür) — çipler arasında geçiş ağa çıkmadan anında olur ve her çipin sayacı
 * aynı veriden okunur.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { memo, useCallback, useMemo, useState } from "react";
import { Alert, SectionList, StyleSheet, Text, View } from "react-native";
import type { SectionListData, SectionListRenderItemInfo } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Badge,
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  Input,
  MatchRow,
  ScreenHeader,
  SectionHeader,
  SkeletonMatchRow,
  Stepper,
  errorMessage,
  matchRowHeight,
  useHeaderScroll,
  useRefresh,
  useToast,
  type Tone,
} from "@/components/ui";
import { useAppActive } from "@/hooks/useLiveFavoriteCount";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import {
  getAdminMatches,
  MATCH_STATUS_LABELS,
  patchMatchScore,
  patchMatchStatus,
} from "@/lib/api/admin";
import { formatDayHeading, formatTime } from "@/lib/format";
import type { ApiMatch, MacDurumu } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, layout, space, textScale, type } from "@/theme";

/* ═══════════════════════════ SABİTLER VE YARDIMCILAR ═══════════════════════ */

const STATUS_ORDER: MacDurumu[] = ["taslak", "zamanlanmis", "canli", "yayinlanmis"];

/** Durum → ton. Renk YALNIZ durumu taşır; başka hiçbir yerde anlam yüklenmez. */
const STATUS_TONE: Record<MacDurumu, Tone> = {
  taslak: "neutral",
  zamanlanmis: "info",
  canli: "live",
  yayinlanmis: "win",
};

/** Onay isteyen geçişler: biri yayına çıkarır, diğeri yayından geri çeker. */
const CONFIRM_STATUS: Partial<Record<MacDurumu, { title: string; body: string; action: string }>> = {
  yayinlanmis: {
    title: "Maçı yayınla",
    body: "Maç yayınlanınca skor kesinleşir, puan durumu yeniden hesaplanır ve üyelere sonuç bildirimi gider.",
    action: "Yayınla",
  },
  taslak: {
    title: "Taslağa al",
    body: "Maç taslağa alınınca üye tarafında görünmez olur ve puan durumundan düşer.",
    action: "Taslağa al",
  },
};

/** Satır ve başlık ölçüleri — `getItemLayout` yalnız bunlardan kurulur. */
const ROW_HEIGHT = matchRowHeight("default", "none");
const SECTION_HEADER_HEIGHT = 32;
const SECTION_GAP = space.md;

/** Canlı bölüm varken hızlı, yokken sakin yoklama. */
const LIVE_POLL_MS = 20_000;
const IDLE_POLL_MS = 60_000;

/** Sunucu durumu boş bırakabilir (eski kayıtlar); o maçlar ayrı bir kovaya düşer. */
const UNKNOWN_STATUS = "bilinmiyor";

/** Rota parametresi tek değer ya da dizi olarak gelebilir. */
function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolveStatus(raw: unknown): MacDurumu | null {
  const key = typeof raw === "string" ? raw.trim() : "";
  return (STATUS_ORDER as string[]).includes(key) ? (key as MacDurumu) : null;
}

/** Maç kaydındaki tarih "2026-08-18T00:00:00.000Z" da olabilir; gün kısmı alınır. */
const matchDay = (match: ApiMatch) => String(match.date ?? "").slice(0, 10);

/** Aynı gün içindeki sıralama saate göredir. */
const startKey = (match: ApiMatch) => `${matchDay(match)}T${match.time ?? "00:00:00"}`;

const statusKey = (match: ApiMatch): string => match.mac_durumu ?? UNKNOWN_STATUS;

const statusLabel = (status: MacDurumu | null): string =>
  status ? MATCH_STATUS_LABELS[status] : "Durumsuz";

/* ══════════════════════════════ BÖLÜM TİPLERİ ══════════════════════════════ */

interface MatchSectionMeta {
  key: string;
  /** Başlık: gün ("Bugün", "21 Ağustos Perşembe") ya da "Canlı". */
  title: string;
  /** Meta: durum + adet ("Zamanlandı · 4 maç"). */
  meta: string;
}

type MatchSection = MatchSectionMeta & { data: ApiMatch[] };

/* ══════════════════════════════════ EKRAN ═════════════════════════════════ */

export default function AdminMatchesScreen() {
  const auth = useAuth();
  const scope = useScope();
  const router = useRouter();
  const toast = useToast();
  const teams = useTeamLogos();
  const appActive = useAppActive();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ durum?: string | string[] }>();
  const { scrollY, scrollProps } = useHeaderScroll();

  /** Durum süzgeci ROTADA taşınır: paylaşılan bağlantı doğru çipe düşer. */
  const status = resolveStatus(firstParam(params.durum));

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);

  /* ───────────────────────────── VERİ ───────────────────────────── */

  const queryKey = useMemo(
    () => ["admin", "matches", "list", scope.cityId, scope.leagueId, scope.seasonId] as const,
    [scope.cityId, scope.leagueId, scope.seasonId],
  );

  const matchesQuery = useQuery({
    queryKey,
    queryFn: () =>
      getAdminMatches({
        leagueId: scope.leagueId ?? undefined,
        seasonId: scope.seasonId ?? undefined,
        limit: 500,
      }),
    enabled: Boolean(auth.user) && auth.isManagement && scope.ready,
    staleTime: 10_000,
    retry: false,
    /**
     * Canlı maç varken 20 sn, yokken 60 sn; uygulama arkadayken hiç yoklanmaz.
     * İŞLEV BİÇİMİ ŞART: aralık listenin kendi verisine bağlı, bu yüzden sabit
     * bir sayı yazılamaz (sorgu kurulurken canlı maç olup olmadığı bilinmez).
     */
    refetchInterval: (query) => {
      if (!appActive) return false;
      const rows = query.state.data ?? [];
      return rows.some((item) => item.mac_durumu === "canli") ? LIVE_POLL_MS : IDLE_POLL_MS;
    },
  });

  const matches = useMemo(() => matchesQuery.data ?? [], [matchesQuery.data]);

  /** Arama tüm listeye uygulanır; çip sayaçları da bu süzülmüş kümeden okunur. */
  const searched = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("tr-TR");
    if (!term) return matches;
    return matches.filter(
      (match) =>
        match.first_team_name.toLocaleLowerCase("tr-TR").includes(term) ||
        match.second_team_name.toLocaleLowerCase("tr-TR").includes(term),
    );
  }, [matches, search]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    searched.forEach((match) => {
      const key = statusKey(match);
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
  }, [searched]);

  const visible = useMemo(
    () => (status ? searched.filter((match) => match.mac_durumu === status) : searched),
    [searched, status],
  );

  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
  }, [queryClient]);

  const refresh = useRefresh(refetch, { refreshing: matchesQuery.isRefetching });

  /* ─────────────────────────── BÖLÜMLER ─────────────────────────── */

  const sections = useMemo<MatchSection[]>(() => {
    const live = visible.filter((match) => match.mac_durumu === "canli");
    const rest = visible.filter((match) => match.mac_durumu !== "canli");

    const result: MatchSection[] = [];

    if (live.length) {
      result.push({
        key: "canli",
        title: "Canlı",
        meta: `${live.length} maç · otomatik yenileniyor`,
        data: [...live].sort((a, b) => startKey(a).localeCompare(startKey(b))),
      });
    }

    // (durum, gün) çiftine göre kovalama — anahtar sıralaması aşağıda kurulur.
    const buckets = new Map<string, ApiMatch[]>();
    rest.forEach((match) => {
      const key = `${statusKey(match)}|${matchDay(match)}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(match);
      else buckets.set(key, [match]);
    });

    /** Durum sırası: önce ele alınması gerekenler, sonra biten işler. */
    const order = ["taslak", "zamanlanmis", "yayinlanmis", UNKNOWN_STATUS];

    const keys = [...buckets.keys()].sort((a, b) => {
      const [statusA, dayA] = a.split("|");
      const [statusB, dayB] = b.split("|");
      const rankA = order.indexOf(statusA);
      const rankB = order.indexOf(statusB);
      if (rankA !== rankB) return (rankA < 0 ? order.length : rankA) - (rankB < 0 ? order.length : rankB);
      // Yayınlanmış maçlar en yeniden eskiye; bekleyen işler yakın günden uzağa.
      return statusA === "yayinlanmis" ? dayB.localeCompare(dayA) : dayA.localeCompare(dayB);
    });

    keys.forEach((key) => {
      const [bucketStatus, day] = key.split("|");
      const data = (buckets.get(key) ?? []).sort((a, b) => startKey(a).localeCompare(startKey(b)));
      const label = statusLabel(resolveStatus(bucketStatus));
      result.push({
        key,
        title: formatDayHeading(day),
        meta: `${label} · ${data.length} maç`,
        data,
      });
    });

    return result;
  }, [visible]);

  /* ──────────────────────────── EYLEMLER ──────────────────────────── */

  const selected = useMemo(
    () => matches.find((match) => Number(match.id) === selectedId) ?? null,
    [matches, selectedId],
  );

  const openSheet = useCallback(
    (matchId: number) => {
      const match = matches.find((item) => Number(item.id) === matchId);
      setHomeScore(Number(match?.first_team_score ?? 0));
      setAwayScore(Number(match?.second_team_score ?? 0));
      setSelectedId(matchId);
    },
    [matches],
  );

  const closeSheet = useCallback(() => setSelectedId(null), []);

  /**
   * GERİ BİLDİRİM KANALI: Toast, yerel `Modal` katmanının ALTINDA kalır — alt
   * sayfa açıkken görünmez. Bu yüzden alt sayfadan tetiklenen hatalar Alert
   * (yerel katman, her zaman üstte), alt sayfayı KAPATAN başarılar Toast ile
   * bildirilir. Kapatmayan başarılar için geri bildirim ekranın kendisidir:
   * durum çipi seçili hâle geçer.
   */
  const scoreMutation = useMutation({
    mutationFn: (input: { id: number; home: number; away: number }) =>
      patchMatchScore(input.id, input.home, input.away),
    onSuccess: () => {
      refetch();
      closeSheet();
      toast.show({ message: "Skor kaydedildi. Puan durumu yeniden hesaplandı.", tone: "success" });
    },
    onError: (error) => Alert.alert("Skor kaydedilemedi", errorMessage(error)),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { id: number; status: MacDurumu }) =>
      patchMatchStatus(input.id, input.status),
    // Alt sayfa açık kalır: yeni durum çipi anında seçili görünür, üstelik
    // yönetici aynı maçta arka arkaya işlem yapabilir.
    onSuccess: () => refetch(),
    onError: (error) => Alert.alert("Durum değiştirilemedi", errorMessage(error)),
  });

  const changeStatus = useCallback(
    (next: MacDurumu) => {
      if (!selected) return;
      const id = Number(selected.id);
      const confirm = CONFIRM_STATUS[next];
      if (!confirm) {
        statusMutation.mutate({ id, status: next });
        return;
      }
      Alert.alert(
        confirm.title,
        `${selected.first_team_name} – ${selected.second_team_name}\n\n${confirm.body}`,
        [
          { text: "Vazgeç", style: "cancel" },
          {
            text: confirm.action,
            style: next === "taslak" ? "destructive" : "default",
            onPress: () => statusMutation.mutate({ id, status: next }),
          },
        ],
      );
    },
    [selected, statusMutation],
  );

  const saveScore = useCallback(() => {
    if (!selected) return;
    scoreMutation.mutate({ id: Number(selected.id), home: homeScore, away: awayScore });
  }, [awayScore, homeScore, scoreMutation, selected]);

  const openMatchPage = useCallback(() => {
    if (!selected) return;
    const id = Number(selected.id);
    closeSheet();
    router.push(`/mac/${id}`);
  }, [closeSheet, router, selected]);

  const selectStatus = useCallback(
    (next: MacDurumu | null) => {
      router.setParams({ durum: next ?? "" });
    },
    [router],
  );

  /* ───────────────────────────── ÇİZİM ───────────────────────────── */

  const renderItem = useCallback(
    ({ item, index, section }: SectionListRenderItemInfo<ApiMatch, MatchSectionMeta>) => {
      const last = index === section.data.length - 1;
      const position = index === 0 ? (last ? "single" : "first") : last ? "last" : "middle";
      return (
        <AdminMatchRow
          match={item}
          homeLogo={teams.logoFor(item.home_team_id, item.first_team_name)}
          awayLogo={teams.logoFor(item.away_team_id, item.second_team_name)}
          position={position}
          onOpen={openSheet}
        />
      );
    },
    [openSheet, teams],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<ApiMatch, MatchSectionMeta> }) => (
      <SectionHeader title={section.title} meta={section.meta} />
    ),
    [],
  );

  const renderSectionFooter = useCallback(() => <View style={styles.sectionGap} />, []);

  /**
   * SectionList düz indeks uzayı: her bölüm için [başlık, ...satırlar, altlık].
   * Altlık bir indeks tüketir (VirtualizedSectionList kuralı) ve burada gerçek
   * bir yüksekliği vardır (bölümler arası boşluk).
   */
  const getItemLayout = useCallback(
    (data: SectionListData<ApiMatch, MatchSectionMeta>[] | null, index: number) => {
      let offset = 0;
      let cursor = 0;

      for (const section of data ?? []) {
        if (index === cursor) return { length: SECTION_HEADER_HEIGHT, offset, index };
        offset += SECTION_HEADER_HEIGHT;
        cursor += 1;

        const count = section.data.length;
        if (index < cursor + count) {
          const within = index - cursor;
          return { length: ROW_HEIGHT, offset: offset + within * ROW_HEIGHT, index };
        }
        offset += count * ROW_HEIGHT;
        cursor += count;

        if (index === cursor) return { length: SECTION_GAP, offset, index };
        offset += SECTION_GAP;
        cursor += 1;
      }

      return { length: 0, offset, index };
    },
    [],
  );

  /* ─────────────────────────────── KAPI ─────────────────────────────── */

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }
  if (!auth.isManagement) {
    return <Redirect href="/yonetim" />;
  }

  const scopeLabel =
    [scope.cityLabel, scope.leagueLabel, scope.seasonLabel].filter(Boolean).join(" · ") ||
    "Kapsam seçilmedi";

  const loading = matchesQuery.isLoading || (!scope.ready && scope.loading);
  const failed = matchesQuery.isError && matches.length === 0;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Maç Yönetimi"
        subtitle={scopeLabel}
        back
        scrollY={scrollY}
        bottom={
          <View style={styles.controls}>
            <ChipGroup>
              <Chip
                label="Tümü"
                count={searched.length}
                selected={status === null}
                onPress={() => selectStatus(null)}
              />
              {STATUS_ORDER.map((item) => (
                <Chip
                  key={item}
                  label={MATCH_STATUS_LABELS[item]}
                  count={counts.get(item) ?? 0}
                  tone={STATUS_TONE[item]}
                  selected={status === item}
                  onPress={() => selectStatus(status === item ? null : item)}
                />
              ))}
            </ChipGroup>

            <Input
              variant="search"
              size="sm"
              value={search}
              onChangeText={setSearch}
              placeholder="Takım adı ara…"
              autoCorrect={false}
              containerStyle={styles.search}
              accessibilityLabel="Takım adına göre ara"
            />
          </View>
        }
      />

      {!scope.ready && !scope.loading ? (
        <EmptyState
          icon="options-outline"
          title="Kapsam seçilmedi"
          body="Maçları yönetmek için şehir, lig ve sezon seçin."
          action={{ label: "Kapsam seç", onPress: () => scope.openScopeSheet("city") }}
        />
      ) : loading ? (
        <View style={styles.skeleton}>
          <SkeletonMatchRow count={7} />
        </View>
      ) : failed ? (
        <ErrorState error={matchesQuery.error} onRetry={refetch} />
      ) : (
        <SectionList<ApiMatch, MatchSectionMeta>
          {...scrollProps}
          sections={sections}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          renderSectionFooter={renderSectionFooter}
          getItemLayout={getItemLayout}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
          refreshControl={refresh.control}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={8}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            matchesQuery.isError ? (
              <ErrorState
                error={matchesQuery.error}
                onRetry={refetch}
                variant="banner"
                style={styles.banner}
              />
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="football-outline"
              title="Maç bulunamadı"
              body={
                search
                  ? "Aramanızla eşleşen maç yok. Farklı bir takım adı deneyin."
                  : "Bu kapsam ve durumda maç yok. Durum çipini değiştirmeyi deneyin."
              }
              action={
                status || search
                  ? {
                      label: "Süzgeci temizle",
                      onPress: () => {
                        setSearch("");
                        selectStatus(null);
                      },
                    }
                  : undefined
              }
            />
          }
        />
      )}

      {/* Eylem alt sayfası: skor · durum · maç sayfası */}
      <BottomSheet
        visible={selected !== null}
        onClose={closeSheet}
        title={selected ? `${selected.first_team_name} – ${selected.second_team_name}` : undefined}
        snap="content"
      >
        {selected ? (
          <View style={styles.sheet}>
            <View style={styles.sheetMetaRow}>
              <Badge
                label={statusLabel(selected.mac_durumu).toLocaleUpperCase("tr-TR")}
                tone={selected.mac_durumu ? STATUS_TONE[selected.mac_durumu] : "neutral"}
                size="xs"
              />
              <Text style={styles.sheetMeta} numberOfLines={1} {...textScale.dense}>
                {[
                  formatDayHeading(matchDay(selected)),
                  formatTime(selected.time),
                  selected.match_field,
                  selected.league_name,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>

            {/* Skor girişi — tabular Stepper, sabit genişlik, basılı tutunca hızlanır. */}
            <Text style={styles.sheetLabel} {...textScale.dense}>
              SKOR
            </Text>
            <View style={styles.scoreRow}>
              <View style={styles.scoreSide}>
                <Text style={styles.scoreTeam} numberOfLines={1} {...textScale.dense}>
                  {selected.first_team_name}
                </Text>
                <Stepper
                  value={homeScore}
                  onChange={setHomeScore}
                  min={0}
                  max={99}
                  repeatOnHold
                  accessibilityLabel={`${selected.first_team_name} skoru`}
                />
              </View>
              <View style={styles.scoreSide}>
                <Text style={styles.scoreTeam} numberOfLines={1} {...textScale.dense}>
                  {selected.second_team_name}
                </Text>
                <Stepper
                  value={awayScore}
                  onChange={setAwayScore}
                  min={0}
                  max={99}
                  repeatOnHold
                  accessibilityLabel={`${selected.second_team_name} skoru`}
                />
              </View>
            </View>

            <Button
              label="Skoru kaydet"
              icon="save-outline"
              onPress={saveScore}
              loading={scoreMutation.isPending}
              disabled={
                homeScore === Number(selected.first_team_score ?? 0) &&
                awayScore === Number(selected.second_team_score ?? 0)
              }
              haptic="medium"
              fullWidth
            />

            {/* Durum değiştirme */}
            <Text style={styles.sheetLabel} {...textScale.dense}>
              DURUM
            </Text>
            <ChipGroup scrollable={false} contentPadding={0}>
              {STATUS_ORDER.map((item) => (
                <Chip
                  key={item}
                  label={MATCH_STATUS_LABELS[item]}
                  tone={STATUS_TONE[item]}
                  selected={selected.mac_durumu === item}
                  disabled={selected.mac_durumu === item || statusMutation.isPending}
                  onPress={() => changeStatus(item)}
                />
              ))}
            </ChipGroup>
            <Text style={styles.sheetNote} {...textScale.long}>
              &quot;Canlı&quot; durumu üyelere maç başladı bildirimi gönderir. &quot;Yayınlandı&quot;
              ve &quot;Taslak&quot; puan durumunu değiştirdiği için onay ister.
            </Text>

            <Button
              label="Maç sayfasını aç"
              variant="secondary"
              icon="open-outline"
              onPress={openMatchPage}
              fullWidth
            />
          </View>
        ) : null}
      </BottomSheet>
    </SafeAreaView>
  );
}

const keyExtractor = (item: ApiMatch) => String(item.id);

/* ═══════════════════════════════ ALT PARÇALAR ══════════════════════════════ */

/**
 * Satır sarmalayıcı. `MatchRow` memo'lu; `onPress` her çizimde yeniden
 * üretilseydi memo işe yaramazdı. İşleyici maç id'sini burada bağlanır.
 * Yönetimde yıldız sütunu yoktur — favori üyeye ait bir kavramdır.
 */
const AdminMatchRow = memo(function AdminMatchRow({
  match,
  homeLogo,
  awayLogo,
  position,
  onOpen,
}: {
  match: ApiMatch;
  homeLogo: string | null;
  awayLogo: string | null;
  position: "single" | "first" | "middle" | "last";
  onOpen: (matchId: number) => void;
}) {
  const matchId = Number(match.id);
  const handlePress = useCallback(() => onOpen(matchId), [matchId, onOpen]);

  return (
    <MatchRow
      match={match}
      homeLogo={homeLogo}
      awayLogo={awayLogo}
      position={position}
      showFavorite={false}
      onPress={handlePress}
      flashOnScoreChange
    />
  );
});

/* ═════════════════════════════════ STİLLER ═════════════════════════════════ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  controls: {
    gap: space.sm,
    paddingBottom: space.sm,
  },
  search: {
    paddingHorizontal: layout.screenPadding,
  },
  skeleton: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
  },
  list: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.giant,
    flexGrow: 1,
  },
  banner: {
    marginBottom: space.sm,
  },
  sectionGap: {
    height: SECTION_GAP,
  },

  /* Eylem alt sayfası */
  sheet: {
    gap: space.md,
    paddingBottom: space.sm,
  },
  sheetMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  sheetMeta: {
    ...type.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  sheetLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },
  sheetNote: {
    ...type.caption,
    color: colors.textTertiary,
  },
  scoreRow: {
    flexDirection: "row",
    gap: space.md,
  },
  scoreSide: {
    flex: 1,
    alignItems: "center",
    gap: space.sm,
  },
  scoreTeam: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
