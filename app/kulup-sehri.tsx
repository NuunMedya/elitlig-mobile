/**
 * KULÜP ŞEHRİ — /kulup-sehri
 *
 * Bütün oyunlardan gelen yıldızlarla kurulan futbol şehri. Okulun beton
 * bahçesinde başlarsın; yıldızlarını sahaya, tribüne, soyunma odasına,
 * kafeteryaya, kulüp mağazasına, kamp oteline… harcayarak amatör bir okul
 * takımından Avrupa devine yükselirsin.
 *
 * EKRAN:
 *   · Üstte canlı 3B şehir (games/sehir.js, WebView): birime dokununca kamera
 *     uçar ve birimin kartı açılır; geliştirince inşaat oynar.
 *   · Yıldız cüzdanı: harcanabilir yıldız, kaynakları (Lig Yolu · Oyunlar ·
 *     Tahmin+Fantezi · Saha+Görev XP) ve "Yıldızları topla". Oyunlar ve lig
 *     yarışmaları YILDIZI doğrudan verir (XP vermez); XP yalnız sahadan ve
 *     görevlerden gelir ve burada yıldıza çevrilir (10 XP = 1 yıldız).
 *   · Kulüp statüsü ve gelişim puanı.
 *   · Birim kartları: şimdiki hâl, sıradaki basamak, maliyet ya da kilit.
 *
 * Kurallar ve maliyetler sunucudadır (elitlig-server services/puzzle/city.js).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAdminMutation } from "@/components/admin";
import { WebGame, type WebGameHandle } from "@/components/game/WebGame";
import { BottomSheet, Button, ErrorState, ScreenHeader, SkeletonCard, Touchable, useToast } from "@/components/ui";
import { cityKeys, collectCityStars, getCity, puzzleKeys, upgradeCity, type CityBuilding, type CityState } from "@/lib/puzzle/api";
import { ARENA_TITLES, CITY_ICONS, CITY_KIT_KEY, CITY_SKY, CITY_UI, CITY_UNIT_COLORS, CLUB_KITS, type ClubKit } from "@/lib/puzzle/cityPalette";
import { useAuth } from "@/providers/AuthProvider";
import { colors, fonts, hairline, layout, radius, space, textScale, type } from "@/theme";

const fmt = (n: number) => n.toLocaleString("tr-TR");
const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;
const unitColors = (key: string) => CITY_UNIT_COLORS[key] ?? CITY_UNIT_COLORS.saha;

/** Alt dudaklı 3B oyun düğmesi (altın: geliştir · yeşil: topla). */
function ChunkyButton({
  label,
  icon,
  onPress,
  disabled,
  tone = "gold",
  small,
  accessibilityLabel,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  tone?: "gold" | "green";
  small?: boolean;
  accessibilityLabel?: string;
}) {
  const fill = tone === "green" ? CITY_UI.green : CITY_UI.gold;
  const lip = tone === "green" ? CITY_UI.greenLip : CITY_UI.goldLip;
  const ink = tone === "green" ? CITY_UI.white : CITY_UI.ink;
  const h = small ? 38 : 52;
  return (
    <Touchable
      onPress={onPress}
      disabled={disabled}
      haptic="success"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[small ? styles.chunkySmall : styles.chunky, { height: h + 4, opacity: disabled ? 0.45 : 1 }]}
    >
      <View style={[styles.chunkyLip, { height: h, backgroundColor: lip }]} />
      <LinearGradient colors={fill} start={TOP} end={BOTTOM} style={[styles.chunkyFill, { height: h }]}>
        {icon ? <Ionicons name={icon} size={small ? 15 : 20} color={ink} /> : null}
        <Text style={[small ? styles.chunkyTextSmall : styles.chunkyText, { color: ink }]} numberOfLines={1} {...textScale.badge}>
          {label}
        </Text>
      </LinearGradient>
    </Touchable>
  );
}

