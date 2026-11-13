/**
 * KULÜBÜM — takım başkanının ana sayfası (Yönetim sekmesi ▸ Kulübüm).
 *
 * `app/(tabs)/kulubum.tsx` bu bileşeni çizer:
 *   <ClubHome signals={signals} go={go} onAttention={openAttention} />
 *
 * DÜZEN — KONTROL PANELİ ("biz neredeyiz?" → "ne bekliyor?" → "nereye?" → "durum ne?"):
 *   1. Kimlik sahnesi   koyu mor sahne: arma, ad, rol/lig hapları; SIRA ·
 *                       PUAN · AVERAJ · KADRO dönen sayılarla; G/B/M oran
 *                       çubuğu ve son beş maç formu
 *   2. Yapılacaklar      en ağır iş büyük "öncelikli" kartta, kalanlar tek
 *                       kartta satır satır (izin, revizyon, başvuru, yoklama,
 *                       sözleşmesiz, kadro taslağı, FFP, disiplin…)
 *   3. Kısayollar        haftalık döngünün altı işi, IconTile + DURUM satırı
 *   4. Sıradaki maç      armalar + başlama saati, hazırlık yüzdesi, üç adım
 *   5. Kadro özeti       oyuncu sayısı, sözleşme oranı, mevki dağılımı, gol
 *                       katkısı ilk üçü
 *   6. Kasa özeti        bakiye, gelir/gider oranı, FFP, kadro değeri
 *   7. Tüm araçlar       kalan her şey dört grupta, açık ızgara
 *   8. Kulüp ayarları    yönetim yetkisi, bildirim tercihleri, profil modları,
 *                       hesap — sayfanın sonunda
 *
 * TAKIMSIZ BAŞKAN: mod açık ama takım bağlı değilse boş durum bekleyen
 * yönetim talebini (onay bekliyor / reddedildi + not) gösterir; yeniden
 * "takımını bağla"ya itmez.
 *
 * VERİ: kimlik/kadro/maç/sayaçlar `useClubSignals`tan (Yönetim sekmesiyle
 * ortak önbellek); özet, kasa, bildirim ve kadro taslağı `useClubExtras`tan.
 * Yenileme: üst ekran aşağı çekince `signals.refetchAll()` çağırır; bu
 * bileşen `signals.refreshing` açıldığında kendi sorgularını da tazeler.
 */

import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";

import { MenuGroup, type MenuItemSpec } from "@/components/account/MenuBlocks";
import { AttentionRail } from "@/components/club/home/AttentionRail";
import { ClubHero, type HeroFact } from "@/components/club/home/ClubHero";
import { FinanceSummary, SquadSummary } from "@/components/club/home/ClubSummaries";
import { ControlGrid, ToolDeck } from "@/components/club/home/ControlGrid";
import { HomeSkeleton } from "@/components/club/home/HomeSkeleton";
import { NextMatchPrep } from "@/components/club/home/NextMatchPrep";
import type { BoardSection, Shortcut } from "@/components/club/home/ToolBoard";
import { useClubExtras } from "@/components/club/home/useClubExtras";
import { PanelCard, PanelEmpty, PanelRow, PanelSection } from "@/components/club/Panel";
import { countLines } from "@/components/club/SquadSnapshot";
import type { AttentionItem, ClubSignals } from "@/components/club/useClubSignals";
import { matchWhen } from "@/components/club/NextMatchCard";
import { shortMoney } from "@/components/team/ClubKit";
import { Reveal, SectionHeader } from "@/components/ui";
import { ACCOUNT_REQUEST_LABELS, TEAM_REQUEST_TYPES, getAccountRequests } from "@/lib/api/club/account";
import { formatDateShort, mediaUrl } from "@/lib/format";
import { layout, space } from "@/theme";

export interface ClubHomeProps {
  signals: ClubSignals;
  go: (href: string) => void;
  onAttention: (item: AttentionItem) => void;
}

const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

/**
 * Ortak dikkat listesindeki bazı işler eski genel ekranlara gidiyordu
 * (ör. teklif → kadro sekmesi, başvuru → oyuncunun da kullandığı davetler).
 * Kulübüm'de aynı iş takıma özel yerel ekranı açar.
 */
