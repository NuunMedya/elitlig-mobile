/**
 * KULÜP SİNYALLERİ — "şu an neyle ilgilenmem gerekiyor?" sorusunun veri katmanı.
 *
 * NEDEN TEK KANCA: Yönetim sekmesi ile Takım Paneli aynı soruyu iki
 * ayrıntı düzeyinde yanıtlar (sekme: ilk üç iş, panel: tam liste). İki ekran
 * eskiden aynı dört sorguyu ve aynı sayaç hesaplarını AYRI AYRI kopyalıyordu;
 * bir sayacın tanımı (ör. "açık teklif") birinde değişip ötekinde değişmeyince
 * iki ekran farklı sayı gösteriyordu. Sorgular, önbellek anahtarları ve
 * "dikkat" kuralları artık burada, TEK yerde.
 *
 * ÖNBELLEK ORTAKLIĞI (anahtarlar diğer ekranlarla BİREBİR aynı — ikinci istek
 * atılmaz, bir ekranda yapılan değişiklik ötekini tazeler):
 *   ["takim","dashboard"]        takimim/index, kadro, davetler
 *   ["takim","join-requests"]    davetler
 *   ["takim","offers-outbox"]    (yalnız sayaç)
 *   ["takim","matches"]          mac-merkezi, ana sayfa
 *   ["takim","availability",id]  mac-merkezi yaklaşan maç kartı
 *   ["panel","me"]               oyuncum
 *   ["panel","offers"]           tekliflerim
 *   ["panel","penalties"]        cezalarim, cezalar, ceza/[id]
 *   ["panel","my-matches"]       oyuncum
 *
 * YETKİ: her sorgu `retry: false` ve rolüne göre `enabled`. Yetkisiz bir uç
 * (403) sessizce boş kalır; dikkat listesi yalnız GERÇEK sayılardan kurulur,
 * sayı bilinmiyorsa satır hiç çizilmez — uydurma "0" göstermektense susmak.
 */

import type Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import type { Href } from "expo-router";
import { useCallback, useMemo } from "react";
import type { Tone } from "@/components/ui";
import { getStandings } from "@/lib/api/standings";
import {
  getMyMatches,
  getMyPenalties,
  getOfferInbox,
  getPanelMe,
  type Penalty,
} from "@/lib/api/panel";
import {
  getJoinRequests,
  getTeamAvailability,
  getTeamDashboard,
  getTeamMatches,
} from "@/lib/api/team";
import { get } from "@/lib/http";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";

/* ══════════════════════════════════════════════════════════════════════════
   Sabitler ve saf kurallar
   ══════════════════════════════════════════════════════════════════════════ */

/** Takım başkanı sayılan profil tipleri (sunucudaki `profile_type`). */
export const PRESIDENT_PROFILES = new Set(["takim_baskani", "double"]);

/**
 * `constants/transfer.js` ACTIVE_STATUSES — kulübün gönderdiği, hâlâ
 * sonuçlanmamış teklifler. Süresi dolmuş/geri çekilmiş teklif iş değildir.
 */
const ACTIVE_OFFER_STATUSES = new Set(["DRAFT", "SENT", "REVISION_REQUESTED"]);

/** `services/changeRequestService.js` TYPES kümesinin Türkçe karşılıkları. */
export const CHANGE_LABELS: Record<string, string> = {
  team_update: "Takım bilgisi güncellemesi",
  team_logo: "Takım logosu değişikliği",
  player_update: "Oyuncu bilgisi güncellemesi",
  player_release: "Oyuncu serbest bırakma",
  sponsor_update: "Sponsor alanı güncellemesi",
};

/** Kulübün gönderdiği teklifler — yalnız SAYAÇ için, en dar tiple. */
const getOfferOutbox = () =>
  get<{ items: { id: number; status: string }[]; totalItems: number }>("/api/transfer-offers/outbox", {
    limit: 100,
  });

/** Süre penceresi açık mı: son tarih var VE henüz geçmemiş. */
const windowOpen = (deadline: string | null): boolean =>
  Boolean(deadline && new Date(deadline).getTime() > Date.now());

