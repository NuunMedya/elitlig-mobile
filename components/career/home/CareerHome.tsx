/**
 * KARİYERİM — Yönetim sekmesinin oyuncu bölümü (web PlayerTeamPanel `player`
 * kapsamının mobil ana sayfası).
 *
 * "HER ŞEY İKİ DOKUNUŞTA" DÜZENİ (yukarıdan aşağı):
 *   1. KAHRAMAN — fotoğraf, ad, mevki/takım, Elit Kart OVR, sezonun dört
 *      sayısı, Elit Seviye çubuğu, son 5 maç formu; "Profilim" · "Kartımı paylaş".
 *   2. ŞİMDİ İLGİLEN — yatay eylem rayı: disiplin süresi, yanıt bekleyen teklif,
 *      kadro daveti, yoklama ("geliyor musun?"), biten sözleşme, değerlendirilecek
 *      maç, onay bekleyen değişiklik / talep. Dokununca işin yapılacağı yer.
 *   3. SIRADAKİ MAÇ — iki takım + geri sayım + kart İÇİNDE katılım yanıtı.
 *   4. HIZLI İŞLEMLER — renkli ikonlu, rozetli 2×4 karo ızgarası.
 *   5. MENÜ GRUPLARI — web panelinin oyuncu menüsünün birebir karşılığı
 *      (Genel · Maç · Kariyer · Bildirimler ve hesap): web'de yapılan her
 *      işlemin buradan bir kapısı var.
 *   6. ÖZET — sezonum şeridi, son performansım, takımımın ligdeki durumu.
 *
 * VERİ: sinyaller (`useClubSignals`) panel/me, maçlarım, teklif, davet ve
 * ceza sayaçlarını zaten taşır. Bu bileşen yalnız kendine özgü dört sorguyu
 * açar — hepsi diğer ekranlarla AYNI önbellek anahtarında:
 *   ["panel","overview","player"]   özet ucu (form, piyasa değeri, sözleşme, puan durumu)
 *   ["career","me"]                 Elit Kariyer (kart, seviye) — app/kariyer.tsx ile ortak
 *   ["account-requests"]            bekleyen hesap talepleri — oyuncum/bagla ile ortak
 *   ["takim","availability-mine",id] sıradaki maçın yoklaması — AvailabilityPicker ile ortak
 *
 * PROPS: `{ signals, go, onAttention }` — sinyal listesindeki işler
 * `onAttention` ile sekmeye geri verilir (sekme alt sayfa açabilir).
 */

import { useQuery } from "@tanstack/react-query";
import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { availabilityMineKey } from "@/components/club/AvailabilityPicker";
import { matchWhen } from "@/components/club/NextMatchCard";
import {
  PanelCard,
  PanelEmpty,
  PanelRow,
  PanelSection,
  StatStrip,
  type StatItem,
} from "@/components/club/Panel";
import type { AttentionItem, ClubSignals } from "@/components/club/useClubSignals";
import { MatchReviewSheet } from "@/components/career/MatchReviewSheet";
import { ShareProfileCard } from "@/components/career/ShareProfileCard";
import { HubGrid, HubTile, SkeletonCard, type FormResult, type HubTone } from "@/components/ui";
import { getMyCareer } from "@/lib/api/career";
import {
  accountRequestList,
  getMyReview,
  getPlayerOverview,
  memberKeys,
  type PanelMeExtras,
} from "@/lib/api/member/player";
import { getAccountRequests } from "@/lib/api/playerProfile";
import { getMyAvailability } from "@/lib/api/team";
import { formatDateShort, formatDecimal, formatMoney, mediaUrl } from "@/lib/format";
import { layout, space } from "@/theme";

import { CareerHero } from "./CareerHero";
import { ActionRail, NextMatchPanel, RecentForm, type HomeAction } from "./parts";

export interface CareerHomeProps {
  signals: ClubSignals;
  go: (href: string) => void;
  onAttention: (item: AttentionItem) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Sözleşme bitişine bu kadar gün kala "şimdi ilgilen"e düşer. */
const CONTRACT_WARN_DAYS = 30;
/** Oynanan maç bu kadar gün içindeyse değerlendirme hatırlatılır. */
const REVIEW_WINDOW_DAYS = 14;

/** Sinyal anahtarı → eylem kartının düğme metni. */
const SIGNAL_CTA: Record<string, string> = {
  ceza: "Savunmanı yaz",
  teklif: "Teklifleri gör",
  davet: "Yanıtla",
};

const daysFromNow = (value?: string | null): number | null => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? Math.ceil((time - Date.now()) / DAY_MS) : null;
};

