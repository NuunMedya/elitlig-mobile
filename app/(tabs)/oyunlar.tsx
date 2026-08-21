/**
 * Oyunlar sekmesi — beş mini oyunun tek giriş kapısı.
 *
 * NE:
 *   1. Kişisel durum şeridi — girişliyse bu haftaki en iyi sıra, toplam puan
 *      ve kaç oyunda skoru olduğu; girişsizse "giriş yap" çağrısı.
 *   2. "Günün Testi" öne çıkan kartı — bugün oynandı mı, bu hafta kaç kişi
 *      yarıştı, tek dokunuşla oyna.
 *   3. İki sütunlu oyun kartları — Arena, Top Sektir, Kim Bu?, Slalom.
 *   4. REKORLAR — Rekor Tablosu (/siralama) ve Türkiye Sıralaması (/turkiye).
 *
 * NEDEN SEGMENT YOK: sayfada dört blok ve dokuz basılabilir öğe var; bunları
 * sekmelere bölmek keşfi zorlaştırır, kaydırma ise bedavadır. Öğe sayısı sabit
 * ve küçük olduğu için FlatList değil ScrollView kullanılır (sanallaştırmanın
 * kurulum maliyeti burada kazancından büyük olurdu).
 *
 * NEDEN İKİ AYRI VERİ KAYNAĞI:
 *   • KİŞİSEL REKORLAR CİHAZDAN gelir — her oyun ekranı rekorunu kendi
 *     AsyncStorage anahtarına yazar (BEST_KEYS bu anahtarların birebir
 *     kopyasıdır). Böylece girişsiz oynayan da rekorunu kartında görür ve
 *     sekme çevrimdışı da dolu açılır.
 *   • HAFTALIK SIRA ve TOPLAM PUAN SUNUCUDAN gelir (arena lider tablosu) ve
 *     yalnız oturum varken sorgulanır; sıralama kimliğe bağlıdır.
 *
 * NEDEN UÇ DOĞRUDAN ÇAĞRILIYOR: `lib/api/arena.ts` içindeki `getMyArenaRank`
 * yardımcısı `period` parametresini iletmiyor ve dönüşü `Record<string,
 * unknown>`. "Bu hafta" için dönem şart olduğundan `/api/arena/leaderboard/me`
 * burada tiplenerek çağrılır; arena.ts başka bir ajanın dosyası olduğu için
 * imzası genişletilmedi (bütünleştirme ajanı isterse oraya taşıyabilir).
 *
 * NOT — GÜN ANAHTARI: Günün Testi'nin gün anahtarı `app/gunun.tsx` ile BİREBİR
 * aynı olmalı; o dosya günü `toISOString().slice(0,10)` ile (yani UTC'ye göre)
 * üretiyor. Yerel takvime geçmek, gece yarısı ile 03:00 arasında "bugün
 * oynanmadı" gösterirdi. Tarih etiketi de bu yüzden aynı dizeden türetilir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Animated, RefreshControl, StyleSheet, Text, View, type ColorValue } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Badge,
  ListRow,
  ScreenHeader,
  SectionHeader,
  Skeleton,
  Touchable,
  refreshControlProps,
  toneColors,
  useHeaderScroll,
  useRefresh,
  withAlpha,
} from "@/components/ui";
import type { Tone } from "@/components/ui";
import type { ArenaGame } from "@/lib/api/arena";
import { get } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

/* ===================== SABİTLER (saf veri) ===================== */

/**
 * Oyunların cihazdaki rekor anahtarları. Değerler ilgili oyun ekranındaki
 * `BEST_KEY` sabitiyle BİREBİR aynıdır; biri değişirse burası da değişmeli,
 * yoksa kartlar sessizce boş kalır.
 */
const BEST_KEYS: Record<ArenaGame, string> = {
  seri: "elitlig.arena.best.v1",
  sektir: "elitlig.sektir.best.v1",
  kimbu: "elitlig.kimbu.best.v1",
  slalom: "elitlig.slalom.best.v1",
  gunun: "elitlig.gunun.best.v1",
  penalti: "elitlig.penalti.best.v1",
};

