/**
 * LİG — kapsama (il → lig → sezon) bağlı tüm verinin tek evi; alt çubukta
 * kendi sekmesidir.
 *
 * ARENA DÜZENİ (bu sürüm):
 *   · BAŞLIK LİGİN KENDİSİDİR. Eski başlık "Lig" yazıyordu ve kapsam altta üç
 *     kutuluk ayrı bir şeritte tekrar ediliyordu (~120px). Şimdi büyük başlık
 *     seçili ligin adı, üst satırı onu konumlandıran bağlam ("ANKARA · 15.
 *     SEZON ⌄", dokununca kapsam sayfası sezon adımında açılır). Daralınca
 *     yalnız lig adı kalır.
 *   · LİG KISAYOLLARI başlığın altında tek çip şeridi (`ScopeBar
 *     showSlots={false}`): ligler arası geçiş alt sayfa açmadan tek dokunuş.
 *   · YEDİ SEKME: Puan · Fikstür · Takımlar · Oyuncular · İstatistik · Haber ·
 *     Arşiv. Her bölme `components/league/` altında kendi dosyasındadır;
 *     bu dosya yalnız kabuk, rota ve kapsam bağlantısıdır.
 *
 * DERİN BAĞLANTI: `/(tabs)/ligler?tab=<puan|fikstur|takimlar|oyuncular|
 * istatistik|haberler|arsiv>&leagueId=<id>`. Geçersiz değer sessizce "puan"
 * olur; `leagueId` verilirse kapsam o lige çevrilir (maç listesindeki lig
 * başlığı buraya bu parametreyle gelir).
 *
 * PERFORMANS: aynı anda YALNIZ bir bölmenin listesi mount edilir; her bölme
 * kendi sorgusunu `enabled` ile açar, arka plandaki bölmeler istek atmaz.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScopeBar } from "@/components/ScopeBar";
import { ScopeChip } from "@/components/ScopeChip";
import { ArchivePane } from "@/components/league/ArchivePane";
import { FixturesPane } from "@/components/league/FixturesPane";
import { NewsPane } from "@/components/league/NewsPane";
import { PlayersPane } from "@/components/league/PlayersPane";
import { StandingsPane } from "@/components/league/StandingsPane";
import { StatsPane } from "@/components/league/StatsPane";
import { TeamsPane } from "@/components/league/TeamsPane";
import { ScreenHeader, Tabs, useHeaderScroll, type TabItem } from "@/components/ui";
import type { PlayerSort } from "@/lib/types";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors } from "@/theme";

/* ══════════════════════════════════════════════════════════════════════════
   Segmentler ve rota parametresi
   ══════════════════════════════════════════════════════════════════════════ */

type LeagueTab = "puan" | "fikstur" | "takimlar" | "oyuncular" | "istatistik" | "haberler" | "arsiv";

const TAB_ITEMS: TabItem<LeagueTab>[] = [
  { key: "puan", label: "Puan" },
  { key: "fikstur", label: "Fikstür" },
  { key: "takimlar", label: "Takımlar" },
  { key: "oyuncular", label: "Oyuncular" },
  { key: "istatistik", label: "İstatistik" },
  { key: "haberler", label: "Haber" },
  { key: "arsiv", label: "Arşiv" },
];

const TAB_KEYS = TAB_ITEMS.map((item) => item.key);

/**
 * Rota anahtarını normalleştirir.
 *
 * TUZAK: `"PUAN".toLocaleLowerCase("tr")` noktasız ı üretir, düz `toLowerCase()`
 * ise "İ" için birleşik nokta bırakır; ikisi de ASCII rota anahtarıyla
 * eşleşmez. Önce I ailesi katlanır, sonra küçültülür.
 */
function normalizeKey(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/[İIı]/g, "i").toLowerCase();
}

/** Takma adlar: bildirimden/menüden gelen farklı yazımlar da doğru segmente düşer. */
const TAB_ALIASES: Record<string, LeagueTab> = {
  standings: "puan",
  puandurumu: "puan",
  fikstur: "fikstur",
  fixtures: "fikstur",
  maclar: "fikstur",
  stats: "istatistik",
  istatistikler: "istatistik",
  news: "haberler",
  haber: "haberler",
  archive: "arsiv",
  teams: "takimlar",
  takim: "takimlar",
  players: "oyuncular",
  oyuncu: "oyuncular",
  krallik: "oyuncular",
};

function resolveTab(raw: unknown): LeagueTab {
  const key = normalizeKey(raw);
  if ((TAB_KEYS as string[]).includes(key)) return key as LeagueTab;
  return TAB_ALIASES[key] ?? "puan";
}

/** Sorgu parametresi tek değer ya da dizi olarak gelebilir. */
function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/* ══════════════════════════════════════════════════════════════════════════
   Ekran kabuğu
   ══════════════════════════════════════════════════════════════════════════ */

