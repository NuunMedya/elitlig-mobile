/**
 * PENALTI — Lig Yolu oyun bileşeni (WebView bölüm modu).
 *
 * Oyunun kendisi games/penalti.js'tedir (Canvas 2D, WebView içinde); bu
 * bileşen yalnız köprüdür (docs/oyun-yenileme-2026-11.md §2):
 *   RN → oyun : config {levelMode:true, level, boosters, boosterStock, roster,
 *               perks, sound, reduceMotion, hudInset} · start · booster ·
 *               boosterDeclined ·
 *               continue · giveUp · pause / resume
 *   oyun → RN : ready · levelInfo · useBooster {key} (canlı güçlendirici
 *               isteği: stok çerçevede, düşerse "booster" döner) · fail ·
 *               over {score, stats:{level, won, stars, …}}
 *
 * DEVAM (reklam): oyun "fail" gönderince çerçevenin `requestContinue`'una
 * sorulur ("+1 şut"); evetse "continue" (oyun +1 şut / son kaçan atışı yeniden
 * attırır), hayırsa ya da çerçeve sunmuyorsa "giveUp" (oyun "over" gönderir).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useGameRoster } from "@/components/game/useGameRoster";
import { PAUSE_HUD_INSET } from "@/components/game/HudPauseButton";
import { useLevelArenaScore } from "@/components/game/useLevelArenaScore";
import { WebGame, type GameCommand, type GameOverPayload, type WebGameHandle } from "@/components/game/WebGame";
import { useReduceMotion } from "@/components/ui";
import { getPlayerCareer } from "@/lib/api/career";
import type { PuzzleGameProps } from "@/lib/puzzle/types";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";

/** Arena oyunlarıyla ortak ses tercihi (ArenaGameScreen ile aynı anahtar). */
const SOUND_KEY = "elitlig.arena.sound.v1";
/** Sağ üstteki durdur düğmesinin (çerçeve bindirir) köşesi: oyun HUD'u orayı boş bırakır. */
const HUD_INSET = PAUSE_HUD_INSET;
/** Oyunun tanıdığı güçlendirici anahtarları (games/penalti.js applyBooster). */
const KEYS = ["nisan", "ek_sut"] as const;

/** Bölüm modu komutları: WebGame'in GameCommand türünde (henüz) yok. */
type LevelCommand =
  | { type: "booster"; key: string }
  | { type: "boosterDeclined"; key: string }
  | { type: "continue"; extra?: { shots?: number } }
  | { type: "giveUp" }
  | {
      type: "config";
      levelMode?: boolean;
      level?: number;
      boosters?: string[];
      boosterStock?: Record<string, number>;
      sound?: boolean;
      reduceMotion?: boolean;
      perks?: { penalti?: { aimBonus: number } } | null;
      roster?: Record<string, unknown> | null;
      hudInset?: { top: number; right: number };
      safeArea?: { top: number; bottom: number };
    };

