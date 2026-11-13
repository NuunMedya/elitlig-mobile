/**
 * OYUN MERKEZİ — uygulamadaki BÜTÜN oyunların ve oyun sıralamalarının tek
 * kapısı. İçine girince uygulamadan çıkıp oyun dünyasına geçilir: koyu gece
 * stadyumu zemini, kurdeleli kategori başlıkları, kalın renkli ikon kareleri.
 *
 * MANTIK — her şey Kulüp Şehri için oynanır:
 *   · En üstte Kulüp Şehri kartı: statü, harcanabilir yıldız, sıradaki statüye
 *     ilerleme, toplanmayı bekleyen XP yıldızı ve "Şehrini geliştir".
 *   · Altında yıldızın kaynakları tek şeritte. OYUNLAR doğrudan YILDIZ verir
 *     (XP vermez): bulmaca seviyeleri (1–3 yıldız), bilgi ve arcade skorları
 *     (skora göre, günlük tavanlı), Tahmin Ligi ve Fantezi puanları (haftalık
 *     tavanlı). XP yalnız SAHADAN ve GÖREVLERDEN gelir; o da yıldıza çevrilir
 *     (10 XP = 1 yıldız, Kulüp Şehri'nde "Yıldızları topla"; 3 gün bekler).
 *     Gerçek maçlar da doğrudan yıldız verir (maç başı 25 + bonus, haftada 2).
 *   · Günlük giriş ödülü + seri kartı (components/city/DailyReward): yıldız,
 *     jeton, joker; uzun seri ödülleri ve seri koruyucu (eski "Lig Yolu
 *     günlük ödülü" bunun içindedir).
 *   · Oyunlar EŞİT satırlar halinde, yalnız kategori başlıkları altında:
 *       Bilgi yarışmaları · Bulmacalar · Arcade · Lig yarışmaları
 *     Hiçbir oyun ötekinden büyük ya da önde değildir. Her satır aynı bilgiyi
 *     verir: rekor ya da seviye ve o oyunun şehre kazandırdığı yıldız.
 *     Bulmacalar (eski "Lig Yolu" başlığı) doğrudan kendi haritasına açılır.
 *   · En altta sıralamalar, bu haftanın özeti, görevler ve kariyer.
 *
 * VERİ: rekorlar cihazdan (AsyncStorage, oyun ekranlarının yazdığı anahtarlar)
 * ve sunucudan (/api/arena/me); şehir /api/puzzle/city; bulmaca seviyesi ve
 * canları /api/puzzle/me. Misafir oynayabilir; şehir ve bulmacalar girişte.
 *
 * GÜN ANAHTARI: Günün Testi'nin sonucu `app/gunun.tsx` ile AYNI anahtarla
 * (UTC günü, toISOString) okunur.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Ellipse, Path, Polygon, Rect } from "react-native-svg";

import { DailyRewardEntry } from "@/components/city/DailyReward";
import { XpTransferBanner } from "@/components/city/XpTransferBanner";
import { Touchable } from "@/components/ui";
import { getMyArenaSummary, type ArenaGame } from "@/lib/api/arena";
import { ARENA_BEST_KEYS } from "@/lib/game/arenaKeys";
import { HUB } from "@/lib/game/hubPalette";
import { cityKeys, getCity, type CityState } from "@/lib/puzzle/api";
import type { PuzzleGameKey } from "@/lib/puzzle/types";
import { usePuzzleMe } from "@/lib/puzzle/usePuzzle";
import { useAuth } from "@/providers/AuthProvider";
import { colors, fonts, layout, radius, space, textScale, touchSlop, type } from "@/theme";

const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;
const LEFT = { x: 0, y: 0.5 } as const;
const RIGHT = { x: 1, y: 0.5 } as const;
const fmt = (n: number) => n.toLocaleString("tr-TR");
/** Bilgi + arcade oyunlarının günlük şehir yıldızı tavanı (sunucu ARENA_STARS_PER_DAY). */
const ARENA_DAILY_CAP = 30;

/* ═══════════════════════ OYUN KATALOĞU (saf veri) ═══════════════════════ */

type Category = "quiz" | "puzzle" | "arcade" | "league";

interface GameRow {
  key: string;
  category: Category;
  title: string;
  blurb: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Skor oyunu (rekor + skora göre yıldız). */
  arena?: ArenaGame;
  /** Seviyeli bulmaca (seviye + yıldız + oyuna özel can). */
  puzzle?: PuzzleGameKey;
  route: string;
  /** Giriş gerektirir mi (sunucu ilerlemesi). */
  auth?: boolean;
}

