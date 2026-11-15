/**
 * KADRO KOŞUSU — Lig Yolu oyun bileşeni: `games/kadro.js` WebView'ini BÖLÜM
 * MODUNDA açar ve tek bir bölüm oynatır (docs/oyun-yenileme-2026-11.md §2).
 *
 * Köprü:
 *   RN → oyun  config {levelMode, level, boosters, sound, reduceMotion, roster, hudInset}
 *              start · pause / resume · booster {key} · continue / giveUp
 *   oyun → RN  ready · levelInfo · fail {canContinue, revive} · over {score, stats}
 *
 * Bölüm seçimi, kayıt ve sonuç penceresi çerçevenin (app/lig-yolu/oyna)
 * işidir: oyun yalnız `over` gönderir, burada onFinish'e çevrilir. Yıldızı
 * oyun hesaplar (kale anındaki kadro / üretecin PAR kadrosu).
 *
 * DEVAM (reklamla takviye): kadro tükenince oyun `fail` yollar ve bekler. Bu
 * sırada oyun DURDURULUR (bekleme sayacı işlemesin); çerçeve `requestContinue`
 * verirse cevabına göre continue / giveUp gönderilir; vermezse bölüm kaybedilir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useGameRoster } from "@/components/game/useGameRoster";
import { OVERLAY_PAUSE } from "@/components/game/HudPauseButton";
import { WebGame, type GameCommand, type GameOverPayload, type WebGameHandle } from "@/components/game/WebGame";
import { Touchable, useReduceMotion } from "@/components/ui";
import { STAGE_COMMON } from "@/lib/puzzle/stagePalette";
import type { PuzzleGameProps, PuzzleResult } from "@/lib/puzzle/types";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { fonts, radius, textScale, touchSlop, type } from "@/theme";

/** Arena oyunlarının ortak ses tercihi (ArenaGameScreen ile aynı anahtar). */
const SOUND_KEY = "elitlig.arena.sound.v1";
/**
 * Oyun HUD'unun sağ üstte boş bıraktığı köşe: en sağda çerçevenin durdur
 * düğmesi, solunda canlı güçlendirici düğmesi (ikisi bir sırada).
 */
const HUD_INSET = { top: 52, right: OVERLAY_PAUSE.right + OVERLAY_PAUSE.size * 2 + 16 };
/** Oyun içi güçlendirici (sunucu anahtarı). */
const LIVE_BOOSTER = "kalkan";

/** Bölüm modu komutları (WebGame'in GameCommand birleşiminde yok). */
type LevelCommand =
  | {
      type: "config";
      levelMode?: boolean;
      level?: number;
      boosters?: string[];
      sound?: boolean;
      reduceMotion?: boolean;
      roster?: Record<string, unknown> | null;
      hudInset?: { top: number; right: number };
      safeArea?: { top: number; bottom: number };
    }
  | { type: "booster"; key: string }
  | { type: "continue"; extra?: Record<string, unknown> }
  | { type: "giveUp" };