/** Sorgu ve depolama okumalarının sabit sırası. */
const GAME_ORDER: ArenaGame[] = ["gunun", "penalti", "seri", "sektir", "kimbu", "slalom"];

/** Günün Testi'nin o güne ait sonucu — `app/gunun.tsx` ile aynı anahtar. */
const dailyResultKey = (day: string) => `elitlig.gunun.${day}.v1`;

/** Kart ızgarasındaki dört oyun (Günün Testi ayrı, öne çıkan kartta). */
interface GameMeta {
  key: ArenaGame;
  route: string;
  title: string;
  /** Tek cümlelik açıklama — kartta en fazla iki satır. */
  blurb: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: Tone;
  /** Rekorun birimi: "24 seri", "18 sekme". */
  unit: string;
}

const GRID_GAMES: GameMeta[] = [
  {
    key: "penalti",
    route: "/penalti",
    title: "Penaltı",
    blurb: "Nişan al, vuruş gücünü tuttur, kaleciyi geç. Üç ıska hakkın var.",
    icon: "golf",
    tone: "brand",
    unit: "gol",
  },
  {
    key: "seri",
    route: "/arena",
    title: "Arena",
    blurb: "Seri modu: iki oyuncudan hangisi önde? Yanlışa kadar uzat.",
    icon: "flame",
    tone: "warn",
    unit: "seri",
  },
  {
    key: "sektir",
    route: "/sektir",
    title: "Top Sektir",
    blurb: "Topu çime düşürme; her dokunuş bir sekme yazar.",
    icon: "football",
    tone: "win",
    unit: "sekme",
  },
  {
    key: "kimbu",
    route: "/kimbu",
    title: "Kim Bu?",
    blurb: "Gizemli oyuncuyu en az ipucuyla bil, puanı koru.",
    icon: "search",
    tone: "brand",
    unit: "puan",
  },
  {
    key: "slalom",
    route: "/slalom",
    title: "Slalom",
    blurb: "Basılı tut, konileri sıyır; hız her turda artar.",
    icon: "flag",
    tone: "danger",
    unit: "koni",
  },
];

/** Türkçe ay adları — Intl'e bağımlı kalmadan "19 Ağustos" üretmek için. */
const MONTHS_TR = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

/* ===================== SUNUCU SÖZLEŞMESİ ===================== */

interface ArenaStandingEntry {
  rank: number;
  userId: number;
  name: string;
  teamName?: string | null;
  score: number;
  date: string | null;
}

interface ArenaStanding {
  game: string;
  period: string;
  cityId: number | null;
  /** Bu dönemde skoru olan FARKLI oyuncu sayısı (sunucu DISTINCT sayar). */
  totalPlayers: number;
  /** Kullanıcının kendi en iyi kaydı — hiç oynamadıysa null. */
  entry: ArenaStandingEntry | null;
}

/**
 * Kullanıcının bir oyundaki haftalık durumu. Kapsam bilerek Türkiye geneli:
 * oyunlar sahaya değil kullanıcıya bağlıdır, şehir filtresi burada anlam
 * taşımaz (şehir kırılımı Rekor Tablosu ekranında zaten var).
 */
const fetchWeeklyStanding = (game: ArenaGame) =>
  get<ArenaStanding>("/api/arena/leaderboard/me", { game, period: "weekly" }, { retry: false });

/* ===================== SAF YARDIMCILAR ===================== */

/** Depolamadaki rekor dizesi → pozitif tam sayı ya da null. */
function parseBest(raw: string | null): number | null {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

interface DailyResult {
  score: number;
  correct: number;
}

/** Günün Testi sonucu JSON'u — bozuk kayıt "oynanmadı" sayılır. */
function parseDailyResult(raw: string | null): DailyResult | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    const score = Number(record.score);
    const correct = Number(record.correct);
    if (!Number.isFinite(score) || !Number.isFinite(correct)) return null;
    return { score: Math.round(score), correct: Math.round(correct) };
  } catch {
    return null;
  }
}