const CLUB_HREF: Record<string, string> = {
  teklif: "/takimim/transfer",
  basvuru: "/takimim/ilanlar",
  davet: "/takimim/ilanlar?bolum=davet",
  ceza: "/takimim/disiplin?durum=aksiyon",
};

export function ClubHome({ signals, go, onAttention }: ClubHomeProps) {
  const { team, standing, dashboard, counts } = signals;
  const extras = useClubExtras(signals.managed);
  const data = dashboard.data;

  /* Üst ekran aşağı çekince yalnız ortak sinyalleri tazeler; bizimkiler de. */
  const wasRefreshing = useRef(false);
  const { refetch: refetchExtras } = extras;
  useEffect(() => {
    if (signals.refreshing && !wasRefreshing.current) refetchExtras();
    wasRefreshing.current = signals.refreshing;
  }, [refetchExtras, signals.refreshing]);

  const attention = useMemo(() => {
    const merged = [
      ...signals.clubAttention.map((item) => (CLUB_HREF[item.key] ? { ...item, href: CLUB_HREF[item.key] as AttentionItem["href"] } : item)),
      ...extras.attention,
    ];
    const seen = new Set<string>();
    return merged
      .filter((item) => (seen.has(item.key) ? false : (seen.add(item.key), true)))
      .sort((a, b) => b.weight - a.weight);
  }, [extras.attention, signals.clubAttention]);

  const lines = useMemo(
    () =>
      countLines([
        ...(data?.roster?.contracted ?? []).map((player) => player.player_position),
        ...(data?.roster?.withoutContract ?? []).map((player) => player.player_position),
      ]),
    [data],
  );

  const overview = extras.overview.data;
  const pendingApplications = counts.applications;

  const finance = extras.finance.data;
  const balance = finance?.totals ? finance.totals.income - finance.totals.expense : null;
  const nextMatch = signals.nextTeamMatch;
  const transferWork = extras.revisionCount + extras.releaseRequests.length;

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      {
        key: "kadro",
        icon: "people",
        label: "Kadro",
        status: signals.withoutContract ? `${signals.withoutContract} sözleşmesiz` : `${signals.squadSize} oyuncu`,
        href: signals.withoutContract ? "/takimim/kadro?filtre=sozlesmesiz" : "/takimim/kadro",
        tone: "info",
        count: signals.withoutContract || undefined,
      },
      {
        key: "mac-kadrosu",
        icon: "clipboard",
        label: "Maç kadrosu",
        status: nextMatch ? matchWhen(nextMatch.date, nextMatch.time) : "Programda maç yok",
        href: nextMatch ? `/takimim/mac/${nextMatch.id}?sekme=kadro` : "/takimim/mac-merkezi",
        tone: "live",
      },
      { key: "mac-al", icon: "calendar", label: "Maç al", status: "Saha ve saat seç", href: "/takimim/mac-al", tone: "win" },
      {
        key: "teklifler",
        icon: "swap-horizontal",
        label: "Teklifler",
        status: transferWork ? "Senden karar bekliyor" : counts.offersOpen ? `${counts.offersOpen} açık teklif` : "Transfer masası",
        href: "/takimim/transfer",
        tone: "accent",
        count: transferWork || undefined,
        urgent: extras.releaseRequests.length > 0,
      },
      {
        key: "kasa",
        icon: "wallet",
        label: "Kasa",
        status: balance != null ? shortMoney(balance) : "Bütçe ve FFP",
        href: "/takimim/kasa",
        tone: finance?.ffp?.status === "BREACH" ? "danger" : "neutral",
      },
      { key: "teklif-ver", icon: "person-add", label: "Teklif ver", status: "Oyuncu ara", href: "/takimim/oyuncu-ara", tone: "brand", primary: true },
    ],
    [balance, counts.offersOpen, extras.releaseRequests.length, finance?.ffp?.status, nextMatch, signals.squadSize, signals.withoutContract, transferWork],
  );

  const sections = useMemo<BoardSection[]>(
    () => [
      {
        key: "mac",
        title: "Maç",
        tools: [
          { key: "fikstur", icon: "calendar-number", label: "Fikstür", href: "/takimim/mac-merkezi?tab=yaklasan", tone: "live" },
          { key: "sonuclar", icon: "time", label: "Sonuçlar", href: "/takimim/mac-merkezi?tab=oynanan", tone: "neutral" },
          { key: "musaitlik", icon: "checkbox", label: "Müsaitlik", href: "/takimim/musaitlik", tone: "win" },
          { key: "istatistik", icon: "stats-chart", label: "İstatistik", href: "/takimim/istatistik", tone: "brand" },
        ],
      },
      {
        key: "kadro",
        title: "Kadro ve transfer",
        tools: [
          { key: "sezon", icon: "id-card", label: "Sezon kadrosu", href: "/takimim/kadro?gorunum=sezon", tone: "info" },
          { key: "dizilis", icon: "grid", label: "İdeal diziliş", href: "/takimim/kadro?gorunum=dizilis", tone: "info" },
          { key: "basvuru", icon: "megaphone", label: "İlan ve başvuru", href: "/takimim/ilanlar", tone: "warn", count: pendingApplications || undefined },
          { key: "davet", icon: "paper-plane", label: "Davetler", href: "/takimim/ilanlar?bolum=davet", tone: "info", count: counts.invitesSent || undefined },
          { key: "borsa", icon: "storefront", label: "Transfer borsası", href: "/takimim/borsa", tone: "accent" },
          { key: "sozlesme", icon: "document-text", label: "Sözleşmeler", href: "/takimim/sozlesmeler", tone: "info" },
        ],
      },
      {
        key: "kulup",
        title: "Kulüp",
        tools: [
          { key: "kimlik", icon: "shield-half", label: "Kimlik ve logo", href: "/takimim/bilgiler?bolum=kimlik", tone: "brand", count: signals.pendingChanges.length || undefined },
          { key: "forma", icon: "shirt", label: "Formalar", href: "/takimim/bilgiler?bolum=formalar", tone: "accent" },
          { key: "icerik", icon: "book", label: "Sayfa içeriği", href: "/takimim/bilgiler?bolum=sayfa", tone: "accent" },
          { key: "sponsor", icon: "ribbon", label: "Sponsorlar", href: "/takimim/sponsorlar", tone: "warn" },
          { key: "disiplin", icon: "alert-circle", label: "Disiplin", href: "/takimim/disiplin", tone: "danger", count: counts.penaltiesOpen || undefined, urgent: true },
          { key: "sayfa", icon: "open-outline", label: "Takım sayfası", href: team ? `/takim/${team.id}` : "/kulubum", tone: "neutral" },
        ],
      },
      {
        key: "iletisim",
        title: "İletişim",
        tools: [
          { key: "bildirim", icon: "notifications", label: "Bildirimler", href: "/takimim/bildirimler", tone: "brand", count: extras.unreadNotifications || undefined },
          { key: "mesaj", icon: "chatbubbles", label: "Mesajlar", href: "/mesajlar", tone: "info" },
        ],
      },
    ],
    [counts.invitesSent, counts.penaltiesOpen, extras.unreadNotifications, pendingApplications, signals.pendingChanges.length, team],
  );

  if (dashboard.isLoading) return <HomeSkeleton />;

  if (!team) {
    return (
      <NoTeam
        error={dashboard.isError}
        description={data?.onboarding?.description ?? null}
        onRetry={() => void dashboard.refetch()}
        go={go}
      />
    );
  }

  /* ------------------------------ Kimlik ------------------------------ */

  const facts: HeroFact[] = [];
  /* Sıra ve takım sayısı AYNI kaynaktan: kapsam puan durumu varsa onun
     sırası (takım sayısı bilinmez), yoksa panel özetinin "3/14"ü. */
  const rankFromScope = standing?.rank ?? null;
  const position = rankFromScope ?? overview?.standings?.position ?? null;
  const teamCount = rankFromScope ? null : (overview?.standings?.team_count ?? null);
  if (position) facts.push({ label: "Sıra", value: `${position}.`, suffix: teamCount ? `/${teamCount}` : undefined });
  const points = standing ? Number(standing.row.display_points) : (overview?.standings?.points ?? team.team_points ?? null);
  if (points != null && Number.isFinite(points)) facts.push({ label: "Puan", value: String(points) });
  const diff = standing ? Number(standing.row.goal_diff) || 0 : (overview?.standings?.goal_diff ?? null);
  if (diff != null) facts.push({ label: "Averaj", value: signed(diff), tone: diff > 0 ? "win" : diff < 0 ? "danger" : "neutral" });
  facts.push({ label: "Kadro", value: String(signals.squadSize), onPress: () => go("/takimim/kadro") });

  const form = standing?.row.last5 || overview?.standings?.last5 || overview?.form?.results || null;
  const wins = overview?.standings?.wins ?? team.team_wins;
  const record =
    wins != null
      ? { wins: Number(wins) || 0, draws: Number(overview?.standings?.draws ?? team.team_draws ?? 0) || 0, losses: Number(overview?.standings?.losses ?? team.team_losses ?? 0) || 0 }
      : null;
  const context = [overview?.season?.name ?? team.current_season, team.city].filter(Boolean).join(" · ") || null;

  const contributors = (overview?.top_contributors ?? []).slice(0, 3);

  const settings: MenuItemSpec[] = [
    { key: "yetki", icon: "key", tone: "cyan", title: "Yönetim yetkisi", subtitle: "Takımı devret ya da başkanlıktan istifa et", onPress: () => go("/takimim/bilgiler?bolum=kimlik") },
    { key: "bildirim", icon: "notifications", tone: "violet", title: "Bildirim tercihleri", subtitle: "Maç, transfer, disiplin — hangisi telefonuna gelsin", onPress: () => go("/bildirim-tercihleri") },
    { key: "modlar", icon: "toggle", tone: "neutral", title: "Profil modları", subtitle: "Takım başkanı / oyuncu alanını aç-kapat", onPress: () => go("/oyuncum/modlar") },
    { key: "hesap", icon: "person-circle", tone: "neutral", title: "Hesabım", subtitle: "Üyelik bilgileri ve güvenlik", onPress: () => go("/hesabim") },
  ];

  return (
    <View style={styles.root}>
      <Reveal index={0} scaleFrom={0.97} style={styles.pad}>
        <ClubHero
          name={team.team_name}
          logo={mediaUrl(team.logo)}
          role="Başkan"
          league={overview?.team?.league ?? team.current_league}
          context={context}
          facts={facts}
          form={form}
          record={record}
          onOpen={() => go(`/takim/${team.id}`)}
          onEdit={() => go("/takimim/bilgiler")}
        />
      </Reveal>

      <Reveal index={1} style={styles.section}>
        <SectionHeader title="Yapılacaklar" meta={attention.length ? `${attention.length} iş` : undefined} />
        <AttentionRail items={attention} onPress={onAttention} />
      </Reveal>

      <Reveal index={2} style={[styles.section, styles.pad]}>
        <SectionHeader title="Kısayollar" inset="flush" />
        <ControlGrid items={shortcuts} go={go} />
      </Reveal>

      <Reveal index={3} style={[styles.section, styles.pad]}>
        <SectionHeader title="Sıradaki maç" inset="flush" action={{ label: "Fikstür", onPress: () => go("/takimim/mac-merkezi") }} />
        <NextMatchPrep signals={signals} teamName={team.team_name} teamLogo={mediaUrl(team.logo)} go={go} />
      </Reveal>

      <Reveal index={4} style={[styles.section, styles.pad]}>
        <SectionHeader title="Kadro özeti" inset="flush" action={{ label: "Yönet", onPress: () => go("/takimim/kadro") }} />
        {signals.squadSize > 0 ? (
          <SquadSummary
            lines={lines}
            total={signals.squadSize}
            contracted={signals.contracted}
            contributors={contributors}
            onOpen={() => go("/takimim/kadro")}
            onContracts={() => go(signals.withoutContract > 0 ? "/takimim/kadro?filtre=sozlesmesiz" : "/takimim/sozlesmeler")}
            onPlayer={(id) => go(`/oyuncu/${id}`)}
          />
        ) : (
          <PanelEmpty
            icon="people-outline"
            text="Kadron boş. Oyuncu ara; davet ya da transfer teklifi gönder."
            action={{ label: "Oyuncu ara", onPress: () => go("/takimim/oyuncu-ara") }}
          />
        )}
      </Reveal>

      {finance?.totals && finance.ffp ? (
        <Reveal index={5} style={[styles.section, styles.pad]}>
          <SectionHeader title="Kasa özeti" inset="flush" action={{ label: "Kasa", onPress: () => go("/takimim/kasa") }} />
          <FinanceSummary
            income={finance.totals.income}
            expense={finance.totals.expense}
            squadValue={finance.squadValue}
            ffp={finance.ffp.status}
            season={finance.team?.season ?? team.current_season}
            onOpen={() => go("/takimim/kasa")}
            onSquadValue={() => go("/takimim/kasa?tab=kadro")}
          />
        </Reveal>
      ) : null}

      <View style={[styles.section, styles.pad]}>
        <SectionHeader title="Tüm araçlar" inset="flush" />
        <ToolDeck sections={sections} go={go} />
      </View>

      <MenuGroup title="Kulüp ayarları" icon="settings" tone="neutral" items={settings} style={[styles.section, styles.pad]} />
    </View>
  );
}

