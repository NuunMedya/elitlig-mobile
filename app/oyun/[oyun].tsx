/**
 * SONSUZ / BİLGİ OYUNU ANA SAYFASI — /oyun/<oyun> (sözleşme §6)
 *
 * Slalom, Top Sektir, Gol Düellosu, Kim Bu?, Kim Kazandı? ve Günün Testi'nin
 * evi, bölümlü oyunlarla aynı sade dilde: ince üst şerit (geri · can · jeton
 * · yıldız · ayarlar), sakin gece stadyumu sahnesinin ortasında oyunun
 * madalyonu, adı ve iki bilgi kartı (Rekor · Bugünkü yıldız), altta üç çip
 * (Ödüller · Sıralama · Diğer) ve tek odak yeşil OYNA. Bugünkü yıldız artık
 * ayrı bir çubuk değil, sahnedeki kartta (tekrar yok). OYNA asıl oyun
 * ekranını açar; canı biten oyuncuya can penceresi açılır (her tur 1 can,
 * sözleşme §4). Günün Testi'nin canı yoktur.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";

import { ArenaScene } from "@/components/gamehome/ArenaScene";
import { GameHome } from "@/components/gamehome/GameHome";
import { fmtShort } from "@/components/gamehome/GameHomeKit";
import { getMyArenaSummary } from "@/lib/api/arena";
import { scoreGame } from "@/lib/game/gameCatalog";
import { cityKeys, getCity } from "@/lib/puzzle/api";
import { useGameSave } from "@/lib/puzzle/saves";
import { useAuth } from "@/providers/AuthProvider";

/** Bilgi + arcade oyunlarının günlük şehir yıldızı tavanı (sunucu ARENA_STARS_PER_DAY). */
const ARENA_DAILY_CAP = 30;

export default function ScoreGameHome() {
  const router = useRouter();
  const auth = useAuth();
  const signedIn = Boolean(auth.user);
  const params = useLocalSearchParams<{ oyun?: string }>();
  const def = scoreGame(params.oyun);

  const summary = useQuery({ queryKey: ["arena", "me", "summary"], queryFn: getMyArenaSummary, enabled: signedIn, staleTime: 60_000, retry: false });
  const city = useQuery({ queryKey: cityKeys.me(), queryFn: getCity, enabled: signedIn, staleTime: 60_000, retry: false }).data?.city;
  const bests = useGameSave("bests");

  // Günün Testi: bugün oynandı mı (app/gunun.tsx ile aynı UTC gün anahtarı).
  const [today, setToday] = useState<{ correct: number } | null>(null);
  const [insets, setInsets] = useState({ top: 100, bottom: 150 });
  const onInsets = useCallback((top: number, bottom: number) => {
    setInsets((cur) => (Math.abs(cur.top - top) < 2 && Math.abs(cur.bottom - bottom) < 2 ? cur : { top, bottom }));
  }, []);
  useFocusEffect(
    useCallback(() => {
      if (def?.key !== "gunun") return;
      const day = new Date().toISOString().slice(0, 10);
      void AsyncStorage.getItem(`elitlig.gunun.${day}.v1`)
        .then((raw) => {
          const v = raw ? (JSON.parse(raw) as { correct?: number }) : null;
          setToday(v && Number.isFinite(Number(v.correct)) ? { correct: Number(v.correct) } : null);
        })
        .catch(() => setToday(null));
    }, [def?.key]),
  );

  if (!def) return <Redirect href="/(tabs)/oyunlar" />;

  const device = (bests.data as Record<string, number> | undefined)?.[def.key] ?? null;
  const server = summary.data?.games?.[def.key]?.best ?? null;
  const best = device == null ? server : server == null ? device : Math.max(device, server);
  const gameStars = city?.stars.arena_by_game?.[def.key] ?? null;
  const daily = def.kind === "daily";

  return (
    <GameHome
      title={def.title}
      livesGame={def.lives}
      onInsets={onInsets}
      background={
        <ArenaScene
          gameKey={def.key}
          icon={def.icon}
          title={def.title}
          top={insets.top}
          bottom={insets.bottom}
          stats={[
            daily
              ? { icon: "checkmark-done", label: "Bugün", value: today ? `${today.correct}/10` : "–" }
              : { icon: "trophy", label: "Rekor", value: best != null ? fmtShort(best) : "–" },
            !daily && signedIn && city
              ? { icon: "star", label: "Bugünkü yıldız", value: `${fmtShort(Math.min(city.stars.arena_today ?? 0, ARENA_DAILY_CAP))}/${ARENA_DAILY_CAP}` }
              : { icon: "star", label: "Toplam yıldız", value: gameStars != null ? fmtShort(gameStars) : "–" },
          ]}
        />
      }
      play={{
        title: daily && today ? "SONUCUN" : "OYNA",
        sub: daily ? (today ? "Yarın yeni test" : "Bugünün 10 sorusu hazır") : best != null ? "Rekorunu geç" : "İlk rekorunu kur",
        onPress: () => router.push(def.route),
        accessibilityLabel: `${def.title} oyna${best != null ? `, rekorun ${best}` : ""}`,
      }}
      rules={def.rules}
      starLine={daily ? "Doğru sayına göre en çok 5 yıldız (günde bir)." : `Rekor yıldızı: rekorunu geçince yeni eşiklerin yıldızı; rekor kırılmayan iyi turda küçük katılım yıldızı (günde sınırlı).`}
      onBoard={() => router.push({ pathname: "/siralama", params: { game: def.key } })}
    />
  );
}