/** 1240 → "1.240" (binlik ayracı Türkçe nokta). */
function formatCount(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** "2026-08-19" → "19 Ağustos". */
function dayLabelOf(isoDay: string): string {
  const parts = isoDay.split("-");
  const month = MONTHS_TR[Number(parts[1]) - 1];
  const day = Number(parts[2]);
  return month && Number.isFinite(day) ? `${day} ${month}` : "";
}

/* ===================== KİŞİSEL DURUM ŞERİDİ ===================== */

/**
 * NEDEN İLKEL PROP: özet bir nesne olarak geçilseydi her render'da yeni
 * referans alır ve `React.memo` hiçbir şey kazandırmazdı. Üç sayı ayrı ayrı
 * geçilince şerit yalnız değerler gerçekten değişince yeniden çizilir.
 */
const WeekStrip = React.memo(function WeekStrip({
  bestRank,
  totalScore,
  playedGames,
  onPress,
}: {
  /** En iyi (en küçük) sıra — hiç kaydı yoksa null. */
  bestRank: number | null;
  totalScore: number;
  playedGames: number;
  onPress: () => void;
}) {
  return (
    <Touchable
      feedback="card"
      haptic="light"
      onPress={onPress}
      style={styles.weekCard}
      accessibilityRole="button"
      accessibilityLabel={`Bu hafta en iyi sıran ${bestRank ?? "yok"}, toplam ${totalScore} puan. Rekor tablosunu aç.`}
    >
      <View style={styles.weekHead}>
        <Ionicons name="sparkles" size={12} color={colors.brandAccent} />
        <Text style={styles.weekOverline} {...textScale.badge}>
          {upperTR("Bu hafta")}
        </Text>
        <View style={styles.flex} />
        <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
      </View>

      <View style={styles.weekStats}>
        <View style={styles.weekStat}>
          <Text style={styles.weekValueAccent} {...textScale.dense}>
            {bestRank != null ? `#${bestRank}` : "—"}
          </Text>
          <Text style={styles.weekLabel} numberOfLines={1} {...textScale.badge}>
            en iyi sıran
          </Text>
        </View>

        <View style={styles.weekDivider} />

        <View style={styles.weekStat}>
          <Text style={styles.weekValue} {...textScale.dense}>
            {formatCount(totalScore)}
          </Text>
          <Text style={styles.weekLabel} numberOfLines={1} {...textScale.badge}>
            toplam puan
          </Text>
        </View>

        <View style={styles.weekDivider} />

        <View style={styles.weekStat}>
          <Text style={styles.weekValue} {...textScale.dense}>
            {`${playedGames}/${GAME_ORDER.length}`}
          </Text>
          <Text style={styles.weekLabel} numberOfLines={1} {...textScale.badge}>
            oyun
          </Text>
        </View>
      </View>
    </Touchable>
  );
});

/* ===================== GÜNÜN TESTİ KARTI ===================== */

const DailyTestCard = React.memo(function DailyTestCard({
  dayLabel,
  ready,
  result,
  rank,
  players,
  onPress,
}: {
  dayLabel: string;
  /** Cihazdaki sonuç okundu mu — okunmadan "çözülmedi" iddiası yazılmaz. */
  ready: boolean;
  /** Bugünkü resmî hak kullanıldıysa sonucu, yoksa null. */
  result: DailyResult | null;
  /** Bu haftaki sıra — girişsizken ya da hiç oynamamışken null. */
  rank: number | null;
  /** Bu hafta yarışan oyuncu sayısı — girişsizken null. */
  players: number | null;
  onPress: () => void;
}) {
  const done = result != null;

  const title = !ready
    ? "Bugünün testi hazır"
    : done
      ? `${result.correct}/10 doğru · ${formatCount(result.score)} puan`
      : "Bugünün testini çöz";

  const subtitle = (() => {
    if (rank != null && players != null) {
      return `Bu hafta #${rank} · ${formatCount(players)} kişi yarıştı`;
    }
    if (players != null) return `Bu hafta ${formatCount(players)} kişi yarıştı`;
    return "Herkese aynı 10 soru — günde tek resmî hak";
  })();

  return (
    <Touchable
      feedback="card"
      haptic="light"
      onPress={onPress}
      style={styles.daily}
      accessibilityRole="button"
      accessibilityLabel={`Günün Testi. ${title}. ${subtitle}`}
    >
      <LinearGradient
        colors={[colors.brand, colors.brandStrong]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.dailyFill}
      >
        <View style={styles.dailyIcon}>
          <Ionicons
            name={ready && done ? "checkmark" : "bulb"}
            size={20}
            color={colors.textOnBrand}
          />
        </View>

        <View style={styles.dailyBody}>
          <Text style={styles.dailyOverline} numberOfLines={1} {...textScale.badge}>
            {upperTR(dayLabel ? `${dayLabel} · Günün Testi` : "Günün Testi")}
          </Text>
          <Text style={styles.dailyTitle} numberOfLines={1} {...textScale.dense}>
            {title}
          </Text>
          <Text style={styles.dailySub} numberOfLines={1} {...textScale.dense}>
            {subtitle}
          </Text>
        </View>

        <View style={styles.dailyPill}>
          <Text style={styles.dailyPillText} {...textScale.badge}>
            {ready && done ? "Tekrar" : "Oyna"}
          </Text>
        </View>
      </LinearGradient>
    </Touchable>
  );
});

/* ===================== OYUN KARTI (ızgara) ===================== */

const GameCard = React.memo(function GameCard({
  meta,
  ready,
  best,
  rank,
  onPress,
}: {
  meta: GameMeta;
  /** Cihazdaki rekor okundu mu — okunmadan "İlk rekorunu kur" yazılmaz. */
  ready: boolean;
  /** Cihazdaki kişisel rekor — hiç oynanmadıysa null. */
  best: number | null;
  /** Bu haftaki sıra — girişsizken ya da kaydı yokken null. */
  rank: number | null;
  onPress: (route: string) => void;
}) {
  const tone = toneColors(meta.tone);

  const handlePress = useCallback(() => onPress(meta.route), [meta.route, onPress]);

  /**
   * Tonlu zemin: kartın kimliğini rengin kendisi değil, yüzeye doğru sönen
   * ince bir tint verir. Dolu renk dört kartta yan yana durunca ekranı
   * yorar (§renk felsefesi: renk anlam taşır, dekor değildir).
   */
  const fill: readonly [ColorValue, ColorValue] = [withAlpha(tone.fg, 0.18), colors.surface1];

  return (
    <Touchable
      feedback="card"
      haptic="light"
      onPress={handlePress}
      style={styles.gameCard}
      accessibilityRole="button"
      accessibilityLabel={`${meta.title}. ${meta.blurb}${best != null ? ` Rekorun ${best} ${meta.unit}.` : ""}`}
    >
      <LinearGradient
        colors={fill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.gameFill}
      >
        <View style={styles.gameTop}>
          <View style={[styles.gameIcon, { backgroundColor: tone.dim }]}>
            <Ionicons name={meta.icon} size={18} color={tone.fg} />
          </View>
          {rank != null ? <Badge label={`#${rank}`} tone={meta.tone} size="xs" /> : null}
        </View>

        <Text style={styles.gameTitle} numberOfLines={1} {...textScale.dense}>
          {meta.title}
        </Text>
        <Text style={styles.gameBlurb} numberOfLines={2} {...textScale.dense}>
          {meta.blurb}
        </Text>

        {/* Yükseklik her durumda sabit: depolama okunurken satır kaybolup
            kart zıplamasın diye boş hâl de aynı yeri kaplar. */}
        <View style={styles.gameFoot}>
          {!ready ? null : best != null ? (
            <>
              <Ionicons name="trophy" size={11} color={colors.star} />
              <Text style={styles.gameBest} numberOfLines={1} {...textScale.badge}>
                {`${formatCount(best)} ${meta.unit}`}
              </Text>
            </>
          ) : (
            <Text style={styles.gameCta} numberOfLines={1} {...textScale.badge}>
              İlk rekorunu kur
            </Text>
          )}
        </View>
      </LinearGradient>
    </Touchable>
  );
});

/* ===================== EKRAN ===================== */

interface LocalState {
  best: Partial<Record<ArenaGame, number>>;
  today: DailyResult | null;
  loaded: boolean;
}

export default function OyunlarScreen() {
  const router = useRouter();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { scrollY, scrollProps } = useHeaderScroll();

  const signedIn = Boolean(auth.user);

  /* Gün anahtarı app/gunun.tsx ile aynı biçimde üretilir (bkz. dosya başı). */
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const dayLabel = useMemo(() => dayLabelOf(today), [today]);

  /* — Cihazdaki rekorlar ve bugünün sonucu — */
  const [local, setLocal] = useState<LocalState>({ best: {}, today: null, loaded: false });

  const loadLocal = useCallback(async () => {
    const keys = [...GAME_ORDER.map((game) => BEST_KEYS[game]), dailyResultKey(today)];
    // Depolama okunamazsa ekran çökmez; rekorlar yalnızca gizli kalır.
    const pairs = await AsyncStorage.multiGet(keys).catch(() => []);
    const valueOf = (key: string): string | null =>
      pairs.find((pair) => pair[0] === key)?.[1] ?? null;

    const best: Partial<Record<ArenaGame, number>> = {};
    GAME_ORDER.forEach((game) => {
      const parsed = parseBest(valueOf(BEST_KEYS[game]));
      if (parsed != null) best[game] = parsed;
    });

    setLocal({ best, today: parseDailyResult(valueOf(dailyResultKey(today))), loaded: true });
  }, [today]);

  /**
   * Odakta yeniden okunur: kullanıcı bir oyundan rekor kırıp geri döndüğünde
   * kart eski değeri göstermesin. Oyun ekranları rekoru senkron yazmıyor,
   * bu yüzden mount'ta bir kez okumak yetmez.
   */
  useFocusEffect(
    useCallback(() => {
      void loadLocal();
    }, [loadLocal])
  );

  /* — Haftalık sıralama (yalnız girişliyken) — */
  const standings = useQueries({
    queries: GAME_ORDER.map((game) => ({
      queryKey: ["arena", "me", "weekly", game],
      queryFn: () => fetchWeeklyStanding(game),
      enabled: signedIn,
      staleTime: 60_000,
      retry: false,
    })),
  });

  /**
   * Oyun → haftalık durum. Sorgu sırası GAME_ORDER ile birebir aynıdır.
   *
   * NEDEN useMemo YOK: `useQueries` her render'da yeni bir dizi döndürür, yani
   * memo'nun bağımlılığı zaten her seferinde değişirdi. Beş elemanlık bu eşleme
   * memo defterini tutmaktan ucuzdur; alt bileşenlere yalnız ilkel değerler
   * (sıra, rekor) geçtiği için React.memo da bundan etkilenmez.
   */
  const standingByGame: Partial<Record<ArenaGame, ArenaStanding>> = {};
  GAME_ORDER.forEach((game, index) => {
    const data = standings[index]?.data;
    if (data) standingByGame[game] = data;
  });

  let bestRank: number | null = null;
  let totalScore = 0;
  let playedGames = 0;
  GAME_ORDER.forEach((game) => {
    const entry = standingByGame[game]?.entry;
    if (!entry) return;
    playedGames += 1;
    totalScore += entry.score;
    if (bestRank == null || entry.rank < bestRank) bestRank = entry.rank;
  });

  const standingsLoading = signedIn && standings.some((query) => query.isLoading);
  const standingsRefreshing = standings.some((query) => query.isRefetching);

  const onRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["arena", "me", "weekly"] }),
      loadLocal(),
    ]);
  }, [loadLocal, queryClient]);

  /**
   * Girişsizken sunucu sorgusu hiç açılmaz; `standingsRefreshing` daima false
   * kalırdı ve gösterge anında sönerdi. `undefined` geçilince kanca kendi
   * sözünü (yerel depolama okuması) bekler.
   */
  const refresh = useRefresh(onRefresh, {
    refreshing: signedIn ? standingsRefreshing : undefined,
  });

  /**
   * RN'in `refreshControl` prop'u `ReactElement<RefreshControlProps>` bekler;
   * `useRefresh().control` ise gevşek tipli bir eleman döndürüyor ve
   * `Animated.ScrollView` üzerinde tip hatası veriyor. Kancanın asıl değeri
   * (en az 450 ms görünürlük + tetikleme haptiği) `refreshing`/`onRefresh`
   * alanlarında; gösterge bu yüzden burada kuruluyor.
   */
  const refreshControl = useMemo(
    () => <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />,
    [refresh.refreshing, refresh.onRefresh]
  );

  /* — Gezinme — */
  const openGame = useCallback((route: string) => router.push(route), [router]);
  const openDaily = useCallback(() => router.push("/gunun"), [router]);
  const openBoard = useCallback(() => router.push("/siralama"), [router]);
  const openTurkey = useCallback(() => router.push("/turkiye"), [router]);
  const openSignIn = useCallback(() => router.push("/giris"), [router]);

  const headerActions = useMemo(
    () => [
      {
        icon: "trophy-outline" as keyof typeof Ionicons.glyphMap,
        onPress: openBoard,
        accessibilityLabel: "Rekor tablosu",
      },
    ],
    [openBoard]
  );

  const dailyStanding = standingByGame.gunun;

  /**
   * Üst slot üç hâlden birini alır:
   *   • girişsiz            → giriş çağrısı (skorun neden kaybolduğunu anlatır)
   *   • girişli + yükleniyor→ iskelet (spinner değil, §yükleme stratejisi)
   *   • girişli + kaydı var → haftalık özet şeridi
   * Girişli ama bu hafta hiç skoru yoksa slot BOŞ kalır: "#— / 0 puan" satırı
   * bilgi taşımaz, yalnız ekranın tepesini üzgün bir tabloya çevirirdi.
   */
  const topSlot = !signedIn ? (
    <View style={styles.rows}>
      <ListRow
        leading={{ icon: "log-in", tone: "brand" }}
        title="Giriş yap"
        subtitle="Skorların rekor tablosuna yazılsın"
        position="single"
        onPress={openSignIn}
      />
    </View>
  ) : standingsLoading ? (
    <Skeleton width="100%" height={78} radius="lg" style={styles.stripSkeleton} />
  ) : playedGames > 0 ? (
    <WeekStrip
      bestRank={bestRank}
      totalScore={totalScore}
      playedGames={playedGames}
      onPress={openBoard}
    />
  ) : null;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Oyunlar"
        back
        /* Bu ekran sekme çubuğunda yuvası olmayan bir sekmedir (href: null) ve
           Menü'den açılır. Sekme gezgininde geri yığını olmayabilir; o durumda
           geldiği yere, yani Menü'ye dönülür. */
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/menu"))}
        subtitle="Rekor kır, sıralamaya gir"
        scrollY={scrollY}
        actions={headerActions}
      />

      <Animated.ScrollView
        {...scrollProps}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        {/* 1) Kişisel durum şeridi */}
        {topSlot}

        {/* 2) Günün Testi */}
        <DailyTestCard
          dayLabel={dayLabel}
          ready={local.loaded}
          result={local.today}
          rank={dailyStanding?.entry?.rank ?? null}
          players={dailyStanding ? dailyStanding.totalPlayers : null}
          onPress={openDaily}
        />

        {/* 3) Oyun kartları */}
        <SectionHeader title="Oyunlar" meta={`${GRID_GAMES.length} oyun`} />
        <View style={styles.grid}>
          {GRID_GAMES.map((meta) => (
            <GameCard
              key={meta.key}
              meta={meta}
              ready={local.loaded}
              best={local.best[meta.key] ?? null}
              rank={standingByGame[meta.key]?.entry?.rank ?? null}
              onPress={openGame}
            />
          ))}
        </View>

        {/* 4) Rekorlar */}
        <SectionHeader title="Rekorlar" />
        <View style={styles.rows}>
          <ListRow
            leading={{ icon: "trophy", tone: "warn" }}
            title="Rekor Tablosu"
            subtitle="Beş oyunun haftalık ve tüm zamanlar sıralaması"
            position="first"
            onPress={openBoard}
          />
          <ListRow
            leading={{ icon: "earth", tone: "info" }}
            title="Türkiye Sıralaması"
            subtitle="Tüm şehirler · oyuncu ve takım rekorları"
            position="last"
            onPress={openTurkey}
          />
        </View>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

