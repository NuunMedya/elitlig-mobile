/**
 * KULÜBÜM — takım başkanının ana sayfası (Yönetim sekmesi ▸ Kulübüm).
 *
 * `app/(tabs)/kulubum.tsx` bu bileşeni `ClubSection` yerine çizer:
 *   <ClubHome signals={signals} go={go} onAttention={openAttention} />
 *
 * DÜZEN ("her şey iki dokunuşta"):
 *   1. Kahraman kartı   arma, ad, lig/sezon, sıra · puan · averaj · kadro, form
 *   2. Şimdi ilgilen     yatay renkli iş kartları (izin, revizyon, başvuru,
 *                        yoklama, sözleşmesiz, kadro taslağı, FFP, disiplin…)
 *   3. Sıradaki maç      rakip, geri sayım, hazırlık yüzdesi ve üç adım
 *   4. Hızlı işlemler    4×2 renkli ızgara; ilk karo vurgulu "Teklif ver"
 *   5. Kısa özet         gol katkısı ilk 3 · kadro dengesi · kasa
 *   6. Kulüp menüsü      web panelinin menü gruplarının tamamı (katlanır)
 *
 * VERİ: kimlik/kadro/maç/sayaçlar `useClubSignals`tan (Yönetim sekmesiyle
 * ortak önbellek); özet, kasa, bildirim ve kadro taslağı `useClubExtras`tan.
 * Yenileme: üst ekran aşağı çekince `signals.refetchAll()` çağırır; bu
 * bileşen `signals.refreshing` açıldığında kendi sorgularını da tazeler.
 */

import React, { useEffect, useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AttentionRail } from "@/components/club/home/AttentionRail";
import { ClubHero, type HeroFact } from "@/components/club/home/ClubHero";
import { MenuGroups, type MenuGroup } from "@/components/club/home/MenuGroups";
import { NextMatchPrep } from "@/components/club/home/NextMatchPrep";
import { QuickActions, type QuickAction } from "@/components/club/home/QuickActions";
import { useClubExtras } from "@/components/club/home/useClubExtras";
import { PanelCard, PanelEmpty, PanelRow, PanelSection, StatStrip, type StatItem } from "@/components/club/Panel";
import { countLines } from "@/components/club/SquadSnapshot";
import type { AttentionItem, ClubSignals } from "@/components/club/useClubSignals";
import { Avatar, SkeletonCard } from "@/components/ui";
import { formatDecimal, mediaUrl } from "@/lib/format";
import { colors, layout, space, textScale, type } from "@/theme";

export interface ClubHomeProps {
  signals: ClubSignals;
  go: (href: string) => void;
  onAttention: (item: AttentionItem) => void;
}

const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

