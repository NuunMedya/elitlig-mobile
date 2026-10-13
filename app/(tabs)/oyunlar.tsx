/**
 * Oyunlar sekmesi — beş mini oyunun tek giriş kapısı.
 *
 * NE (Arena "merkez" kalıbı):
 *   1. SAHNE — Günün Testi (bugün oynandı mı, bu hafta kaç kişi yarıştı, tek
 *      mor düğme) ve dibinde kişisel haftalık özet: en iyi sıra · puan · oyun.
 *      Misafirde özetin yerine giriş çağrısı durur.
 *   2. OYNA — ilk oyun tam genişlikte öne çıkar, kalan dördü 2×2; her kartın
 *      dibinde rekor RAKAMLA yazılır (Archivo), yoksa "İlk rekorunu kur".
 *   3. SIRALAMALAR — Rekor tablosu (/siralama) ve Türkiye sıralaması (/turkiye).
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
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Animated, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Badge,
  Button,
  GradientFill,
  ListRow,
  ScreenHeader,
  SectionHeader,
  Touchable,
  refreshControlProps,
  toneColors,
  useHeaderScroll,
  useRefresh,
} from "@/components/ui";
import type { Tone } from "@/components/ui";
import type { ArenaGame } from "@/lib/api/arena";
import { formatNumber } from "@/lib/format";
import { get } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import {
  colors,
  elevate,
  hairline,
  layout,
  radius,
  space,
  textScale,
  type,
  upperTR,
} from "@/theme";

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
    blurb: "İki oyuncudan hangisi önde? Seriyi yanlışa kadar uzat.",
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

/** "2026-08-19" → "19 Ağustos". */
function dayLabelOf(isoDay: string): string {
  const parts = isoDay.split("-");
  const month = MONTHS_TR[Number(parts[1]) - 1];
  const day = Number(parts[2]);
  return month && Number.isFinite(day) ? `${day} ${month}` : "";
}

/* ===================== SAHNE: GÜNÜN TESTİ + BU HAFTA ===================== */

/**
 * EKRANIN TEK SAHNESİ (Arena §1.2) — Günün Testi'nin kendisi.
 *
 * ESKİ DÜZEN: üstte beyaz "bu hafta" şeridi, altında mor dolgulu Günün Testi
 * kartı. İki ayrı vurgu yarışıyordu ve mor dolgu Arena'da yalnız aksiyona
 * ayrılmış rengi bir yüzeye yayıyordu. YENİ: grafit sahne, içinde günün
 * sorusu ve tek mor düğme ("Oyna"); kişisel haftalık özet sahnenin dibinde
 * üç sayı olarak durur (rakam kahramandır). Misafirde sayıların yerine giriş
 * çağrısı çıkar — skorların neden sıralamaya girmediğini söyler.
 */
