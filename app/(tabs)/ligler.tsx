/**
 * LİG — kapsama (il → lig → sezon) bağlı tüm verinin tek evi; alt çubukta
 * kendi sekmesidir. Eski Ana Sayfa'daki puan özeti, gol krallığı ve haber
 * şeridi de buraya taşındı.
 *
 * DÜZEN:
 *   · BAŞLIK LİGİN KENDİSİDİR: büyük başlık seçili ligin adı. Altındaki bantta
 *     uygulamanın TEK lig seçicisi `<LeaguePicker />` durur (hap "Ankara ·
 *     FREELİG · 15. Sezon ▾" + sabitlenmiş lig çipleri). Geçmiş sezonlar
 *     (eski "Arşiv" sekmesi) o seçicinin sezon adımındadır.
 *   · BAŞLIK EYLEMLERİ: ara · sabitle (raptiye — lig seçicide kısayol çipi
 *     olur, `togglePinLeague`) · takip et (yıldız — `useFollowFlow().toggle`,
 *     takip edince bildirim türleri alt sayfası açılır).
 *   · BEŞ SEKME: Puan · Fikstür · Oyuncular · İstatistik · Haber. Takımlar
 *     sekmesi kalktı: puan tablosunun her satırında takip yıldızı var ve
 *     takım sayfası satıra dokununca açılır. Puan bölmesinin altında kısa
 *     "Gol krallığı" (ilk üç) Oyuncular'a kapı açar. Her bölme
 *     `components/league/` altında kendi dosyasındadır; bu dosya yalnız
 *     kabuk, rota ve kapsam bağlantısıdır.
 *   · YOĞUN ÖLÇÜ: Lig sekmesi bir veri sekmesidir; bölmeler küçük punto
 *     (ad 12px, rakam 11px), ince satır (34–42px) ve 14px köşeli kartlarla
 *     çizilir ki tek ekrana olabildiğince çok satır sığsın. Ortak bileşenler
 *     küçültülmedi; ince varyantlar `components/league/` içindedir.
 *
 * DERİN BAĞLANTI: `/(tabs)/ligler?tab=<puan|fikstur|oyuncular|istatistik|
 * haberler>&leagueId=<id>`. Geçersiz değer sessizce "puan" olur. Eski
 * değerler kırılmaz: `takimlar` → puan; `arsiv` → puan + lig seçicinin sezon
 * adımı açılır. `leagueId` verilirse kapsam o lige çevrilir (maç listesindeki
 * lig başlığı buraya bu parametreyle gelir).
 *
 * PERFORMANS: aynı anda YALNIZ bir bölmenin listesi mount edilir; her bölme
 * kendi sorgusunu `enabled` ile açar, arka plandaki bölmeler istek atmaz.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LeaguePicker } from "@/components/LeaguePicker";
import { FixturesPane } from "@/components/league/FixturesPane";
import { NewsPane } from "@/components/league/NewsPane";
import { PlayersPane } from "@/components/league/PlayersPane";
import { StandingsPane } from "@/components/league/StandingsPane";
import { StatsPane } from "@/components/league/StatsPane";
import { ScreenHeader, Tabs, useHeaderScroll, type TabItem } from "@/components/ui";
import type { PlayerSort } from "@/lib/types";
import { useFavorite } from "@/providers/FavoriteProvider";
import { useFollowFlow } from "@/providers/FollowFlowProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors } from "@/theme";

/* ══════════════════════════════════════════════════════════════════════════
   Segmentler ve rota parametresi
   ══════════════════════════════════════════════════════════════════════════ */

type LeagueTab = "puan" | "fikstur" | "oyuncular" | "istatistik" | "haberler";

const TAB_ITEMS: TabItem<LeagueTab>[] = [
  { key: "puan", label: "Puan" },
  { key: "fikstur", label: "Fikstür" },
  { key: "oyuncular", label: "Oyuncular" },
  { key: "istatistik", label: "İstatistik" },
  { key: "haberler", label: "Haber" },
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

/**
 * Takma adlar: bildirimden/menüden gelen farklı yazımlar da doğru segmente
 * düşer. Kaldırılan sekmeler (Takımlar, Arşiv) eski bağlantılar kırılmasın
 * diye Puan'a düşer; Arşiv ayrıca sezon adımını açar (bkz. `isArchiveLink`).
 */
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
  archive: "puan",
  arsiv: "puan",
  teams: "puan",
  takim: "puan",
  takimlar: "puan",
  players: "oyuncular",
  oyuncu: "oyuncular",
  krallik: "oyuncular",
};

