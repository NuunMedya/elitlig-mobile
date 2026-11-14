/**
 * SONSUZ / BİLGİ OYUNU ANA SAYFASI — /oyun/<oyun> (sözleşme §6)
 *
 * Slalom, Top Sektir, Gol Düellosu, Kim Bu?, Kim Kazandı? ve Günün Testi'nin
 * evi: Royal Match tarzı üst şerit (avatar · can · jeton · yıldız · ayarlar),
 * bugünkü oyun yıldızı çubuğu, yan düğmeler (hediye, ücretsiz ödül, çark,
 * sıralama, kurallar) ve gece stadyumu sahnesinde büyük yeşil
 * "OYNA · Rekor X". OYNA asıl oyun ekranını açar; canı biten oyuncuya can
 * penceresi açılır (her tur 1 can, sözleşme §4). Günün Testi'nin canı yoktur.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";

import { ArenaScene } from "@/components/gamehome/ArenaScene";
import { GameHome } from "@/components/gamehome/GameHome";
import { ChestBar } from "@/components/gamehome/GameHomeKit";
import { getMyArenaSummary } from "@/lib/api/arena";
import { RECORD_STAR_LINE, scoreGame } from "@/lib/game/gameCatalog";
import { cityKeys, getCity } from "@/lib/puzzle/api";
import { useGameSave } from "@/lib/puzzle/saves";
import { useAuth } from "@/providers/AuthProvider";

/** Bilgi + arcade oyunlarının günlük şehir yıldızı tavanı (sunucu ARENA_STARS_PER_DAY). */
const ARENA_DAILY_CAP = 30;
const fmt = (n: number) => n.toLocaleString("tr-TR");

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
      background={<ArenaScene gameKey={def.key} icon={def.icon} />}
      eventBar={
        signedIn && city ? (
          <ChestBar
            icon="star"
            title={daily ? "GÜNÜN TESTİ YILDIZI" : "BUGÜNKÜ OYUN YILDIZI"}
            value={daily ? today?.correct ?? 0 : city.stars.arena_today ?? 0}
            max={daily ? 10 : ARENA_DAILY_CAP}
            note={gameStars != null ? `${def.title}: toplam ${fmt(gameStars)} yıldız · ${RECORD_STAR_LINE}` : RECORD_STAR_LINE}
          />
        ) : null
      }
      play={{
        title: daily && today ? "SONUCUN" : "OYNA",
        sub: daily ? (today ? `Bugün ${today.correct}/10 · yarın yeni test` : "Bugünün 10 sorusu hazır") : best != null ? `Rekor ${fmt(best)}` : "İlk rekorunu kur",
        onPress: () => router.push(def.route),
        accessibilityLabel: `${def.title} oyna${best != null ? `, rekorun ${best}` : ""}`,
      }}
      rules={def.rules}
      starLine={daily ? "Doğru sayına göre en çok 5 yıldız (günde bir)." : `Rekor yıldızı: rekorunu geçince yeni eşiklerin yıldızı; rekor kırılmayan iyi turda küçük katılım yıldızı (günde sınırlı).`}
      onBoard={() => router.push({ pathname: "/siralama", params: { game: def.key } })}
    />
  );
}