/* ══════════════════════════ TAKIMSIZ BAŞKAN ══════════════════════════ */

/**
 * Başkan modu açık ama yönetilen takım yok. Bekleyen bir yönetim / takım
 * kurma talebi varsa DURUMU gösterilir (aynı talebi ikinci kez göndertmek
 * yerine); yoksa takımını bağlama ve takım kurma yolları.
 */
function NoTeam({
  error,
  description,
  onRetry,
  go,
}: {
  error: boolean;
  description: string | null;
  onRetry: () => void;
  go: (href: string) => void;
}) {
  const requests = useQuery({
    queryKey: ["account-requests"],
    queryFn: getAccountRequests,
    enabled: !error,
    staleTime: 60_000,
    retry: false,
  });
  const teamRequests = (requests.data?.requests ?? []).filter(
    (item) => TEAM_REQUEST_TYPES.has(item.type) && (item.type === "team_management" || item.type === "team_create"),
  );
  const pending = teamRequests.find((item) => item.status === "pending") ?? null;
  const rejected = !pending ? (teamRequests.find((item) => item.status === "rejected") ?? null) : null;
  const rejectedNote = rejected ? (rejected.adminNote ?? rejected.admin_note ?? rejected.reviewNote ?? null) : null;
  const sentAt = pending?.createdAt ?? pending?.created_at ?? null;

  if (error) {
    return (
      <PanelSection title="Kulüp">
        <PanelEmpty icon="cloud-offline-outline" text="Takım bilgisi alınamadı. Bağlantını kontrol edip yeniden dene." action={{ label: "Tekrar dene", onPress: onRetry }} />
      </PanelSection>
    );
  }

  return (
    <Reveal>
      <PanelSection title="Kulüp">
        {pending ? (
          <PanelCard padded={false}>
            <PanelRow
              icon="hourglass"
              tone="warn"
              title={`${ACCOUNT_REQUEST_LABELS[pending.type] ?? "Talebin"} — onay bekliyor`}
              hint={sentAt ? `${formatDateShort(sentAt)} tarihinde gönderildi · lig yönetimi inceliyor` : "Lig yönetimi inceliyor"}
              onPress={() => go("/oyuncum/bagla?tur=takim")}
              last
            />
          </PanelCard>
        ) : (
          <PanelEmpty
            icon="shield-outline"
            text={
              rejected
                ? `Son talebin reddedildi${rejectedNote ? `: ${rejectedNote}` : "."} Bilgileri düzeltip yeniden gönderebilirsin.`
                : (description ?? "Hesabına bağlı bir takım görünmüyor. Takımını bul ve yönetim yetkisi iste.")
            }
            action={{ label: "Takımını bağla", onPress: () => go("/oyuncum/bagla?tur=takim") }}
          />
        )}
        <PanelCard padded={false}>
          <PanelRow icon="search" tone="info" title="Takımları keşfet" hint="Adıyla ara, takım sayfasını aç" onPress={() => go("/ara?tip=takim")} />
          <PanelRow icon="toggle" tone="neutral" title="Profil modları" hint="Takım başkanı / oyuncu alanını aç-kapat" onPress={() => go("/oyuncum/modlar")} />
          <PanelRow icon="person-circle" tone="neutral" title="Hesabım" hint="Üyelik bilgileri ve güvenlik" onPress={() => go("/hesabim")} last />
        </PanelCard>
      </PanelSection>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  root: { paddingTop: space.md },
  pad: { paddingHorizontal: layout.screenPadding },
  section: { marginTop: space.xl },
});