/** Bakiye eksiye düşebilir; kısa biçim: 12,4 B ₺ / 850 ₺. */
function shortMoney(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${formatDecimal(abs / 1_000_000, 1)} Mn ₺`;
  if (abs >= 1_000) return `${sign}${formatDecimal(abs / 1_000, 1)} B ₺`;
  return `${sign}${Math.round(abs)} ₺`;
}

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
        ...(data?.roster.contracted ?? []).map((player) => player.player_position),
        ...(data?.roster.withoutContract ?? []).map((player) => player.player_position),
      ]),
    [data],
  );

  const overview = extras.overview.data;
  const pendingApplications = counts.applications;

  const quick = useMemo<QuickAction[]>(
    () => [
      { key: "teklif", icon: "swap-horizontal", label: "Teklif ver", href: "/takimim/oyuncu-ara", tone: "brand", primary: true },
      { key: "mac-al", icon: "calendar", label: "Maç al", href: "/takimim/mac-al", tone: "win" },
      { key: "maclar", icon: "football", label: "Maçlar", href: "/takimim/mac-merkezi", tone: "live" },
      { key: "kadro", icon: "people", label: "Kadro", href: "/takimim/kadro", tone: "info", count: signals.withoutContract || undefined },
      {
        key: "transfer",
        icon: "briefcase",
        label: "Transfer",
        href: "/takimim/transfer",
        tone: "accent",
        count: extras.revisionCount + extras.releaseRequests.length || undefined,
      },
      { key: "ilan", icon: "megaphone", label: "Başvurular", href: "/takimim/ilanlar", tone: "warn", count: pendingApplications || undefined },
      { key: "musaitlik", icon: "time", label: "Müsaitlik", href: "/takimim/musaitlik", tone: "win" },
      { key: "kasa", icon: "wallet", label: "Bütçe", href: "/takimim/kasa", tone: "neutral" },
    ],
    [extras.releaseRequests.length, extras.revisionCount, pendingApplications, signals.withoutContract],
  );

  const groups = useMemo<MenuGroup[]>(
    () => [
      {
        key: "mac",
        title: "Maç yönetimi",
        items: [
          { key: "yaklasan", icon: "calendar-number", label: "Gelecek maçlar", hint: "Kadro kur, yoklama yap, rakip analizi", href: "/takimim/mac-merkezi?tab=yaklasan", tone: "live" },
          { key: "oynanan", icon: "time", label: "Geçmiş maçlar", hint: "Sonuçlar ve maç karnesi", href: "/takimim/mac-merkezi?tab=oynanan", tone: "neutral" },
          { key: "mac-al", icon: "add-circle", label: "Maç al", hint: "Boş saha saatinden maç talep et", href: "/takimim/mac-al", tone: "win" },
          { key: "musaitlik", icon: "checkbox", label: "Müsaitlik takvimi", hint: "Oynayabileceğin saha ve saatler", href: "/takimim/musaitlik", tone: "win" },
        ],
      },
      {
        key: "kadro",
        title: "Kadro ve transfer",
        items: [
          { key: "oyuncular", icon: "people", label: "Tüm oyuncularım", hint: "Forma no, mevki, rol, sözleşme durumu", href: "/takimim/kadro", tone: "info", count: signals.withoutContract || undefined },
          { key: "sezon", icon: "id-card", label: "Sezon kadrolarım", hint: "Lisans ve kadro kuralları, onaya gönder", href: "/takimim/kadro?gorunum=sezon", tone: "info" },
          { key: "ideal", icon: "grid", label: "İdeal kadrom", hint: "Dizilişi sahada kur", href: "/takimim/kadro?gorunum=dizilis", tone: "info" },
          {
            key: "transfer",
            icon: "swap-horizontal",
            label: "Transfer yönetimi",
            hint: "Gönderilen teklifler, izinler, satılık listesi",
            href: "/takimim/transfer",
            tone: "brand",
            count: counts.offersOpen || undefined,
          },
          { key: "ara", icon: "search", label: "Oyuncu ara · teklif ver", hint: "İlindeki futbolcu veritabanı", href: "/takimim/oyuncu-ara", tone: "brand" },
          { key: "ilan", icon: "megaphone", label: "İlanlar ve başvurular", hint: "Oyuncu arıyoruz ilanı, başvuru, davet", href: "/takimim/ilanlar", tone: "warn", count: pendingApplications || undefined },
          { key: "borsa", icon: "storefront", label: "Transfer borsası", hint: "Satılık ve kiralık oyuncular", href: "/takimim/borsa", tone: "warn" },
        ],
      },
      {
        key: "genel",
        title: "Performans",
        items: [
          { key: "istatistik", icon: "stats-chart", label: "Detaylı istatistikler", hint: "Lig ve sezon bazında tüm maç geçmişi", href: "/takimim/istatistik", tone: "brand" },
          { key: "sayfa", icon: "shield", label: "Takım sayfası", hint: "Herkesin gördüğü profil", href: team ? `/takim/${team.id}` : "/kulubum", tone: "neutral" },
        ],
      },
      {
        key: "bilgi",
        title: "Takım bilgileri",
        items: [
          { key: "kimlik", icon: "shield-half", label: "Kimlik ve logo", hint: "Ad, il, kuruluş, logo — onaylı", href: "/takimim/bilgiler?bolum=kimlik", tone: "info", count: signals.pendingChanges.length || undefined },
          { key: "forma", icon: "color-palette", label: "Renkler ve formalar", hint: "İç saha ve deplasman forması", href: "/takimim/bilgiler?bolum=formalar", tone: "accent" },
          { key: "icerik", icon: "book", label: "Takım sayfası içeriği", hint: "Tarihçe, başarılar, gol müziği, kaptan", href: "/takimim/bilgiler?bolum=sayfa", tone: "accent" },
          { key: "sponsor", icon: "megaphone", label: "Sponsorlar", hint: "Takım sayfasındaki sponsor alanları", href: "/takimim/sponsorlar", tone: "warn" },
        ],
      },
      {
        key: "evrak",
        title: "Evrak ve süreç",
        items: [
          { key: "disiplin", icon: "alert-circle", label: "Disiplin süreçleri", hint: "Savunma ve itiraz hakkı", href: "/takimim/disiplin", tone: "danger", count: counts.penaltiesOpen || undefined },
          { key: "sozlesme", icon: "document-text", label: "Sözleşmeler", hint: "Oyuncularla yapılan sözleşmeler", href: "/takimim/sozlesmeler", tone: "info" },
          { key: "kasa", icon: "wallet", label: "Kulüp bütçesi · FFP", hint: "Gelir-gider, kadro değeri, fair play", href: "/takimim/kasa", tone: "neutral" },
        ],
      },
      {
        key: "bildirim",
        title: "Mesajlar ve bildirimler",
        items: [
          { key: "b-transfer", icon: "swap-horizontal", label: "Transfer bildirimleri", hint: "Teklif, sözleşme, izin, davet", href: "/takimim/bildirimler?tur=transfer", tone: "brand" },
          { key: "b-disiplin", icon: "warning", label: "Disiplin bildirimleri", hint: "Dosya, karar, savunma", href: "/takimim/bildirimler?tur=disiplin", tone: "danger" },
          { key: "b-mac", icon: "football", label: "Maç bildirimleri", hint: "Maç, kadro, yoklama, maç talebi", href: "/takimim/bildirimler?tur=mac", tone: "live" },
          { key: "mesaj", icon: "chatbubbles", label: "Mesajlar", hint: "Yönetim, takımın ve oyuncularla yazış", href: "/mesajlar", tone: "neutral" },
        ],
      },
    ],
    [counts.offersOpen, counts.penaltiesOpen, pendingApplications, signals.pendingChanges.length, signals.withoutContract, team],
  );

  if (dashboard.isLoading) {
    return (
      <View style={[styles.pad, styles.loading]}>
        <SkeletonCard lines={3} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={4} />
      </View>
    );
  }

  if (!team) {
    return (
      <PanelSection title="Kulüp">
        <PanelEmpty
          icon="shield-outline"
          text={
            dashboard.isError
              ? "Takım bilgisi alınamadı. Aşağı çekerek yeniden dene."
              : (data?.onboarding?.description ?? "Hesabına bağlı bir takım görünmüyor. Takımını bul ve yönetim yetkisi iste.")
          }
          action={
            dashboard.isError
              ? { label: "Tekrar dene", onPress: () => void dashboard.refetch() }
              : { label: "Takımını bağla", onPress: () => go("/oyuncum/bagla?tur=takim") }
          }
        />
      </PanelSection>
    );
  }

  /* ------------------------------ Kahraman ------------------------------ */

  const facts: HeroFact[] = [];
  const position = standing?.rank ?? overview?.standings?.position ?? null;
  const teamCount = overview?.standings?.team_count ?? null;
  if (position) facts.push({ label: "Sıra", value: teamCount ? `${position}/${teamCount}` : `${position}.` });
  const points = standing ? Number(standing.row.display_points) : (overview?.standings?.points ?? team.team_points ?? null);
  if (points != null) facts.push({ label: "Puan", value: String(points) });
  const diff = standing ? Number(standing.row.goal_diff) || 0 : (overview?.standings?.goal_diff ?? null);
  if (diff != null) facts.push({ label: "Averaj", value: signed(diff), tone: diff > 0 ? "win" : diff < 0 ? "danger" : "neutral" });
  facts.push({ label: "Kadro", value: String(signals.squadSize) });

  const form = standing?.row.last5 || overview?.standings?.last5 || overview?.form?.results || null;
  const wins = overview?.standings?.wins ?? team.team_wins;
  const record = wins != null ? `${wins}G ${overview?.standings?.draws ?? team.team_draws ?? 0}B ${overview?.standings?.losses ?? team.team_losses ?? 0}M` : null;
  const context = [team.current_league, overview?.season?.name ?? team.current_season].filter(Boolean).join(" · ") || team.city;

  /* ------------------------------- Özet --------------------------------- */

  const squadItems: StatItem[] = [
    { label: "Kaleci", value: String(lines.GK), tone: lines.GK === 0 ? "danger" : "neutral" },
    { label: "Defans", value: String(lines.DEF) },
    { label: "Orta", value: String(lines.MID) },
    { label: "Forvet", value: String(lines.FWD) },
    {
      label: "Sözleşme",
      value: `${signals.contracted}/${signals.squadSize}`,
      tone: signals.withoutContract > 0 ? "danger" : "win",
      onPress: signals.withoutContract > 0 ? () => go("/takimim/kadro?filtre=sozlesmesiz") : undefined,
    },
  ];

  const finance = extras.finance.data;
  const financeItems: StatItem[] = [];
  if (finance) {
    const balance = finance.totals.income - finance.totals.expense;
    financeItems.push({ label: "Bakiye", value: shortMoney(balance), tone: balance < 0 ? "danger" : "neutral", onPress: () => go("/takimim/kasa") });
    financeItems.push({ label: "Kadro değeri", value: shortMoney(finance.squadValue), tone: "brand", onPress: () => go("/takimim/kasa?tab=kadro") });
    financeItems.push({
      label: "FFP",
      value: finance.ffp.status === "BREACH" ? "Aşıldı" : finance.ffp.status === "WARNING" ? "Uyarı" : finance.ffp.status === "DISABLED" ? "Kapalı" : "Uygun",
      tone: finance.ffp.status === "BREACH" ? "danger" : finance.ffp.status === "COMPLIANT" ? "win" : "neutral",
      onPress: () => go("/takimim/kasa"),
    });
  }
  const contributors = (overview?.top_contributors ?? []).slice(0, 3);

  return (
    <View style={styles.root}>
      <View style={styles.pad}>
        <ClubHero
          name={team.team_name}
          logo={mediaUrl(team.logo)}
          role="Başkan"
          context={context}
          facts={facts}
          form={form}
          record={record}
          onOpen={() => go(`/takim/${team.id}`)}
          onEdit={() => go("/takimim/bilgiler")}
        />
      </View>

      <View style={styles.block}>
        <SectionTitle title="Şimdi ilgilen" meta={attention.length ? `${attention.length} iş` : undefined} />
        <AttentionRail items={attention} onPress={onAttention} />
      </View>

      <PanelSection title="Sıradaki maç" action={{ label: "Fikstür", onPress: () => go("/takimim/mac-merkezi") }}>
        <NextMatchPrep signals={signals} teamName={team.team_name} teamLogo={mediaUrl(team.logo)} go={go} />
      </PanelSection>

      <PanelSection title="Hızlı işlemler">
        <QuickActions actions={quick} go={go} />
      </PanelSection>

      {contributors.length ? (
        <PanelSection title="Gol katkısı" meta={overview?.season?.name ?? undefined} action={{ label: "İstatistik", onPress: () => go("/takimim/istatistik") }}>
          <PanelCard padded={false}>
            {contributors.map((player, index) => (
              <PanelRow
                key={player.id}
                leading={<Avatar name={player.name} image={mediaUrl(player.image)} size={layout.crestMd} />}
                title={player.name}
                hint={[player.position, `${player.matches} maç`].filter(Boolean).join(" · ")}
                value={`${player.goals} G · ${player.assists} A`}
                onPress={() => go(`/oyuncu/${player.id}`)}
                last={index === contributors.length - 1}
              />
            ))}
          </PanelCard>
        </PanelSection>
      ) : null}

      <PanelSection title="Kadro dengesi" meta={`${signals.squadSize} oyuncu`} action={{ label: "Yönet", onPress: () => go("/takimim/kadro") }}>
        {signals.squadSize > 0 ? (
          <StatStrip items={squadItems} />
        ) : (
          <PanelEmpty
            icon="people-outline"
            text="Kadron boş. Oyuncu ara; davet ya da transfer teklifi gönder."
            action={{ label: "Oyuncu ara", onPress: () => go("/takimim/oyuncu-ara") }}
          />
        )}
      </PanelSection>

      {financeItems.length ? (
        <PanelSection title="Kulüp bütçesi" meta={team.current_season ?? undefined} action={{ label: "Kasa", onPress: () => go("/takimim/kasa") }}>
          <StatStrip items={financeItems} />
        </PanelSection>
      ) : null}

      <View style={styles.block}>
        <SectionTitle title="Kulüp menüsü" meta={extras.unreadNotifications ? `${extras.unreadNotifications} okunmamış bildirim` : undefined} />
        <MenuGroups groups={groups} go={go} />
      </View>
    </View>
  );
}

function SectionTitle({ title, meta }: { title: string; meta?: string }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle} numberOfLines={1} {...textScale.badge}>
        {title.toLocaleUpperCase("tr-TR")}
        {meta ? <Text style={styles.sectionMeta}>{`  ·  ${meta}`}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingTop: space.md },
  pad: { paddingHorizontal: layout.screenPadding },
  loading: { gap: space.md, paddingTop: space.md },
  block: { marginTop: space.xl, gap: space.sm },
  sectionHead: { paddingHorizontal: layout.screenPadding },
  sectionTitle: { ...type.overline, color: colors.textTertiary },
  sectionMeta: { ...type.overline, color: colors.textTertiary, letterSpacing: 0.4 },
});
