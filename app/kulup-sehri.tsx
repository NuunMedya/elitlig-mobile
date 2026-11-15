/**
 * KULÜP ŞEHRİ 2.0 — /kulup-sehri (TAM EKRAN OYUN)
 *
 * Bütün oyunlardan, gerçek maçlardan, görevlerden ve günlük girişten gelen
 * yıldızlarla kurulan futbol şehri. Mahalle arası toptan Şampiyonlar Ligi
 * şampiyonluğuna 18 basamaklı bir KARİYER MERDİVENİ (16. basamak iki alt
 * adım: 19 kademe).
 *
 * EKRAN (Royal Match tarzı ev ekranı gibi; uygulama başlığı ve sekme çubuğu yok):
 *   · Kenardan kenara canlı şehir (games/sehir.js, WebView; `type:"city2"`).
 *     Sahneye üst HUD'un ve alt rafın/panelin kapladığı alan `type:"view"`
 *     ile bildirilir: kamera görünen alanı ortalar.
 *   · Üstte yüzen HUD: geri · ★ yıldız · EL kasası · jeton · ayarlar; altında
 *     lig kurdelesi (şu anki → sıradaki lig, gelişim, "YÜKSEL").
 *   · Yanlarda yuvarlak düğmeler: akademi, sezon, takım, ziyaret, hediye ·
 *     haberler, ligler, sıralama, prestij. Akademi/sezon/takım/ziyaret/
 *     sıralama/ligler şehrin ÜSTÜNDE tam ekran oyun penceresi olarak açılır
 *     (components/city2/windows/*; aynı pencereler kendi rotalarında da çizilir).
 *   · Altta tahta raf: Binalar (yatay bina rafı) · büyük bağlam düğmesi (lige
 *     yüksel / topla / sıradaki iş) · sembol yapılar.
 *   · Binaya dokununca (sahne `{type:"tap", key}` yollar ya da raftan) kamera
 *     binaya uçar ve BİNA PANELİ (game/BuildingPanel) şehrin içinde alttan
 *     açılır: ara adımlar, ana yükseltme, EL toplama, bakım, EL yükseltmeleri,
 *     aşamalar. Başarıda sahne inşaat (`build`) ya da kıvılcım (`pop`) oynatır.
 *     Boş zemine dokunmak (`tapEmpty`) ya da kapat düğmesi paneli kapatır.
 *
 *   · Bütün ayrıntılar (lig ilerlemesi, sembol yapılar, EL defteri ve "nasıl
 *     işler", günlük ödül, jeton mağazası, yıldız rehberi, maç yıldızı)
 *     karartılmış şehrin üstünde ahşap çerçeveli oyun penceresi olarak açılır
 *     (game/GameModal, game/GamePaper · GameSheet); başka ekranlarla ortak
 *     olanlar `variant="game"` ile.
 *
 * Derin bağlantılar: ?bina=<anahtar> o binanın panelini, ?pencere=<sezon|…>
 * o pencereyi şehrin üstünde açar.
 *
 * Kurallar, adlar ve maliyetler sunucudadır (elitlig-server services/city2).
 * Sunucu /city2'yi tanımıyorsa (404) eski şehir ekranı (components/city/CityV1)
 * açılır.
 */

import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, BackHandler, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAdminMutation } from "@/components/admin";
import { CityV1Screen } from "@/components/city/CityV1";
import { DailyRewardSheet } from "@/components/city/DailyReward";
import { MatchStarsSheet } from "@/components/city/MatchStars";
import { HowSheet, StarWallet, type WalletStars } from "@/components/city/StarWallet";
import { XpTransferBanner } from "@/components/city/XpTransferBanner";
import { ElHistorySheet, ElHowSheet, ElWallet, FormCard } from "@/components/city2/ElitLira";
import { LandmarkSheet, type LandmarkTab, type Placing } from "@/components/city2/Landmarks";
import { MigrationNotice, StepCelebration, type StepResult } from "@/components/city2/Notices";
import { CrestChip, SeasonEndSheet } from "@/components/city2/Season";
import { BuildingPanel, type PanelCelebration } from "@/components/city2/game/BuildingPanel";
import { BOTTOM, CityRound, GlossyButton, PaperHead, PaperRow, PaperText, TOP, fmt } from "@/components/city2/game/CityGameKit";
import { BuildingStrip, CityDock, CityTopBar, LeagueRibbon, PlaceBar, type DockTile } from "@/components/city2/game/CityHudKit";
import { CityNavProvider, type CityNav, type CityWindowKey, type CityWindowParams } from "@/components/city2/game/CityNav";
import { GameModal } from "@/components/city2/game/GameModal";
import { LeagueWindow } from "@/components/city2/game/LeagueWindow";
import { AcademyWindow } from "@/components/city2/windows/AcademyWindow";
import { LadderWindow } from "@/components/city2/windows/LadderWindow";
import { LeaderboardWindow } from "@/components/city2/windows/LeaderboardWindow";
import { SeasonWindow } from "@/components/city2/windows/SeasonWindow";
import { TeamWindow } from "@/components/city2/windows/TeamWindow";
import { VisitWindow } from "@/components/city2/windows/VisitWindow";
import { WebGame, type WebGameHandle } from "@/components/game/WebGame";
import { CoinShopSheet } from "@/components/puzzle/CoinShop";
import { ErrorState, Touchable, useReduceMotion, useToast } from "@/components/ui";
import { collectCityStars } from "@/lib/puzzle/api";
import { buildingMark, fmtEl, incomeOf, type City2OwnedLandmark, type City2CollectResult, type City2State, type City2UpgradeKind } from "@/lib/puzzle/city2";
import { CG } from "@/lib/puzzle/cityGamePalette";
import { CITY2_EL, CITY_SKY, CLUB_KITS, PREMIUM_KITS, type ClubKit } from "@/lib/puzzle/cityPalette";
import { useClubKit } from "@/lib/puzzle/saves";
import { useCity2, useCity2Actions } from "@/lib/puzzle/useCity2";
import { useDailyStatus } from "@/lib/puzzle/useDaily";
import { usePuzzleMe } from "@/lib/puzzle/usePuzzle";
import { useAuth } from "@/providers/AuthProvider";
import { colors, fonts, layout, radius, space, textScale, type } from "@/theme";

