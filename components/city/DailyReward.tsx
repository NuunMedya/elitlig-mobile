/**
 * GÜNLÜK GİRİŞ ÖDÜLÜ + SERİ (Ekonomi A5) — oyun merkezi ve Kulüp Şehri.
 *
 *   · DailyRewardCard: kısa kart (bugünün ödülü, seri, 7 günlük nokta şeridi,
 *     seri koruyucu uyarısı). Oyun dünyası renkleri: iki temada da aynı.
 *   · DailyRewardSheet: 7 günlük döngü (yıldız / jeton / ekstra; bugün
 *     vurgulu, alınan günler tikli), seri ve en iyi seri, uzun seri ödülleri
 *     (14 · 30 · 60 · 100 gün: Seri Çeşmesi, Sadık Başkan heykeli, Işık
 *     gösterisi, Altın kupa anıtı) ve sıradakine ilerleme, gün 3 joker
 *     seçimi, gün 5 can doldurma oyunu, gün 7 haftanın sandığı; alınca sonlu
 *     bir kutlama. Bir gün kaçırıldıysa ve hak varsa önce SERİ KORUYUCU:
 *     "Reklam izle, serini kurtar" (ödüllü reklam akışı, haftada 1).
 *   · DailyRewardEntry: kart + pencere birlikte (ekranlara tek satır).
 *
 * Eski sunucu: yıldız / uzun seri / koruyucu alanları yoksa yalnız jeton
 * döngüsü gösterilir (lib/puzzle/daily.ts).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import { RewardedAdModal, type RewardedFlow } from "@/components/puzzle/RewardedLife";
import { BottomSheet, Touchable, useReduceMotion, useToast } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { CARTOON } from "@/lib/game/cartoon";
import { HUB } from "@/lib/game/hubPalette";
import { cityKeys, claimStreakSaver, startStreakSaver, type DailyClaimResponse, type DailyReward, type DailyStatus } from "@/lib/puzzle/api";
import { LANDMARK_ICONS, rewardLine, type DailyDay, type DailyView } from "@/lib/puzzle/daily";
import { puzzleGame, PUZZLE_GAMES } from "@/lib/puzzle/registry";
import type { PuzzleGameKey } from "@/lib/puzzle/types";
import { useClaimDaily, useDailyCache, useDailyStatus } from "@/lib/puzzle/useDaily";
import { usePuzzleMe } from "@/lib/puzzle/usePuzzle";
import { colors, fonts, hairline, radius, space, textScale, type } from "@/theme";

import { ChunkyButton } from "./ChunkyButton";

const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;
const LEFT = { x: 0, y: 0.5 } as const;
const RIGHT = { x: 1, y: 0.5 } as const;
const fmt = (n: number) => n.toLocaleString("tr-TR");
/** Sunucunun gün 3 varsayılan jokeri (rules.DAILY_DEFAULT_JOKER). */
const DEFAULT_JOKER = "karistir";
type IconName = keyof typeof Ionicons.glyphMap;

/* ═══════════════════════ GİRİŞ: KART + PENCERE ═══════════════════════ */

