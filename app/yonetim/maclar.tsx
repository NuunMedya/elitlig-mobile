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
 * İŞ AKIŞI: alt sayfanın ilk düğmesi maçın dört adımlı ekranını açar
 * (/yonetim/mac/[id]); üst çubukta yetkiye göre "Yeni maç" ve "Toplu
 * düzenle" kısayolları durur.
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
  EmptyState,
  ErrorState,
  IconTile,
  Input,
  ScreenHeader,
  Skeleton,
  Stepper,
  TeamLogo,
  Touchable,
  useHeaderScroll,
  useRefresh,
  useToast,
  type IconTileTone,
  type Tone,
} from "@/components/ui";
import {
  DAY_HEADER_HEIGHT,
  DayHeader,
  InfoPill,
  OPS_MATCH_CARD_HEIGHT,
  OpsGroup,
  OpsMatchCard,
  OpsStage,
  ScorePlate,
  StatusTiles,
  toneColor,
  upperTR,
} from "@/components/admin/matches/opsKit";
import { useAppActive } from "@/hooks/useLiveFavoriteCount";
import { useTeamLogos } from "@/hooks/useTeamLogos";
import {
  getAdminMatches,
  MATCH_STATUS_LABELS,
  patchMatchScore,
  patchMatchStatus,
} from "@/lib/api/admin";
import { hasAnyPermission } from "@/lib/admin/access";
import { errorText } from "@/lib/admin/errors";
import { normalizeMatchStatus, updateMatch } from "@/lib/api/admin/matches";
import { formatDayHeading, formatTime } from "@/lib/format";
import type { ApiMatch, MacDurumu } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

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

/** Satır ve başlık ölçüleri — `getItemLayout` yalnız bunlardan kurulur.
   Kart sabit yükseklikli (OpsMatchCard) + kartlar arası nefes. */
const CARD_GAP = space.sm;
const ROW_HEIGHT = OPS_MATCH_CARD_HEIGHT + CARD_GAP;
/* Gün başlığı: takvim pulu + gün adı + durum hapı (DayHeader). */
const SECTION_HEADER_HEIGHT = DAY_HEADER_HEIGHT + space.sm;
const SECTION_GAP = space.xs;

/** Durum sayacı karolarındaki kısa adlar ve simgeler. */
const STATUS_TILE: Record<MacDurumu, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  taslak: { label: "Taslak", icon: "document-outline" },
  zamanlanmis: { label: "Zamanlandı", icon: "calendar-outline" },
  canli: { label: "Canlı", icon: "radio-outline" },
  yayinlanmis: { label: "Yayınlandı", icon: "checkmark-done-outline" },
};

/** Bugünün "YYYY-MM-DD" anahtarı (yerel saat) — "sonuç bekliyor" uyarısı için. */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Ekranı açabilen yetkiler. Menüdeki modül matches.view/create/update ister;
 * yalnız kadro / canlı akış / istatistik yetkisi olan operatör de (Lig
 * Yönetimi ana ekranındaki "Tüm maçlar" ya da bildirim bağlantısıyla) listeye
 * gelebilmeli — iş akışı ekranı zaten aynı kümeyi kabul eder.
 */
const SCREEN_PERMS = ["matches.view", "matches.create", "matches.update", "matches.lineup", "matches.live", "matches.stats"];

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

/** "zamanlandi" (fikstür maçları) ile "zamanlanmis" aynı kovaya düşer. */
const statusKey = (match: ApiMatch): string => normalizeMatchStatus(match.mac_durumu) ?? UNKNOWN_STATUS;

const statusLabel = (status: MacDurumu | null): string =>
  status ? MATCH_STATUS_LABELS[status] : "Durumsuz";

/* ══════════════════════════════ BÖLÜM TİPLERİ ══════════════════════════════ */

interface MatchSectionMeta {
  key: string;
  /** Başlık: gün ("Bugün", "21 Ağustos Perşembe") ya da "Canlı". */
  title: string;
  /** Meta: durum + adet ("Zamanlandı · 4 maç"). */
  meta: string;
  /** Takvim pulu için gün ("2026-11-14"); canlı bölümde boş. */
  day?: string;
  /** Bölümün durum anahtarı (hap tonu). */
  status: string;
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

