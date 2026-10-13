/**
 * KULÜP PANELİ — başkanın tam kulüp görünümü (`/takimim`).
 *
 * KULÜBÜM SEKMESİYLE FARKI: sekme bir KAPIdır — kimlik, ilk üç iş, sıradaki
 * maç ve araç ızgarası. Panel ise kulübün DURUM RAPORUdur: bekleyen işlerin
 * tamamı, maç günü, kadronun mevki/sözleşme dağılımı, sezon karnesi ve kasa.
 * Veri katmanı ikisinde ortaktır (`components/club/useClubSignals.ts`); iki
 * ekran aynı sayıyı asla farklı göstermez.
 *
 * DÜZEN (Arena "Detay (kimlik)" kalıbı):
 *   sahne başlık + takım kimliği (kaydırınca kapanır)
 *   → Şimdi ilgilen (aciliyete göre sıralı, tamamı)
 *   → Maç günü (yoklama ölçeri, "kadroyu gir")
 *   → Kadro (hat dağılımı + sözleşme sağlığı)
 *   → Sezon (G-B-M, gol, puan)
 *   → Kasa (kadro değeri, bakiye, FFP) — yetki yoksa bölüm hiç çizilmez
 *   → Araçlar (üç grup: kadro ve transfer · maç · kulüp)
 *
 * DEĞİŞİKLİK TALEPLERİ: "Onay bekleyen değişiklik" satırı başka ekrana değil
 * bu ekranın alt sayfasına açılır (talepler yalnız burada listelenir).
 *
 * DURUMLAR: misafir → giriş; başkan değil → yetki boş hâli; yükleniyor →
 * kimlik iskeleti; hata → ErrorState (bayat veri varken bant); yönetilen
 * takım yok → sunucunun onboarding cümlesi.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { Redirect, useRouter, type Href } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AttendanceMeter } from "@/components/club/AttendanceMeter";
import { AttentionList } from "@/components/club/AttentionList";
import { ClubIdentity, type IdentityFact } from "@/components/club/ClubIdentity";
import { NextMatchCard } from "@/components/club/NextMatchCard";
import { SquadSnapshot, countLines } from "@/components/club/SquadSnapshot";
import { CHANGE_LABELS, useClubSignals, type AttentionItem } from "@/components/club/useClubSignals";
import {
  BottomSheet,
  Button,
  EmptyState,
  ErrorState,
  ListRow,
  MetricGrid,
  MetricTile,
  ScreenHeader,
  SectionHeader,
  Skeleton,
  SkeletonCard,
  SkeletonHero,
  SkeletonListRow,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
  type MetricTone,
} from "@/components/ui";
import { MAX_STARTERS, getTeamFinance, type FfpStatus } from "@/lib/api/team";
import { formatDateShort, formatMoney, mediaUrl } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, layout, space, textScale, type } from "@/theme";

/* ══════════════════════════════════════════════════════════════════════════
   Sabitler ve saf yardımcılar
   ══════════════════════════════════════════════════════════════════════════ */

interface ToolItem {
  key: string;
  href: Href;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}

/** Araçlar İŞ AİLESİNE göre gruplanır — yedi satırlık tek liste taranmıyordu. */
const TOOL_GROUPS: { title: string; items: ToolItem[] }[] = [
  {
    title: "Kadro ve transfer",
    items: [
      { key: "kadro", href: "/takimim/kadro", icon: "people", title: "Kadro", subtitle: "Forma, mevki, rol; oyuncu çıkar" },
      { key: "dizilis", href: "/takimim/kadro?gorunum=dizilis", icon: "grid", title: "İdeal diziliş", subtitle: "İlk 8'i sahada kur" },
      { key: "transfer", href: "/takimim/kadro?gorunum=transfer", icon: "swap-horizontal", title: "Transfer", subtitle: "Oyuncu ara, davet et, teklif ver" },
      { key: "sezon", href: "/takimim/kadro?gorunum=sezon", icon: "id-card", title: "Sezon kadrosu", subtitle: "Lisans, transfer hakkı, yönetim onayı" },
      { key: "davetler", href: "/davetler", icon: "git-pull-request", title: "Davet ve başvurular", subtitle: "Katılım istekleri ve oyuncu ilanı" },
    ],
  },
  {
    title: "Maç",
    items: [
      { key: "mac-merkezi", href: "/takimim/mac-merkezi", icon: "clipboard", title: "Maç merkezi", subtitle: "Fikstür, yoklama, maç karnesi" },
      { key: "mac-al", href: "/takimim/mac-al", icon: "calendar", title: "Maç al", subtitle: "Saha panosundan saat seç, talep gönder" },
    ],
  },
  {
    title: "Kulüp",
    items: [
      { key: "kasa", href: "/takimim/kasa", icon: "wallet", title: "Kulüp kasası", subtitle: "Gelir, gider, kadro değeri, FFP" },
      { key: "mesajlar", href: "/sohbet", icon: "chatbubbles", title: "Mesajlar", subtitle: "Takım grubu, oyuncular, yönetim" },
    ],
  },
];