/** Oyun merkezi ve Kulüp Şehri için: kart ve dokununca açılan pencere. */
export function DailyRewardEntry({ style }: { style?: object }) {
  const { view } = useDailyStatus();
  const [open, setOpen] = useState(false);
  if (!view) return null;
  return (
    <>
      <DailyRewardCard view={view} onPress={() => setOpen(true)} style={style} />
      <DailyRewardSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

/* ═══════════════════════ KISA KART ═══════════════════════ */

export function DailyRewardCard({ view, onPress, style }: { view: DailyView; onPress: () => void; style?: object }) {
  const ready = view.available;
  const saver = view.offerSaver;
  const title = saver ? "Serini kurtar!" : ready ? "Günlük ödülün hazır!" : `${view.streak} günlük seri`;
  const sub = saver
    ? `Dün girmedin: reklam izle, ${view.saver?.streak ?? 0} günlük serin korunsun`
    : ready
      ? `${view.cycleDay}. gün · ${rewardLine(view.today)}`
      : view.tomorrow
        ? `Yarın: ${rewardLine(view.tomorrow)}`
        : "Yarın yine gel";
  const next = view.next && view.v2 ? `${view.next.title}: ${view.next.inDays} gün kaldı` : null;
  return (
    <Touchable
      onPress={onPress}
      haptic="medium"
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      style={[styles.card, ready ? styles.cardReady : null, saver ? styles.cardSaver : null, style]}
    >
      <LinearGradient colors={CARTOON.pill} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
      <View style={styles.cardBadgeWrap}>
        <LinearGradient colors={saver ? CARTOON.orange : ready ? CARTOON.gold : CARTOON.purple} start={TOP} end={BOTTOM} style={styles.cardBadge}>
          <Ionicons name={saver ? "shield-checkmark" : ready ? "gift" : "calendar"} size={26} color={saver || !ready ? CARTOON.white : CARTOON.goldInk} />
        </LinearGradient>
        {view.streak > 0 || view.nextStreak > 1 ? (
          <View style={styles.flameBadge}>
            <Ionicons name="flame" size={11} color={CARTOON.white} />
            <Text style={styles.flameText} {...textScale.badge}>
              {saver ? view.saver?.streak ?? 0 : view.streak}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.cardTexts}>
        <Text style={styles.cardTitle} numberOfLines={1} {...textScale.dense}>
          {title}
        </Text>
        <Text style={styles.cardSub} numberOfLines={2} {...textScale.dense}>
          {sub}
        </Text>
        <View style={styles.dots}>
          {view.days.map((d) => (
            <View key={d.day} style={[styles.dot, d.state === "claimed" ? styles.dotDone : d.state === "today" ? styles.dotToday : null]}>
              {d.state === "claimed" ? <Ionicons name="checkmark" size={9} color={CARTOON.white} /> : null}
            </View>
          ))}
        </View>
        {next ? (
          <Text style={styles.cardNext} numberOfLines={1} {...textScale.badge}>
            {next}
          </Text>
        ) : null}
      </View>
      {ready ? (
        <View style={[styles.cardCta, saver ? styles.cardCtaSaver : null]}>
          <Text style={styles.cardCtaText} {...textScale.badge}>
            {saver ? "KURTAR" : "AL"}
          </Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={HUB.muted} />
      )}
    </Touchable>
  );
}

/* ═══════════════════════ PENCERE ═══════════════════════ */

export function DailyRewardSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { view } = useDailyStatus();
  const puzzle = usePuzzleMe();
  const me = puzzle.data;
  const claim = useClaimDaily();
  const toast = useToast();
  const queryClient = useQueryClient();
  const writeDaily = useDailyCache();
  const [result, setResult] = useState<DailyClaimResponse | null>(null);
  const [joker, setJoker] = useState<string>(DEFAULT_JOKER);
  const [lifeGame, setLifeGame] = useState<PuzzleGameKey | null>(null);
  const [ad, setAd] = useState(false);

  // Gün 5: varsayılan oyun en az canı olan (sunucu da öyle seçer).
  const fewest = useMemo<PuzzleGameKey | null>(() => {
    const by = me?.profile.lives_by_game;
    if (!by) return null;
    let pick: PuzzleGameKey | null = null;
    let min = Infinity;
    for (const g of PUZZLE_GAMES) {
      const lives = by[g.key]?.lives ?? me?.profile.max_lives ?? 5;
      if (lives < min) {
        min = lives;
        pick = g.key;
      }
    }
    return pick;
  }, [me]);

  useEffect(() => {
    if (visible) {
      setResult(null);
      setLifeGame(null);
    }
  }, [visible]);

  const saverFlow = useMemo<RewardedFlow<{ daily: DailyStatus; streak: number }>>(
    () => ({
      start: startStreakSaver,
      claim: (token) => claimStreakSaver(token),
      reward: "seri kurtarma",
      icon: "flame",
      claiming: "Serin kurtarılıyor",
      success: "Serin kurtarıldı! Şimdi bugünün ödülünü al.",
    }),
    [],
  );

  if (!view) return null;
  const today = view.today;
  const chosenGame = lifeGame ?? fewest;
  const doClaim = () =>
    claim.mutate(
      { joker: today.joker ? joker : undefined, game: today.life_refill ? chosenGame ?? undefined : undefined },
      {
        onSuccess: (res) => setResult(res),
        onError: (error) => toast.show({ message: errorText(error), tone: "danger" }),
      },
    );

  const footer = result ? (
    <ChunkyButton label="HARİKA!" icon="checkmark" tone="green" onPress={onClose} />
  ) : view.available ? (
    <ChunkyButton
      label={claim.isPending ? "ALINIYOR…" : view.offerSaver ? "SERİYİ BIRAK, ÖDÜLÜ AL" : `ÖDÜLÜ AL${today.stars ? ` · +${today.stars} YILDIZ` : ` · +${today.coins} JETON`}`}
      icon="gift"
      tone={view.offerSaver ? "gold" : "green"}
      disabled={claim.isPending}
      onPress={doClaim}
      accessibilityLabel={`Günlük ödülü al: ${rewardLine(today)}`}
    />
  ) : (
    <ChunkyButton label={view.tomorrow ? `YARIN: ${rewardLine(view.tomorrow).toLocaleUpperCase("tr-TR")}` : "YARIN YİNE GEL"} icon="time" disabled onPress={() => undefined} />
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} title={result ? undefined : "Günlük ödül"} snap="full" footer={footer}>
      {result ? (
        <Celebration result={result} me={me} />
      ) : (
        <View style={styles.sheet}>
          <StreakHero view={view} />
          {view.offerSaver && view.saver ? <SaverOffer view={view} onWatch={() => setAd(true)} /> : null}
          <DayGrid view={view} />
          {view.available && today.joker ? (
            <JokerPicker selected={joker} onSelect={setJoker} catalog={me?.catalog.boosters} stock={me?.profile.boosters} />
          ) : null}
          {view.available && today.life_refill ? (
            <LifeGamePicker selected={chosenGame} onSelect={setLifeGame} lives={me?.profile.lives_by_game} max={me?.profile.max_lives ?? 5} />
          ) : null}
          {view.available && today.chest && today.boosters ? <ChestContents boosters={today.boosters} title={(key) => me?.catalog.boosters[key]?.title ?? key} /> : null}
          {view.v2 && view.milestones.length ? <Milestones view={view} /> : null}
          <Text style={styles.rules} {...textScale.long}>
            {view.v2
              ? "Her gün bir kez al; 7 günlük döngü yeniden başlar ama serin büyümeye devam eder. Bir gün kaçırırsan seri 1'e döner. Haftada bir kez reklam izleyerek kaçırdığın tek günü kurtarabilirsin."
              : "Her gün gir, seri büyüsün. 7. günün ödülü güçlendirici paketi. Bir gün kaçırırsan seri baştan başlar."}
          </Text>
        </View>
      )}
      <RewardedAdModal
        visible={ad}
        onClose={() => setAd(false)}
        flow={saverFlow}
        onRewarded={(res) => {
          writeDaily(res.daily);
          void queryClient.invalidateQueries({ queryKey: cityKeys.me() });
        }}
      />
    </BottomSheet>
  );
}

/* ═══════════════════════ PARÇALAR ═══════════════════════ */

function StreakHero({ view }: { view: DailyView }) {
  const shown = view.offerSaver ? view.saver?.streak ?? 0 : view.available ? view.streak : view.nextStreak;
  return (
    <View style={styles.hero}>
      <LinearGradient colors={CARTOON.pill} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={view.offerSaver ? CARTOON.red : CARTOON.orange} start={TOP} end={BOTTOM} style={styles.heroFlame}>
        <Ionicons name="flame" size={30} color={CARTOON.white} />
      </LinearGradient>
      <View style={styles.heroTexts}>
        <Text style={styles.heroBig} {...textScale.dense}>
          {shown} günlük seri
        </Text>
        <Text style={styles.heroSub} numberOfLines={2} {...textScale.dense}>
          {view.offerSaver
            ? "Dün girmedin: serin tehlikede!"
            : view.available
              ? view.streak > 0
                ? `Bugün al, seri ${view.nextStreak} gün olsun`
                : "Bugün al, yeni seriye başla"
              : "Bugünün ödülünü aldın. Yarın yine gel!"}
        </Text>
      </View>
      {view.v2 ? (
        <View style={styles.heroBest}>
          <Ionicons name="ribbon" size={14} color={CARTOON.star} />
          <Text style={styles.heroBestValue} {...textScale.badge}>
            {view.best}
          </Text>
          <Text style={styles.heroBestLabel} {...textScale.badge}>
            en iyi
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function SaverOffer({ view, onWatch }: { view: DailyView; onWatch: () => void }) {
  const saver = view.saver!;
  return (
    <View style={styles.saver}>
      <View style={styles.saverHead}>
        <View style={styles.saverIcon}>
          <Ionicons name="shield-checkmark" size={22} color={colors.warn} />
        </View>
        <View style={styles.saverTexts}>
          <Text style={styles.saverTitle} {...textScale.dense}>
            Seri koruyucu hazır
          </Text>
          <Text style={styles.saverSub} {...textScale.long}>
            {saver.streak} günlük serin kurtarılabilir. Kısa bir reklam izle, kaçırdığın gün sayılsın; sonra bugünün ödülünü al, seri {saver.streak + 1} gün olsun.
          </Text>
        </View>
      </View>
      <ChunkyButton label="REKLAM İZLE, SERİNİ KURTAR" icon="play-circle" tone="green" onPress={onWatch} accessibilityLabel={`Reklam izle, ${saver.streak} günlük serini kurtar`} />
      <Text style={styles.saverFoot} {...textScale.dense}>
        Haftada {saver.per_week} kez · {saver.seconds} sn reklam
      </Text>
    </View>
  );
}

function DayGrid({ view }: { view: DailyView }) {
  const first = view.days.slice(0, 4);
  const rest = view.days.slice(4);
  return (
    <View style={styles.grid}>
      <Text style={styles.sectionTitle} {...textScale.dense}>
        7 günlük döngü
      </Text>
      <View style={styles.gridRow}>
        {first.map((d) => (
          <DayTile key={d.day} d={d} />
        ))}
      </View>
      <View style={styles.gridRow}>
        {rest.map((d) => (
          <DayTile key={d.day} d={d} wide={d.day === 7} />
        ))}
      </View>
    </View>
  );
}

function extraOf(r: DailyReward): { icon: IconName; text: string } | null {
  if (r.chest) return { icon: "gift", text: "Sandık" };
  if (r.joker) return { icon: "flash", text: "Joker" };
  if (r.life_refill) return { icon: "heart", text: "Can" };
  if (r.boosters && Object.keys(r.boosters).length) return { icon: "gift", text: "Paket" };
  return null;
}

function DayTile({ d, wide }: { d: DailyDay; wide?: boolean }) {
  const r = d.reward;
  const today = d.state === "today";
  const done = d.state === "claimed";
  const extra = extraOf(r);
  const ink = today ? CARTOON.goldInk : colors.textPrimary;
  const sub = today ? CARTOON.goldInk : colors.textSecondary;
  const body = (
    <>
      <Text style={[styles.tileDay, { color: sub }]} {...textScale.badge}>
        {today ? "BUGÜN" : `${d.day}. GÜN`}
      </Text>
      <View style={styles.tileMain}>
        <Ionicons name={r.stars != null ? "star" : "disc"} size={wide ? 24 : 18} color={today ? CARTOON.goldInk : r.stars != null ? CARTOON.star : colors.yellowCard} />
        <Text style={[wide ? styles.tileValueWide : styles.tileValue, { color: ink }]} {...textScale.badge}>
          {r.stars != null ? r.stars : r.coins}
        </Text>
      </View>
      {r.stars != null ? (
        <Text style={[styles.tileCoins, { color: sub }]} numberOfLines={1} {...textScale.badge}>
          {r.coins} jeton
        </Text>
      ) : null}
      {extra ? (
        <View style={[styles.tileExtra, today ? styles.tileExtraToday : null]}>
          <Ionicons name={extra.icon} size={11} color={today ? CARTOON.goldInk : colors.brandAccent} />
          <Text style={[styles.tileExtraText, { color: today ? CARTOON.goldInk : colors.brandAccent }]} numberOfLines={1} {...textScale.badge}>
            {extra.text}
          </Text>
        </View>
      ) : null}
      {done ? (
        <View style={styles.tileCheck}>
          <Ionicons name="checkmark" size={13} color={CARTOON.white} />
        </View>
      ) : null}
    </>
  );
  const label = `${d.day}. gün: ${rewardLine(r)}${done ? ", alındı" : today ? ", bugün" : ""}`;
  return today ? (
    <View style={[styles.tile, styles.tileToday, wide ? styles.tileWide : null]} accessibilityLabel={label}>
      <LinearGradient colors={CARTOON.gold} start={TOP} end={BOTTOM} style={[StyleSheet.absoluteFill, styles.tileFill]} />
      {body}
    </View>
  ) : (
    <View style={[styles.tile, done ? styles.tileDone : null, wide ? styles.tileWide : null]} accessibilityLabel={label}>
      {body}
    </View>
  );
}

function JokerPicker({
  selected,
  onSelect,
  catalog,
  stock,
}: {
  selected: string;
  onSelect: (key: string) => void;
  catalog: Record<string, { game: PuzzleGameKey; title: string }> | undefined;
  stock: Record<string, number> | undefined;
}) {
  const entries = Object.entries(catalog ?? {});
  if (!entries.length) return null;
  return (
    <View style={styles.pick}>
      <Text style={styles.sectionTitle} {...textScale.dense}>
        Jokerini seç
      </Text>
      <Text style={styles.pickLead} {...textScale.long}>
        3. günün jokeri seçtiğin güçlendiriciye dönüşür (simgedeki sayı: elindeki).
      </Text>
      <View style={styles.jokers}>
        {entries.map(([key, b]) => {
          const on = key === selected;
          const game = puzzleGame(b.game);
          const icon = (game?.boosters.find((x) => x.key === key)?.icon ?? "flash") as IconName;
          return (
            <Touchable
              key={key}
              onPress={() => onSelect(key)}
              haptic="selection"
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${b.title}, ${game?.title ?? ""}, elinde ${stock?.[key] ?? 0}`}
              style={[styles.joker, on ? styles.jokerOn : null]}
            >
              <View>
                <LinearGradient colors={HUB.game[b.game] ?? HUB.game.uclu} start={TOP} end={BOTTOM} style={styles.jokerIcon}>
                  <Ionicons name={icon} size={18} color={CARTOON.white} />
                </LinearGradient>
                <View style={[styles.jokerBadge, on ? styles.jokerBadgeOn : null]}>
                  {on ? (
                    <Ionicons name="checkmark" size={11} color={CARTOON.white} />
                  ) : (
                    <Text style={styles.jokerBadgeText} {...textScale.badge}>
                      {stock?.[key] ?? 0}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.jokerTexts}>
                <Text style={styles.jokerTitle} numberOfLines={1} {...textScale.dense}>
                  {b.title}
                </Text>
                <Text style={styles.jokerGame} numberOfLines={1} {...textScale.dense}>
                  {game?.title ?? b.game}
                </Text>
              </View>
            </Touchable>
          );
        })}
      </View>
    </View>
  );
}

function LifeGamePicker({
  selected,
  onSelect,
  lives,
  max,
}: {
  selected: PuzzleGameKey | null;
  onSelect: (key: PuzzleGameKey) => void;
  lives: Partial<Record<PuzzleGameKey, { lives: number }>> | undefined;
  max: number;
}) {
  return (
    <View style={styles.pick}>
      <Text style={styles.sectionTitle} {...textScale.dense}>
        Canları dolacak oyun
      </Text>
      <Text style={styles.pickLead} {...textScale.long}>
        5. günün ödülü: seçtiğin bulmacanın canları tam dolar.
      </Text>
      {PUZZLE_GAMES.map((g) => {
        const on = g.key === selected;
        const n = lives?.[g.key]?.lives ?? max;
        return (
          <Touchable
            key={g.key}
            onPress={() => onSelect(g.key)}
            haptic="selection"
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${g.title}, ${n}/${max} can`}
            style={[styles.lifeRow, on ? styles.jokerOn : null]}
          >
            <LinearGradient colors={HUB.game[g.key] ?? HUB.game.uclu} start={TOP} end={BOTTOM} style={styles.jokerIcon}>
              <Ionicons name={g.icon as IconName} size={18} color={CARTOON.white} />
            </LinearGradient>
            <Text style={styles.lifeTitle} numberOfLines={1} {...textScale.dense}>
              {g.title}
            </Text>
            <View style={styles.hearts}>
              {Array.from({ length: max }, (_, i) => (
                <Ionicons key={i} name={i < n ? "heart" : "heart-outline"} size={13} color={i < n ? CARTOON.heart : colors.textTertiary} />
              ))}
            </View>
            <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={20} color={on ? colors.win : colors.textTertiary} />
          </Touchable>
        );
      })}
    </View>
  );
}

function ChestContents({ boosters, title }: { boosters: Record<string, number>; title: (key: string) => string }) {
  return (
    <View style={styles.chest}>
      <LinearGradient colors={CARTOON.purple} start={TOP} end={BOTTOM} style={styles.chestIcon}>
        <Ionicons name="gift" size={22} color={CARTOON.white} />
      </LinearGradient>
      <View style={styles.saverTexts}>
        <Text style={styles.saverTitle} {...textScale.dense}>
          Haftanın sandığı
        </Text>
        <Text style={styles.saverSub} {...textScale.long}>
          {Object.entries(boosters)
            .map(([k, n]) => `${title(k)}${n > 1 ? ` ×${n}` : ""}`)
            .join(" · ")}
        </Text>
      </View>
    </View>
  );
}

function Milestones({ view }: { view: DailyView }) {
  const next = view.next;
  return (
    <View style={styles.miles}>
      <Text style={styles.sectionTitle} {...textScale.dense}>
        Uzun seri ödülleri
      </Text>
      {next ? (
        <View style={styles.mileNext}>
          <View style={styles.mileNextHead}>
            <Text style={styles.mileNextTitle} numberOfLines={1} {...textScale.dense}>
              Sıradaki: {next.title}
            </Text>
            <Text style={styles.mileNextDays} {...textScale.badge}>
              {next.inDays} gün kaldı
            </Text>
          </View>
          <View style={styles.mileTrack}>
            <LinearGradient colors={CARTOON.orange} start={LEFT} end={RIGHT} style={[styles.mileFill, { width: `${Math.max(4, next.progress * 100)}%` }]} />
          </View>
          <Text style={styles.mileNextSub} {...textScale.dense}>
            {Math.max(0, next.days - next.inDays)}/{next.days} gün
          </Text>
        </View>
      ) : (
        <Text style={styles.pickLead} {...textScale.long}>
          Bütün uzun seri ödüllerini açtın. Efsane bir başkansın!
        </Text>
      )}
      <View style={styles.mileRow}>
        {view.milestones.map((m) => {
          const isNext = next?.key === m.key;
          const icon = (LANDMARK_ICONS[m.landmark ?? m.key] ?? "flag") as IconName;
          return (
            <View key={m.key} style={styles.mile} accessibilityLabel={`${m.days} gün: ${m.title}${m.stars ? `, ${m.stars} yıldız` : ""}${m.reached ? ", açıldı" : ""}`}>
              {m.reached ? (
                <LinearGradient colors={CARTOON.gold} start={TOP} end={BOTTOM} style={styles.mileIcon}>
                  <Ionicons name={icon} size={22} color={CARTOON.goldInk} />
                  <View style={styles.mileCheck}>
                    <Ionicons name="checkmark" size={10} color={CARTOON.white} />
                  </View>
                </LinearGradient>
              ) : (
                <View style={[styles.mileIcon, styles.mileIconOff, isNext ? styles.mileIconNext : null]}>
                  <Ionicons name={icon} size={22} color={isNext ? colors.brandAccent : colors.textTertiary} />
                </View>
              )}
              <Text style={styles.mileDays} {...textScale.badge}>
                {m.days} gün
              </Text>
              <Text style={styles.mileTitle} numberOfLines={2} {...textScale.dense}>
                {m.title}
              </Text>
              {m.stars ? (
                <View style={styles.mileStars}>
                  <Ionicons name="star" size={10} color={CARTOON.star} />
                  <Text style={styles.mileStarsText} {...textScale.badge}>
                    +{m.stars}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/* ═══════════════════════ KUTLAMA (sonlu) ═══════════════════════ */

const BURST = 12;

function Celebration({ result, me }: { result: DailyClaimResponse; me: ReturnType<typeof usePuzzleMe>["data"] }) {
  const reduce = useReduceMotion();
  const pop = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const burst = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return;
    Animated.parallel([
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
      Animated.timing(burst, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [burst, pop, reduce]);

  const r = result.reward;
  const stars = result.stars ?? r.stars ?? 0;
  const milestone = result.milestone ?? null;
  const lines: { icon: IconName; text: string; tint: string }[] = [];
  if (r.coins) lines.push({ icon: "disc", text: `+${fmt(r.coins)} jeton`, tint: colors.yellowCard });
  if (r.joker_booster) lines.push({ icon: "flash", text: `Joker: ${me?.catalog.boosters[r.joker_booster]?.title ?? r.joker_booster}`, tint: colors.brandAccent });
  if (r.life_game) lines.push({ icon: "heart", text: `${puzzleGame(r.life_game)?.title ?? r.life_game}: canlar doldu`, tint: CARTOON.heart });
  if (r.boosters && Object.keys(r.boosters).length)
    lines.push({
      icon: "gift",
      text: `${r.chest ? "Haftanın sandığı: " : ""}${Object.entries(r.boosters)
        .map(([k, n]) => `${me?.catalog.boosters[k]?.title ?? k}${n > 1 ? ` ×${n}` : ""}`)
        .join(", ")}`,
      tint: colors.brandAccent,
    });

  return (
    <View style={styles.party}>
      <View style={styles.partyStage}>
        {Array.from({ length: BURST }, (_, i) => {
          const a = (i / BURST) * Math.PI * 2;
          const dist = 86 + (i % 3) * 14;
          return (
            <Animated.View
              key={i}
              pointerEvents="none"
              style={[
                styles.spark,
                {
                  opacity: burst.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 1, 0.9] }),
                  transform: [
                    { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * dist] }) },
                    { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * dist] }) },
                    { scale: burst.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 1.2, 0.6] }) },
                  ],
                },
              ]}
            >
              <Ionicons name={i % 2 ? "star" : "sparkles"} size={i % 3 ? 16 : 22} color={i % 4 === 1 ? CARTOON.heart : CARTOON.star} />
            </Animated.View>
          );
        })}
        <Animated.View style={{ transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }}>
          <LinearGradient colors={CARTOON.gold} start={TOP} end={BOTTOM} style={styles.partyStar}>
            <Ionicons name="star" size={44} color={CARTOON.white} />
            <Text style={styles.partyStarText} {...textScale.badge}>
              +{stars || r.coins}
            </Text>
          </LinearGradient>
        </Animated.View>
      </View>
      <Text style={styles.partyTitle} {...textScale.dense}>
        {stars ? `+${fmt(stars)} yıldız!` : `+${fmt(r.coins)} jeton!`}
      </Text>
      <View style={styles.partyStreak}>
        <Ionicons name="flame" size={16} color={CARTOON.orange[1]} />
        <Text style={styles.partyStreakText} {...textScale.dense}>
          {result.streak} günlük seri
        </Text>
      </View>
      {milestone ? (
        <View style={styles.partyMile}>
          <LinearGradient colors={CARTOON.pill} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
          <View style={styles.partyMileIcon}>
            <Ionicons name={(LANDMARK_ICONS[milestone.landmark ?? milestone.key] ?? "trophy") as IconName} size={26} color={CARTOON.goldInk} />
          </View>
          <View style={styles.saverTexts}>
            <Text style={styles.partyMileTitle} {...textScale.dense}>
              {milestone.days} günlük seri: {milestone.title} açıldı!
            </Text>
            <Text style={styles.partyMileSub} {...textScale.long}>
              {milestone.stars ? `+${fmt(milestone.stars)} yıldız da senin. ` : ""}Sembol yapın Kulüp Şehri'nde seni bekliyor.
            </Text>
          </View>
        </View>
      ) : null}
      <View style={styles.partyLines}>
        {stars && r.stars && stars !== r.stars ? (
          <PartyLine icon="star" tint={CARTOON.star} text={`${r.stars} yıldız günlük ödül + ${stars - r.stars} yıldız seri ödülü`} />
        ) : null}
        {lines.map((l) => (
          <PartyLine key={l.text} icon={l.icon} tint={l.tint} text={l.text} />
        ))}
      </View>
    </View>
  );
}

function PartyLine({ icon, tint, text }: { icon: IconName; tint: string; text: string }) {
  return (
    <View style={styles.partyLine}>
      <Ionicons name={icon} size={16} color={tint} />
      <Text style={styles.partyLineText} {...textScale.dense}>
        {text}
      </Text>
    </View>
  );
}

/* ═══════════════════════ STİLLER ═══════════════════════ */

const styles = StyleSheet.create({
  /* kart */
  card: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.xl, overflow: "hidden", borderWidth: 2, borderColor: CARTOON.glassEdge },
  cardReady: { borderColor: CARTOON.star },
  cardSaver: { borderColor: CARTOON.orange[0] },
  cardBadgeWrap: { width: 56, height: 56 },
  cardBadge: { width: 56, height: 56, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: CARTOON.white },
  flameBadge: {
    position: "absolute",
    right: -6,
    bottom: -4,
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    paddingHorizontal: space.xs,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: CARTOON.orange[1],
    borderWidth: 2,
    borderColor: CARTOON.white,
  },
  flameText: { ...type.micro, fontFamily: fonts.bold, color: CARTOON.white },
  cardTexts: { flex: 1, gap: 2 },
  cardTitle: { ...type.h3, fontFamily: fonts.bold, color: CARTOON.white },
  cardSub: { ...type.caption, color: HUB.muted },
  cardNext: { ...type.micro, color: HUB.muted, marginTop: 2 },
  dots: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  dot: { width: 14, height: 14, borderRadius: radius.pill, backgroundColor: CARTOON.glass, alignItems: "center", justifyContent: "center" },
  dotDone: { backgroundColor: CARTOON.correct },
  dotToday: { backgroundColor: CARTOON.star, borderWidth: 2, borderColor: CARTOON.white },
  cardCta: { paddingHorizontal: space.md, height: 34, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: CARTOON.green[1], borderWidth: 2, borderColor: CARTOON.white },
  cardCtaSaver: { backgroundColor: CARTOON.orange[1] },
  cardCtaText: { ...type.label, fontFamily: fonts.bold, color: CARTOON.white, letterSpacing: 1 },

  /* pencere */
  sheet: { gap: space.lg, paddingBottom: space.md },
  sectionTitle: { ...type.h3, fontFamily: fonts.bold, color: colors.textPrimary },
  rules: { ...type.caption, color: colors.textTertiary },

  hero: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg, borderRadius: radius.xxl, overflow: "hidden" },
  heroFlame: { width: 58, height: 58, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: CARTOON.white },
  heroTexts: { flex: 1, gap: 2 },
  heroBig: { ...type.display, fontFamily: fonts.bold, color: CARTOON.white },
  heroSub: { ...type.bodySm, color: HUB.muted },
  heroBest: { alignItems: "center", paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.lg, backgroundColor: CARTOON.glass },
  heroBestValue: { ...type.h2, fontFamily: fonts.bold, color: CARTOON.white },
  heroBestLabel: { ...type.micro, color: HUB.muted },

  saver: { gap: space.sm, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.warnDim, borderWidth: 2, borderColor: colors.warn },
  saverHead: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  saverIcon: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface1 },
  saverTexts: { flex: 1, gap: 2 },
  saverTitle: { ...type.h3, fontFamily: fonts.bold, color: colors.textPrimary },
  saverSub: { ...type.bodySm, color: colors.textSecondary },
  saverFoot: { ...type.caption, color: colors.textSecondary, textAlign: "center" },

  grid: { gap: space.sm },
  gridRow: { flexDirection: "row", gap: space.sm },
  tile: {
    flex: 1,
    minHeight: 96,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: space.sm,
    paddingHorizontal: space.xxs,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  tileWide: { flex: 2.15 },
  tileToday: { borderWidth: 2, borderColor: CARTOON.goldLip, transform: [{ scale: 1.04 }] },
  tileFill: { borderRadius: radius.lg },
  tileDone: { backgroundColor: colors.winDim, borderColor: colors.win },
  tileDay: { ...type.micro, fontFamily: fonts.bold, letterSpacing: 0.6 },
  tileMain: { flexDirection: "row", alignItems: "center", gap: 3 },
  tileValue: { ...type.scoreSm },
  tileValueWide: { ...type.scoreMd },
  tileCoins: { ...type.micro },
  tileExtra: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2, paddingHorizontal: space.xs, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: colors.brandDim },
  tileExtraToday: { backgroundColor: CARTOON.shine },
  tileExtraText: { ...type.micro, fontFamily: fonts.bold },
  tileCheck: { position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.win, borderWidth: 2, borderColor: colors.surface1 },

  pick: { gap: space.sm },
  pickLead: { ...type.bodySm, color: colors.textSecondary, marginTop: -space.xs },
  jokers: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  joker: { width: "48%", flexGrow: 1, flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.sm, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 2, borderColor: colors.border },
  jokerOn: { borderColor: colors.win, backgroundColor: colors.winDim },
  jokerIcon: { width: 34, height: 34, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  jokerTexts: { flex: 1, gap: 1 },
  jokerTitle: { ...type.label, fontFamily: fonts.bold, color: colors.textPrimary },
  jokerGame: { ...type.caption, color: colors.textSecondary },
  jokerBadge: {
    position: "absolute",
    right: -6,
    bottom: -5,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 3,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CARTOON.navy,
    borderWidth: 1.5,
    borderColor: CARTOON.white,
  },
  jokerBadgeOn: { backgroundColor: colors.win },
  jokerBadgeText: { ...type.micro, fontFamily: fonts.bold, color: CARTOON.white },
  lifeRow: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.sm, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 2, borderColor: colors.border },
  lifeTitle: { ...type.label, fontFamily: fonts.bold, color: colors.textPrimary, flex: 1 },
  hearts: { flexDirection: "row", gap: 1 },

  chest: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.brandDim },
  chestIcon: { width: 44, height: 44, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: CARTOON.white },

  miles: { gap: space.sm },
  mileNext: { gap: space.xs, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface2, borderWidth: hairline, borderColor: colors.border },
  mileNextHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  mileNextTitle: { ...type.label, fontFamily: fonts.bold, color: colors.textPrimary, flex: 1 },
  mileNextDays: { ...type.caption, fontFamily: fonts.bold, color: colors.warn },
  mileTrack: { height: 12, borderRadius: radius.pill, backgroundColor: colors.surface3, overflow: "hidden" },
  mileFill: { height: 12, borderRadius: radius.pill },
  mileNextSub: { ...type.caption, color: colors.textSecondary },
  mileRow: { flexDirection: "row", gap: space.sm },
  mile: { flex: 1, alignItems: "center", gap: 2 },
  mileIcon: { width: 50, height: 50, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: CARTOON.white },
  mileIconOff: { backgroundColor: colors.surface3, borderColor: colors.border },
  mileIconNext: { borderColor: colors.brandAccent, backgroundColor: colors.brandDim },
  mileCheck: { position: "absolute", right: -4, bottom: -4, width: 18, height: 18, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.win, borderWidth: 2, borderColor: CARTOON.white },
  mileDays: { ...type.micro, fontFamily: fonts.bold, color: colors.textSecondary, marginTop: 2 },
  mileTitle: { ...type.caption, fontFamily: fonts.semibold, color: colors.textPrimary, textAlign: "center" },
  mileStars: { flexDirection: "row", alignItems: "center", gap: 2 },
  mileStarsText: { ...type.micro, fontFamily: fonts.bold, color: colors.textSecondary },

  /* kutlama */
  party: { alignItems: "center", gap: space.md, paddingBottom: space.lg },
  partyStage: { width: 260, height: 200, alignItems: "center", justifyContent: "center" },
  spark: { position: "absolute" },
  partyStar: { width: 120, height: 120, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: CARTOON.white },
  partyStarText: { ...type.scoreSm, color: CARTOON.goldInk, marginTop: -space.xxs },
  partyTitle: { ...type.largeTitle, fontFamily: fonts.bold, color: colors.textPrimary, textAlign: "center" },
  partyStreak: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: colors.warnDim },
  partyStreakText: { ...type.label, fontFamily: fonts.bold, color: colors.warn },
  partyMile: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.xl, overflow: "hidden", borderWidth: 2, borderColor: CARTOON.star },
  partyMileIcon: { width: 50, height: 50, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: CARTOON.star, borderWidth: 2, borderColor: CARTOON.white },
  partyMileTitle: { ...type.h3, fontFamily: fonts.bold, color: CARTOON.white },
  partyMileSub: { ...type.bodySm, color: HUB.muted },
  partyLines: { alignSelf: "stretch", gap: space.xs },
  partyLine: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.sm, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  partyLineText: { ...type.body, color: colors.textPrimary, flex: 1 },
});