function resolveTab(raw: unknown): LeagueTab {
  const key = normalizeKey(raw);
  if ((TAB_KEYS as string[]).includes(key)) return key as LeagueTab;
  return TAB_ALIASES[key] ?? "puan";
}

/** Eski "Arşiv" sekmesine giden bağlantı mı? (Geçmiş sezonlar artık lig seçicide.) */
function isArchiveLink(raw: unknown): boolean {
  const key = normalizeKey(raw);
  return key === "arsiv" || key === "archive";
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
  const { isFollowing } = useFavorite();
  const flow = useFollowFlow();
  const { scrollY, scrollProps } = useHeaderScroll();
  /* İstatistik → "Tüm sıralama" Oyuncular bölmesini bu ölçütle açar. */
  const [playerSort, setPlayerSort] = useState<PlayerSort>("topScorers");

  const [tab, setTab] = useState<LeagueTab>(() => resolveTab(firstParam(params.tab)));

  // Rota parametresi sonradan değişirse (bildirime dokunma, menüden derin
  // bağlantı) görünüm ona uyar.
  const rawTab = firstParam(params.tab);
  const routeTab = resolveTab(rawTab);
  useEffect(() => {
    setTab(routeTab);
    scrollY.setValue(0);
  }, [routeTab, scrollY]);

  // Eski `?tab=arsiv` bağlantısı: Puan'a düşer ve lig seçici sezon adımında
  // açılır. Rota temiz puan anahtarına çevrilir ki sayfa geri dönüşte yeniden
  // açılmasın.
  const archiveLink = isArchiveLink(rawTab);
  const { openScopeSheet } = scope;
  useEffect(() => {
    if (!archiveLink) return;
    router.setParams({ tab: "puan" });
    openScopeSheet("season");
  }, [archiveLink, openScopeSheet, router]);

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
  const { cityId, cityLabel, isPinnedLeague, togglePinLeague } = scope;
  const leagueFollowed = isFollowing("league", leagueId);
  const leaguePinned = isPinnedLeague(leagueId);

  const toggleFollow = useCallback(() => {
    if (leagueId == null) return;
    flow.toggle({ type: "league", id: leagueId, name: leagueLabel || "Lig" });
  }, [flow, leagueId, leagueLabel]);

  const togglePin = useCallback(() => {
    if (leagueId == null || cityId == null) return;
    togglePinLeague({ cityId, cityLabel: cityLabel || "", leagueId, label: leagueLabel || "Lig" });
  }, [cityId, cityLabel, leagueId, leagueLabel, togglePinLeague]);

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
              icon: (leaguePinned ? "pin" : "pin-outline") as keyof typeof Ionicons.glyphMap,
              onPress: togglePin,
              tone: leaguePinned ? ("brand" as const) : undefined,
              accessibilityLabel: leaguePinned ? "Lig sabitlemesini kaldır" : "Ligi sabitle",
            },
            {
              icon: (leagueFollowed ? "star" : "star-outline") as keyof typeof Ionicons.glyphMap,
              onPress: toggleFollow,
              tone: leagueFollowed ? ("brand" as const) : undefined,
              accessibilityLabel: leagueFollowed ? "Lig takibini bırak" : "Ligi takip et",
            },
          ],
    [leagueFollowed, leagueId, leaguePinned, router, toggleFollow, togglePin],
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title={leagueLabel || "Lig"}
        scrollY={scrollY}
        actions={actions}
        tabs={<Tabs items={TAB_ITEMS} value={tab} onChange={changeTab} distribute="scroll" sticky />}
        bottom={<LeaguePicker />}
      />

      {tab === "puan" ? (
        <StandingsPane scrollProps={scrollProps} onOpenPlayers={openPlayers} />
      ) : tab === "fikstur" ? (
        <FixturesPane scrollProps={scrollProps} />
      ) : tab === "oyuncular" ? (
        <PlayersPane scrollProps={scrollProps} initialSort={playerSort} />
      ) : tab === "istatistik" ? (
        <StatsPane
          scrollProps={scrollProps}
          onOpenPlayers={openPlayers}
          onOpenStandings={openStandings}
        />
      ) : (
        <NewsPane scrollProps={scrollProps} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
});