const FFP_LABEL: Record<FfpStatus, { label: string; tone: MetricTone }> = {
  COMPLIANT: { label: "Uyumlu", tone: "win" },
  WARNING: { label: "Sınırda", tone: "warn" },
  BREACH: { label: "İhlal", tone: "danger" },
  DISABLED: { label: "Kapalı", tone: "neutral" },
};

function rowPosition(index: number, total: number): "single" | "first" | "middle" | "last" {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/** Bakiye eksiye düşebilir; `formatMoney` sıfır ve altını "—" yapar. */
function signedMoney(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0 ₺";
  const abs = Math.abs(value).toLocaleString("tr-TR", { maximumFractionDigits: 0 });
  return `${value < 0 ? "−" : ""}${abs} ₺`;
}

/* ══════════════════════════════════════════════════════════════════════════
   Ekran
   ══════════════════════════════════════════════════════════════════════════ */

export default function ClubPanelScreen() {
  const auth = useAuth();
  const scope = useScope();
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();
  const signals = useClubSignals();
  const [changesOpen, setChangesOpen] = useState(false);

  const { dashboard, team, standing, nextTeamMatch, teamAvailability } = signals;
  const data = dashboard.data;

  /** Kasa özeti — yetki yoksa (403) bölüm sessizce çizilmez. */
  const finance = useQuery({
    queryKey: ["takim", "finance"],
    queryFn: getTeamFinance,
    enabled: signals.managed,
    staleTime: 60_000,
    retry: false,
  });

  const lines = useMemo(
    () =>
      countLines([
        ...(data?.roster.contracted ?? []).map((player) => player.player_position),
        ...(data?.roster.withoutContract ?? []).map((player) => player.player_position),
      ]),
    [data],
  );

  const refresh = useRefresh(
    useCallback(() => {
      signals.refetchAll();
      if (signals.managed) void finance.refetch();
    }, [finance, signals]),
    { refreshing: signals.refreshing },
  );

  const go = useCallback((href: Href) => router.push(href), [router]);

  const openAttention = useCallback(
    (item: AttentionItem) => {
      if (item.action === "changes") setChangesOpen(true);
      else if (item.href) router.push(item.href);
    },
    [router],
  );

  /* --------------------------------- ÇİZİM ------------------------------- */

  if (!auth.user) return <Redirect href="/giris" />;

  if (!signals.isPresident) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Kulüp Paneli" back />
        <EmptyState
          icon="shield-outline"
          title="Takım başkanlığı gerekli"
          body="Bu alan bir takımın yönetimini üstlenen başkanlara açıktır. Takımını sahiplenmek ya da yeni takım kurmak için elitlig.com üzerinden başvurabilirsin."
          action={{ label: "Kulübüm'e dön", onPress: () => router.replace("/kulubum") }}
        />
      </SafeAreaView>
    );
  }

  if (dashboard.isLoading && !data) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Kulüp Paneli" back variant="stage" />
        <SkeletonHero />
        <View style={styles.loading}>
          <SkeletonListRow count={4} />
          <SkeletonCard lines={2} />
        </View>
      </SafeAreaView>
    );
  }

  if (dashboard.isError && !data) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Kulüp Paneli" back />
        <ErrorState error={dashboard.error} onRetry={dashboard.refetch} />
      </SafeAreaView>
    );
  }

  if (!team) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Kulüp Paneli" back />
        <EmptyState
          icon="shield-outline"
          title={data?.onboarding?.title ?? "Henüz bir takım yönetmiyorsun"}
          body={data?.onboarding?.description ?? "Takım yönetimi başvurusu elitlig.com üzerinden yapılır."}
        />
      </SafeAreaView>
    );
  }

  const facts: IdentityFact[] = [];
  if (standing) {
    facts.push({ label: "Sıra", value: `${standing.rank}.` });
    facts.push({ label: "Puan", value: String(standing.row.display_points) });
    facts.push({ label: "Averaj", value: signed(Number(standing.row.goal_diff) || 0) });
  } else if (team.team_points != null) {
    facts.push({ label: "Puan", value: String(team.team_points) });
  }
  facts.push({ label: "Kadro", value: String(signals.squadSize) });

  const context =
    [team.current_league, team.current_season].filter(Boolean).join(" · ") ||
    [scope.leagueLabel, scope.seasonLabel].filter(Boolean).join(" · ") ||
    team.city;

  const played = team.total_matches ?? null;
  const record =
    team.team_wins != null ? `${team.team_wins ?? 0}-${team.team_draws ?? 0}-${team.team_losses ?? 0}` : null;
  const goals =
    team.goals_scored != null && team.goals_conceded != null ? `${team.goals_scored}:${team.goals_conceded}` : null;

  const fin = finance.data;
  const ffp = fin ? (FFP_LABEL[fin.ffp.status] ?? FFP_LABEL.DISABLED) : null;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title={team.team_name}
        back
        scrollY={scrollY}
        actions={[
          { icon: "shield-outline", accessibilityLabel: "Takım sayfası", onPress: () => go(`/takim/${team.id}`) },
        ]}
        hero={
          <ClubIdentity
            kind="team"
            role="Kulüp paneli"
            name={team.team_name}
            image={mediaUrl(team.logo)}
            context={context}
            facts={facts}
            form={standing?.row.last5 ?? null}
          />
        }
      />

      <ScrollView
        {...scrollProps}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />}
      >
        {dashboard.isError ? (
          <ErrorState error={dashboard.error} onRetry={dashboard.refetch} variant="banner" style={styles.banner} />
        ) : null}

        {/* ŞİMDİ İLGİLEN */}
        <SectionHeader
          title="Şimdi ilgilen"
          meta={signals.clubAttention.length ? `${signals.clubAttention.length} iş` : undefined}
        />
        <AttentionList items={signals.clubAttention} onPress={openAttention} />

        {/* MAÇ GÜNÜ */}
        <SectionHeader
          title="Maç günü"
          action={{ label: "Fikstür", onPress: () => go("/takimim/mac-merkezi") }}
        />
        {signals.teamMatches.isLoading ? (
          <View style={styles.pad}>
            <SkeletonCard lines={2} />
          </View>
        ) : nextTeamMatch ? (
          <NextMatchCard
            opponent={nextTeamMatch.opponent_name}
            date={nextTeamMatch.date}
            time={nextTeamMatch.time}
            isHome={nextTeamMatch.is_home}
            venue={nextTeamMatch.match_field}
            onPress={() => go(`/mac/${nextTeamMatch.id}`)}
            footer={
              <>
                <Button
                  label="Maç kadrosu"
                  icon="people-outline"
                  size="sm"
                  onPress={() => go(`/takimim/mac/${nextTeamMatch.id}`)}
                  style={styles.flex}
                />
                <Button
                  label="Rakip analizi"
                  icon="analytics-outline"
                  size="sm"
                  variant="secondary"
                  onPress={() => go(`/takimim/mac/${nextTeamMatch.id}?sekme=analiz`)}
                  style={styles.flex}
                />
              </>
            }
          >
            {teamAvailability.isLoading ? (
              <Skeleton width="100%" height={8} radius="pill" />
            ) : teamAvailability.data ? (
              <AttendanceMeter counts={teamAvailability.data.counts} need={MAX_STARTERS} />
            ) : (
              <Text style={styles.muted} {...textScale.dense}>
                Yoklama bilgisi alınamadı.
              </Text>
            )}
          </NextMatchCard>
        ) : (
          <View style={styles.pad}>
            <EmptyState
              icon="calendar-outline"
              title="Programda maç yok"
              body="Saha panosundan boş saat seç; yönetici onaylayınca maç takımına yazılır."
              action={{ label: "Maç al", onPress: () => go("/takimim/mac-al") }}
              variant="inline"
              compact
            />
          </View>
        )}

        {/* KADRO */}
        <SectionHeader
          title="Kadro"
          meta={`${signals.squadSize} oyuncu`}
          action={{ label: "Yönet", onPress: () => go("/takimim/kadro") }}
        />
        {signals.squadSize > 0 ? (
          <SquadSnapshot
            lines={lines}
            total={signals.squadSize}
            contracted={signals.contracted}
            onPress={() => go("/takimim/kadro")}
          />
        ) : (
          <View style={styles.pad}>
            <EmptyState
              icon="people-outline"
              title="Kadron boş"
              body="Oyuncu ara; serbest oyuncuya davet, takımlı oyuncuya transfer teklifi gönder."
              action={{ label: "Oyuncu ekle", onPress: () => go("/takimim/kadro?gorunum=transfer") }}
              variant="inline"
              compact
            />
          </View>
        )}

        {/* SEZON */}
        {record || goals || played != null ? (
          <>
            <SectionHeader title="Sezon" meta={team.current_season ?? undefined} />
            <MetricGrid columns={3} style={styles.pad}>
              <MetricTile label="G-B-M" value={record ?? "—"} hint={played != null ? `${played} maç` : undefined} />
              <MetricTile
                label="Gol"
                value={goals ?? "—"}
                hint={
                  team.goals_scored != null && team.goals_conceded != null
                    ? `averaj ${signed(Number(team.goals_scored) - Number(team.goals_conceded))}`
                    : undefined
                }
              />
              <MetricTile label="Puan" value={team.team_points != null ? String(team.team_points) : "—"} tone="accent" />
            </MetricGrid>
          </>
        ) : null}

        {/* KASA */}
        {fin && ffp ? (
          <>
            <SectionHeader title="Kasa" action={{ label: "Defter", onPress: () => go("/takimim/kasa") }} />
            <MetricGrid columns={2} style={styles.pad}>
              <MetricTile
                label="Kadro değeri"
                value={formatMoney(fin.squadValue)}
                hint={`${fin.playerCount} oyuncu`}
                onPress={() => go("/takimim/kasa?tab=kadro")}
              />
              <MetricTile
                label="Bakiye"
                value={signedMoney(fin.totals.income - fin.totals.expense)}
                hint={`FFP: ${ffp.label}`}
                tone={fin.totals.income - fin.totals.expense < 0 || ffp.tone === "danger" ? "danger" : "neutral"}
                onPress={() => go("/takimim/kasa")}
              />
            </MetricGrid>
          </>
        ) : null}

        {/* ARAÇLAR */}
        {TOOL_GROUPS.map((group) => (
          <View key={group.title}>
            <SectionHeader title={group.title} />
            <View style={styles.pad}>
              {group.items.map((item, index) => (
                <ListRow
                  key={item.key}
                  leading={{ icon: item.icon, tone: "brand" }}
                  title={item.title}
                  subtitle={item.subtitle}
                  value={
                    item.key === "kadro"
                      ? String(signals.squadSize)
                      : item.key === "davetler" && signals.counts.applications
                        ? `${signals.counts.applications} yeni`
                        : item.key === "transfer" && signals.counts.offersOpen
                          ? `${signals.counts.offersOpen} açık`
                          : undefined
                  }
                  position={rowPosition(index, group.items.length)}
                  onPress={() => go(item.href)}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Onay bekleyen değişiklik talepleri */}
      <BottomSheet
        visible={changesOpen}
        onClose={() => setChangesOpen(false)}
        title="Onay bekleyen değişiklikler"
        snap="content"
      >
        <View style={styles.sheetBody}>
          {signals.pendingChanges.length === 0 ? (
            <Text style={styles.sheetNote} {...textScale.long}>
              Bekleyen talep yok.
            </Text>
          ) : (
            signals.pendingChanges.map((change, index) => (
              <ListRow
                key={change.id}
                leading={{ icon: "hourglass-outline", tone: "warn" }}
                title={CHANGE_LABELS[change.type] ?? change.type}
                subtitle={change.created_at ? `${formatDateShort(change.created_at)} tarihinde gönderildi` : undefined}
                value="İnceleniyor"
                chevron={false}
                position={rowPosition(index, signals.pendingChanges.length)}
              />
            ))
          )}
          <Text style={styles.sheetNote} {...textScale.long}>
            Talepler yönetici onayından sonra yayına alınır. Geri çekme işlemi şimdilik elitlig.com üzerinden yapılır.
          </Text>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Stiller
   ══════════════════════════════════════════════════════════════════════════ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingTop: space.xs,
    paddingBottom: space.huge,
  },
  pad: {
    paddingHorizontal: layout.screenPadding,
  },
  flex: {
    flex: 1,
  },
  loading: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    gap: space.md,
  },
  banner: {
    marginTop: space.sm,
    marginHorizontal: layout.screenPadding,
  },
  muted: {
    ...type.bodySm,
    color: colors.textTertiary,
  },
  sheetBody: {
    gap: space.xs,
    paddingBottom: space.sm,
  },
  sheetNote: {
    ...type.caption,
    color: colors.textTertiary,
    paddingHorizontal: layout.rowPaddingH,
    paddingTop: space.sm,
  },
});