const GAMES: GameRow[] = [
  // BİLGİ YARIŞMALARI — skora göre şehir yıldızı
  { key: "gunun", category: "quiz", title: "Günün Testi", blurb: "Herkese aynı 10 soru, günde bir kez", icon: "bulb", arena: "gunun", route: "/gunun" },
  { key: "kimbu", category: "quiz", title: "Kim Bu?", blurb: "İpuçlarından gizemli oyuncuyu bul", icon: "search", arena: "kimbu", route: "/kimbu" },
  { key: "seri", category: "quiz", title: "Gol Düellosu", blurb: "İki oyuncudan hangisi daha çok gol attı?", icon: "flame", arena: "seri", route: "/arena" },
  { key: "tahmin", category: "quiz", title: "Kim Kazandı?", blurb: "Oynanmış maçların sonucunu bil: 1 · X · 2", icon: "stats-chart", arena: "tahmin", route: "/tahmin" },
  // BULMACALAR — seviye başına 1–3 yıldız
  { key: "uclu", category: "puzzle", title: "Elit Üçlü", blurb: "Kaydır, üçle, patlat: sahayı temizle", icon: "football", puzzle: "uclu", route: "/lig-yolu/uclu", auth: true },
  { key: "ucle", category: "puzzle", title: "Üçle Kazan", blurb: "Karoları rafa topla, üçlüyü patlat", icon: "layers", puzzle: "ucle", route: "/lig-yolu/ucle", auth: true },
  { key: "soyunma", category: "puzzle", title: "Soyunma Odası", blurb: "Formaları takım takım dolaplara diz", icon: "shirt", puzzle: "soyunma", route: "/lig-yolu/soyunma", auth: true },
  { key: "kantin", category: "puzzle", title: "Stadyum Kantini", blurb: "Taraftarın siparişini doğru sırayla hazırla", icon: "fast-food", puzzle: "kantin", route: "/lig-yolu/kantin", auth: true },
  { key: "kariyer", category: "puzzle", title: "Kariyer Yolu", blurb: "Mahalle sahasından yıldızlığa: şut, pas, çalım", icon: "trending-up", puzzle: "kariyer", route: "/lig-yolu/kariyer", auth: true },
  // ARCADE — skora göre şehir yıldızı
  { key: "penalti", category: "arcade", title: "Penaltı", blurb: "Seri penaltıda ligin kulüplerini geç", icon: "golf", arena: "penalti", route: "/penalti" },
  { key: "slalom", category: "arcade", title: "Slalom", blurb: "Sokakta top sür: zıpla, kay, şerit değiştir", icon: "flag", arena: "slalom", route: "/slalom" },
  { key: "sektir", category: "arcade", title: "Top Sektir", blurb: "Dokun, topu sektir, barajın arasından geçir", icon: "football-outline", arena: "sektir", route: "/sektir" },
  { key: "savunma", category: "arcade", title: "Savunma Hattı", blurb: "Oyuncularını diz, hücumu durdur, kaleni koru", icon: "shield", arena: "savunma", route: "/savunma" },
  { key: "kadro", category: "arcade", title: "Kadro Koşusu", blurb: "Kapılardan geç, kadronu büyüt, golü at", icon: "people", arena: "kadro", route: "/kadro" },
  // LİG YARIŞMALARI — gerçek maçlarla, XP → yıldız
  { key: "fantezi", category: "league", title: "Fantezi ElitLig", blurb: "Liginin oyuncularıyla haftalık 5 kişilik kadro", icon: "people-circle", route: "/fantezi" },
  { key: "tahminLigi", category: "league", title: "Tahmin Ligi", blurb: "Liginin gelecek maçlarına skor tahmini", icon: "podium", route: "/tahmin-ligi" },
  { key: "kulupArenasi", category: "league", title: "Kulüp Arenası", blurb: "Takımların haftalık arena yarışı ve derbi", icon: "shield-half", route: "/kulup-arenasi" },
];

const CATEGORIES: { key: Category; title: string; hint: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "quiz", title: "BİLGİ YARIŞMALARI", hint: "Skoruna göre şehrine yıldız", icon: "bulb" },
  { key: "puzzle", title: "BULMACALAR", hint: "Her seviye 1–3 yıldız · oyun başına 5 can", icon: "extension-puzzle" },
  { key: "arcade", title: "ARCADE", hint: "Skoruna göre şehrine yıldız", icon: "game-controller" },
  { key: "league", title: "LİG YARIŞMALARI", hint: "Gerçek maçlarla puan · Fantezi ve Tahmin yıldız verir", icon: "trophy" },
];

/** Lig yarışmalarının satır alt yazısı (oyunlar XP vermez; puan yıldıza döner). */
const LEAGUE_LINE: Record<string, string> = {
  fantezi: "Haftalık puanına göre yıldız",
  tahminLigi: "Tahmin puanına göre yıldız",
  kulupArenasi: "Takımının haftalık yarışı · yıldız vermez",
};