  /* Yetkiler — düğmeler sunucunun isteyeceği yetkiye göre açılır; aksi hâlde
     yönetici dokunup 403 alıyordu. */
  const allowed = auth.isManagement && hasAnyPermission(auth.user, SCREEN_PERMS);
  const canScore = hasAnyPermission(auth.user, ["matches.live"]);
  const canUpdate = hasAnyPermission(auth.user, ["matches.update"]);
  const canLive = hasAnyPermission(auth.user, ["matches.live"]);
  const canPublish = hasAnyPermission(auth.user, ["matches.publish"]);
  /** Bu duruma geçişi kullanıcı yapabilir mi (sunucu kuralı: lib/matchLivePatch.js). */
  const canSetStatus = useCallback(
    (next: MacDurumu) => canPublish || canUpdate || (canLive && (next === "canli" || next === "yayinlanmis")),
    [canLive, canPublish, canUpdate],
  );

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
    enabled: Boolean(auth.user) && allowed && scope.ready,
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
      return rows.some((item) => normalizeMatchStatus(item.mac_durumu) === "canli") ? LIVE_POLL_MS : IDLE_POLL_MS;
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
    () => (status ? searched.filter((match) => statusKey(match) === status) : searched),
    [searched, status],
  );

  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
  }, [queryClient]);

  const refresh = useRefresh(refetch, { refreshing: matchesQuery.isRefetching });

  /* ─────────────────────────── BÖLÜMLER ─────────────────────────── */

  const sections = useMemo<MatchSection[]>(() => {
    const live = visible.filter((match) => statusKey(match) === "canli");
    const rest = visible.filter((match) => statusKey(match) !== "canli");

    const result: MatchSection[] = [];

    if (live.length) {
      result.push({
        key: "canli",
        status: "canli",
        title: "Şu an sahada",
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
        status: bucketStatus,
        day,
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
    onError: (error) => Alert.alert("Skor kaydedilemedi", errorText(error)),
  });

  const statusMutation = useMutation({
    /**
     * UÇ SEÇİMİ: genel güncelleme ucu (PATCH /maclar/:id; matches.update ya da
     * canlı/yayınlandı geçişinde matches.live) durum geçişinde "maç başladı"
     * ve "maç bitti" bildirimlerini gönderir — web reji paneliyle aynı yol.
     * Kullanıcının yalnız matches.publish yetkisi varsa durum ucuna düşülür.
     */
    mutationFn: (input: { id: number; status: MacDurumu }): Promise<unknown> =>
      canUpdate || (canLive && (input.status === "canli" || input.status === "yayinlanmis"))
        ? updateMatch(input.id, { mac_durumu: input.status })
        : patchMatchStatus(input.id, input.status),
    // İYİMSER: çip anında seçili görünür; sunucu reddederse liste eski hâline döner.
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ApiMatch[]>(queryKey);
      queryClient.setQueryData<ApiMatch[]>(queryKey, (old) =>
        (old ?? []).map((item) => (Number(item.id) === input.id ? { ...item, mac_durumu: input.status } : item)),
      );
      return { previous };
    },
    // Alt sayfa açık kalır: yönetici aynı maçta arka arkaya işlem yapabilir.
    onSuccess: () => refetch(),
    onError: (error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      Alert.alert("Durum değiştirilemedi", errorText(error));
    },
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

  /** Maçın dört adımlı iş akışı (öncesi · kadro · canlı · maç sonu). */
  const openWorkflow = useCallback(() => {
    if (!selected) return;
    const id = Number(selected.id);
    closeSheet();
    router.push(`/yonetim/mac/${id}`);
  }, [closeSheet, router, selected]);

  /** Doğrudan bir adıma: kadro girişi, canlı akış ya da maç sonu ayrıntıları. */
  const openStep = useCallback(
    (step: "kadro" | "canli" | "mac-sonu") => {
      if (!selected) return;
      const id = Number(selected.id);
      closeSheet();
      router.push(`/yonetim/mac/${id}?adim=${step}`);
    },
    [closeSheet, router, selected],
  );
  const canLineup = hasAnyPermission(auth.user, ["matches.lineup"]);
  const canPost = hasAnyPermission(auth.user, ["matches.stats", "matches.update"]);

  /** Yetkiye göre üst kısayollar: yeni maç, toplu düzenleme. */
  const headerActions = useMemo(
    () =>
      [
        hasAnyPermission(auth.user, ["matches.bulk_edit"])
          ? { icon: "layers-outline" as const, accessibilityLabel: "Toplu düzenle", onPress: () => router.push("/yonetim/toplu-duzenle") }
          : null,
        hasAnyPermission(auth.user, ["matches.create"])
          ? { icon: "add-circle-outline" as const, accessibilityLabel: "Yeni maç", onPress: () => router.push("/yonetim/mac-olustur") }
          : null,
      ].filter((a): a is NonNullable<typeof a> => a !== null),
    [auth.user, router],
  );

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

  const today = todayKey();

  const renderItem = useCallback(
    ({ item }: SectionListRenderItemInfo<ApiMatch, MatchSectionMeta>) => (
      <AdminMatchRow
        match={item}
        homeLogo={teams.logoFor(item.home_team_id, item.first_team_name)}
        awayLogo={teams.logoFor(item.away_team_id, item.second_team_name)}
        today={today}
        onOpen={openSheet}
      />
    ),
    [openSheet, teams, today],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<ApiMatch, MatchSectionMeta> }) => {
      const known = resolveStatus(section.status);
      return (
        <View style={styles.dayHeader}>
          <DayHeader
            day={section.day}
            title={section.title}
            statusLabel={section.key === "canli" ? "Otomatik yenileniyor" : statusLabel(known)}
            tone={known ? STATUS_TONE[known] : "neutral"}
            count={section.data.length}
            live={section.key === "canli"}
          />
        </View>
      );
    },
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
  if (!allowed) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Maç Yönetimi" back />
        <EmptyState
          icon="lock-closed-outline"
          title="Bu bölüme yetkin yok"
          body="Maç yönetimi için gereken yetki hesabında tanımlı değil. Yetki için yöneticinle görüş."
          action={{ label: "Yönetim paneline dön", onPress: () => router.replace("/yonetim") }}
        />
      </SafeAreaView>
    );
  }

  const scopeLabel =
    [scope.cityLabel, scope.leagueLabel, scope.seasonLabel].filter(Boolean).join(" · ") ||
    "Kapsam seçilmedi";

  const loading = matchesQuery.isLoading || (!scope.ready && scope.loading);
  const failed = matchesQuery.isError && matches.length === 0;

  /* Eksik bilgi sayısı: sahası/saati olmayan ve sonucu bekleyen maçlar — özet altında tek satır. */
  const missing = searched.filter((m) => statusKey(m) !== "yayinlanmis" && (!m.match_field || !m.time)).length;
  const overdue = searched.filter((m) => statusKey(m) === "zamanlanmis" && matchDay(m) && matchDay(m) < today).length;

  const listHeader = (
    <View style={styles.summary}>
      <StatusTiles<MacDurumu>
        items={STATUS_ORDER.map((key) => ({
          key,
          label: STATUS_TILE[key].label,
          icon: STATUS_TILE[key].icon,
          value: counts.get(key) ?? 0,
          tone: STATUS_TONE[key],
        }))}
        value={status}
        onChange={selectStatus}
      />
      <View style={styles.summaryLine}>
        <Text style={styles.summaryText} numberOfLines={1} {...textScale.dense}>
          {status ? `${MATCH_STATUS_LABELS[status]} · ${visible.length} maç` : `Toplam ${searched.length} maç`}
          {search ? " · aramaya göre" : ""}
        </Text>
        {overdue ? <InfoPill icon="hourglass-outline" label={`${overdue} sonuç bekliyor`} tone="danger" /> : null}
        {missing ? <InfoPill icon="alert-circle" label={`${missing} eksik bilgi`} tone="warn" /> : null}
        {status ? (
          <Touchable onPress={() => selectStatus(null)} feedback="none" style={styles.clear} accessibilityRole="button" accessibilityLabel="Durum süzgecini kaldır">
            <Ionicons name="close-circle" size={14} color={colors.brandAccent} />
            <Text style={styles.clearText} {...textScale.dense}>
              Tümü
            </Text>
          </Touchable>
        ) : null}
      </View>
      {matchesQuery.isError ? (
        <ErrorState error={matchesQuery.error} onRetry={refetch} variant="banner" style={styles.banner} />
      ) : null}
    </View>
  );

  const selStatus = selected ? normalizeMatchStatus(selected.mac_durumu) : null;
  const selScored = selected
    ? (selStatus === "canli" || selStatus === "yayinlanmis") && selected.first_team_score != null && selected.second_team_score != null
    : false;

  /** Alt sayfadaki adım kısayolları — yetkisi olmayan adım gizlenir. */
  const stepTiles: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; tone: IconTileTone; onPress: () => void; hint: string }[] = [
    { key: "bilgiler", label: "Öncesi", icon: "clipboard-outline", tone: "violet", onPress: openWorkflow, hint: "Maç öncesi: tarih, saha, görevliler" },
    ...(canLineup ? [{ key: "kadro", label: "Kadro", icon: "people-outline" as const, tone: "cyan" as const, onPress: () => openStep("kadro"), hint: "İki takımın ilk 11 ve yedeklerini gir" }] : []),
    ...(canLive ? [{ key: "canli", label: "Canlı", icon: "radio-outline" as const, tone: "red" as const, onPress: () => openStep("canli"), hint: "Saat, devre, olaylar ve skor" }] : []),
    ...(canPost ? [{ key: "mac-sonu", label: "Maç sonu", icon: "star-outline" as const, tone: "gold" as const, onPress: () => openStep("mac-sonu"), hint: "Sonuç tescili, puanlar, maçın enleri, içerik, istatistik ve olaylar" }] : []),
  ];

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Maç Yönetimi"
        subtitle={scopeLabel}
        back
        actions={headerActions}
        scrollY={scrollY}
        bottom={
          <View style={styles.controls}>
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
          <View style={styles.skeletonTiles}>
            {STATUS_ORDER.map((key) => (
              <Skeleton key={key} height={68} radius="lg" style={styles.flex} />
            ))}
          </View>
          <Skeleton height={20} width={160} radius="sm" />
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} height={OPS_MATCH_CARD_HEIGHT} radius="xl" />
          ))}
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
          initialNumToRender={8}
          maxToRenderPerBatch={10}
          windowSize={8}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <EmptyState
              icon="football-outline"
              title="Maç bulunamadı"
              body={
                search
                  ? "Aramanızla eşleşen maç yok. Farklı bir takım adı deneyin."
                  : "Bu kapsam ve durumda maç yok. Durum karosunu değiştirmeyi deneyin."
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

      {/* Eylem alt sayfası: maç sahnesi · iş akışı · skor · durum · maç sayfası */}
      <BottomSheet
        visible={selected !== null}
        onClose={closeSheet}
        title={selected ? "Maç işlemleri" : undefined}
        snap="content"
      >
        {selected ? (
          <View style={styles.sheet}>
            {/* Mini sahne: logolar, skor plakası, durum ve künye hapları. */}
            <OpsStage height={170} style={styles.sheetStage}>
              <View style={styles.stageRow}>
                <View style={styles.stageTeam}>
                  <TeamLogo name={selected.first_team_name} logo={teams.logoFor(selected.home_team_id, selected.first_team_name)} size={40} />
                  <Text style={styles.stageName} numberOfLines={2} {...textScale.dense}>
                    {selected.first_team_name}
                  </Text>
                </View>
                <View style={styles.stageCenter}>
                  <ScorePlate
                    scored={selScored}
                    home={Number(selected.first_team_score ?? 0)}
                    away={Number(selected.second_team_score ?? 0)}
                    time={selected.time ? formatTime(selected.time) : null}
                    live={selStatus === "canli"}
                    size="lg"
                  />
                  <Badge
                    label={upperTR(statusLabel(selStatus))}
                    tone={selStatus ? STATUS_TONE[selStatus] : "neutral"}
                    size="xs"
                    dot={selStatus === "canli"}
                  />
                </View>
                <View style={styles.stageTeam}>
                  <TeamLogo name={selected.second_team_name} logo={teams.logoFor(selected.away_team_id, selected.second_team_name)} size={40} />
                  <Text style={styles.stageName} numberOfLines={2} {...textScale.dense}>
                    {selected.second_team_name}
                  </Text>
                </View>
              </View>
              <View style={styles.stagePills}>
                <InfoPill icon="calendar-outline" label={formatDayHeading(matchDay(selected))} onDark />
                {selected.time ? <InfoPill icon="time-outline" label={formatTime(selected.time)} strong onDark /> : <InfoPill icon="time-outline" label="Saat yok" tone="warn" />}
                {selected.match_field ? <InfoPill icon="location-outline" label={selected.match_field} onDark /> : <InfoPill icon="location-outline" label="Saha yok" tone="warn" />}
              </View>
            </OpsStage>

            {/* İş akışı: dört adımın kısayol karoları + birincil eylem. */}
            <View style={styles.stepGrid}>
              {stepTiles.map((tile, index) => (
                <Touchable
                  key={tile.key}
                  feedback="card"
                  haptic="light"
                  onPress={tile.onPress}
                  style={styles.stepTile}
                  accessibilityRole="button"
                  accessibilityLabel={`${index + 1}. adım: ${tile.label}`}
                  accessibilityHint={tile.hint}
                >
                  <IconTile icon={tile.icon} tone={tile.tone} size={34} glow={false} />
                  <Text style={styles.stepLabel} numberOfLines={1} {...textScale.badge}>
                    {tile.label}
                  </Text>
                </Touchable>
              ))}
            </View>
            <Button
              label="Maç iş akışını aç"
              icon="git-branch-outline"
              size="lg"
              onPress={openWorkflow}
              haptic="light"
              fullWidth
              accessibilityHint="Maç öncesi, kadro, canlı akış ve maç sonu adımları"
            />

            {/* Hızlı skor — iki takım yan yana, tabular Stepper, basılı tutunca hızlanır. */}
            {canScore ? (
              <OpsGroup title="Hızlı skor" icon="football-outline" tone="cyan" hint="Yalnız rakamı yazar; olay girilen maçta skor olaylardan hesaplanır. Kalıcı elle ya da hükmen sonuç için iş akışındaki “Sonucu tescil et”i kullan.">
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
                  <Text style={styles.scoreDash} {...textScale.badge}>
                    –
                  </Text>
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
                  variant="secondary"
                  onPress={saveScore}
                  loading={scoreMutation.isPending}
                  disabled={
                    homeScore === Number(selected.first_team_score ?? 0) &&
                    awayScore === Number(selected.second_team_score ?? 0)
                  }
                  haptic="medium"
                  fullWidth
                />
              </OpsGroup>
            ) : null}

            {/* Durum: dört durum karosu — mevcut durum seçili, yetkisiz geçiş soluk. */}
            <OpsGroup
              title="Durum"
              icon="flag-outline"
              tone="mint"
              hint={
                STATUS_ORDER.some(canSetStatus)
                  ? "“Canlı” üyelere maç başladı bildirimi gönderir. “Yayınlandı” ve “Taslak” puan durumunu değiştirdiği için onay ister."
                  : "Maç durumunu değiştirmek için hesabında maç güncelleme, canlı akış ya da yayınlama yetkisi olmalı."
              }
            >
              <View style={styles.statusGrid}>
                {STATUS_ORDER.map((item) => {
                  const current = statusKey(selected) === item;
                  const disabled = current || statusMutation.isPending || !canSetStatus(item);
                  const fg = toneColor(STATUS_TONE[item]);
                  return (
                    <Touchable
                      key={item}
                      feedback="card"
                      haptic="selection"
                      onPress={() => changeStatus(item)}
                      disabled={disabled}
                      style={[styles.statusCell, current ? [styles.statusCellOn, { borderColor: fg }] : null, disabled && !current ? styles.statusCellOff : null]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: current, disabled }}
                      accessibilityLabel={`Durumu ${MATCH_STATUS_LABELS[item]} yap`}
                    >
                      <Ionicons name={current ? "radio-button-on" : STATUS_TILE[item].icon} size={16} color={fg} />
                      <Text style={[styles.statusText, current ? { color: colors.textPrimary } : null]} numberOfLines={1} {...textScale.dense}>
                        {MATCH_STATUS_LABELS[item]}
                      </Text>
                      {current ? (
                        <Text style={[styles.statusNow, { color: fg }]} {...textScale.badge}>
                          ŞU AN
                        </Text>
                      ) : null}
                    </Touchable>
                  );
                })}
              </View>
            </OpsGroup>

            <Button
              label="Maç sayfasını aç"
              variant="ghost"
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
 * Satır sarmalayıcı. Kart memo'lu; `onPress` her çizimde yeniden üretilseydi
 * memo işe yaramazdı. İşleyici maç id'sini burada bağlanır. Eksik bilgi
 * uyarıları (saha / saat / bekleyen sonuç) burada hesaplanır.
 */
const AdminMatchRow = memo(function AdminMatchRow({
  match,
  homeLogo,
  awayLogo,
  today,
  onOpen,
}: {
  match: ApiMatch;
  homeLogo: string | null;
  awayLogo: string | null;
  today: string;
  onOpen: (matchId: number) => void;
}) {
  const matchId = Number(match.id);
  const handlePress = useCallback(() => onOpen(matchId), [matchId, onOpen]);
  const key = statusKey(match);
  const known = resolveStatus(key);
  const scored =
    (key === "canli" || key === "yayinlanmis") && match.first_team_score != null && match.second_team_score != null;

  const warnings = useMemo(() => {
    const list: { label: string; tone?: Tone; icon?: keyof typeof Ionicons.glyphMap }[] = [];
    if (key === "zamanlanmis" && matchDay(match) && matchDay(match) < today) list.push({ label: "Sonuç bekliyor", tone: "danger", icon: "hourglass-outline" });
    if (key !== "yayinlanmis" && !match.match_field) list.push({ label: "Saha yok", icon: "location-outline" });
    if (key !== "yayinlanmis" && !match.time) list.push({ label: "Saat yok", icon: "time-outline" });
    return list;
  }, [key, match, today]);

  return (
    <View style={styles.rowWrap}>
      <OpsMatchCard
        home={match.first_team_name}
        away={match.second_team_name}
        homeLogo={homeLogo}
        awayLogo={awayLogo}
        homeScore={match.first_team_score}
        awayScore={match.second_team_score}
        scored={scored}
        time={match.time ? formatTime(match.time) : null}
        field={match.match_field}
        statusLabel={statusLabel(known)}
        statusTone={known ? STATUS_TONE[known] : "neutral"}
        live={key === "canli"}
        warnings={warnings}
        meta={[match.league_name, match.match_season].filter(Boolean).join(" · ") || null}
        onPress={handlePress}
      />
    </View>
  );
});

/* ═════════════════════════════════ STİLLER ═════════════════════════════════ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: { flex: 1 },
  controls: {
    paddingBottom: space.sm,
  },
  search: {
    paddingHorizontal: layout.screenPadding,
  },
  skeleton: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    gap: space.md,
  },
  skeletonTiles: { flexDirection: "row", gap: space.sm },
  list: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.giant,
    flexGrow: 1,
  },
  summary: {
    gap: space.m,
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  summaryLine: { flexDirection: "row", alignItems: "center", gap: space.xs, flexWrap: "wrap" },
  summaryText: { ...type.caption, color: colors.textSecondary, flexShrink: 1, marginRight: space.xs },
  clear: { flexDirection: "row", alignItems: "center", gap: space.xxs, marginLeft: "auto", paddingVertical: space.xxs },
  clearText: { ...type.labelXs, color: colors.brandAccent },
  banner: {
    marginTop: space.xs,
  },
  sectionGap: {
    height: SECTION_GAP,
  },
  dayHeader: {
    height: SECTION_HEADER_HEIGHT,
    paddingBottom: space.sm,
  },
  rowWrap: {
    height: ROW_HEIGHT,
    paddingBottom: CARD_GAP,
  },

  /* Eylem alt sayfası */
  sheet: {
    gap: space.md,
    paddingBottom: space.sm,
  },
  sheetStage: { padding: space.md, gap: space.md },
  stageRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  stageTeam: { flex: 1, alignItems: "center", gap: space.s },
  stageName: { ...type.label, color: colors.onDark, textAlign: "center" },
  stageCenter: { alignItems: "center", gap: space.s },
  stagePills: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, justifyContent: "center" },
  stepGrid: { flexDirection: "row", gap: space.sm },
  stepTile: {
    flex: 1,
    alignItems: "center",
    gap: space.s,
    paddingVertical: space.m,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  stepLabel: { ...type.labelXs, color: colors.textPrimary },
  scoreRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.sm,
  },
  scoreSide: {
    flex: 1,
    alignItems: "center",
    gap: space.sm,
  },
  scoreDash: { ...type.scoreMd, color: colors.textTertiary, paddingBottom: space.xs },
  scoreTeam: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: "center",
  },
  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  statusCell: {
    flexBasis: "47%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  statusCellOn: { backgroundColor: colors.brandDim, borderWidth: 1 },
  statusCellOff: { opacity: 0.45 },
  statusText: { ...type.label, color: colors.textSecondary, flex: 1 },
  statusNow: { ...type.overline },
});