export default function ClubCityScreen() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { height } = useWindowDimensions();
  const scene = useRef<WebGameHandle>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [kit, setKit] = useState<ClubKit>(CLUB_KITS[0]);
  const [kitSheet, setKitSheet] = useState(false);
  const [howSheet, setHowSheet] = useState(false);

  const query = useQuery({ queryKey: cityKeys.me(), queryFn: getCity, enabled: Boolean(auth.user), staleTime: 20_000, retry: false });
  const city = query.data?.city;

  useEffect(() => {
    AsyncStorage.getItem(CITY_KIT_KEY).then((value) => {
      const found = CLUB_KITS.find((k) => k.key === value);
      if (found) setKit(found);
    });
  }, []);

  const write = useCallback(
    (next: CityState) => {
      queryClient.setQueryData(cityKeys.me(), (current: { city: CityState; tiers: unknown[] } | undefined) => (current ? { ...current, city: next } : current));
      void queryClient.invalidateQueries({ queryKey: puzzleKeys.me() });
    },
    [queryClient],
  );

  /* Sahneye şehrin durumu: seviyeler, renkler, etiket rozetleri. */
  const marks = useMemo(() => {
    const out: Record<string, string> = {};
    for (const b of city?.buildings ?? []) {
      if (!b.next) out[b.key] = "max";
      else if (b.locked) out[b.key] = "lock";
      else if (city && city.stars.available >= b.next.cost) out[b.key] = "up";
    }
    return out;
  }, [city]);

  const pushCity = useCallback(
    (focus?: string | null) => {
      if (!city || !ready) return;
      scene.current?.send({
        type: "city",
        levels: city.levels,
        kit: { primary: kit.primary, secondary: kit.secondary },
        marks,
        tier: city.tier.title,
        ...(focus !== undefined ? { focus } : {}),
      });
    },
    [city, kit, marks, ready],
  );
  useEffect(() => {
    pushCity();
  }, [pushCity]);

  const upgrade = useAdminMutation((key: string) => upgradeCity(key), {
    success: (res) => `${res.step.title} hazır!`,
    onSuccess: (res) => {
      write(res.city);
      scene.current?.send({ type: "focus", key: res.building });
      if (res.tier_up) {
        scene.current?.send({ type: "celebrate" });
        toast.show({ message: `Yeni statü: ${res.tier_up.title}!`, tone: "success" });
      }
    },
  });
  const collect = useAdminMutation(() => collectCityStars(), {
    success: (res) => `${fmt(res.stars)} yıldız havuzuna eklendi (${fmt(res.xp)} XP)`,
    onSuccess: (res) => write(res.city),
  });

  const chooseKit = (next: ClubKit) => {
    setKit(next);
    void AsyncStorage.setItem(CITY_KIT_KEY, next.key);
    setKitSheet(false);
  };

  const onEvent = useCallback((message: Record<string, unknown>) => {
    if (message.type === "tap" && typeof message.key === "string") setOpen(message.key);
  }, []);

  if (!auth.user) return <Redirect href="/giris" />;

  const selected = city?.buildings.find((b) => b.key === open) ?? null;
  const sceneHeight = Math.max(260, Math.min(460, height * 0.46));

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Kulüp Şehrin"
        subtitle={city ? `${city.tier.title} · ${fmt(city.dev)} gelişim puanı` : "Yıldızlarınla futbol şehrini kur"}
        back
        actions={[
          { icon: "color-palette-outline", onPress: () => setKitSheet(true), accessibilityLabel: "Kulüp renkleri" },
          { icon: "podium-outline", onPress: () => router.push("/kulup-sehri-siralama"), accessibilityLabel: "Gelişim sıralaması" },
        ]}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.scene, { height: sceneHeight }]}>
          <WebGame
            ref={scene}
            game="sehir"
            background={CITY_SKY}
            accessibilityLabel="Kulüp şehri"
            onReady={() => setReady(true)}
            onEvent={onEvent}
          />
          {city ? (
            <View style={styles.sceneBadge} pointerEvents="none">
              <Ionicons name="star" size={14} color={colors.yellowCard} />
              <Text style={styles.sceneBadgeText} {...textScale.badge}>
                {fmt(city.stars.available)}
              </Text>
            </View>
          ) : null}
          <Touchable onPress={() => scene.current?.send({ type: "focus", key: null })} style={styles.sceneHome} accessibilityRole="button" accessibilityLabel="Bütün şehri göster">
            <Ionicons name="scan-outline" size={18} color={colors.onDark} />
          </Touchable>
        </View>

        {query.isLoading ? (
          <SkeletonCard lines={5} />
        ) : query.isError || !city ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <>
            <Wallet city={city} collecting={collect.isPending} onCollect={() => collect.mutate(undefined)} onHow={() => setHowSheet(true)} />
            <TierCard city={city} />
            <Text style={styles.sectionTitle} {...textScale.dense}>
              Birimler · {city.progress.built}/{city.progress.total} basamak
            </Text>
            {city.buildings.map((b) => (
              <BuildingCard
                key={b.key}
                b={b}
                available={city.stars.available}
                busy={upgrade.isPending}
                onOpen={() => {
                  setOpen(b.key);
                  scene.current?.send({ type: "focus", key: b.key });
                }}
                onUpgrade={() => upgrade.mutate(b.key)}
              />
            ))}
          </>
        )}
      </ScrollView>

      <BuildingSheet
        b={selected}
        available={city?.stars.available ?? 0}
        busy={upgrade.isPending}
        onClose={() => setOpen(null)}
        onUpgrade={(key) => upgrade.mutate(key)}
      />
      <BottomSheet visible={kitSheet} onClose={() => setKitSheet(false)} title="Kulüp renkleri" snap="half">
        <Text style={styles.sheetLead} {...textScale.long}>
          Formalar, çatılar, bayraklar ve tabelalar bu renklerle boyanır.
        </Text>
        <View style={styles.kits}>
          {CLUB_KITS.map((k) => (
            <Touchable key={k.key} onPress={() => chooseKit(k)} style={[styles.kit, k.key === kit.key ? styles.kitOn : null]} accessibilityRole="button" accessibilityLabel={k.name}>
              <View style={styles.kitSwatch}>
                <View style={[styles.kitHalf, { backgroundColor: k.primary }]} />
                <View style={[styles.kitHalf, { backgroundColor: k.secondary }]} />
              </View>
              <Text style={styles.kitName} numberOfLines={1} {...textScale.dense}>
                {k.name}
              </Text>
            </Touchable>
          ))}
        </View>
      </BottomSheet>
      <HowSheet visible={howSheet} onClose={() => setHowSheet(false)} city={city} onGames={() => router.push("/(tabs)/oyunlar")} onQuests={() => router.push("/gorevler")} />
    </SafeAreaView>
  );
}