/** Cihazdaki rekor anahtarları (oyun ekranlarıyla birebir). */
const BEST_KEYS: Record<ArenaGame, string> = {
  seri: ARENA_BEST_KEYS.seri,
  sektir: ARENA_BEST_KEYS.sektir,
  kimbu: ARENA_BEST_KEYS.kimbu,
  slalom: ARENA_BEST_KEYS.slalom,
  gunun: "elitlig.gunun.best.v1",
  penalti: ARENA_BEST_KEYS.penalti,
  tahmin: ARENA_BEST_KEYS.tahmin,
  savunma: ARENA_BEST_KEYS.savunma,
  kadro: ARENA_BEST_KEYS.kadro,
};
const ARENA_GAMES = Object.keys(BEST_KEYS) as ArenaGame[];
const dailyResultKey = (day: string) => `elitlig.gunun.${day}.v1`;

function parseBest(raw: string | null): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function parseDaily(raw: string | null): { correct: number; total: number } | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { correct?: unknown; total?: unknown };
    const correct = Number(v.correct);
    const total = Number(v.total);
    return Number.isFinite(correct) && Number.isFinite(total) && total > 0 ? { correct, total } : null;
  } catch {
    return null;
  }
}

/* ═══════════════════════ EKRAN ═══════════════════════ */