export default function ClubCityScreen() {
  const auth = useAuth();
  const { query, city2, legacy } = useCity2();
  if (!auth.user) return <Redirect href="/giris" />;
  if (legacy) return <CityV1Screen />;
  return <City2Screen query={query} city2={city2} />;
}

function walletStars(c: City2State): WalletStars {
  const s = c.stars.sources;
  return { ...s, available: c.stars.available, total: c.stars.earned, refund: c.stars.refund };
}

const WINDOW_KEYS: CityWindowKey[] = ["akademi", "sezon", "takim", "ziyaret", "siralama", "merdiven"];

type GameSheet = null | "stars" | "el" | "kit" | "settings" | "notices";

function City2Screen({ query, city2 }: { query: ReturnType<typeof useCity2>["query"]; city2: City2State | undefined }) {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const scene = useRef<WebGameHandle>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [panelH, setPanelH] = useState(0);
  const [hudH, setHudH] = useState(0);
  const [dockH, setDockH] = useState(0);
  const [strip, setStrip] = useState(false);
  const [sheet, setSheet] = useState<GameSheet>(null);
  const [win, setWin] = useState<{ key: CityWindowKey; params: CityWindowParams } | null>(null);
  const [celebrate, setCelebrate] = useState<PanelCelebration | null>(null);
  // Forma rengi hesaba bağlıdır (lib/puzzle/saves): başka telefonda da aynı.
  const [kit, setKit] = useClubKit();
  const [coinShop, setCoinShop] = useState(false);
  const puzzleMe = usePuzzleMe();
  const [howSheet, setHowSheet] = useState(false);
  const [matchSheet, setMatchSheet] = useState(false);
  const [marksSheet, setMarksSheet] = useState(false);
  const [marksTab, setMarksTab] = useState<LandmarkTab>("shop");
  const [placing, setPlacing] = useState<Placing | null>(null);
  const [picked, setPicked] = useState<City2OwnedLandmark | null>(null);
  const [stepResult, setStepResult] = useState<StepResult | null>(null);
  const [elHistory, setElHistory] = useState(false);
  const [elHow, setElHow] = useState(false);
  const [leagueSheet, setLeagueSheet] = useState(false);
  const [dailySheet, setDailySheet] = useState(false);
  const daily = useDailyStatus();
  const [collected, setCollected] = useState<{ res: City2CollectResult; key: number } | null>(null);
  const slotsBefore = useRef(0);
  const params = useLocalSearchParams<{ bina?: string; pencere?: string }>();

  const send = useCallback((cmd: Parameters<WebGameHandle["send"]>[0]) => scene.current?.send(cmd), []);
  const cheer = useCallback((text: string) => setCelebrate((c) => ({ n: (c?.n ?? 0) + 1, text })), []);

  const openBuilding = useCallback(
    (key: string) => {
      setOpen(key);
      setStrip(false);
      send({ type: "focus", key });
    },
    [send],
  );
  const closeBuilding = useCallback(() => {
    setOpen(null);
    setPanelH(0);
    send({ type: "focus", key: null });
  }, [send]);

  /* Derin bağlantı: ?bina=halisaha (merdivenden, akademiden) · ?pencere=sezon. */
  useEffect(() => {
    if (typeof params.bina === "string" && params.bina) {
      setWin(null);
      setOpen(params.bina);
    }
  }, [params.bina]);
  useEffect(() => {
    const k = params.pencere as CityWindowKey | undefined;
    if (k && WINDOW_KEYS.includes(k)) setWin({ key: k, params: {} });
  }, [params.pencere]);
  /* Sahne hazır olunca (ya da derin bağlantıyla) açık binaya odaklan. */
  useEffect(() => {
    if (ready && open) send({ type: "focus", key: open });
    // yalnız sahne hazır olduğunda bir kez (open bilerek bağımlılık değil)
  }, [ready]);

  const actions = useCity2Actions({
    onLock: (key) => {
      send({ type: "focus", key });
      send({ type: "pop", key, text: "ARA ADIM!", color: CG.star });
      cheer("ARA ADIM TAMAM!");
    },
    onStage: (key) => {
      send({ type: "focus", key });
      send({ type: "build", key });
      cheer("YÜKSELDİ!");
    },
    onStep: (res) => {
      send({ type: "celebrate" });
      setStepResult({ step: res.step, via: res.via, slotsBefore: slotsBefore.current });
    },
    onLandmark: (res) => {
      // Yeni alınan yapı doğrudan yerleştirmeye hazır: depo sekmesine geç.
      setMarksTab("depot");
      void res;
    },
    onPlace: () => {
      setPlacing(null);
    },
    onCollect: (res, building) => {
      if (res.collected > 0) setCollected((c) => ({ res, key: (c?.key ?? 0) + 1 }));
      if (res.collected < 1) return;
      if (building) {
        send({ type: "pop", key: building, text: `+${fmtEl(res.collected)} EL`, color: CITY2_EL.gain });
        cheer(`+${fmtEl(res.collected)} EL`);
      } else {
        // Hepsini topla: her binanın üstünde kendi payı.
        Object.entries(res.by_building)
          .filter(([, v]) => v > 0)
          .slice(0, 8)
          .forEach(([k, v]) => send({ type: "pop", key: k, text: `+${fmtEl(v)}`, color: CITY2_EL.gain }));
      }
    },
    onUpgrade: (res) => {
      send({ type: "pop", key: res.building, text: `${res.level}. SEVİYE`, color: CITY2_EL.gain });
      cheer("EL YÜKSELTMESİ!");
    },
  });
  const collectStars = useAdminMutation(() => collectCityStars(), {
    success: (res) => `${fmt(res.stars)} yıldız havuzuna eklendi (${fmt(res.xp)} XP)`,
    onSuccess: () => void query.refetch(),
  });
  const care = (building: string | null) =>
    actions.care.mutate(building, {
      onSuccess: () => {
        if (building) {
          send({ type: "pop", key: building, text: "BAKIM!", color: CG.btn.blue.fill[0] });
          cheer("BAKIM YAPILDI!");
        }
      },
    });
  const step = (pay?: boolean) => {
    if (city2) slotsBefore.current = city2.landmarks.grid.open_slots;
    actions.step.mutate(pay);
  };

  /* Sahneye şehrin durumu. */
  const message = useMemo(() => {
    if (!city2) return null;
    const tierOf = new Map(city2.landmarks.catalogue.map((c) => [c.key, c.tier]));
    const marks: Record<string, string> = {};
    for (const b of city2.buildings) {
      const m = buildingMark(b, city2.stars.available);
      if (m) marks[b.key] = m;
    }
    return {
      type: "city2" as const,
      buildings: Object.fromEntries(city2.buildings.map((b) => [b.key, b.stage])),
      rung: city2.ladder.rung,
      kit: { primary: kit.primary, secondary: kit.secondary },
      marks,
      landmarks: city2.landmarks.owned
        .filter((l): l is City2OwnedLandmark & { slot: string } => Boolean(l.slot))
        .map((l) => ({ id: l.id, key: l.key, slot: l.slot, tier: tierOf.get(l.key) ?? "sus" })),
      grid: { cols: city2.landmarks.grid.cols, rows: city2.landmarks.grid.rows, open_rows: city2.landmarks.grid.open_rows },
      place: placing ? { key: placing.key } : null,
    };
  }, [city2, kit, placing]);
  useEffect(() => {
    if (ready && message) send(message);
  }, [ready, message, send]);

  /* Sahnenin görünür alanı: üst HUD + (açık panel | alt raf). */
  const viewBottom = open ? panelH : dockH;
  useEffect(() => {
    if (ready) send({ type: "view", top: hudH, bottom: viewBottom });
  }, [ready, hudH, viewBottom, send]);

  const placeAt = useCallback(
    (slot: string, id: string | null) => {
      if (!city2) return;
      if (placing) {
        if (id && id !== placing.id) {
          toast.show({ message: "Bu yuva dolu; boş bir yuva seç.", tone: "warn" });
          return;
        }
        if (id && id === placing.id) {
          setPlacing(null);
          return;
        }
        actions.place.mutate(placing.id ? { id: placing.id, slot } : { key: placing.key, slot }, {
          onSuccess: () => setMarksSheet(false),
        });
        return;
      }
      if (id) {
        const l = city2.landmarks.owned.find((x) => x.id === id);
        if (l) setPicked(l);
      }
    },
    [actions.place, city2, placing, toast],
  );

  const onEvent = useCallback(
    (msg: Record<string, unknown>) => {
      if ((msg.type === "tap" || msg.type === "tapBuilding") && typeof msg.key === "string") {
        if (!placing) {
          setOpen(msg.key);
          setStrip(false);
        }
      } else if (msg.type === "tapEmpty") {
        if (open) closeBuilding();
        setStrip(false);
      } else if (msg.type === "slot" && typeof msg.slot === "string") {
        placeAt(msg.slot, typeof msg.id === "string" ? msg.id : null);
      }
    },
    [closeBuilding, open, placeAt, placing],
  );

  const startPlacing = (l: City2OwnedLandmark) => {
    closeBuilding();
    setPlacing({ id: l.id, key: l.key, title: l.title });
    setMarksSheet(false);
  };

  const chooseKit = (next: ClubKit) => {
    setKit(next);
    setSheet(null);
  };

  /* Şehrin üstündeki pencereler (aynı bileşenler kendi rotalarında da çizilir). */
  const nav = useMemo<CityNav>(
    () => ({
      inCity: true,
      params: win?.params ?? {},
      open: (key, p) => setWin({ key, params: p ?? {} }),
      close: () => setWin(null),
      building: (key) => {
        setWin(null);
        openBuilding(key);
      },
    }),
    [openBuilding, win?.params],
  );
  const openWin = useCallback((key: CityWindowKey, p?: CityWindowParams) => {
    setStrip(false);
    setWin({ key, params: p ?? {} });
  }, []);

  /* Android geri: önce pencere, sonra panel/raf/yerleştirme, sonra çıkış. */
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (win) {
        setWin(null);
        return true;
      }
      if (open) {
        closeBuilding();
        return true;
      }
      if (placing) {
        setPlacing(null);
        return true;
      }
      if (strip) {
        setStrip(false);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [closeBuilding, open, placing, strip, win]);

  const winFade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!win) return;
    winFade.setValue(reduce ? 1 : 0);
    if (!reduce) Animated.timing(winFade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [reduce, win, winFade]);

  const selected = city2?.buildings.find((b) => b.key === open) ?? null;
  const ladder = city2?.ladder ?? null;
  const unplaced = city2?.landmarks.owned.filter((l) => !l.slot) ?? [];
  const incomeBonus = useMemo(() => {
    const inc = (city2?.buildings ?? []).map((b) => incomeOf(b)).find(Boolean);
    return inc ? { prestige: inc.prestige_pct ?? 0, team: inc.team_pct ?? 0 } : null;
  }, [city2?.buildings]);
  const needs = useMemo(() => new Set((ladder?.next?.stages ?? []).filter((s) => !s.ok).map((s) => s.building)), [ladder?.next?.stages]);

  /* Haberler: bekleyen her şey tek pencerede. */
  const notices = useMemo(() => {
    if (!city2) return [];
    const list: { key: string; icon: React.ComponentProps<typeof PaperRow>["icon"]; tint: string; title: string; sub?: string; action: string; onPress: () => void }[] = [];
    const next = city2.ladder.next;
    if (next?.can_advance) list.push({ key: "step", icon: "arrow-up-circle", tint: CG.ok, title: `${next.title} ligine yükselmeye hazırsın`, action: "YÜKSEL", onPress: () => step() });
    const el = city2.el;
    if (el && el.collectable > 0) list.push({ key: "collect", icon: "cash", tint: CG.el, title: `Depolarda ${fmtEl(el.collectable)} EL birikti`, sub: el.full > 0 ? `${el.full} depo dolu: üretim durdu` : undefined, action: "TOPLA", onPress: () => actions.collect.mutate(null) });
    if (el?.care && el.care.cost > 0 && el.care.low > 0)
      list.push({ key: "care", icon: "construct", tint: CG.warn, title: `${el.care.low} tesisin bakımı düşük`, sub: `Ortalama %${el.care.avg_pct}: gelir azaldı. Hepsine bakım ${fmt(el.care.cost)} yıldız.`, action: "BAKIM", onPress: () => care(null) });
    if (daily.view?.available) list.push({ key: "daily", icon: "gift", tint: CG.side.gift[1], title: "Günlük ödülün hazır", sub: `${daily.view.streak} gün seri`, action: "AL", onPress: () => setDailySheet(true) });
    if (city2.stars.xp.claimable_stars > 0) list.push({ key: "xp", icon: "star", tint: CG.starDeep, title: `XP'nden ${fmt(city2.stars.xp.claimable_stars)} yıldız toplanabilir`, action: "TOPLA", onPress: () => collectStars.mutate(undefined) });
    if (city2.academy?.offers.length) list.push({ key: "offers", icon: "mail-unread", tint: CG.side.academy[1], title: `Akademide ${city2.academy.offers.length} transfer teklifi`, action: "AÇ", onPress: () => openWin("akademi") });
    if (unplaced.length) list.push({ key: "depot", icon: "archive", tint: CG.side.marks[1], title: `Depoda ${unplaced.length} sembol yapı bekliyor`, action: "YERLEŞTİR", onPress: () => (setMarksTab("depot"), setMarksSheet(true)) });
    const ups = city2.buildings.filter((b) => buildingMark(b, city2.stars.available) === "up");
    if (ups.length) list.push({ key: "ups", icon: "hammer", tint: CG.ok, title: `${ups.length} binada yapılacak iş var`, sub: ups.slice(0, 3).map((b) => b.title).join(" · "), action: "GÖSTER", onPress: () => openBuilding(ups[0].key) });
    return list;
    // step/care/collectStars her render yenilenir; liste veriyle değişir
  }, [city2, daily.view, unplaced.length, openWin, openBuilding]);

  /* Alt rafın büyük düğmesi: bağlama göre en önemli iş. */
  const main = useMemo(() => {
    if (!city2 || !ladder) return { label: "ŞEHİR", icon: "business" as const, tone: "grey" as const, onPress: () => undefined, disabled: true };
    if (ladder.next?.can_advance)
      return { label: "LİGE YÜKSEL", sub: ladder.next.title, icon: "arrow-up-circle" as const, tone: "green" as const, onPress: () => step(), busy: actions.step.isPending, accessibilityLabel: `Lige yüksel: ${ladder.next.title}` };
    const el = city2.el;
    if (el && el.collectable > 0)
      return { label: "TOPLA", sub: `+${fmtEl(el.collectable)} EL`, icon: "arrow-down-circle" as const, tone: "teal" as const, onPress: () => actions.collect.mutate(null), busy: actions.collect.isPending && actions.collect.variables == null, accessibilityLabel: `Bütün depoları topla, ${el.collectable} Elit Lira` };
    const ranked = city2.buildings
      .filter((b) => buildingMark(b, city2.stars.available) === "up")
      .sort((a, b) => Number(needs.has(b.key)) - Number(needs.has(a.key)));
    if (ranked[0]) return { label: "SIRADAKİ İŞ", sub: ranked[0].title, icon: "hammer" as const, tone: "gold" as const, onPress: () => openBuilding(ranked[0].key), accessibilityLabel: `Sıradaki iş: ${ranked[0].title}` };
    return { label: "LİG HEDEFİ", sub: ladder.next ? ladder.next.title : "Zirvedesin", icon: "trophy" as const, tone: "purple" as const, onPress: () => setLeagueSheet(true) };
  }, [actions.collect.isPending, actions.collect.variables, actions.step.isPending, city2, ladder, needs, openBuilding]);

  const left: { key: string; icon: React.ComponentProps<typeof CityRound>["icon"]; label: string; tone: React.ComponentProps<typeof CityRound>["tone"]; onPress: () => void; badge?: string | number | null; dot?: boolean }[] = city2
    ? [
        ...(city2.academy !== undefined ? [{ key: "akademi", icon: "school" as const, label: "Akademi", tone: "academy" as const, onPress: () => openWin("akademi"), badge: city2.academy?.offers.length || null }] : []),
        ...(city2.season ? [{ key: "sezon", icon: "calendar" as const, label: "Sezon", tone: "season" as const, onPress: () => openWin("sezon") }] : []),
        ...(city2.team?.team ? [{ key: "takim", icon: "people" as const, label: "Takım", tone: "team" as const, onPress: () => openWin("takim"), badge: city2.team.team.level }] : []),
        ...(city2.visit ? [{ key: "gez", icon: "airplane" as const, label: "Ziyaret", tone: "visit" as const, onPress: () => openWin("ziyaret") }] : []),
        { key: "gunluk", icon: "gift" as const, label: "Hediye", tone: "gift" as const, onPress: () => setDailySheet(true), dot: Boolean(daily.view?.available) },
      ]
    : [];
  const right: typeof left = city2
    ? [
        { key: "haber", icon: "notifications", label: "Haberler", tone: "board", onPress: () => setSheet("notices"), badge: notices.length || null },
        { key: "merdiven", icon: "trending-up", label: "Ligler", tone: "ladder", onPress: () => openWin("merdiven") },
        { key: "siralama", icon: "podium", label: "Sıralama", tone: "season", onPress: () => openWin("siralama") },
        ...(city2.prestige ? [{ key: "prestij", icon: "ribbon" as const, label: "Prestij", tone: "prestige" as const, onPress: () => openWin("merdiven"), dot: !ladder?.next }] : []),
      ]
    : [];
  const dockLeft: DockTile[] = [{ key: "binalar", icon: "grid", label: "Binalar", tone: "blue", onPress: () => setStrip((v) => !v), on: strip, badge: city2 ? city2.buildings.filter((b) => buildingMark(b, city2.stars.available) === "up").length || null : null }];
  const dockRight: DockTile[] = [
    {
      key: "sembol",
      icon: "sparkles",
      label: "Sembol",
      tone: "purple",
      onPress: () => {
        setMarksTab(unplaced.length ? "depot" : "shop");
        setMarksSheet(true);
      },
      badge: unplaced.length || null,
    },
  ];

  const back = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/oyunlar"));
  const elDot = city2?.el ? ((city2.el.care?.low ?? 0) > 0 ? "warn" : city2.el.collectable > 0 ? "go" : null) : null;
  const sideTop = hudH + space.sm;
  const showChrome = !open && !win;

  return (
    <CityNavProvider value={nav}>
      <View style={styles.screen}>
        <View style={StyleSheet.absoluteFill}>
          <WebGame ref={scene} game="sehir" background={CITY_SKY} accessibilityLabel="Kulüp şehri" onReady={() => setReady(true)} onEvent={onEvent} />
        </View>

        {/* Üst HUD */}
        <View style={styles.top} pointerEvents="box-none" onLayout={(e) => setHudH(e.nativeEvent.layout.height)}>
          <LinearGradient colors={CG.scrimTop} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={[styles.topInner, { paddingTop: insets.top + space.xs }]} pointerEvents="box-none">
            <CityTopBar
              onBack={back}
              stars={city2 ? city2.stars.available : null}
              onStars={() => setSheet("stars")}
              el={city2?.el ? city2.el.balance : null}
              elDot={elDot}
              onEl={() => setSheet("el")}
              coins={puzzleMe.data ? puzzleMe.data.profile.coins : null}
              onCoins={() => setCoinShop(true)}
              onSettings={() => setSheet("settings")}
            />
            {ladder ? <LeagueRibbon ladder={ladder} onPress={() => setLeagueSheet(true)} onHome={() => (open ? closeBuilding() : send({ type: "focus", key: null }))} /> : null}
            {city2?.crest && (city2.crest.frame || city2.crest.prestige_stars > 0) ? (
              <View style={styles.crest} pointerEvents="none">
                <CrestChip crest={city2.crest} />
              </View>
            ) : null}
          </View>
        </View>

        {city2 ? (
          <View style={[styles.xp, { top: sideTop }]} pointerEvents="box-none">
            <XpTransferBanner transfer={city2.stars.xp.transfer} perStar={city2.stars.xp.per_star} />
          </View>
        ) : null}

        {/* Yan düğmeler */}
        {showChrome && !placing && !strip ? (
          <>
            <View style={[styles.sideCol, styles.sideLeft, { top: sideTop }]} pointerEvents="box-none">
              {left.map((b) => (
                <CityRound key={b.key} icon={b.icon} label={b.label} tone={b.tone} onPress={b.onPress} badge={b.badge} dot={b.dot} size={50} />
              ))}
            </View>
            <View style={[styles.sideCol, styles.sideRight, { top: sideTop }]} pointerEvents="box-none">
              {right.map((b) => (
                <CityRound key={b.key} icon={b.icon} label={b.label} tone={b.tone} onPress={b.onPress} badge={b.badge} dot={b.dot} size={50} />
              ))}
            </View>
          </>
        ) : null}

        {/* Yükleniyor / hata: sahnenin ortasında oyun penceresi */}
        {query.isLoading ? (
          <View style={styles.center} pointerEvents="none">
            <View style={styles.loading}>
              <Text style={styles.loadingText} {...textScale.badge}>
                ŞEHİR KURULUYOR…
              </Text>
            </View>
          </View>
        ) : query.isError || !city2 ? (
          <View style={styles.center}>
            <View style={styles.errorBox}>
              <ErrorState error={query.error} onRetry={() => query.refetch()} />
            </View>
          </View>
        ) : null}

        {/* Alt raf / yerleştirme şeridi */}
        {city2 && !open && !win ? (
          <View style={styles.bottom} pointerEvents="box-none" onLayout={(e) => setDockH(e.nativeEvent.layout.height)}>
            {placing ? (
              <PlaceBar
                title={placing.title}
                bottomInset={insets.bottom}
                onGrid={() => {
                  setMarksTab("grid");
                  setMarksSheet(true);
                }}
                onCancel={() => setPlacing(null)}
              />
            ) : (
              <>
                {strip ? <BuildingStrip buildings={city2.buildings} available={city2.stars.available} needs={needs} onOpen={openBuilding} /> : null}
                <CityDock left={dockLeft} right={dockRight} main={main} bottomInset={insets.bottom} />
              </>
            )}
          </View>
        ) : null}

        {/* Bina paneli: şehrin içinde, alttan */}
        {selected && city2 ? (
          <BuildingPanel
            b={selected}
            city2={city2}
            busy={actions.busy}
            pending={{
              lock: actions.lock.isPending && actions.lock.variables?.building === selected.key ? actions.lock.variables.lock : null,
              stage: actions.stage.isPending && actions.stage.variables === selected.key,
              collect: actions.collect.isPending && actions.collect.variables === selected.key,
              care: actions.care.isPending && actions.care.variables === selected.key,
              upgrade: actions.upgrade.isPending && actions.upgrade.variables?.building === selected.key ? actions.upgrade.variables.kind : null,
            }}
            onClose={closeBuilding}
            onLock={(lock) => actions.lock.mutate({ building: selected.key, lock })}
            onStage={() => actions.stage.mutate(selected.key)}
            onCollect={() => actions.collect.mutate(selected.key)}
            onUpgrade={(kind: City2UpgradeKind) => actions.upgrade.mutate({ building: selected.key, kind })}
            onCare={city2.el?.care ? () => care(selected.key) : undefined}
            onAcademy={() => openWin("akademi")}
            onLeague={() => setLeagueSheet(true)}
            celebrate={celebrate}
            onHeight={setPanelH}
          />
        ) : null}

        {/* Şehrin üstündeki pencere */}
        {win ? (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: winFade, transform: [{ scale: winFade.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }] }]}>
            {win.key === "akademi" ? (
              <AcademyWindow />
            ) : win.key === "sezon" ? (
              <SeasonWindow />
            ) : win.key === "takim" ? (
              <TeamWindow />
            ) : win.key === "ziyaret" ? (
              <VisitWindow />
            ) : win.key === "siralama" ? (
              <LeaderboardWindow key={win.params.tab ?? "step"} />
            ) : (
              <LadderWindow />
            )}
          </Animated.View>
        ) : null}

        {/* ── Oyun pencereleri ── */}
        <GameModal visible={sheet === "stars"} onClose={() => setSheet(null)} title="Yıldızların" surface="page">
          {city2 ? (
            <>
              <StarWallet
                stars={walletStars(city2)}
                xp={city2.stars.xp}
                collecting={collectStars.isPending}
                onCollect={() => collectStars.mutate(undefined)}
                onHow={() => {
                  setSheet(null);
                  setHowSheet(true);
                }}
                onMatch={() => {
                  setSheet(null);
                  setMatchSheet(true);
                }}
              />
              <Text style={styles.pageLead} {...textScale.long}>
                Yıldız şehrin asıl parasıdır: ara adımlar, ana yükseltmeler, tesis bakımı ve sembol yapılar yıldızla alınır. Oyun oynayarak, maçlarla, görevlerle ve günlük girişle kazanılır.
              </Text>
            </>
          ) : null}
        </GameModal>

        <GameModal visible={sheet === "el"} onClose={() => setSheet(null)} title="Elit Lira kasası">
          {city2?.el ? (
            <>
              <ElWallet
                el={city2.el}
                buildings={city2.buildings}
                collecting={actions.collect.isPending && actions.collect.variables == null}
                result={collected?.res ?? null}
                burstKey={collected?.key ?? 0}
                onCollect={() => actions.collect.mutate(null)}
                onHistory={() => setElHistory(true)}
                onHow={() => setElHow(true)}
                onBuilding={(key) => {
                  setSheet(null);
                  openBuilding(key);
                }}
              />
              {city2.el.care ? (
                <WalletCard icon="construct" tint={city2.el.care.low ? CG.warn : CG.ok} title={`Tesis bakımı · ortalama %${city2.el.care.avg_pct}`} text={`${city2.el.care.text} Bakım günde %${city2.el.care.decay_per_day} düşer, en çok %${city2.el.care.floor}'e iner.`}>
                  <GlossyButton
                    label={city2.el.care.cost > 0 ? (city2.el.care.cost > city2.stars.available ? `${fmt(city2.el.care.cost - city2.stars.available)} YILDIZ EKSİK` : "HEPSİNE BAKIM") : "BÜTÜN TESİSLER BAKIMLI"}
                    icon="construct"
                    tone={city2.el.care.cost > 0 ? "blue" : "grey"}
                    small
                    stars={city2.el.care.cost > 0 ? city2.el.care.cost : null}
                    disabled={city2.el.care.cost < 1 || city2.el.care.cost > city2.stars.available || actions.busy}
                    busy={actions.care.isPending && actions.care.variables == null}
                    onPress={() => care(null)}
                  />
                </WalletCard>
              ) : null}
              {city2.el.star_trade ? (
                <WalletCard
                  icon="swap-horizontal"
                  tint={CG.starDeep}
                  title={`Yıldıza çevir · bu hafta ${city2.el.star_trade.used}/${city2.el.star_trade.per_week}`}
                  text={`${fmtEl(city2.el.star_trade.el)} EL = ${city2.el.star_trade.stars} yıldız. Haftada en çok ${city2.el.star_trade.per_week} kez; Pazartesi yenilenir.`}
                >
                  <GlossyButton
                    label={city2.el.star_trade.left < 1 ? "BU HAFTANIN HAKKI BİTTİ" : city2.el.balance < city2.el.star_trade.el ? `${fmtEl(city2.el.star_trade.el - city2.el.balance)} EL EKSİK` : `${city2.el.star_trade.stars} YILDIZ AL`}
                    icon="star"
                    tone="gold"
                    small
                    el={city2.el.star_trade.left > 0 ? city2.el.star_trade.el : null}
                    disabled={city2.el.star_trade.left < 1 || city2.el.balance < city2.el.star_trade.el || actions.busy}
                    busy={actions.elStars.isPending}
                    onPress={() => actions.elStars.mutate(undefined)}
                  />
                </WalletCard>
              ) : null}
              <FormCard form={city2.el.form} />
            </>
          ) : null}
        </GameModal>

        <GameModal visible={sheet === "notices"} onClose={() => setSheet(null)} title="Kulüp haberleri">
          {notices.length ? (
            notices.map((n) => (
              <PaperRow
                key={n.key}
                icon={n.icon}
                tint={n.tint}
                title={n.title}
                sub={n.sub}
                right={
                  <GlossyButton
                    label={n.action}
                    tone="green"
                    small
                    disabled={actions.busy}
                    onPress={() => {
                      setSheet(null);
                      n.onPress();
                    }}
                    style={styles.noticeBtn}
                  />
                }
              />
            ))
          ) : (
            <PaperRow icon="checkmark-circle" tint={CG.ok} title="Her şey yolunda" sub="Bekleyen iş yok. Oyun oynayıp yıldız kazan, şehrini büyüt." done />
          )}
        </GameModal>

        <GameModal visible={sheet === "settings"} onClose={() => setSheet(null)} title="Şehir ayarları" footer={<GlossyButton label="KAPAT" icon="close" tone="green" small onPress={() => setSheet(null)} />}>
          <SettingsRow icon="color-palette" tint={CG.side.kit[1]} title="Kulüp renkleri" sub={kit.name} onPress={() => setSheet("kit")} />
          <SettingsRow icon="disc" tint={CG.starDeep} title="Jeton mağazası" sub={puzzleMe.data ? `${puzzleMe.data.profile.coins.toLocaleString("tr-TR")} jeton` : "Yıldız takası"} onPress={() => (setSheet(null), setCoinShop(true))} />
          <SettingsRow icon="trophy" tint={CG.league[1]} title="Nasıl ilerlerim?" sub="Ara adım → ana yükseltme → lig" onPress={() => (setSheet(null), setLeagueSheet(true))} />
          <SettingsRow icon="help-circle" tint={CG.side.visit[1]} title="Yıldızlar nereden gelir?" onPress={() => (setSheet(null), setHowSheet(true))} />
          <SettingsRow icon="options" tint={CG.inkSoft} title="Uygulama ayarları" sub="Hareketi azalt, bildirimler" onPress={() => (setSheet(null), router.push("/ayarlar"))} />
        </GameModal>

        <GameModal visible={sheet === "kit"} onClose={() => setSheet(null)} title="Kulüp renkleri">
          <PaperText center>Formalar, çatılar, bayraklar ve tabelalar bu renklerle boyanır.</PaperText>
          <View style={styles.kits}>
            {[...CLUB_KITS, ...PREMIUM_KITS].map((k) => {
              const premium = PREMIUM_KITS.includes(k);
              const owned = !premium || Boolean(puzzleMe.data?.profile.coin_shop?.kits.find((x) => x.key === k.key)?.owned);
              const on = k.key === kit.key;
              return (
                <Touchable
                  key={k.key}
                  onPress={() => (owned ? chooseKit(k) : (setSheet(null), setCoinShop(true)))}
                  haptic="selection"
                  style={[styles.kit, on ? styles.kitOn : null]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={owned ? k.name : `${k.name}, jeton mağazasında açılır`}
                >
                  <View style={styles.kitSwatch}>
                    <View style={[styles.kitHalf, { backgroundColor: k.primary }]} />
                    <View style={[styles.kitHalf, { backgroundColor: k.secondary }]} />
                  </View>
                  <Text style={styles.kitName} numberOfLines={1} {...textScale.dense}>
                    {k.name}
                  </Text>
                  {!owned ? <PaperHead title="JETON" /> : null}
                </Touchable>
              );
            })}
          </View>
        </GameModal>

        {/* ── Ayrıntı pencereleri: hepsi şehrin üstünde ahşap çerçeveli oyun penceresi ── */}
        <LeagueWindow
          visible={leagueSheet}
          onClose={() => setLeagueSheet(false)}
          ladder={ladder}
          buildings={city2?.buildings ?? []}
          busy={actions.step.isPending}
          onAdvance={(pay) => step(pay)}
          onBuilding={(key) => {
            setLeagueSheet(false);
            openBuilding(key);
          }}
          onLadder={() => {
            setLeagueSheet(false);
            openWin("merdiven");
          }}
        />
        <DailyRewardSheet visible={dailySheet} onClose={() => setDailySheet(false)} variant="game" />
        <ElHistorySheet visible={elHistory} onClose={() => setElHistory(false)} el={city2?.el ?? null} />
        <ElHowSheet visible={elHow} onClose={() => setElHow(false)} el={city2?.el ?? null} bonus={incomeBonus} />
        <LandmarkSheet
          visible={marksSheet}
          onClose={() => setMarksSheet(false)}
          tab={marksTab}
          onTab={setMarksTab}
          landmarks={city2?.landmarks ?? null}
          ladder={ladder}
          beauty={city2?.beauty ?? 0}
          available={city2?.stars.available ?? 0}
          busy={actions.busy}
          placing={placing}
          onBuy={(key) => actions.landmark.mutate(key)}
          onPlace={startPlacing}
          onStore={(l) => actions.place.mutate({ id: l.id, slot: null })}
          onSlot={placeAt}
          onCancelPlacing={() => setPlacing(null)}
        />
        <GameModal
          visible={Boolean(picked)}
          onClose={() => setPicked(null)}
          title={picked?.title ?? "Sembol yapı"}
          footer={
            picked ? (
              <>
                <GlossyButton label="TAŞI" sub="Başka bir boş yuvaya koy" icon="move" tone="blue" onPress={() => (setPicked(null), startPlacing(picked))} />
                <GlossyButton
                  label="DEPOYA KALDIR"
                  icon="archive"
                  tone="gold"
                  small
                  disabled={actions.busy}
                  onPress={() => {
                    setPicked(null);
                    actions.place.mutate({ id: picked.id, slot: null });
                  }}
                />
              </>
            ) : null
          }
        >
          <PaperText center>Depoya kaldırılan yapı güzellik puanından düşer; istediğinde yeniden yerleştirirsin.</PaperText>
        </GameModal>
        <MigrationNotice city2={city2} />
        <SeasonEndSheet
          city2={city2}
          onPlace={() => {
            setMarksTab("depot");
            setMarksSheet(true);
          }}
        />
        <StepCelebration result={stepResult} city2={city2} onClose={() => setStepResult(null)} />
        <CoinShopSheet
          variant="game"
          visible={coinShop}
          onClose={() => setCoinShop(false)}
          onKitBought={(key) => {
            const next = PREMIUM_KITS.find((k) => k.key === key);
            if (next) chooseKit(next);
          }}
        />
        <MatchStarsSheet variant="game" visible={matchSheet} onClose={() => setMatchSheet(false)} detail={city2?.stars.sources.match_detail} total={city2?.stars.sources.match ?? 0} />
        <HowSheet
          variant="game"
          visible={howSheet}
          onClose={() => setHowSheet(false)}
          stars={city2 ? walletStars(city2) : undefined}
          xp={city2?.stars.xp}
          onGames={() => router.push("/(tabs)/oyunlar")}
          onQuests={() => router.push("/gorevler")}
        />
      </View>
    </CityNavProvider>
  );
}