const DailyStage = React.memo(function DailyStage({
  dayLabel,
  ready,
  result,
  players,
  signedIn,
  statsLoading,
  bestRank,
  totalScore,
  playedGames,
  onPlay,
  onBoard,
  onSignIn,
}: {
  dayLabel: string;
  /** Cihazdaki sonuç okundu mu — okunmadan "çözülmedi" iddiası yazılmaz. */
  ready: boolean;
  /** Bugünkü resmî hak kullanıldıysa sonucu, yoksa null. */
  result: DailyResult | null;
  /** Bu hafta Günün Testi'nde yarışan oyuncu sayısı — girişsizken null. */
  players: number | null;
  signedIn: boolean;
  statsLoading: boolean;
  /** En iyi (en küçük) haftalık sıra — kaydı yoksa null. */
  bestRank: number | null;
  totalScore: number;
  playedGames: number;
  onPlay: () => void;
  onBoard: () => void;
  onSignIn: () => void;
}) {
  const done = ready && result != null;

  const title = done ? "Bugünkü testi çözdün" : "Bugünün testi hazır";
  const body = done
    ? `${result.correct}/10 doğru · ${formatNumber(result.score)} puan`
    : players != null && players > 0
      ? `Herkese aynı 10 soru. Bu hafta ${formatNumber(players)} kişi yarıştı.`
      : "Herkese aynı 10 soru — günde tek resmî hak.";

  return (
    <View style={styles.stage}>
      <GradientFill tone="ink" radius="xxl" />

      <View style={styles.stageTop}>
        <View style={styles.stageHead}>
          <View style={styles.stageIcon}>
            <Ionicons name={done ? "checkmark" : "bulb"} size={18} color={colors.brandOnDark} />
          </View>
          <Text style={styles.stageOverline} numberOfLines={1} {...textScale.badge}>
            {upperTR(dayLabel ? `Günün Testi · ${dayLabel}` : "Günün Testi")}
          </Text>
        </View>
        <Text style={styles.stageTitle} numberOfLines={1} {...textScale.dense}>
          {title}
        </Text>
        <Text style={[styles.stageBody, done ? styles.stageBodyResult : null]} numberOfLines={2} {...textScale.dense}>
          {body}
        </Text>
        <View style={styles.stageActions}>
          <Button
            label={done ? "Tekrar oyna" : "Testi çöz"}
            icon={done ? "refresh" : "play"}
            variant={done ? "secondary" : "primary"}
            onDark
            onPress={onPlay}
            accessibilityLabel={`Günün Testi. ${title}. ${body}`}
          />
        </View>
      </View>

      {/* Bu hafta — sahnenin dibinde üç sayı ya da misafir çağrısı. */}
      {!signedIn ? (
        <Touchable
          feedback="chip"
          haptic="selection"
          onPress={onSignIn}
          accessibilityRole="button"
          accessibilityLabel="Giriş yap; skorların sıralamaya yazılsın"
          style={styles.stageFoot}
        >
          <Ionicons name="log-in-outline" size={16} color={colors.brandOnDark} />
          <Text style={styles.stageFootText} numberOfLines={1} {...textScale.dense}>
            Giriş yap, skorların sıralamaya yazılsın
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.onDarkMuted} />
        </Touchable>
      ) : statsLoading ? (
        <View style={[styles.stageFoot, styles.stageStats]}>
          <Text style={styles.stageFootText} {...textScale.dense}>
            Haftalık sıran yükleniyor…
          </Text>
        </View>
      ) : (
        <Touchable
          feedback="chip"
          haptic="selection"
          onPress={onBoard}
          accessibilityRole="button"
          accessibilityLabel={`Bu hafta en iyi sıran ${bestRank ?? "yok"}, toplam ${totalScore} puan, ${playedGames} oyun. Rekor tablosunu aç.`}
          style={[styles.stageFoot, styles.stageStats]}
        >
          <StageStat value={bestRank != null ? `#${bestRank}` : "—"} label="En iyi sıra" />
          <View style={styles.stageDivider} />
          <StageStat value={formatNumber(totalScore)} label="Puan" />
          <View style={styles.stageDivider} />
          <StageStat value={`${playedGames}/${GAME_ORDER.length}`} label="Oyun" />
        </Touchable>
      )}
    </View>
  );
});

const StageStat = React.memo(function StageStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stageStat}>
      <Text style={styles.stageStatValue} {...textScale.dense}>
        {value}
      </Text>
      <Text style={styles.stageStatLabel} numberOfLines={1} {...textScale.badge}>
        {upperTR(label)}
      </Text>
    </View>
  );
});

/* ===================== OYUN KARTI (ızgara) ===================== */