export default function OyunlarScreen() {
  const router = useRouter();
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const signedIn = Boolean(auth.user);

  const cityQuery = useQuery({ queryKey: cityKeys.me(), queryFn: getCity, enabled: signedIn, staleTime: 60_000, retry: false });
  const city = cityQuery.data?.city;
  const puzzle = usePuzzleMe();
  const me = puzzle.data;
  const summary = useQuery({ queryKey: ["arena", "me", "summary"], queryFn: getMyArenaSummary, enabled: signedIn, staleTime: 60_000, retry: false });

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [local, setLocal] = useState<{ best: Partial<Record<ArenaGame, number>>; daily: { correct: number; total: number } | null }>({ best: {}, daily: null });
  const loadLocal = useCallback(async () => {
    const keys = [...ARENA_GAMES.map((g) => BEST_KEYS[g]), dailyResultKey(today)];
    const pairs = await AsyncStorage.multiGet(keys).catch(() => [] as readonly [string, string | null][]);
    const valueOf = (key: string) => pairs.find((p) => p[0] === key)?.[1] ?? null;
    const best: Partial<Record<ArenaGame, number>> = {};
    ARENA_GAMES.forEach((g) => {
      const v = parseBest(valueOf(BEST_KEYS[g]));
      if (v != null) best[g] = v;
    });
    setLocal({ best, daily: parseDaily(valueOf(dailyResultKey(today))) });
  }, [today]);
  useFocusEffect(
    useCallback(() => {
      void loadLocal();
    }, [loadLocal])
  );

  const bestOf = (game: ArenaGame): number | null => {
    const device = local.best[game] ?? null;
    const server = summary.data?.games?.[game]?.best ?? null;
    if (device == null) return server;
    return server == null ? device : Math.max(device, server);
  };

  // Bu haftanın özeti (sunucu): en iyi sıra, oynanan oyun, haftalık puan toplamı.
  const week = useMemo(() => {
    const games = summary.data?.games ?? {};
    let bestRank: number | null = null;
    let total = 0;
    let played = 0;
    for (const g of ARENA_GAMES) {
      const s = games[g];
      if (!s?.weekBest) continue;
      played += 1;
      total += s.weekBest;
      if (s.weekRank != null && (bestRank == null || s.weekRank < bestRank)) bestRank = s.weekRank;
    }
    return { bestRank, total, played };
  }, [summary.data]);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["arena", "me"] }),
      queryClient.invalidateQueries({ queryKey: cityKeys.me() }),
      puzzle.refetch(),
      loadLocal(),
    ]).catch(() => undefined);
    setRefreshing(false);
  }, [loadLocal, puzzle, queryClient]);

  const go = useCallback((route: string, needsAuth?: boolean) => router.push((needsAuth && !signedIn ? "/giris" : route) as never), [router, signedIn]);

  const metaOf = (g: GameRow): { line: string; stars: number | null; badge?: string | null; lives?: number | null } => {
    if (g.puzzle) {
      const p = me?.games[g.puzzle];
      const lives = me?.profile.lives_by_game?.[g.puzzle]?.lives ?? null;
      if (!signedIn) return { line: "Giriş yap, seviye seviye ilerle", stars: null };
      return { line: p ? `${p.level + 1}. seviye` : "1. seviye", stars: p?.total_stars ?? 0, lives };
    }
    if (g.arena) {
      const best = bestOf(g.arena);
      const stars = signedIn ? city?.stars.arena_by_game?.[g.arena] ?? 0 : null;
      const badge = g.key === "gunun" ? (local.daily ? `Bugün ${local.daily.correct}/${local.daily.total}` : "Bugünkü test hazır") : null;
      return { line: best != null ? `Rekor ${fmt(best)}` : "İlk rekorunu kur", stars, badge };
    }
    return { line: LEAGUE_LINE[g.key] ?? "Puanına göre yıldız", stars: null };
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={HUB.bg} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xs, paddingBottom: insets.bottom + space.giant }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={HUB.white} />}
      >
        {/* Üst şerit */}
        <View style={styles.topBar}>
          <Touchable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/menu"))}
            hitSlop={touchSlop(40)}
            style={styles.round}
            accessibilityLabel="Geri"
            haptic="light"
          >
            <Ionicons name="chevron-back" size={24} color={HUB.white} />
          </Touchable>
          <Text style={styles.topTitle} {...textScale.badge}>
            OYUN MERKEZİ
          </Text>
          <View style={styles.starPill} accessibilityLabel={`${city?.stars.available ?? 0} harcanabilir yıldız`}>
            <Ionicons name="star" size={16} color={HUB.star} />
            <Text style={styles.starPillText} {...textScale.badge}>
              {city ? fmt(city.stars.available) : "–"}
            </Text>
          </View>
        </View>

        {/* 1) KULÜP ŞEHRİ — her şey bunun için */}
        <CityHero
          signedIn={signedIn}
          city={city}
          onOpen={() => go("/kulup-sehri", true)}
          onRank={() => go("/kulup-sehri-siralama", true)}
        />

        {/* Günlük giriş ödülü ve seri (yıldız + jeton + joker; seri koruyucu) */}
        {signedIn ? <DailyRewardEntry /> : null}

        {city ? <XpTransferBanner transfer={city.xp.transfer} perStar={city.xp.per_star} /> : null}

        {/* Yıldız kaynakları */}
        <View style={styles.sources}>
          <Source icon="extension-puzzle" tint={HUB.ribbon.puzzle[0]} title="Bulmaca" text="1–3 yıldız / seviye" />
          <Source icon="game-controller" tint={HUB.ribbon.arcade[0]} title="Bilgi · Arcade" text={city ? `bugün +${city.stars.arena_today ?? 0}/${ARENA_DAILY_CAP} yıldız` : "skora göre yıldız"} />
          <Source
            icon="football"
            tint={HUB.ribbon.quiz[0]}
            title="Maç"
            text={city?.stars.match_detail ? `bu hafta ${city.stars.match_detail.week.matches}/${city.stars.match_detail.week.cap_matches} maç` : "25+ yıldız / maç"}
          />
          <Source icon="podium" tint={HUB.ribbon.league[0]} title="Lig oyunları" text="Tahmin · Fantezi puanı" />
          <Source icon="flash" tint={HUB.ribbon.career[0]} title="Saha · Görev" text="10 XP = 1 yıldız" />
        </View>

        {/* 2) OYUNLAR — eşit satırlar, yalnız kategori başlıkları */}
        {CATEGORIES.map((cat) => (
          <View key={cat.key} style={styles.section}>
            <Ribbon icon={cat.icon} title={cat.title} hint={cat.hint} colors={HUB.ribbon[cat.key]} />
            <View style={styles.list}>
              {GAMES.filter((g) => g.category === cat.key).map((g) => (
                <GameTile key={g.key} game={g} meta={metaOf(g)} onPress={() => go(g.route, g.auth)} />
              ))}
            </View>
          </View>
        ))}

        {/* 3) SIRALAMALAR */}
        <View style={styles.section}>
          <Ribbon icon="podium" title="SIRALAMALAR" hint="Haftalık ve tüm zamanlar" colors={HUB.ribbon.board} />
          {signedIn ? (
            <View style={styles.weekRow}>
              <WeekStat value={week.bestRank != null ? `${week.bestRank}.` : "–"} label="en iyi sıran" />
              <WeekStat value={week.total ? fmt(week.total) : "–"} label="haftalık puan" />
              <WeekStat value={String(week.played)} label="oyunda skor" />
            </View>
          ) : null}
          <View style={styles.boardGrid}>
            <BoardTile icon="trophy" title="Rekor tablosu" sub="Bütün oyunlar" onPress={() => go("/siralama")} />
            <BoardTile icon="business" title="Şehir sıralaması" sub="Gelişim puanı" onPress={() => go("/kulup-sehri-siralama", true)} />
            <BoardTile icon="extension-puzzle" title="Bulmaca sıralaması" sub="Toplam yıldız" onPress={() => go("/lig-yolu/siralama", true)} />
            <BoardTile icon="flash" title="XP sıralaması" sub="Oyuncu ve takım" onPress={() => go("/saha-siralamasi")} />
          </View>
        </View>

        {/* 4) GÖREVLER VE KARİYER — XP buradan, şehirde yıldıza döner */}
        <View style={styles.section}>
          <Ribbon icon="ribbon" title="GÖREVLER VE KARİYER" hint="Saha + görev XP'si · 10 XP = 1 yıldız" colors={HUB.ribbon.career} />
          <View style={styles.list}>
            <LinkRow icon="flag" title="Haftalık görevler" sub="Oyun, şehir ve saha görevleriyle XP kazan" onPress={() => go("/gorevler", true)} />
            <LinkRow icon="ribbon" title="Elit Kariyer" sub="Seviye, Elit Kart ve rozetler" onPress={() => go("/kariyer")} />
            <LinkRow icon="sparkles" title="Sezon Özeti" sub="Sezonunun paylaşılabilir hikâyesi" onPress={() => go("/sezon-ozeti")} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/* ═══════════════════════ KULÜP ŞEHRİ KARTI ═══════════════════════ */