export function PenaltiGame({ level, maxWidth, maxHeight, preBoosters, boosterStock, useBooster, onFinish, paused, requestContinue, safeArea, sound: soundProp }: PuzzleGameProps) {
  const web = useRef<WebGameHandle>(null);
  /* Bölüm skoru arena tablosuna da gider (haftalık görevler + sıralama). */
  const arenaScore = useLevelArenaScore("penalti");
  const send = useCallback((cmd: GameCommand | LevelCommand) => web.current?.send(cmd as GameCommand), []);
  const reduceMotion = useReduceMotion();
  const auth = useAuth();
  const scope = useScope();
  const playerId = auth.user?.player_id ?? null;

  /* Kariyer avantajı (Elit Kart): penaltı isabet payı (aimBonus, en çok 0.1). */
  const career = useQuery({
    queryKey: ["career", "player", playerId],
    queryFn: () => getPlayerCareer(playerId as number),
    enabled: Boolean(playerId),
    staleTime: 10 * 60_000,
    retry: false,
  });
  const perks = career.data?.card.perks ?? null;
  /* Gerçek lig kadrosu (atıcı + kaleci merdiveni); gelmezse varsayılan kadro. */
  const { roster } = useGameRoster("penalti", scope.cityId ?? null, playerId);

  /* Ses: çerçevenin mola kartındaki tercih (yoksa kayıtlı tercih). */
  const [savedSound, setSound] = useState(true);
  const sound = soundProp ?? savedSound;
  useEffect(() => {
    AsyncStorage.getItem(SOUND_KEY)
      .then((value) => {
        if (value === "0") setSound(false);
      })
      .catch(() => undefined);
  }, []);

  const boosters = useMemo(() => preBoosters.filter((k) => (KEYS as readonly string[]).includes(k)), [preBoosters]);
  const stock = useMemo(() => Object.fromEntries(KEYS.map((k) => [k, boosterStock[k] ?? 0])), [boosterStock]);

  /* Tam ekran: sahne kenardan kenara, HUD güvenli alanın içinde (games/core.js safeArea). */
  const safeTop = Math.round(safeArea?.top ?? 0);
  const safeBottom = Math.round(safeArea?.bottom ?? 0);
  const config = useMemo<LevelCommand>(
    () => ({ type: "config", levelMode: true, level, boosters, boosterStock: stock, sound, reduceMotion, perks, roster, hudInset: HUD_INSET, safeArea: { top: safeTop, bottom: safeBottom } }),
    [level, boosters, stock, sound, reduceMotion, perks, roster, safeTop, safeBottom],
  );
  const configRef = useRef(config);
  configRef.current = config;

  const [ready, setReady] = useState(false);
  const started = useRef(false);
  const finished = useRef(false);

  /* Ayar / stok / kadro değişince oyuna yeniden iletilir (oyun idempotent okur;
     bölüm başladıktan sonra kadro ve ön güçlendiriciler değişmez). */
  useEffect(() => {
    if (ready) send(config);
  }, [ready, config, send]);

  /* Hazır olunca bir kez başlat: config önce gider (bölüm modu + N). */
  const onReady = useCallback(() => {
    send(configRef.current);
    setReady(true);
    if (!started.current) {
      started.current = true;
      send({ type: "start" });
      arenaScore.begin();
    }
  }, [send]);

  /* Duraklatma: çerçevenin ayarlar / mağaza / sonuç penceresi. */
  useEffect(() => {
    if (!ready) return;
    send({ type: paused ? "pause" : "resume" });
  }, [paused, ready, send]);

  const onOver = useCallback(
    (payload: GameOverPayload) => {
      if (finished.current) return;
      finished.current = true;
      arenaScore.submit(payload);
      const won = payload.stats.won === 1;
      const stars = won ? (Math.max(1, Math.min(3, Math.round(payload.stats.stars || 1))) as 1 | 2 | 3) : 0;
      const goals = payload.stats.goals ?? 0;
      const shots = payload.stats.shots ?? 0;
      onFinish({ won, stars, score: payload.score, summary: `${goals}/${shots} gol` });
    },
    [onFinish, arenaScore],
  );

  const onEvent = useCallback(
    (message: Record<string, unknown>) => {
      if (message.type === "useBooster") {
        const key = String(message.key ?? "");
        // Düşemezse oyuna söylenir; yoksa düğme bir sonraki şuta kadar soluk kalırdı.
        if ((KEYS as readonly string[]).includes(key) && useBooster(key)) send({ type: "booster", key });
        else send({ type: "boosterDeclined", key });
        return;
      }
      if (message.type === "fail") {
        if (message.canContinue !== true || !requestContinue) {
          send({ type: "giveUp" });
          return;
        }
        requestContinue({ extra: "+1 şut" })
          .then((ok) => send(ok ? { type: "continue", extra: { shots: 1 } } : { type: "giveUp" }))
          .catch(() => send({ type: "giveUp" }));
      }
    },
    [requestContinue, send, useBooster],
  );

  return (
    <View style={[styles.frame, { width: maxWidth, height: maxHeight }]}>
      <WebGame ref={web} game="penalti" onReady={onReady} onOver={onOver} onEvent={onEvent} accessibilityLabel={`Penaltı, seviye ${level}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignSelf: "center", overflow: "hidden" },
});