export function CareerHome({ signals, go, onAttention }: CareerHomeProps) {
  const { me, counts, user, nextPlayerMatch: nextMatch, myMatches } = signals;
  const data = me.data as (typeof me.data & PanelMeExtras) | undefined;
  const player = data?.player ?? null;
  const playerTeam = data?.playerTeam ?? null;
  const stats = data?.stats ?? null;
  const linked = Boolean(player);

  const [shareOpen, setShareOpen] = useState(false);
  const [reviewing, setReviewing] = useState<{ id: number; title: string; subtitle: string } | null>(null);

  /* ------------------------------ SORGULAR ----------------------------- */

  const overview = useQuery({
    queryKey: memberKeys.overview,
    queryFn: getPlayerOverview,
    enabled: linked,
    staleTime: 60_000,
    retry: false,
  });

  const career = useQuery({
    queryKey: ["career", "me"],
    queryFn: getMyCareer,
    enabled: Boolean(user),
    staleTime: 60_000,
    retry: false,
  });

  const requests = useQuery({
    queryKey: memberKeys.accountRequests,
    queryFn: getAccountRequests,
    enabled: Boolean(user),
    staleTime: 60_000,
    retry: false,
  });

  /** Sıradaki maçın yoklama yanıtı — boşsa "geliyor musun?" işi çıkar. */
  const rsvp = useQuery({
    queryKey: availabilityMineKey(nextMatch?.id ?? 0),
    queryFn: () => getMyAvailability(nextMatch!.id),
    enabled: nextMatch != null,
    staleTime: 60_000,
    retry: false,
  });

  /** En son oynanan, değerlendirilebilir maç (kadrodaydın). */
  const lastPlayed = useMemo(() => {
    const match = myMatches.data?.past?.[0] ?? null;
    if (!match || !match.can_review) return null;
    const ago = daysFromNow(match.date);
    return ago != null && ago >= -REVIEW_WINDOW_DAYS ? match : null;
  }, [myMatches.data]);

  const lastReview = useQuery({
    queryKey: memberKeys.review(lastPlayed?.id ?? 0),
    queryFn: () => getMyReview(lastPlayed!.id),
    enabled: lastPlayed != null,
    staleTime: 5 * 60_000,
    retry: false,
  });

  /* ---------------------------- TÜRETİLENLER --------------------------- */

  const ov = overview.data?.linked ? overview.data : null;
  const card = career.data?.card ?? null;

  const openReview = useCallback(
    (match: { id: number; opponent: string | null; date: string }) =>
      setReviewing({
        id: match.id,
        title: `${match.opponent ?? "Rakip"} maçı`,
        subtitle: formatDateShort(match.date),
      }),
    [],
  );

  const pendingRequests = useMemo(
    () =>
      accountRequestList(requests.data).filter(
        (item) => item.status === "pending" && String(item.type).startsWith("player_"),
      ),
    [requests.data],
  );
  const pendingChanges = useMemo(
    () => (data?.pendingChanges ?? []).filter((item) => item.type === "player_update" || item.type === "sponsor_update"),
    [data?.pendingChanges],
  );

  const contractEnd = ov?.contracts?.active?.end ?? null;
  const contractDays = daysFromNow(contractEnd);

  const actions = useMemo<HomeAction[]>(() => {
    const list: HomeAction[] = signals.playerAttention.map((item) => ({
      key: item.key,
      icon: item.icon,
      tone: item.tone,
      title: item.title,
      subtitle: item.subtitle,
      count: item.count,
      cta: SIGNAL_CTA[item.key] ?? "Aç",
      weight: item.weight,
      onPress: () => onAttention(item),
    }));

    if (nextMatch && rsvp.isSuccess && !rsvp.data?.status) {
      list.push({
        key: "yoklama",
        icon: "hand-left",
        tone: "warn",
        title: "Geliyor musun?",
        subtitle: `${nextMatch.opponent_name ?? "Sıradaki"} maçı · ${matchWhen(nextMatch.date, nextMatch.time)}`,
        cta: "Yanıtla",
        weight: 85,
        onPress: () => go(`/mac/${nextMatch.id}`),
      });
    }
    if (contractDays != null && contractDays >= 0 && contractDays <= CONTRACT_WARN_DAYS) {
      list.push({
        key: "sozlesme",
        icon: "document-text",
        tone: "info",
        title: "Sözleşmen bitiyor",
        subtitle: contractDays === 0 ? "Bugün sona eriyor" : `${contractDays} gün sonra · ${formatDateShort(contractEnd)}`,
        cta: "Sözleşmeyi gör",
        weight: 70,
        onPress: () => go("/sozlesmelerim"),
      });
    }
    if (lastPlayed && lastReview.isSuccess && !lastReview.data?.review) {
      const opponent =
        lastPlayed.opponent_name ?? (lastPlayed.is_home ? lastPlayed.second_team_name : lastPlayed.first_team_name);
      list.push({
        key: "degerlendir",
        icon: "star",
        tone: "brand",
        title: "Maçı değerlendir",
        subtitle: `${opponent ?? "Son"} maçı · hakem, yayın ve rakip`,
        cta: "Puanla",
        weight: 55,
        onPress: () => openReview({ id: lastPlayed.id, opponent, date: lastPlayed.date }),
      });
    }
    if (pendingRequests.length) {
      list.push({
        key: "talep",
        icon: "hourglass",
        tone: "neutral",
        title: "Onay bekleyen talep",
        subtitle: "Yönetici incelemesinde; istersen geri çekebilirsin",
        count: pendingRequests.length,
        cta: "Taleplerim",
        weight: 35,
        onPress: () => go("/oyuncum/profil"),
      });
    }
    if (pendingChanges.length) {
      list.push({
        key: "degisiklik",
        icon: "create",
        tone: "neutral",
        title: "Profil değişikliğin onayda",
        subtitle: "Onaylanınca profilinde yayınlanır",
        count: pendingChanges.length,
        cta: "Ayrıntı",
        weight: 30,
        onPress: () => go("/oyuncum/profil"),
      });
    }
    return list.sort((a, b) => b.weight - a.weight);
  }, [
    contractDays,
    contractEnd,
    go,
    lastPlayed,
    lastReview.data,
    lastReview.isSuccess,
    nextMatch,
    onAttention,
    openReview,
    pendingChanges.length,
    pendingRequests.length,
    rsvp.data,
    rsvp.isSuccess,
    signals.playerAttention,
  ]);

  /* ------------------------------- ÇİZİM ------------------------------- */

  if (me.isLoading) {
    return (
      <View style={styles.loading}>
        <SkeletonCard lines={4} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={3} />
      </View>
    );
  }

  if (!player) {
    return (
      <PanelSection title="Oyuncu profili" style={styles.first}>
        <PanelEmpty
          icon="person-add-outline"
          text={
            me.isError
              ? "Oyuncu bilgisi alınamadı. Aşağı çekerek yeniden dene."
              : "Oyuncu profilin bağlı değil. Kaydını bul ve sahiplen ya da yeni profil aç."
          }
          action={
            me.isError
              ? { label: "Tekrar dene", onPress: () => void me.refetch() }
              : { label: "Bağla", onPress: () => go("/oyuncum/bagla") }
          }
        />
        <PanelCard padded={false} style={styles.gap}>
          <PanelRow icon="toggle" tone="neutral" title="Profil modları" hint="Oyuncu / takım başkanı alanını aç-kapat" onPress={() => go("/oyuncum/modlar")} />
          <PanelRow icon="mail-unread" tone="win" title="Davet ve başvurular" hint="Takımlara başvur, gelen davetleri yanıtla" onPress={() => go("/davetler")} last />
        </PanelCard>
      </PanelSection>
    );
  }

  const name = player.player_name ?? user?.fullName ?? "Oyuncu";
  const scopeLabel = stats?.scope === "career" ? "Kariyer" : stats?.season ? `${stats.season} sezonu` : "Bu sezon";
  const rating = stats?.rating != null && Number(stats.rating) > 0 ? formatDecimal(stats.rating, 1) : "—";

  const heroStats = [
    { label: "Maç", value: String(stats?.matches ?? 0) },
    { label: "Gol", value: String(stats?.goals ?? 0) },
    { label: "Asist", value: String(stats?.assists ?? 0) },
    { label: "Puan", value: rating },
  ];
  const form = (ov?.recent_form ?? []).map((row) => row.result as FormResult);
  const heroChips: { icon: "trending-up" | "podium" | "id-card"; label: string }[] = [];
  if (ov?.market_value?.current) {
    heroChips.push({ icon: "trending-up", label: formatMoney(ov.market_value.current, ov.market_value.currency) });
  }
  if (ov?.standings?.position) {
    heroChips.push({
      icon: "podium",
      label: `Takımın ${ov.standings.position}.${ov.standings.team_count ? ` / ${ov.standings.team_count}` : ""}`,
    });
  }
  if (contractEnd) heroChips.push({ icon: "id-card", label: `Sözleşme ${formatDateShort(contractEnd)}` });

  const upcomingCount = myMatches.data?.upcoming?.length ?? 0;
  const level = career.data?.level ?? null;

  const tiles: { key: string; icon: Parameters<typeof HubTile>[0]["icon"]; title: string; subtitle: string; tone: HubTone; badge?: number; href: string }[] = [
    { key: "maclar", icon: "football", title: "Maçlarım", subtitle: upcomingCount ? `${upcomingCount} yaklaşan maç` : "Geçmiş ve gelecek", tone: "brand", href: "/oyuncum?tab=maclarim" },
    { key: "istatistik", icon: "stats-chart", title: "İstatistiklerim", subtitle: "Lig ve sezon süzgeçli", tone: "accent", href: "/oyuncum?tab=istatistik" },
    { key: "teklif", icon: "swap-horizontal", title: "Transfer teklifleri", subtitle: counts.offersAwaiting ? "Yanıtını bekliyor" : "Gelen teklifler", tone: "brand", badge: counts.offersAwaiting, href: "/tekliflerim" },
    { key: "davet", icon: "mail-unread", title: "Davet ve başvuru", subtitle: counts.invitesReceived ? "Kadro daveti var" : "Takımlara başvur", tone: "win", badge: counts.invitesReceived, href: "/davetler" },
    { key: "sozlesme", icon: "document-text", title: "Sözleşmelerim", subtitle: contractEnd ? `Bitiş ${formatDateShort(contractEnd)}` : "Aktif ve geçmiş", tone: "info", href: "/sozlesmelerim" },
    { key: "ceza", icon: "shield-checkmark", title: "Cezalar ve savunma", subtitle: counts.penaltiesOpen ? "Süre işliyor" : "Disiplin dosyaların", tone: counts.penaltiesOpen ? "danger" : "warn", badge: counts.penaltiesOpen, href: "/cezalarim" },
    { key: "kariyer", icon: "trophy", title: "Elit Kariyer", subtitle: level ? `Seviye ${level.level}${card ? ` · OVR ${card.ovr}` : ""}` : "Kart, rozet, görev", tone: "warn", href: "/kariyer?tab=kariyer" },
    { key: "ara", icon: "search", title: "Futbolcu veritabanı", subtitle: "Bölgendeki oyuncuları ara", tone: "neutral", href: "/takimim/oyuncu-ara" },
  ];

  const matches = Number(stats?.matches ?? 0);
  const seasonItems: StatItem[] = [
    { label: "İlk 11", value: matches > 0 ? `%${Math.round((Number(stats?.starts ?? 0) / matches) * 100)}` : "—" },
    {
      label: "G+A / maç",
      value: matches > 0 ? formatDecimal((Number(stats?.goals ?? 0) + Number(stats?.assists ?? 0)) / matches, 2) : "—",
      tone: "brand",
    },
    { label: "Sarı", value: String(stats?.yellow_cards ?? 0) },
    { label: "Kırmızı", value: String(stats?.red_cards ?? 0), tone: Number(stats?.red_cards ?? 0) > 0 ? "danger" : "neutral" },
  ];

  const recent = (ov?.recent_form ?? []).slice(0, 5);
  const standing = ov?.standings ?? null;
  const teamForm = (ov?.team_form ?? []).map((row) => row.result).join("");

  return (
    <>
      {/* 1 — KAHRAMAN */}
      <View style={styles.hero}>
        <CareerHero
          name={name}
          image={mediaUrl(player.player_img)}
          position={player.player_position}
          teamName={playerTeam?.team_name ?? null}
          teamLogo={mediaUrl(playerTeam?.logo ?? null)}
          scopeLabel={scopeLabel}
          stats={heroStats}
          form={form}
          chips={heroChips}
          career={career.data ?? null}
          onOpenProfile={() => go("/oyuncum/profil")}
          onOpenPublic={() => go(`/oyuncu/${player.id}`)}
          onOpenCareer={() => go("/kariyer?tab=kariyer")}
          onShare={() => setShareOpen(true)}
        />
      </View>

      {/* 2 — ŞİMDİ İLGİLEN */}
      <PanelSection
        title="Şimdi ilgilen"
        meta={actions.length ? `${actions.length} iş` : undefined}
      >
        <ActionRail items={actions} />
      </PanelSection>

      {/* 3 — SIRADAKİ MAÇ */}
      <PanelSection
        title="Sıradaki maç"
        action={{ label: "Maçlarım", onPress: () => go("/oyuncum?tab=maclarim") }}
      >
        {myMatches.isLoading ? (
          <SkeletonCard lines={2} />
        ) : nextMatch ? (
          <NextMatchPanel
            match={nextMatch}
            teamName={playerTeam?.team_name ?? null}
            teamLogo={mediaUrl(playerTeam?.logo ?? null)}
            onOpen={() => go(`/mac/${nextMatch.id}`)}
          />
        ) : (
          <PanelEmpty
            icon="calendar-outline"
            text={myMatches.isError ? "Maç bilgisi alınamadı." : "Takımına maç yazılınca burada görünür."}
            action={playerTeam ? undefined : { label: "Takım bul", onPress: () => go("/davetler") }}
          />
        )}
      </PanelSection>

      {/* 4 — HIZLI İŞLEMLER */}
      <PanelSection title="Hızlı işlemler">
        <HubGrid inset="flush">
          {tiles.map((tile) => (
            <HubTile
              key={tile.key}
              icon={tile.icon}
              title={tile.title}
              subtitle={tile.subtitle}
              tone={tile.tone}
              badge={tile.badge}
              onPress={() => go(tile.href)}
            />
          ))}
        </HubGrid>
      </PanelSection>

      {/* 5 — ÖZET */}
      <PanelSection
        title="Sezonum"
        meta={stats?.season ?? undefined}
        action={{ label: "Ayrıntı", onPress: () => go("/oyuncum?tab=istatistik") }}
      >
        <StatStrip items={seasonItems} />
      </PanelSection>

      {recent.length ? (
        <PanelSection
          title="Son performansım"
          action={{ label: "Tümü", onPress: () => go("/oyuncum?tab=maclarim&durum=oynanan") }}
         
        >
          <RecentForm rows={recent} onOpen={(id) => go(`/mac/${id}`)} />
        </PanelSection>
      ) : null}

      {playerTeam ? (
        <PanelSection
          title="Takımım"
          meta={ov?.season?.name ?? undefined}
          action={{ label: "Takım sayfası", onPress: () => go(`/takim/${playerTeam.id}`) }}
        >
          <PanelCard padded={false}>
            <PanelRow
              icon="shield"
              tone="brand"
              title={playerTeam.team_name}
              hint={
                standing
                  ? `${standing.played} maç · ${standing.wins}G ${standing.draws}B ${standing.losses}M · averaj ${standing.goal_diff > 0 ? "+" : ""}${standing.goal_diff}`
                  : "Puan durumu kaydı yok"
              }
              value={standing?.position ? `${standing.position}. · ${standing.points} P` : undefined}
              onPress={() => go(`/takim/${playerTeam.id}`)}
              last={!teamForm}
            />
            {teamForm ? (
              <PanelRow icon="pulse" tone="info" title="Takımın son maçları" value={teamForm.split("").map((r) => (r === "W" ? "G" : r === "L" ? "M" : "B")).join(" ")} last />
            ) : null}
          </PanelCard>
        </PanelSection>
      ) : null}

      {/* 6 — MENÜ GRUPLARI (web oyuncu menüsü) */}
      <PanelSection title="Genel">
        <PanelCard padded={false}>
          <PanelRow icon="person" title="Oyuncu profilim" hint="Kişisel bilgiler · değişiklikler onayla yayınlanır" count={pendingChanges.length} onPress={() => go("/oyuncum/profil")} />
          <PanelRow icon="create" tone="info" title="Bilgilerimi düzenle" hint="Fotoğraf, mevki, iletişim" onPress={() => go("/oyuncum/duzenle")} />
          <PanelRow icon="stats-chart" tone="accent" title="Detaylı istatistikler" hint="Tüm kariyer · lig ve sezon süzgeci" onPress={() => go("/oyuncum?tab=istatistik")} last />
        </PanelCard>
      </PanelSection>

      <PanelSection title="Maç">
        <PanelCard padded={false}>
          <PanelRow icon="calendar" tone="brand" title="Gelecek maçlarım" hint="Katılım yanıtı · kadro durumu" value={upcomingCount ? String(upcomingCount) : undefined} onPress={() => go("/oyuncum?tab=maclarim&durum=yaklasan")} />
          <PanelRow icon="time" tone="neutral" title="Geçmiş maçlarım" hint="Maç detayı, performansım ve değerlendirme" onPress={() => go("/oyuncum?tab=maclarim&durum=oynanan")} last />
        </PanelCard>
      </PanelSection>

      <PanelSection title="Kariyer">
        <PanelCard padded={false}>
          <PanelRow icon="megaphone" tone="warn" title="Sponsorluklarım" hint="Profil sayfandaki sponsor alanları" onPress={() => go("/oyuncum/sponsorlar")} />
          <PanelRow icon="mail-unread" tone="win" title="Davet ve başvurular" hint="Takımlara başvur · davetleri yanıtla" count={counts.invitesReceived} onPress={() => go("/davetler")} />
          <PanelRow icon="swap-horizontal" tone="brand" title="Transfer tekliflerim" hint="Kabul et, reddet ya da revizyon iste" count={counts.offersAwaiting} onPress={() => go("/tekliflerim")} />
          <PanelRow icon="document-text" tone="info" title="Sözleşmelerim" hint="Aktif ve geçmiş sözleşmeler" onPress={() => go("/sozlesmelerim")} />
          <PanelRow icon="shield-checkmark" tone="danger" title="Cezalarım ve savunma" hint="Savunma ve itiraz hakkın" count={counts.penaltiesOpen} onPress={() => go("/cezalarim")} />
          <PanelRow icon="search" tone="neutral" title="Futbolcu veritabanı" hint="Bölgendeki tüm oyuncular" onPress={() => go("/takimim/oyuncu-ara")} />
          <PanelRow icon="trophy" tone="warn" title="Elit Kariyer" hint="Elit Kart, rozetler, kariyer görevleri" onPress={() => go("/kariyer?tab=kariyer")} />
          <PanelRow icon="sparkles" tone="brand" title="Sezon özetim" hint="Sezonun hikâyesi, paylaşılabilir" onPress={() => go("/sezon-ozeti")} last />
        </PanelCard>
      </PanelSection>

      <PanelSection title="Bildirimler ve hesap">
        <PanelCard padded={false}>
          <PanelRow icon="swap-horizontal" tone="brand" title="Transfer bildirimleri" hint="Teklif, sözleşme, davet, başvuru" onPress={() => go("/bildirimler?filtre=transfer")} />
          <PanelRow icon="alert-circle" tone="danger" title="Disiplin bildirimleri" hint="Dosya, ceza ve savunma" onPress={() => go("/bildirimler?filtre=disiplin")} />
          <PanelRow icon="football" tone="live" title="Maç bildirimleri" hint="Maç, kadro ve yoklama" onPress={() => go("/bildirimler?filtre=mac")} />
          <PanelRow icon="chatbubbles" tone="info" title="Mesajlar" hint="Takımın, oyuncular ve lig yönetimi" onPress={() => go("/mesajlar")} />
          <PanelRow icon="toggle" tone="neutral" title="Profil modları" hint="Oyuncu / takım başkanı alanı" onPress={() => go("/oyuncum/modlar")} />
          <PanelRow icon="person-circle" tone="neutral" title="Hesabım" hint="Üyelik bilgileri ve güvenlik" onPress={() => go("/hesabim")} last />
        </PanelCard>
      </PanelSection>

      <ShareProfileCard
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        data={{
          name,
          image: mediaUrl(player.player_img),
          position: player.player_position,
          teamName: playerTeam?.team_name ?? null,
          scopeLabel,
          matches: Number(stats?.matches ?? 0),
          goals: Number(stats?.goals ?? 0),
          assists: Number(stats?.assists ?? 0),
          rating,
          ovr: card?.ovr ?? null,
          tierLabel: card ? (card.in_form ? "Formda" : card.tier_label) : null,
        }}
      />

      {reviewing ? (
        <MatchReviewSheet
          matchId={reviewing.id}
          title={reviewing.title}
          subtitle={reviewing.subtitle}
          onClose={() => setReviewing(null)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  loading: { gap: space.md, paddingTop: space.sm, paddingHorizontal: layout.screenPadding },
  hero: { paddingHorizontal: layout.screenPadding, paddingTop: space.xs },
  first: { marginTop: space.sm },
  gap: { marginTop: space.sm },
});