function CityHero({
  signedIn,
  city,
  onOpen,
  onRank,
}: {
  signedIn: boolean;
  city: CityState | undefined;
  onOpen: () => void;
  onRank: () => void;
}) {
  const { width } = useWindowDimensions();
  const w = width - layout.screenPadding * 2;
  const h = 150;
  const next = city?.next_tier ?? null;
  const prog = city ? (next ? Math.max(0, Math.min(1, (city.dev - city.tier.min) / Math.max(1, next.min - city.tier.min))) : 1) : 0;
  const claim = city?.xp.claimable_stars ?? 0;
  return (
    <View style={styles.hero}>
      <View style={{ height: h }}>
        <LinearGradient colors={HUB.sky} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
        <CitySkyline w={w} h={h} />
        <View style={styles.heroTag}>
          <Ionicons name="business" size={14} color={HUB.white} />
          <Text style={styles.heroTagText} {...textScale.badge}>
            KULÜP ŞEHRİN
          </Text>
        </View>
      </View>
      <View style={styles.heroBody}>
        <Text style={styles.heroTitle} numberOfLines={1} {...textScale.dense}>
          {city ? city.tier.title : "Okul bahçesinden Avrupa devine"}
        </Text>
        <Text style={styles.heroSub} numberOfLines={2} {...textScale.dense}>
          {signedIn
            ? "Bütün oyunlar şehrine yıldız kazandırır. Yıldızlarla sahanı, tribününü ve tesislerini büyüt."
            : "Giriş yap: oyunlardan kazandığın yıldızlarla kendi futbol şehrini kur."}
        </Text>
        {city ? (
          <>
            <View style={styles.heroStats}>
              <View style={styles.heroStat}>
                <Ionicons name="star" size={18} color={HUB.star} />
                <Text style={styles.heroStatValue} {...textScale.badge}>{fmt(city.stars.available)}</Text>
                <Text style={styles.heroStatLabel} {...textScale.badge}>yıldız</Text>
              </View>
              <View style={styles.heroStat}>
                <Ionicons name="construct" size={16} color={HUB.white} />
                <Text style={styles.heroStatValue} {...textScale.badge}>
                  {city.progress.built}/{city.progress.total}
                </Text>
                <Text style={styles.heroStatLabel} {...textScale.badge}>basamak</Text>
              </View>
              {claim > 0 ? (
                <View style={[styles.heroStat, styles.heroClaim]}>
                  <Ionicons name="sparkles" size={16} color={HUB.goldInk} />
                  <Text style={[styles.heroStatValue, styles.heroClaimText]} {...textScale.badge}>+{fmt(claim)}</Text>
                  <Text style={[styles.heroStatLabel, styles.heroClaimText]} {...textScale.badge}>topla</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.track}>
              <LinearGradient colors={HUB.gold} start={LEFT} end={RIGHT} style={[styles.trackFill, { width: `${prog * 100}%` }]} />
            </View>
            <Text style={styles.heroNext} {...textScale.dense}>
              {next ? `${next.title} için ${fmt(next.min - city.dev)} gelişim puanı` : "Zirvedesin: Avrupa devi!"}
            </Text>
          </>
        ) : null}
        <View style={styles.heroButtons}>
          <Touchable onPress={onOpen} style={styles.goldBtn} haptic="medium" accessibilityRole="button" accessibilityLabel="Şehrini geliştir">
            <View style={styles.goldLip} />
            <LinearGradient colors={HUB.gold} start={TOP} end={BOTTOM} style={styles.goldFill}>
              <Ionicons name="hammer" size={20} color={HUB.goldInk} />
              <Text style={styles.goldText} {...textScale.badge}>
                {signedIn ? "ŞEHRİNİ GELİŞTİR" : "GİRİŞ YAP"}
              </Text>
            </LinearGradient>
          </Touchable>
          {signedIn ? (
            <Touchable onPress={onRank} style={styles.ghostBtn} haptic="light" accessibilityRole="button" accessibilityLabel="Şehir sıralaması">
              <Ionicons name="podium" size={20} color={HUB.white} />
            </Touchable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** Kartın alacakaranlık şehri: uzak ve yakın bina silüetleri, ışıklı pencereler, kemerli stadyum. */
function CitySkyline({ w, h }: { w: number; h: number }) {
  const scene = useMemo(() => {
    let a = 11;
    const r = () => {
      a = (a * 16807) % 2147483647;
      return a / 2147483647;
    };
    const far: { x: number; bw: number; bh: number }[] = [];
    for (let x = -10; x < w; x += 26 + r() * 18) far.push({ x, bw: 22 + r() * 16, bh: 40 + r() * 50 });
    const near: { x: number; bw: number; bh: number; win: { x: number; y: number }[] }[] = [];
    for (let x = -6; x < w; x += 34 + r() * 20) {
      if (x > w * 0.32 && x < w * 0.7) continue; // stadyuma yer
      const bw = 26 + r() * 16;
      const bh = 34 + r() * 46;
      const win: { x: number; y: number }[] = [];
      for (let wy = h - bh + 8; wy < h - 10; wy += 11) for (let wx = x + 5; wx < x + bw - 6; wx += 9) if (r() < 0.55) win.push({ x: wx, y: wy });
      near.push({ x, bw, bh, win });
    }
    return { far, near };
  }, [w, h]);
  const cx = w * 0.51;
  const base = h - 8;
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Circle cx={w * 0.84} cy={34} r={20} fill={HUB.window} opacity={0.85} />
      {scene.far.map((b, i) => (
        <Rect key={`f${i}`} x={b.x} y={h - b.bh} width={b.bw} height={b.bh} fill={HUB.skylineFar} />
      ))}
      {/* projektör hüzmeleri */}
      <Polygon points={`${cx - 70},${base - 70} ${cx - 120},0 ${cx - 40},0`} fill={HUB.beam} />
      <Polygon points={`${cx + 70},${base - 70} ${cx + 120},0 ${cx + 40},0`} fill={HUB.beam} />
      {/* stadyum: kase, kemer, saha */}
      <Path d={`M ${cx - 80} ${base} Q ${cx} ${base - 120} ${cx + 80} ${base}`} stroke={HUB.arch} strokeWidth={5} fill="none" />
      <Ellipse cx={cx} cy={base - 18} rx={86} ry={30} fill={HUB.stadiumShade} />
      <Ellipse cx={cx} cy={base - 24} rx={80} ry={24} fill={HUB.stadium} />
      <Ellipse cx={cx} cy={base - 22} rx={58} ry={14} fill={HUB.grass[1]} />
      <Ellipse cx={cx} cy={base - 22} rx={22} ry={6} fill="none" stroke={HUB.white} strokeWidth={1.4} />
      <Rect x={cx - 74} y={base - 72} width={4} height={50} fill={HUB.stadiumShade} />
      <Rect x={cx + 70} y={base - 72} width={4} height={50} fill={HUB.stadiumShade} />
      <Rect x={cx - 80} y={base - 78} width={16} height={8} fill={HUB.window} />
      <Rect x={cx + 64} y={base - 78} width={16} height={8} fill={HUB.window} />
      {scene.near.map((b, i) => (
        <React.Fragment key={`n${i}`}>
          <Rect x={b.x} y={h - b.bh} width={b.bw} height={b.bh} fill={HUB.skyline} />
          {b.win.map((p, j) => (
            <Rect key={j} x={p.x} y={p.y} width={4} height={5} fill={HUB.window} />
          ))}
        </React.Fragment>
      ))}
    </Svg>
  );
}

/* ═══════════════════════ PARÇALAR ═══════════════════════ */

function Source({ icon, tint, title, text }: { icon: keyof typeof Ionicons.glyphMap; tint: string; title: string; text: string }) {
  return (
    <View style={styles.source}>
      <View style={[styles.sourceIcon, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={15} color={HUB.white} />
      </View>
      <Text style={styles.sourceTitle} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>{title}</Text>
      <Text style={styles.sourceText} numberOfLines={2} {...textScale.badge}>{text}</Text>
    </View>
  );
}

function Ribbon({ icon, title, hint, colors: fill }: { icon: keyof typeof Ionicons.glyphMap; title: string; hint: string; colors: [string, string] }) {
  return (
    <View style={styles.ribbonRow}>
      <LinearGradient colors={fill} start={LEFT} end={RIGHT} style={styles.ribbon}>
        <Ionicons name={icon} size={16} color={HUB.white} />
        <Text style={styles.ribbonText} {...textScale.badge}>{title}</Text>
      </LinearGradient>
      <Text style={styles.ribbonHint} numberOfLines={1} {...textScale.badge}>{hint}</Text>
    </View>
  );
}

function GameTile({ game, meta, onPress }: { game: GameRow; meta: { line: string; stars: number | null; badge?: string | null; lives?: number | null }; onPress: () => void }) {
  const fill = HUB.game[game.key] ?? HUB.game.uclu;
  return (
    <Touchable onPress={onPress} style={styles.tile} haptic="selection" accessibilityRole="button" accessibilityLabel={`${game.title}. ${game.blurb}. ${meta.line}`}>
      <LinearGradient colors={fill} start={TOP} end={BOTTOM} style={styles.tileIcon}>
        <View style={styles.tileShine} />
        <Ionicons name={game.icon} size={28} color={HUB.white} />
      </LinearGradient>
      <View style={styles.tileTexts}>
        <Text style={styles.tileTitle} numberOfLines={1} {...textScale.dense}>{game.title}</Text>
        <Text style={styles.tileBlurb} numberOfLines={1} {...textScale.dense}>{game.blurb}</Text>
        <View style={styles.tileMeta}>
          <Text style={styles.tileLine} numberOfLines={1} {...textScale.badge}>{meta.badge ?? meta.line}</Text>
          {meta.stars != null ? (
            <View style={styles.metaChip}>
              <Ionicons name="star" size={11} color={HUB.star} />
              <Text style={styles.metaChipText} {...textScale.badge}>{fmt(meta.stars)}</Text>
            </View>
          ) : null}
          {meta.lives != null ? (
            <View style={styles.metaChip}>
              <Ionicons name="heart" size={11} color={HUB.heart} />
              <Text style={styles.metaChipText} {...textScale.badge}>{meta.lives}/5</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.playBtn}>
        <Ionicons name="play" size={18} color={HUB.white} />
      </View>
    </Touchable>
  );
}

function WeekStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.weekStat}>
      <Text style={styles.weekValue} {...textScale.badge}>{value}</Text>
      <Text style={styles.weekLabel} numberOfLines={1} {...textScale.badge}>{label}</Text>
    </View>
  );
}

function BoardTile({ icon, title, sub, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; onPress: () => void }) {
  return (
    <Touchable onPress={onPress} style={styles.board} haptic="selection" accessibilityRole="button" accessibilityLabel={title}>
      <LinearGradient colors={HUB.ribbon.board} start={TOP} end={BOTTOM} style={styles.boardIcon}>
        <Ionicons name={icon} size={20} color={HUB.white} />
      </LinearGradient>
      <Text style={styles.boardTitle} numberOfLines={1} {...textScale.dense}>{title}</Text>
      <Text style={styles.boardSub} numberOfLines={1} {...textScale.badge}>{sub}</Text>
    </Touchable>
  );
}

function LinkRow({ icon, title, sub, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; onPress: () => void }) {
  return (
    <Touchable onPress={onPress} style={styles.link} haptic="selection" accessibilityRole="button" accessibilityLabel={title}>
      <LinearGradient colors={HUB.ribbon.career} start={TOP} end={BOTTOM} style={styles.linkIcon}>
        <Ionicons name={icon} size={18} color={HUB.white} />
      </LinearGradient>
      <View style={styles.tileTexts}>
        <Text style={styles.linkTitle} numberOfLines={1} {...textScale.dense}>{title}</Text>
        <Text style={styles.tileBlurb} numberOfLines={1} {...textScale.dense}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={HUB.muted} />
    </Touchable>
  );
}

/* ═══════════════════════ STİLLER ═══════════════════════ */

const shadowText = { textShadowColor: HUB.inkShadow, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2 };

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.inkBlock },
  content: { paddingHorizontal: layout.screenPadding, gap: space.lg },

  topBar: { flexDirection: "row", alignItems: "center", gap: space.sm },
  round: { width: 42, height: 42, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: HUB.card, borderWidth: 2, borderColor: HUB.cardEdge },
  topTitle: { ...type.h2, fontFamily: fonts.bold, color: HUB.white, letterSpacing: 2, flex: 1, textAlign: "center", ...shadowText },
  starPill: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.md, height: 36, borderRadius: radius.pill, backgroundColor: HUB.chip, borderWidth: 2, borderColor: HUB.cardEdge },
  starPillText: { ...type.label, fontFamily: fonts.bold, color: HUB.white },

  hero: { borderRadius: radius.xxl, overflow: "hidden", borderWidth: 3, borderColor: HUB.gold[0], backgroundColor: HUB.skyline },
  heroTag: { position: "absolute", top: space.sm, left: space.sm, flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.pill, backgroundColor: HUB.chip },
  heroTagText: { ...type.micro, fontFamily: fonts.bold, color: HUB.white, letterSpacing: 1.5 },
  heroBody: { padding: space.lg, gap: space.sm },
  heroTitle: { ...type.display, fontFamily: fonts.bold, color: HUB.white, ...shadowText },
  heroSub: { ...type.bodySm, color: HUB.muted },
  heroStats: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  heroStat: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: HUB.chip },
  heroStatValue: { ...type.h3, fontFamily: fonts.bold, color: HUB.white },
  heroStatLabel: { ...type.micro, color: HUB.muted },
  heroClaim: { backgroundColor: HUB.star },
  heroClaimText: { color: HUB.goldInk },
  track: { height: 12, borderRadius: radius.pill, backgroundColor: HUB.track, overflow: "hidden" },
  trackFill: { height: 12, borderRadius: radius.pill },
  heroNext: { ...type.caption, color: HUB.muted },
  heroButtons: { flexDirection: "row", gap: space.sm, marginTop: space.xs },
  goldBtn: { flex: 1, height: 56 },
  goldLip: { position: "absolute", top: 4, left: 0, right: 0, height: 52, borderRadius: radius.pill, backgroundColor: HUB.goldLip },
  goldFill: { height: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, borderRadius: radius.pill, borderWidth: 2, borderColor: HUB.white },
  goldText: { ...type.h3, fontFamily: fonts.bold, color: HUB.goldInk, letterSpacing: 1 },
  ghostBtn: { width: 56, height: 52, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: HUB.card, borderWidth: 2, borderColor: HUB.cardEdge },

  sources: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  source: { width: "30%", flexGrow: 1, alignItems: "center", gap: 2, paddingVertical: space.sm, paddingHorizontal: space.xxs, borderRadius: radius.lg, backgroundColor: HUB.card, borderWidth: 1, borderColor: HUB.cardEdge },
  sourceIcon: { width: 28, height: 28, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  sourceTitle: { ...type.micro, fontFamily: fonts.bold, color: HUB.white },
  sourceText: { ...type.micro, color: HUB.muted, textAlign: "center" },


  section: { gap: space.sm },
  ribbonRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  ribbon: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.md, borderWidth: 2, borderColor: HUB.white },
  ribbonText: { ...type.label, fontFamily: fonts.bold, color: HUB.white, letterSpacing: 1.2, ...shadowText },
  ribbonHint: { ...type.micro, color: HUB.faint, flex: 1 },
  list: { gap: space.sm },

  tile: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.sm, paddingRight: space.md, borderRadius: radius.xl, backgroundColor: HUB.card, borderWidth: 1, borderColor: HUB.cardEdge },
  tileIcon: { width: 60, height: 60, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: HUB.white, overflow: "hidden" },
  tileShine: { position: "absolute", top: 4, left: 8, right: 8, height: 14, borderRadius: radius.pill, backgroundColor: HUB.white, opacity: 0.25 },
  tileTexts: { flex: 1, gap: 2 },
  tileTitle: { ...type.h3, fontFamily: fonts.bold, color: HUB.white },
  tileBlurb: { ...type.caption, color: HUB.muted },
  tileMeta: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: 2 },
  tileLine: { ...type.micro, fontFamily: fonts.bold, color: HUB.white, opacity: 0.9, marginRight: space.xxs },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: space.s, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: HUB.chip },
  metaChipText: { ...type.micro, fontFamily: fonts.bold, color: HUB.white },
  playBtn: { width: 38, height: 38, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: HUB.green, borderWidth: 2, borderColor: HUB.white },

  weekRow: { flexDirection: "row", gap: space.sm },
  weekStat: { flex: 1, alignItems: "center", paddingVertical: space.sm, borderRadius: radius.lg, backgroundColor: HUB.card, borderWidth: 1, borderColor: HUB.cardEdge },
  weekValue: { ...type.h2, fontFamily: fonts.bold, color: HUB.white },
  weekLabel: { ...type.micro, color: HUB.muted },
  boardGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  board: { width: "48%", flexGrow: 1, gap: space.xxs, padding: space.md, borderRadius: radius.xl, backgroundColor: HUB.card, borderWidth: 1, borderColor: HUB.cardEdge },
  boardIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginBottom: space.xs, borderWidth: 2, borderColor: HUB.white },
  boardTitle: { ...type.label, fontFamily: fonts.bold, color: HUB.white },
  boardSub: { ...type.micro, color: HUB.muted },
  link: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.sm, paddingRight: space.md, borderRadius: radius.xl, backgroundColor: HUB.card, borderWidth: 1, borderColor: HUB.cardEdge },
  linkIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: HUB.white },
  linkTitle: { ...type.label, fontFamily: fonts.bold, color: HUB.white },
});