/** Kasa penceresindeki parşömen kartı (bakım, yıldıza çevir). */
function WalletCard({ icon, tint, title, text, children }: { icon: React.ComponentProps<typeof PaperRow>["icon"]; tint: string; title: string; text: string; children: React.ReactNode }) {
  return (
    <View style={styles.walletCard}>
      <PaperRow icon={icon} tint={tint} title={title} sub={text}>
        {children}
      </PaperRow>
    </View>
  );
}

function SettingsRow({ icon, tint, title, sub, onPress }: { icon: React.ComponentProps<typeof PaperRow>["icon"]; tint: string; title: string; sub?: string; onPress: () => void }) {
  return (
    <Touchable onPress={onPress} haptic="selection" accessibilityRole="button" accessibilityLabel={title}>
      <PaperRow icon={icon} tint={tint} title={title} sub={sub} right={<View style={styles.chev} />} />
    </Touchable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CITY_SKY },
  top: { position: "absolute", top: 0, left: 0, right: 0 },
  topInner: { paddingHorizontal: layout.screenPadding, paddingBottom: space.md, gap: space.sm },
  crest: { alignSelf: "center" },
  xp: { position: "absolute", left: layout.screenPadding, right: layout.screenPadding, zIndex: 3 },
  sideCol: { position: "absolute", gap: space.sm },
  sideLeft: { left: space.xxs },
  sideRight: { right: space.xxs },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0 },
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: space.xl },
  loading: { paddingHorizontal: space.xl, paddingVertical: space.md, borderRadius: radius.pill, backgroundColor: CG.dim, borderWidth: 2, borderColor: CG.white },
  loadingText: { ...type.label, fontFamily: fonts.bold, color: CG.white, letterSpacing: 1 },
  errorBox: { alignSelf: "stretch", padding: space.md, borderRadius: radius.xl, backgroundColor: CG.paper[0], borderWidth: 3, borderColor: CG.woodEdge },
  pageLead: { ...type.bodySm, color: colors.textSecondary },
  noticeBtn: { alignSelf: "center", minWidth: 92 },
  walletCard: { borderRadius: radius.lg, backgroundColor: CG.paper[0] },
  chev: { width: 10, height: 10, borderTopWidth: 3, borderRightWidth: 3, borderColor: CG.inkSoft, transform: [{ rotate: "45deg" }], marginRight: space.sm },
  kits: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  kit: { width: "47%", flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.sm, borderRadius: radius.lg, backgroundColor: CG.paperRow, borderWidth: 2, borderColor: CG.clear },
  kitOn: { borderColor: CG.btn.gold.fill[1], backgroundColor: CG.paperRowOn },
  kitSwatch: { width: 30, height: 30, borderRadius: radius.pill, overflow: "hidden", flexDirection: "row", borderWidth: 2, borderColor: CG.white },
  kitHalf: { flex: 1 },
  kitName: { ...type.bodySm, fontFamily: fonts.bold, color: CG.ink, flex: 1 },
});