/** `app/cezalarim.tsx` ile AYNI kural: savunma ya da itiraz penceresi açık. */
export function penaltyNeedsAction(penalty: Penalty): boolean {
  if (windowOpen(penalty.defense_deadline_at)) return true;
  return penalty.status === "kurul_karari" && windowOpen(penalty.objection_deadline_at);
}

/* ══════════════════════════════════════════════════════════════════════════
   Dikkat öğesi
   ══════════════════════════════════════════════════════════════════════════ */

export interface AttentionItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  count: number;
  tone: Tone;
  /** Sıralama ağırlığı: büyük olan üstte (süre baskısı > karar > bilgi). */
  weight: number;
  href?: Href;
  /** Ekranın kendi davranışı (ör. alt sayfa) — verilirse `href`i ezer. */
  action?: "changes";
}

/* ══════════════════════════════════════════════════════════════════════════
   Kanca
   ══════════════════════════════════════════════════════════════════════════ */

export function useClubSignals() {
  const auth = useAuth();
  const scope = useScope();
  const user = auth.user;

  const isPresident = Boolean(
    user && (user.managed_team_id || PRESIDENT_PROFILES.has(String(user.profile_type ?? ""))),
  );
  const isPlayer = Boolean(user?.player_id);
  const isManagement = Boolean(user && auth.isManagement);

  /* ------------------------------ BAŞKAN ------------------------------- */

  const dashboard = useQuery({
    queryKey: ["takim", "dashboard"],
    queryFn: getTeamDashboard,
    enabled: isPresident,
    staleTime: 60_000,
    retry: false,
  });
  const team = dashboard.data?.managed ? (dashboard.data.team ?? null) : null;
  const managed = team != null;

  const offersOut = useQuery({
    queryKey: ["takim", "offers-outbox"],
    queryFn: getOfferOutbox,
    enabled: managed,
    staleTime: 60_000,
    retry: false,
  });

  const teamMatches = useQuery({
    queryKey: ["takim", "matches"],
    queryFn: getTeamMatches,
    enabled: managed,
    staleTime: 60_000,
    retry: false,
  });
  const nextTeamMatch = teamMatches.data?.upcoming?.[0] ?? null;

  /** Sıradaki maçın yoklama dağılımı — mac-merkezi kartıyla aynı anahtar. */
  const teamAvailability = useQuery({
    queryKey: ["takim", "availability", nextTeamMatch?.id ?? 0],
    queryFn: () => getTeamAvailability(nextTeamMatch!.id),
    enabled: nextTeamMatch != null,
    staleTime: 30_000,
    retry: false,
  });

  const scopeKey = {
    cityId: scope.cityId ?? undefined,
    leagueId: scope.leagueId ?? undefined,
    seasonId: scope.seasonId ?? undefined,
  };
  const standings = useQuery({
    queryKey: queryKeys.standings(scopeKey),
    queryFn: () =>
      getStandings({
        cityId: scope.cityId as number,
        leagueId: scope.leagueId as number,
        seasonId: scope.seasonId as number,
      }),
    enabled: scope.ready && managed,
    staleTime: 60_000,
    retry: false,
  });

  /* ------------------------------ ORTAK -------------------------------- */

  /** Davet/başvuru kutusu — başkan için başvurular, oyuncu için davetler. */
  const joins = useQuery({
    queryKey: ["takim", "join-requests"],
    queryFn: getJoinRequests,
    enabled: managed || isPlayer,
    staleTime: 60_000,
    retry: false,
  });

  /** Disiplin — oyuncu ve takım tarafı aynı listede döner. */
  const penalties = useQuery({
    queryKey: ["panel", "penalties"],
    queryFn: getMyPenalties,
    enabled: isPlayer || managed,
    staleTime: 60_000,
    retry: false,
  });

  /* ------------------------------ OYUNCU ------------------------------- */

  const me = useQuery({
    queryKey: ["panel", "me"],
    queryFn: getPanelMe,
    enabled: Boolean(user),
    staleTime: 60_000,
    retry: false,
  });

  const offersIn = useQuery({
    queryKey: ["panel", "offers"],
    queryFn: () => getOfferInbox(),
    enabled: isPlayer,
    staleTime: 30_000,
    retry: false,
  });

  const myMatches = useQuery({
    queryKey: ["panel", "my-matches"],
    queryFn: getMyMatches,
    enabled: isPlayer,
    staleTime: 60_000,
    retry: false,
  });
  const nextPlayerMatch = myMatches.data?.upcoming?.[0] ?? null;

  /* ---------------------------- TÜRETİLENLER --------------------------- */

  const standing = useMemo(() => {
    if (!team || !standings.data) return null;
    const index = standings.data.findIndex((row) => Number(row.team_id) === Number(team.id));
    return index >= 0 ? { rank: index + 1, row: standings.data[index] } : null;
  }, [standings.data, team]);

  const roster = dashboard.data?.roster;
  const contracted = roster?.contracted.length ?? 0;
  const withoutContract = roster?.withoutContract.length ?? 0;
  const squadSize = contracted + withoutContract;
  const pendingChanges = dashboard.data?.pendingChanges ?? [];

  const counts = useMemo(() => {
    const inbox = joins.data?.inbox ?? [];
    const outbox = joins.data?.outbox ?? [];
    const pending = (list: typeof inbox, type?: "invite" | "application") =>
      list.filter((item) => item.status === "pending" && (!type || item.type === type)).length;
    return {
      /** Başkana gelen katılım başvuruları. */
      applications: managed ? pending(inbox, "application") : 0,
      /** Başkanın gönderdiği, yanıt bekleyen davetler. */
      invitesSent: managed ? pending(outbox, "invite") : 0,
      /** Oyuncuya gelen kadro davetleri. */
      invitesReceived: isPlayer ? pending(inbox, "invite") : 0,
      /** Kulübün açık transfer teklifleri. */
      offersOpen: (offersOut.data?.items ?? []).filter((item) => ACTIVE_OFFER_STATUSES.has(item.status)).length,
      /** Oyuncunun yanıtlaması gereken teklifler. */
      offersAwaiting: (offersIn.data?.items ?? []).filter((item) => item.status === "SENT").length,
      /** Savunma/itiraz süresi açık disiplin dosyaları. */
      penaltiesOpen: (penalties.data?.items ?? []).filter(penaltyNeedsAction).length,
    };
  }, [isPlayer, joins.data, managed, offersIn.data, offersOut.data, penalties.data]);

  /* ------------------------- DİKKAT LİSTELERİ -------------------------- */

  const clubAttention = useMemo<AttentionItem[]>(() => {
    if (!managed) return [];
    const list: AttentionItem[] = [];
    const unanswered = teamAvailability.data?.counts.unanswered ?? 0;

    if (counts.penaltiesOpen > 0 && !isPlayer) {
      list.push({
        key: "ceza",
        icon: "alert-circle",
        title: "Disiplin dosyası",
        subtitle: "Savunma ya da itiraz süresi işliyor",
        count: counts.penaltiesOpen,
        tone: "danger",
        weight: 100,
        href: "/cezalarim?durum=aksiyon",
      });
    }
    if (counts.applications > 0) {
      list.push({
        key: "basvuru",
        icon: "mail-unread",
        title: "Katılım başvurusu",
        subtitle: "Oyuncular kadrona katılmak istiyor",
        count: counts.applications,
        tone: "live",
        weight: 90,
        href: "/davetler",
      });
    }
    if (nextTeamMatch && unanswered > 0) {
      list.push({
        key: "yoklama",
        icon: "people",
        title: "Yoklamaya yanıt vermeyen",
        subtitle: `${nextTeamMatch.opponent_name ?? "Sıradaki"} maçı`,
        count: unanswered,
        tone: "warn",
        weight: 80,
        href: `/takimim/mac/${nextTeamMatch.id}`,
      });
    }
    if (withoutContract > 0) {
      list.push({
        key: "sozlesmesiz",
        icon: "document-text",
        title: "Sözleşmesiz oyuncu",
        subtitle: "Kadroda ama aktif sözleşmesi yok",
        count: withoutContract,
        tone: "warn",
        weight: 70,
        href: "/takimim/kadro?filtre=sozlesmesiz",
      });
    }
    if (counts.offersOpen > 0) {
      list.push({
        key: "teklif",
        icon: "swap-horizontal",
        title: "Açık transfer teklifi",
        subtitle: "Henüz sonuçlanmadı",
        count: counts.offersOpen,
        tone: "brand",
        weight: 50,
        href: "/takimim/kadro?gorunum=transfer",
      });
    }
    if (counts.invitesSent > 0) {
      list.push({
        key: "davet",
        icon: "paper-plane",
        title: "Gönderilen davet",
        subtitle: "Oyuncunun yanıtı bekleniyor",
        count: counts.invitesSent,
        tone: "info",
        weight: 40,
        href: "/davetler?tab=gonderilen",
      });
    }
    if (pendingChanges.length > 0) {
      list.push({
        key: "talep",
        icon: "hourglass",
        title: "Onay bekleyen değişiklik",
        subtitle: "Yönetici incelemesinde",
        count: pendingChanges.length,
        tone: "neutral",
        weight: 30,
        action: "changes",
        href: "/kulubum?rol=takim",
      });
    }
    return list.sort((a, b) => b.weight - a.weight);
  }, [counts, isPlayer, managed, nextTeamMatch, pendingChanges.length, teamAvailability.data, withoutContract]);

  const playerAttention = useMemo<AttentionItem[]>(() => {
    if (!isPlayer) return [];
    const list: AttentionItem[] = [];
    if (counts.penaltiesOpen > 0) {
      list.push({
        key: "ceza",
        icon: "alert-circle",
        title: "Disiplin dosyan",
        subtitle: "Savunma ya da itiraz süresi işliyor",
        count: counts.penaltiesOpen,
        tone: "danger",
        weight: 100,
        href: "/cezalarim?durum=aksiyon",
      });
    }
    if (counts.offersAwaiting > 0) {
      list.push({
        key: "teklif",
        icon: "swap-horizontal",
        title: "Yanıt bekleyen teklif",
        subtitle: "Bir kulüp seni kadrosunda istiyor",
        count: counts.offersAwaiting,
        tone: "brand",
        weight: 90,
        href: "/tekliflerim?durum=bekleyen",
      });
    }
    if (counts.invitesReceived > 0) {
      list.push({
        key: "davet",
        icon: "mail-unread",
        title: "Kadro daveti",
        subtitle: "Kabul edersen takımın kadrosuna geçersin",
        count: counts.invitesReceived,
        tone: "live",
        weight: 80,
        href: "/davetler",
      });
    }
    return list.sort((a, b) => b.weight - a.weight);
  }, [counts, isPlayer]);

  /* ------------------------------ TAZELEME ----------------------------- */

  const refetchAll = useCallback(() => {
    if (user) void me.refetch();
    if (isPresident) void dashboard.refetch();
    if (managed) {
      void offersOut.refetch();
      void teamMatches.refetch();
      if (nextTeamMatch) void teamAvailability.refetch();
      if (scope.ready) void standings.refetch();
    }
    if (managed || isPlayer) {
      void joins.refetch();
      void penalties.refetch();
    }
    if (isPlayer) {
      void offersIn.refetch();
      void myMatches.refetch();
    }
  }, [
    dashboard,
    isPlayer,
    isPresident,
    joins,
    managed,
    me,
    myMatches,
    nextTeamMatch,
    offersIn,
    offersOut,
    penalties,
    scope.ready,
    standings,
    teamAvailability,
    teamMatches,
    user,
  ]);

  const refreshing =
    me.isRefetching || dashboard.isRefetching || joins.isRefetching || teamMatches.isRefetching;

  return {
    user,
    isPresident,
    isPlayer,
    isManagement,
    /* başkan */
    dashboard,
    team,
    managed,
    standing,
    squadSize,
    contracted,
    withoutContract,
    pendingChanges,
    nextTeamMatch,
    teamMatches,
    teamAvailability,
    clubAttention,
    /* oyuncu */
    me,
    nextPlayerMatch,
    myMatches,
    playerAttention,
    /* ortak */
    counts,
    refetchAll,
    refreshing,
  };
}

export type ClubSignals = ReturnType<typeof useClubSignals>;