/* ===================== STİLLER ===================== */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },

  content: {
    paddingTop: space.md,
    paddingBottom: layout.tabBarHeight + space.xxxl,
    gap: space.md,
  },

  /* — Kişisel durum şeridi — */
  stripSkeleton: {
    marginHorizontal: layout.screenPadding,
  },
  weekCard: {
    marginHorizontal: layout.screenPadding,
    backgroundColor: colors.surface1,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
    gap: space.sm,
  },
  weekHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  weekOverline: {
    ...type.micro,
    color: colors.brandAccent,
  },
  weekStats: {
    flexDirection: "row",
    alignItems: "center",
  },
  weekStat: {
    flex: 1,
    alignItems: "center",
    gap: space.xxs,
  },
  weekDivider: {
    width: hairline,
    alignSelf: "stretch",
    backgroundColor: colors.separator,
  },
  weekValue: {
    ...type.scoreSm,
    color: colors.textPrimary,
  },
  weekValueAccent: {
    ...type.scoreSm,
    color: colors.brandAccent,
  },
  weekLabel: {
    ...type.caption,
    fontWeight: "600",
    letterSpacing: 0,
    color: colors.textTertiary,
  },

  /* — Günün Testi — */
  daily: {
    marginHorizontal: layout.screenPadding,
    borderRadius: radius.xl,
    overflow: "hidden",
  },
  dailyFill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  dailyIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withAlpha(colors.textOnBrand, 0.18),
  },
  dailyBody: { flex: 1, gap: space.xxs },
  dailyOverline: {
    ...type.micro,
    color: withAlpha(colors.textOnBrand, 0.72),
  },
  dailyTitle: {
    ...type.h2,
    color: colors.textOnBrand,
  },
  dailySub: {
    ...type.caption,
    fontWeight: "600",
    letterSpacing: 0,
    color: withAlpha(colors.textOnBrand, 0.78),
  },
  dailyPill: {
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.s,
    backgroundColor: withAlpha(colors.textOnBrand, 0.22),
  },
  dailyPillText: {
    ...type.caption,
    fontWeight: "800",
    letterSpacing: 0.2,
    color: colors.textOnBrand,
  },

  /* — Oyun ızgarası — */
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: space.m,
    paddingHorizontal: layout.screenPadding,
  },
  gameCard: {
    width: "48.5%",
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: hairline,
    borderColor: colors.border,
  },
  gameFill: {
    minHeight: 132,
    padding: space.md,
    gap: space.xs,
  },
  gameTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.xxs,
  },
  gameIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  gameTitle: {
    ...type.h3,
    color: colors.textPrimary,
  },
  gameBlurb: {
    ...type.caption,
    fontWeight: "500",
    letterSpacing: 0,
    color: colors.textSecondary,
    flex: 1,
  },
  gameFoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    // Rekor satırı boşken de yer kaplar: depolama okunurken kart zıplamaz.
    minHeight: 14,
  },
  gameBest: {
    ...type.caption,
    fontWeight: "800",
    letterSpacing: 0,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  gameCta: {
    ...type.caption,
    fontWeight: "700",
    letterSpacing: 0,
    color: colors.textTertiary,
  },

  /* — Satır grupları — */
  rows: {
    marginHorizontal: layout.screenPadding,
  },
});