export default function LeaguesScreen() {
  const scope = useScope();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string; leagueId?: string }>();
  const { isFavoriteLeague, toggleFavoriteLeague } = useFavorite();
  const { scrollY, scrollProps } = useHeaderScroll();
  /* İstatistik → "Tüm sıralama" Oyuncular bölmesini bu ölçütle açar. */
  const [playerSort, setPlayerSort] = useState<PlayerSort>("topScorers");

  const [tab, setTab] = useState<LeagueTab>(() => resolveTab(firstParam(params.tab)));

  // Rota parametresi sonradan değişirse (bildirime dokunma, menüden derin
  // bağlantı) görünüm ona uyar.
  const routeTab = resolveTab(firstParam(params.tab));
  useEffect(() => {
    setTab(routeTab);
    scrollY.setValue(0);
  }, [routeTab, scrollY]);

  // `leagueId` parametresi kapsamı o lige çevirir (maç listesindeki lig başlığı).
  //
  // TUZAK: parametre TEK SEFERLİK bir komuttur, kalıcı bir kısıt değil. Efekt
  // `scope` nesnesine bağlanırsa (kimliği her kapsam değişiminde yenilenir)
  // kullanıcının sonraki lig seçimi anında rotadaki eski değere geri çevrilir;
  // şehir değişiminde ise ScopeProvider'ın "seçili lig listede yok → ilk lige
  // kay" düzeltmesiyle karşılıklı setState döngüsüne girilir. Bu yüzden yalnız
  // kararlı `selectLeague` referansına bağlanır, uygulanan değer ref'te
  // işaretlenir ve parametre rotadan düşürülür.
  const routeLeagueId = Number(firstParam(params.leagueId));
  const { selectLeague, leagueId: scopeLeagueId } = scope;
  const appliedLeagueRef = useRef<number | null>(null);
  useEffect(() => {
    if (!Number.isFinite(routeLeagueId) || routeLeagueId <= 0) {
      // Parametre düştü: bir sonraki derin bağlantı aynı ligi yeniden uygulayabilsin.
      appliedLeagueRef.current = null;
      return;
    }
    if (appliedLeagueRef.current === routeLeagueId) return;
    appliedLeagueRef.current = routeLeagueId;
    router.setParams({ leagueId: undefined });
    // Zaten o ligdeysek dokunma: `selectLeague` sezonu sıfırlar, kullanıcının
    // seçtiği (ör. arşiv) sezon boşuna kaybolur.
    if (routeLeagueId !== scopeLeagueId) selectLeague(routeLeagueId);
  }, [routeLeagueId, scopeLeagueId, selectLeague, router]);

  const changeTab = useCallback(
    (next: LeagueTab) => {
      setTab(next);
      scrollY.setValue(0); // Yeni listenin tepesindeyiz; başlık yeniden açılsın.
      router.setParams({ tab: next });
    },
    [router, scrollY],
  );

  const openPlayers = useCallback(
    (sort: PlayerSort) => {
      setPlayerSort(sort);
      changeTab("oyuncular");
    },
    [changeTab],
  );
  const openStandings = useCallback(() => changeTab("puan"), [changeTab]);

  const leagueId = scope.leagueId;
  const leagueLabel = scope.leagueLabel;
  const leagueFavorite = isFavoriteLeague(leagueId);
  const toggleLeague = useCallback(() => {
    if (leagueId == null) return;
    toggleFavoriteLeague({ id: leagueId, name: leagueLabel || "Lig" });
  }, [leagueId, leagueLabel, toggleFavoriteLeague]);

  const actions = useMemo(
    () =>
      leagueId == null
        ? undefined
        : [
            {
              icon: "search-outline" as keyof typeof Ionicons.glyphMap,
              onPress: () => router.push("/ara"),
              accessibilityLabel: "Takım, oyuncu ara",
            },
            {
              icon: (leagueFavorite ? "star" : "star-outline") as keyof typeof Ionicons.glyphMap,
              onPress: toggleLeague,
              tone: leagueFavorite ? ("warn" as const) : undefined,
              accessibilityLabel: leagueFavorite ? "Ligi favorilerden çıkar" : "Ligi favoriye al",
            },
          ],
    [leagueFavorite, leagueId, toggleLeague, router],
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title={leagueLabel || "Lig"}
        scope={<ScopeChip variant="context" step="season" />}
        scrollY={scrollY}
        actions={actions}
        tabs={<Tabs items={TAB_ITEMS} value={tab} onChange={changeTab} distribute="scroll" sticky />}
        bottom={<ScopeBar showSlots={false} />}
      />

      {tab === "puan" ? (
        <StandingsPane scrollProps={scrollProps} />
      ) : tab === "fikstur" ? (
        <FixturesPane scrollProps={scrollProps} />
      ) : tab === "takimlar" ? (
        <TeamsPane scrollProps={scrollProps} />
      ) : tab === "oyuncular" ? (
        <PlayersPane scrollProps={scrollProps} initialSort={playerSort} />
      ) : tab === "istatistik" ? (
        <StatsPane
          scrollProps={scrollProps}
          onOpenPlayers={openPlayers}
          onOpenStandings={openStandings}
        />
      ) : tab === "haberler" ? (
        <NewsPane scrollProps={scrollProps} />
      ) : (
        <ArchivePane scrollProps={scrollProps} onGoStandings={openStandings} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
});