/* ═════════════════════════ YILDIZ CÜZDANI ═════════════════════════ */

function Wallet({ city, collecting, onCollect, onHow }: { city: CityState; collecting: boolean; onCollect: () => void; onHow: () => void }) {
  const s = city.stars;
  const claim = city.xp.claimable_stars;
  return (
    <View style={styles.wallet}>
      <LinearGradient colors={CITY_UI.panel} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
      <View style={styles.walletTop}>
        <LinearGradient colors={CITY_UI.gold} start={TOP} end={BOTTOM} style={styles.walletStar}>
          <Ionicons name="star" size={32} color={CITY_UI.white} />
        </LinearGradient>
        <View style={styles.walletTexts}>
          <Text style={styles.walletBig} {...textScale.dense}>
            {fmt(s.available)}
          </Text>
          <Text style={styles.walletSub} {...textScale.dense}>
            harcanabilir yıldız · {fmt(s.total)} kazanıldı
          </Text>
        </View>
        <Touchable onPress={onHow} style={styles.walletHow} accessibilityRole="button" accessibilityLabel="Yıldız nasıl kazanılır">
          <Ionicons name="help-circle" size={26} color={CITY_UI.muted} />
        </Touchable>
      </View>
      <View style={styles.sources}>
        <Source icon="extension-puzzle" label="Lig Yolu" value={s.puzzle} tint={CITY_UI.sources[0]} />
        <Source icon="game-controller" label="Oyunlar" value={s.arena} extra={s.arena_today ? `bugün +${s.arena_today}` : null} tint={CITY_UI.sources[1]} />
        {s.tribun != null ? <Source icon="podium" label="Lig oyunları" value={s.tribun} tint={CITY_UI.sources[3]} /> : null}
        <Source icon="flash" label="XP yıldızı" value={s.xp} tint={CITY_UI.sources[2]} />
      </View>
      <ChunkyButton
        label={collecting ? "TOPLANIYOR…" : claim > 0 ? `YILDIZLARI TOPLA · +${fmt(claim)}` : "TOPLANACAK YILDIZ YOK"}
        icon="sparkles"
        tone="green"
        disabled={claim < 1 || collecting}
        onPress={onCollect}
        accessibilityLabel={claim > 0 ? `Haftalık görev ve maç XP'sinden ${claim} yıldız topla` : "Toplanacak yıldız yok"}
      />
      <Text style={styles.walletHint} {...textScale.dense}>
        {claim > 0
          ? `${fmt(city.xp.pending)} XP bekliyor · ${city.xp.per_star} XP = 1 yıldız`
          : city.xp.pending > 0
            ? `${fmt(city.xp.pending)} XP birikti · ${city.xp.per_star} XP'de bir yıldız`
            : "XP sahadan ve haftalık görevlerden gelir; burada yıldıza çevir."}
      </Text>
    </View>
  );
}