export function KadroGame({ level, maxWidth, maxHeight, preBoosters, boosterStock, useBooster, onFinish, paused, requestContinue, safeArea, sound: soundProp }: PuzzleGameProps) {
  const web = useRef<WebGameHandle>(null);
  const reduceMotion = useReduceMotion();
  const auth = useAuth();
  const scope = useScope();
  const { roster } = useGameRoster("kadro", scope.cityId ?? null, auth.user?.player_id ?? null);
  /* Ses: çerçevenin mola kartındaki tercih (yoksa kayıtlı tercih). */
  const [savedSound, setSound] = useState(true);
  const sound = soundProp ?? savedSound;
  const [ready, setReady] = useState(false);
  const started = useRef(false);
  const finished = useRef(false);
  /** "Devam?" sorulurken oyun duruk kalır (çerçevenin paused'ı ne derse desin). */
  const asking = useRef(false);

  /* Tam ekran: sahne kenardan kenara, HUD güvenli alanın içinde (games/core.js safeArea). */
  const safeTop = Math.round(safeArea?.top ?? 0);
  const safeBottom = Math.round(safeArea?.bottom ?? 0);

  const send = useCallback((cmd: LevelCommand | GameCommand) => {
    web.current?.send(cmd as GameCommand);
  }, []);

  useEffect(() => {
    void AsyncStorage.getItem(SOUND_KEY).then((value) => {
      if (value === "0") setSound(false);
    });
  }, []);

  /* İlk config + start (bir kez); sonra ses / hareket / kadro değişince yalnız config.
     Bölüm ve seviye öncesi güçlendiriciler yalnız start'tan önce okunur. */
  useEffect(() => {
    if (!ready) return;
    send({ type: "config", levelMode: true, level, boosters: preBoosters, sound, reduceMotion, roster, hudInset: HUD_INSET, safeArea: { top: safeTop, bottom: safeBottom } });
    if (!started.current) {
      started.current = true;
      send({ type: "start" });
    }
  }, [ready, level, preBoosters, sound, reduceMotion, roster, safeTop, safeBottom, send]);

  /* Çerçevenin mola / mağaza / sonuç pencereleri oyunu durdurur. */
  useEffect(() => {
    if (ready && !asking.current) send({ type: paused ? "pause" : "resume" });
  }, [paused, ready, send]);

  const onOver = useCallback(
    (payload: GameOverPayload) => {
      if (finished.current) return;
      finished.current = true;
      const s = payload.stats;
      const won = s.won === 1;
      const stars = (won ? Math.max(1, Math.min(3, Math.round(s.stars || 1))) : 0) as PuzzleResult["stars"];
      const summary = won
        ? `Gol! ${s.kept ?? 0} kişilik kadroyla kaleye vardın · ${s.rivals ?? 0} grup eritildi`
        : `Kadron tükendi · ${s.rivals ?? 0} grup eritildi, en kalabalık kadro ${s.squad ?? 0}`;
      onFinish({ won, stars, score: payload.score, summary });
    },
    [onFinish],
  );

  const onEvent = useCallback(
    (message: Record<string, unknown>) => {
      if (message.type !== "fail" || finished.current) return;
      if (!message.canContinue || !requestContinue) {
        send({ type: "giveUp" });
        return;
      }
      asking.current = true;
      send({ type: "pause" });
      const revive = Number(message.revive) || 5;
      void requestContinue({ extra: `+${revive} oyuncu · kalkan` })
        .catch(() => false)
        .then((ok) => {
          asking.current = false;
          send({ type: "resume" });
          send(ok ? { type: "continue", extra: { squad: revive } } : { type: "giveUp" });
        });
    },
    [requestContinue, send],
  );

  const stock = boosterStock[LIVE_BOOSTER] ?? 0;
  const onShield = () => {
    if (!ready || paused || finished.current) return;
    // Stok yoksa çerçeve mağazayı önerir (useBooster false döner).
    if (useBooster(LIVE_BOOSTER)) send({ type: "booster", key: LIVE_BOOSTER });
  };

  return (
    <View style={[styles.wrap, { width: maxWidth, height: maxHeight }]}>
      <WebGame ref={web} game="kadro" onReady={() => setReady(true)} onOver={onOver} onEvent={onEvent} accessibilityLabel="Kadro Koşusu oyun alanı" />
      <Touchable
        onPress={onShield}
        style={[styles.booster, { top: safeTop + OVERLAY_PAUSE.top }, !ready && styles.dim]}
        hitSlop={touchSlop(44)}
        accessibilityRole="button"
        accessibilityLabel={`Kalkan güçlendiricisi: sıradaki zararlı temasta kadrodan kimse düşmez. Stok ${stock}`}
      >
        <Ionicons name="shield-checkmark" size={22} color={STAGE_COMMON.white} />
        <View style={styles.badge}>
          <Text style={styles.badgeText} {...textScale.badge}>
            {stock > 0 ? stock : "+"}
          </Text>
        </View>
      </Touchable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "center", overflow: "hidden" },
  booster: {
    position: "absolute",
    right: OVERLAY_PAUSE.right + OVERLAY_PAUSE.size + 8,
    width: OVERLAY_PAUSE.size,
    height: OVERLAY_PAUSE.size,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: STAGE_COMMON.glassStrong,
    borderWidth: 1,
    borderColor: STAGE_COMMON.glassEdge,
  },
  dim: { opacity: 0.5 },
  badge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: STAGE_COMMON.heart,
  },
  badgeText: { ...type.caption, fontFamily: fonts.bold, color: STAGE_COMMON.white },
});
