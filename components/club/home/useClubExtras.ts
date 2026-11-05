/**
 * KULÜBÜM EK SİNYALLERİ — useClubSignals'ın kapsamadığı, yalnız kulüp ana
 * sayfasının ihtiyaç duyduğu sorgular ve onlardan doğan "şimdi ilgilen" işleri.
 *
 * NEDEN AYRI: useClubSignals Kariyerim ve Yönetim sekmesi rozetleriyle
 * ORTAK bir dosya; buradaki sorgular (özet, kasa, bildirim, kadro taslağı)
 * yalnız Kulübüm açıkken gerekir ve sekme rozeti için atılmamalıdır.
 *
 *   ["club","overview"]              GET /api/panel/me/overview?scope=team
 *   ["takim","finance"]              kulubum.tsx / kasa ile ORTAK anahtar
 *   ["club","notifications"]         izin bekleyen transferler (release)
 *   ["club","outbox","REVISION_REQUESTED"]  revizyon istenen teklifler
 *   ["takim","squad-builder",null]   SquadBuilderView ile ORTAK anahtar
 *
 * Kurallar useClubSignals ile aynı: sayı bilinmiyorsa iş ÇİZİLMEZ.
 */

import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import type { AttentionItem } from "@/components/club/useClubSignals";
import { getTeamOverview } from "@/lib/api/club/overview";
import { isReleaseRequest } from "@/lib/api/club/notifications";
import { getOutboxPage } from "@/lib/api/club/offers";
import { getPanelNotifications } from "@/lib/api/panel";
import { getSquadBuilder, getTeamFinance } from "@/lib/api/team";

export function useClubExtras(managed: boolean) {
  const overview = useQuery({
    queryKey: ["club", "overview"],
    queryFn: getTeamOverview,
    enabled: managed,
    staleTime: 60_000,
    retry: false,
  });
  const finance = useQuery({
    queryKey: ["takim", "finance"],
    queryFn: getTeamFinance,
    enabled: managed,
    staleTime: 60_000,
    retry: false,
  });
  const notifications = useQuery({
    queryKey: ["club", "notifications"],
    queryFn: () => getPanelNotifications(1),
    enabled: managed,
    staleTime: 30_000,
    retry: false,
  });
  const revisions = useQuery({
    queryKey: ["club", "outbox", "REVISION_REQUESTED"],
    queryFn: () => getOutboxPage({ status: "REVISION_REQUESTED" }),
    enabled: managed,
    staleTime: 30_000,
    retry: false,
  });
  const squad = useQuery({
    queryKey: ["takim", "squad-builder", null],
    queryFn: () => getSquadBuilder(null),
    enabled: managed,
    staleTime: 60_000,
    retry: false,
  });

  /** Okunmamış serbest kalma izni talepleri (teklif başına bir kez). */
  const releaseRequests = useMemo(() => {
    const seen = new Set<string>();
    return (notifications.data?.items ?? []).filter((item) => {
      if (!isReleaseRequest(item) || item.is_read || !item.entity_public_id || seen.has(item.entity_public_id)) return false;
      seen.add(item.entity_public_id);
      return true;
    });
  }, [notifications.data]);

  const unreadNotifications = useMemo(
    () => (notifications.data?.items ?? []).filter((item) => !item.is_read).length,
    [notifications.data],
  );

  const draft = squad.data?.draft ?? null;
  const seasonName = squad.data?.seasons?.find((season) => season.id === squad.data?.selectedSeasonId)?.name ?? null;

  const attention = useMemo<AttentionItem[]>(() => {
    if (!managed) return [];
    const list: AttentionItem[] = [];
    if (releaseRequests.length === 1) {
      list.push({
        key: "izin",
        icon: "hand-left",
        title: "Transfer izni isteniyor",
        subtitle: releaseRequests[0].description ?? "Başka bir takım oyuncuna teklif verdi",
        count: 1,
        tone: "danger",
        weight: 95,
        href: `/transfer-izni/${releaseRequests[0].entity_public_id}` as AttentionItem["href"],
      });
    } else if (releaseRequests.length > 1) {
      list.push({
        key: "izin",
        icon: "hand-left",
        title: "Transfer izni isteniyor",
        subtitle: "Oyuncularına teklif geldi; izin ver ya da reddet",
        count: releaseRequests.length,
        tone: "danger",
        weight: 95,
        href: "/takimim/transfer" as AttentionItem["href"],
      });
    }
    const revisionCount = revisions.data?.items?.length ?? 0;
    if (revisionCount > 0) {
      const only = revisionCount === 1 ? revisions.data!.items[0] : null;
      list.push({
        key: "revizyon",
        icon: "create",
        title: "Oyuncu revizyon istedi",
        subtitle: only?.player?.player_name ? `${only.player.player_name} şartları değiştirmek istiyor` : "Yeni sürüm hazırla",
        count: revisionCount,
        tone: "info",
        weight: 85,
        href: (only ? `/teklif/${only.public_id}` : "/takimim/transfer?durum=REVISION_REQUESTED") as AttentionItem["href"],
      });
    }
    if (draft?.last_decision === "rejected" && draft.status === "draft") {
      list.push({
        key: "kadro-ret",
        icon: "close-circle",
        title: "Sezon kadrosu reddedildi",
        subtitle: draft.last_decision_note ?? "Düzeltip yeniden gönder",
        count: 1,
        tone: "danger",
        weight: 75,
        href: "/takimim/kadro?gorunum=sezon" as AttentionItem["href"],
      });
    } else if (draft?.status === "draft" && draft.diff?.changed) {
      list.push({
        key: "kadro-taslak",
        icon: "list",
        title: "Kadro taslağı gönderilmedi",
        subtitle: `${seasonName ?? "Sezon"} değişiklikleri yönetime gitmedi`,
        count: (draft.diff.additions?.length ?? 0) + (draft.diff.removals?.length ?? 0) + (draft.diff.license_changes?.length ?? 0),
        tone: "warn",
        weight: 65,
        href: "/takimim/kadro?gorunum=sezon" as AttentionItem["href"],
      });
    }
    if (finance.data?.ffp?.status === "BREACH") {
      list.push({
        key: "ffp",
        icon: "wallet",
        title: "FFP sınırı aşıldı",
        subtitle: "Kulüp bütçesini kontrol et",
        count: 1,
        tone: "danger",
        weight: 60,
        href: "/takimim/kasa" as AttentionItem["href"],
      });
    }
    return list;
  }, [draft, finance.data, managed, releaseRequests, revisions.data, seasonName]);

  const refetch = useCallback(() => {
    if (!managed) return;
    void overview.refetch();
    void finance.refetch();
    void notifications.refetch();
    void revisions.refetch();
    void squad.refetch();
  }, [finance, managed, notifications, overview, revisions, squad]);

  return {
    overview,
    finance,
    releaseRequests,
    unreadNotifications,
    revisionCount: revisions.data?.items?.length ?? 0,
    attention,
    refetch,
  };
}

export type ClubExtras = ReturnType<typeof useClubExtras>;