function Source({ icon, label, value, extra, tint }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number; extra?: string | null; tint: string }) {
  return (
    <View style={styles.source}>
      <View style={[styles.sourceIcon, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={15} color={CITY_UI.white} />
      </View>
      <Text style={styles.sourceValue} {...textScale.dense}>
        {fmt(value)}
      </Text>
      <Text style={styles.sourceLabel} numberOfLines={1} {...textScale.badge}>
        {extra ? `${label} · ${extra}` : label}
      </Text>
    </View>
  );
}

/* ═════════════════════════ STATÜ ═════════════════════════ */

function TierCard({ city }: { city: CityState }) {
  const next = city.next_tier;
  const span = next ? next.min - city.tier.min : 1;
  const prog = next ? Math.max(0, Math.min(1, (city.dev - city.tier.min) / span)) : 1;
  return (
    <View style={styles.tier}>
      <View style={styles.tierHead}>
        <LinearGradient colors={CITY_UI.gold} start={TOP} end={BOTTOM} style={styles.tierBadge}>
          <Ionicons name="trophy" size={20} color={CITY_UI.white} />
        </LinearGradient>
        <Text style={styles.tierTitle} {...textScale.dense}>
          {city.tier.title}
        </Text>
        <Text style={styles.tierStep} {...textScale.badge}>
          {city.tier.index + 1}/10
        </Text>
      </View>
      <View style={styles.track}>
        <LinearGradient colors={CITY_UI.green} start={TOP} end={BOTTOM} style={[styles.fill, { width: `${prog * 100}%` }]} />
      </View>
      <Text style={styles.tierSub} {...textScale.dense}>
        {next ? `${next.title} için ${fmt(next.min - city.dev)} gelişim puanı daha` : "Zirvedesin: Avrupa devi!"}
      </Text>
    </View>
  );
}

/* ═════════════════════════ BİRİM ═════════════════════════ */

function Steps({ b }: { b: CityBuilding }) {
  const first = b.steps[0]?.cost === 0 && b.key !== "saha" ? 1 : 0;
  const [, deep] = unitColors(b.key);
  return (
    <View style={styles.steps}>
      {b.steps.slice(first).map((s) => (
        <View
          key={s.level}
          style={[styles.step, s.done ? { backgroundColor: deep } : null, s.level === b.level + 1 ? [styles.stepNext, { borderColor: deep }] : null]}
        />
      ))}
    </View>
  );
}

function BuildingCard({ b, available, busy, onOpen, onUpgrade }: { b: CityBuilding; available: number; busy: boolean; onOpen: () => void; onUpgrade: () => void }) {
  const icon = (b.icon || CITY_ICONS[b.key] || "cube") as keyof typeof Ionicons.glyphMap;
  const affordable = Boolean(b.next && available >= b.next.cost);
  return (
    <Touchable onPress={onOpen} style={styles.card} haptic="selection" accessibilityRole="button" accessibilityLabel={`${b.title}, ${b.current?.title ?? "henüz yok"}`}>
      {b.level > 0 || b.key === "saha" ? (
        <LinearGradient colors={unitColors(b.key)} start={TOP} end={BOTTOM} style={styles.cardIcon}>
          <Ionicons name={icon} size={28} color={CITY_UI.white} />
          <View style={styles.levelBadge}>
            <Text style={styles.levelBadgeText} {...textScale.badge}>{b.level}</Text>
          </View>
        </LinearGradient>
      ) : (
        <View style={[styles.cardIcon, styles.cardIconOff]}>
          <Ionicons name={icon} size={28} color={CITY_UI.white} />
        </View>
      )}
      <View style={styles.cardTexts}>
        <Text style={styles.cardTitle} numberOfLines={1} {...textScale.dense}>
          {b.title}
        </Text>
        <Text style={styles.cardSub} numberOfLines={1} {...textScale.dense}>
          {b.current ? b.current.title : "Henüz yok"}
        </Text>
        <Steps b={b} />
        {b.next ? (
          <Text style={[styles.cardNext, b.locked ? styles.cardLocked : null]} numberOfLines={1} {...textScale.dense}>
            {b.locked ? b.locked.text : `Sıradaki: ${b.next.title}`}
          </Text>
        ) : (
          <Text style={styles.cardMax} {...textScale.dense}>
            Son basamak · profesyonel seviye
          </Text>
        )}
      </View>
      {b.next && !b.locked ? (
        <ChunkyButton
          label={fmt(b.next.cost)}
          icon="star"
          small
          disabled={!affordable || busy}
          onPress={onUpgrade}
          accessibilityLabel={`${b.next.title}, ${b.next.cost} yıldız`}
        />
      ) : b.next ? (
        <Ionicons name="lock-closed" size={18} color={colors.textTertiary} />
      ) : (
        <Ionicons name="checkmark-circle" size={28} color={CITY_UI.done} />
      )}
    </Touchable>
  );
}

function BuildingSheet({ b, available, busy, onClose, onUpgrade }: { b: CityBuilding | null; available: number; busy: boolean; onClose: () => void; onUpgrade: (key: string) => void }) {
  const affordable = Boolean(b?.next && available >= b.next.cost);
  return (
    <BottomSheet
      visible={Boolean(b)}
      onClose={onClose}
      title={b?.title}
      snap="half"
      footer={
        b?.next && !b.locked ? (
          <Button
            label={affordable ? `${b.next.title} · ${fmt(b.next.cost)} yıldız` : `${fmt(b.next.cost - available)} yıldız eksik`}
            icon={affordable ? "hammer" : "star-outline"}
            disabled={!affordable || busy}
            loading={busy}
            onPress={() => onUpgrade(b.key)}
            fullWidth
            haptic="success"
          />
        ) : undefined
      }
    >
      {b ? (
        <View style={styles.ladder}>
          {b.current?.desc ? (
            <Text style={styles.sheetLead} {...textScale.long}>
              {b.current.desc}
            </Text>
          ) : null}
          {b.locked ? (
            <View style={styles.lockRow}>
              <Ionicons name="lock-closed" size={16} color={colors.textSecondary} />
              <Text style={styles.lockText} {...textScale.dense}>
                {b.locked.text}
              </Text>
            </View>
          ) : null}
          {b.steps.map((s) => {
            if (s.level === 0 && b.key !== "saha") return null;
            const isNext = b.next?.level === s.level;
            return (
              <View key={s.level} style={[styles.ladderRow, isNext ? styles.ladderNext : null]}>
                <Ionicons
                  name={s.done ? "checkmark-circle" : isNext ? "hammer" : "ellipse-outline"}
                  size={18}
                  color={s.done ? colors.win : isNext ? colors.brandAccent : colors.textTertiary}
                />
                <Text style={[styles.ladderTitle, s.done ? styles.ladderDone : null]} {...textScale.dense}>
                  {s.title}
                </Text>
                {s.cost ? (
                  <View style={styles.ladderCost}>
                    <Ionicons name="star" size={12} color={s.done ? colors.textTertiary : colors.yellowCard} />
                    <Text style={styles.ladderCostText} {...textScale.badge}>
                      {fmt(s.cost)}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
          {b.next?.desc ? (
            <Text style={styles.nextDesc} {...textScale.long}>
              Sıradaki: {b.next.desc}
            </Text>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}

/* ═════════════════════════ NASIL KAZANILIR ═════════════════════════ */

function HowSheet({ visible, onClose, city, onGames, onQuests }: { visible: boolean; onClose: () => void; city?: CityState; onGames: () => void; onQuests: () => void }) {
  const byGame = Object.entries(city?.stars.arena_by_game ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Yıldız nasıl kazanılır?" snap="full">
      <View style={styles.how}>
        <HowRow icon="extension-puzzle" title="Lig Yolu" text="Elit Üçlü, Üçle Kazan, Soyunma Odası, Kantin ve Kariyer Yolu: her seviye 1–3 yıldız." />
        <HowRow
          icon="game-controller"
          title="Oyunlar"
          text="Bölümlü oyunlarda (Penaltı, Savunma Hattı, Kadro Koşusu) geçtiğin her bölüm yaklaşık bir yıldız; puanlı oyunlarda (Slalom, Top Sektir, yarışmalar) puan eşikleri giderek uzar. Bir oyundan günde en çok 15, bütün oyunlardan 45 yıldız."
        />
        <HowRow
          icon="podium"
          title="Tahmin Ligi ve Fantezi"
          text="Tutan tahminlerinin puanı ve biten Fantezi haftalarının puanı yıldız olarak gelir (haftalık tavanla). Bunlar XP vermez."
        />
        <HowRow
          icon="flash"
          title="XP: saha ve görevler"
          text={`Oyunlar XP vermez. XP gerçek maçlardaki performansından ve haftalık görevlerden gelir: ${city?.xp.per_star ?? 10} XP = 1 yıldız. "Yıldızları topla" ile havuza aktar.`}
        />
        {byGame.length ? (
          <View style={styles.byGame}>
            <Text style={styles.byGameTitle} {...textScale.dense}>
              Oyunlardan gelen yıldızların
            </Text>
            {byGame.map(([game, value]) => (
              <View key={game} style={styles.byGameRow}>
                <Text style={styles.byGameName} {...textScale.dense}>
                  {ARENA_TITLES[game] ?? game}
                </Text>
                <Ionicons name="star" size={12} color={colors.yellowCard} />
                <Text style={styles.byGameValue} {...textScale.badge}>
                  {fmt(value)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.howButtons}>
          <Button label="Oyunlara git" icon="game-controller" variant="secondary" onPress={onGames} fullWidth />
          <Button label="Haftalık görevler" icon="list" variant="secondary" onPress={onQuests} fullWidth />
        </View>
      </View>
    </BottomSheet>
  );
}

function HowRow({ icon, title, text }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }) {
  return (
    <View style={styles.howRow}>
      <View style={styles.howIcon}>
        <Ionicons name={icon} size={18} color={colors.brandAccent} />
      </View>
      <View style={styles.howTexts}>
        <Text style={styles.howTitle} {...textScale.dense}>
          {title}
        </Text>
        <Text style={styles.howText} {...textScale.long}>
          {text}
        </Text>
      </View>
    </View>
  );
}

/* ═════════════════════════ STİLLER ═════════════════════════ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.giant * 2, gap: space.md, paddingTop: space.xs },
  scene: { borderRadius: radius.xl, overflow: "hidden", backgroundColor: colors.inkBlock, borderWidth: hairline, borderColor: colors.inkTileBorder },
  sceneBadge: {
    position: "absolute",
    top: space.sm,
    left: space.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    backgroundColor: colors.overlay,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
  },
  sceneBadgeText: { ...type.label, fontFamily: fonts.bold, color: colors.onDark },
  sceneHome: {
    position: "absolute",
    top: space.sm,
    right: space.sm,
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.overlay,
  },

  wallet: { borderRadius: radius.xxl, padding: space.lg, gap: space.md, overflow: "hidden", borderWidth: 3, borderColor: CITY_UI.panelEdge },
  walletTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  walletStar: { width: 58, height: 58, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: CITY_UI.white },
  walletTexts: { flex: 1, gap: 2 },
  walletBig: { ...type.display, fontFamily: fonts.bold, color: CITY_UI.white, textShadowColor: CITY_UI.inkShadow, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2 },
  walletSub: { ...type.bodySm, color: CITY_UI.muted },
  walletHow: { padding: space.xs },
  walletHint: { ...type.caption, color: CITY_UI.muted, textAlign: "center" },
  sources: { flexDirection: "row", gap: space.sm },
  source: { flex: 1, alignItems: "center", gap: 2, paddingVertical: space.sm, borderRadius: radius.lg, backgroundColor: CITY_UI.chip },
  sourceIcon: { width: 28, height: 28, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  sourceValue: { ...type.h3, fontFamily: fonts.bold, color: CITY_UI.white },
  sourceLabel: { ...type.caption, color: CITY_UI.muted },

  tier: { borderRadius: radius.xxl, padding: space.lg, gap: space.sm, backgroundColor: colors.surface1, borderWidth: 2, borderColor: CITY_UI.gold[1] },
  tierBadge: { width: 38, height: 38, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: CITY_UI.white },
  tierHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  tierTitle: { ...type.h2, fontFamily: fonts.bold, color: colors.textPrimary, flex: 1 },
  tierStep: { ...type.label, color: colors.textSecondary },
  tierSub: { ...type.bodySm, color: colors.textSecondary },
  track: { height: 14, borderRadius: radius.pill, backgroundColor: colors.surface3, overflow: "hidden" },
  fill: { height: 14, borderRadius: radius.pill },

  sectionTitle: { ...type.label, color: colors.textSecondary, marginTop: space.xs },
  card: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.xxl, backgroundColor: colors.surface1, borderWidth: 2, borderColor: colors.border },
  cardIcon: { width: 58, height: 58, borderRadius: radius.xl, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: CITY_UI.white },
  cardIconOff: { backgroundColor: CITY_UI.lockBg },
  levelBadge: {
    position: "absolute",
    bottom: -6,
    right: -6,
    minWidth: 22,
    height: 22,
    paddingHorizontal: space.xxs,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CITY_UI.ink,
    borderWidth: 2,
    borderColor: CITY_UI.white,
  },
  levelBadgeText: { ...type.micro, fontFamily: fonts.bold, color: CITY_UI.white },
  cardTexts: { flex: 1, gap: 3 },
  cardTitle: { ...type.h3, fontFamily: fonts.bold, color: colors.textPrimary },
  cardSub: { ...type.bodySm, color: colors.textSecondary },
  cardNext: { ...type.caption, color: colors.brandAccent },
  cardLocked: { color: colors.textTertiary },
  cardMax: { ...type.caption, color: colors.win },
  steps: { flexDirection: "row", gap: 3, marginVertical: 3 },
  step: { flex: 1, height: 9, borderRadius: radius.pill, backgroundColor: colors.surface3 },
  stepNext: { borderWidth: 2 },
  chunky: { alignSelf: "stretch" },
  chunkySmall: { minWidth: 76 },
  chunkyLip: { position: "absolute", top: 4, left: 0, right: 0, borderRadius: radius.pill },
  chunkyFill: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 2, borderColor: CITY_UI.white },
  chunkyText: { ...type.label, fontFamily: fonts.bold, letterSpacing: 1 },
  chunkyTextSmall: { ...type.label, fontFamily: fonts.bold },

  sheetLead: { ...type.body, color: colors.textSecondary },
  ladder: { gap: space.xs },
  lockRow: { flexDirection: "row", alignItems: "center", gap: space.xs, padding: space.sm, borderRadius: radius.lg, backgroundColor: colors.surface3 },
  lockText: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
  ladderRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 40, paddingHorizontal: space.sm, borderRadius: radius.lg },
  ladderNext: { backgroundColor: colors.brandDim },
  ladderTitle: { ...type.body, color: colors.textPrimary, flex: 1 },
  ladderDone: { color: colors.textSecondary },
  ladderCost: { flexDirection: "row", alignItems: "center", gap: 2 },
  ladderCostText: { ...type.caption, color: colors.textSecondary },
  nextDesc: { ...type.bodySm, color: colors.textSecondary, marginTop: space.xs },

  kits: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.sm },
  kit: { width: "47%", flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.sm, borderRadius: radius.lg, borderWidth: hairline, borderColor: colors.border, backgroundColor: colors.surface1 },
  kitOn: { borderColor: colors.brandAccent, backgroundColor: colors.brandDim },
  kitSwatch: { width: 30, height: 30, borderRadius: radius.pill, overflow: "hidden", flexDirection: "row", borderWidth: hairline, borderColor: colors.border },
  kitHalf: { flex: 1 },
  kitName: { ...type.bodySm, color: colors.textPrimary, flex: 1 },

  how: { gap: space.lg },
  howRow: { flexDirection: "row", gap: space.md },
  howIcon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandDim },
  howTexts: { flex: 1, gap: 2 },
  howTitle: { ...type.body, fontFamily: fonts.bold, color: colors.textPrimary },
  howText: { ...type.bodySm, color: colors.textSecondary },
  byGame: { gap: space.xs, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface3 },
  byGameTitle: { ...type.label, color: colors.textSecondary },
  byGameRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  byGameName: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  byGameValue: { ...type.caption, fontFamily: fonts.bold, color: colors.textPrimary },
  howButtons: { gap: space.sm },
});