const GameCard = React.memo(function GameCard({
  meta,
  ready,
  best,
  rank,
  wide,
  onPress,
}: {
  meta: GameMeta;
  /** Cihazdaki rekor okundu mu — okunmadan "İlk rekorunu kur" yazılmaz. */
  ready: boolean;
  /** Cihazdaki kişisel rekor — hiç oynanmadıysa null. */
  best: number | null;
  /** Bu haftaki sıra — girişsizken ya da kaydı yokken null. */
  rank: number | null;
  /** Izgaranın ilk (öne çıkan) kartı tam genişlikte, yatay düzende çizilir. */
  wide?: boolean;
  onPress: (route: string) => void;
}) {
  const tone = toneColors(meta.tone);
  const handlePress = useCallback(() => onPress(meta.route), [meta.route, onPress]);

  /* REKOR RAKAMLA SÖYLENİR (Arena §1.5): "1.240 gol" Archivo ile büyük,
     birimi küçük. Rekor yoksa aynı yükseklikte bir davet satırı durur ki
     depolama okunurken kart zıplamasın. */
  const record = !ready ? (
    <View style={styles.gameRecord} />
  ) : best != null ? (
    <View style={styles.gameRecord}>
      <Text style={styles.gameBest} numberOfLines={1} {...textScale.dense}>
        {formatNumber(best)}
      </Text>
      <Text style={styles.gameUnit} numberOfLines={1} {...textScale.dense}>
        {meta.unit} · rekorun
      </Text>
    </View>
  ) : (
    <View style={styles.gameRecord}>
      <Text style={styles.gameCta} numberOfLines={1} {...textScale.dense}>
        İlk rekorunu kur
      </Text>
      <Ionicons name="arrow-forward" size={13} color={colors.brandAccent} />
    </View>
  );

  return (
    <Touchable
      feedback="card"
      haptic="light"
      onPress={handlePress}
      style={[styles.gameCard, wide ? styles.gameCardWide : null]}
      accessibilityRole="button"
      accessibilityLabel={`${meta.title}. ${meta.blurb}${best != null ? ` Rekorun ${best} ${meta.unit}.` : ""}${rank != null ? ` Bu hafta ${rank}. sıradasın.` : ""}`}
    >
      <View style={styles.gameTop}>
        <View style={[styles.gameIcon, wide ? styles.gameIconWide : null, { backgroundColor: tone.dim }]}>
          <Ionicons name={meta.icon} size={wide ? 22 : 18} color={tone.fg} />
        </View>
        {wide ? (
          <View style={styles.flex}>
            <Text style={styles.gameTitle} numberOfLines={1} {...textScale.dense}>
              {meta.title}
            </Text>
            <Text style={styles.gameBlurb} numberOfLines={2} {...textScale.dense}>
              {meta.blurb}
            </Text>
          </View>
        ) : (
          <View style={styles.flex} />
        )}
        {rank != null ? <Badge label={`#${rank}`} tone="brand" size="xs" /> : null}
      </View>

      {wide ? null : (
        <>
          <Text style={styles.gameTitle} numberOfLines={1} {...textScale.dense}>
            {meta.title}
          </Text>
          <Text style={styles.gameBlurb} numberOfLines={3} {...textScale.dense}>
            {meta.blurb}
          </Text>
        </>
      )}

      <View style={styles.gameFootRule} />
      {record}
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
  // Rota çalışma zamanında seçiliyor; tipli rota birliğine `as never` ile geçilir
  // (kod tabanının kalıbı — bkz. app/(tabs)/menu.tsx).
  const openGame = useCallback((route: string) => router.push(route as never), [router]);
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

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Oyunlar"
        back
        /* Bu ekran sekme çubuğunda yuvası olmayan bir sekmedir (href: null) ve
           Menü'den açılır. Sekme gezgininde geri yığını olmayabilir; o durumda
           geldiği yere, yani Menü'ye dönülür. */
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profil"))}
        scrollY={scrollY}
        actions={headerActions}
      />

      <Animated.ScrollView
        {...scrollProps}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        {/* 1) Sahne: Günün Testi + bu haftaki özet */}
        <DailyStage
          dayLabel={dayLabel}
          ready={local.loaded}
          result={local.today}
          players={dailyStanding ? dailyStanding.totalPlayers : null}
          signedIn={signedIn}
          statsLoading={standingsLoading}
          bestRank={bestRank}
          totalScore={totalScore}
          playedGames={playedGames}
          onPlay={openDaily}
          onBoard={openBoard}
          onSignIn={openSignIn}
        />

        {/* 2) Oyun kartları — ilki öne çıkan, tam genişlik; kalan dördü 2×2. */}
        <SectionHeader title="Oyna" meta={`${GRID_GAMES.length} oyun`} />
        <View style={styles.grid}>
          {GRID_GAMES.map((meta, index) => (
            <GameCard
              key={meta.key}
              wide={index === 0}
              meta={meta}
              ready={local.loaded}
              best={local.best[meta.key] ?? null}
              rank={standingByGame[meta.key]?.entry?.rank ?? null}
              onPress={openGame}
            />
          ))}
        </View>

        {/* 3) Rekorlar */}
        <SectionHeader title="Sıralamalar" />
        <View style={styles.rows}>
          <ListRow
            leading={{ icon: "trophy", tone: "warn" }}
            title="Rekor tablosu"
            subtitle="Her oyunun haftalık ve tüm zamanlar sıralaması"
            position="first"
            onPress={openBoard}
          />
          <ListRow
            leading={{ icon: "earth", tone: "info" }}
            title="Türkiye sıralaması"
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

  /* — Sahne: Günün Testi — */
  stage: {
    marginHorizontal: layout.screenPadding,
    borderRadius: radius.xxl,
    backgroundColor: colors.inkBlock,
    overflow: "hidden",
    ...elevate(2),
  },
  stageTop: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
    gap: space.xs,
  },
  stageHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginBottom: space.xs,
  },
  stageIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  stageOverline: {
    ...type.overline,
    color: colors.brandOnDark,
    flex: 1,
  },
  stageTitle: {
    ...type.display,
    color: colors.onDark,
  },
  stageBody: {
    ...type.bodySm,
    color: colors.onDarkMuted,
  },
  stageBodyResult: {
    ...type.h4,
    color: colors.onDark,
  },
  stageActions: {
    flexDirection: "row",
    marginTop: space.md,
  },
  stageFoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: space.md,
    marginBottom: space.md,
    paddingHorizontal: space.md,
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  stageFootText: {
    ...type.label,
    color: colors.onDark,
    flex: 1,
  },
  stageStats: {
    paddingHorizontal: 0,
    paddingVertical: space.m,
    gap: 0,
  },
  stageStat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  stageStatValue: {
    ...type.metricSm,
    color: colors.onDark,
  },
  stageStatLabel: {
    ...type.overline,
    color: colors.onDarkMuted,
  },
  stageDivider: {
    width: hairline,
    alignSelf: "stretch",
    backgroundColor: colors.borderOnDark,
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
    minHeight: 150,
    padding: space.md,
    gap: space.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    ...elevate(1),
  },
  gameCardWide: {
    width: "100%",
    minHeight: 0,
  },
  gameTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    marginBottom: space.xs,
  },
  gameIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  gameIconWide: {
    width: 44,
    height: 44,
  },
  gameTitle: {
    ...type.h3,
    color: colors.textPrimary,
  },
  gameBlurb: {
    ...type.bodySm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  /* Rekor satırını açıklamadan ayıran ince çizgi; satır kartın dibine iner. */
  gameFootRule: {
    flex: 1,
    minHeight: space.s,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
    marginBottom: space.s,
  },
  gameRecord: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.xs,
    minHeight: 22,
  },
  gameBest: {
    ...type.metricSm,
    color: colors.textPrimary,
  },
  gameUnit: {
    ...type.caption,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  gameCta: {
    ...type.label,
    color: colors.brandAccent,
  },

  /* — Satır grupları — */
  rows: {
    marginHorizontal: layout.screenPadding,
  },
});
