/**
 * YILDIZ CÜZDANI + "Yıldız nasıl kazanılır?" penceresi.
 *
 * Kulüp Şehri'nin eski (v1, GET /city → city.stars) ve yeni (2.0, GET /city2 →
 * city2.stars) ekranlarının ortak parçası. İki sunucu da aynı kaynak kırılımını
 * yollar (Ekonomi A); burada tek biçime indirgenir: harcanabilir + kazanılan
 * yıldız ve kaynaklar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";

import { ChunkyButton } from "@/components/city/ChunkyButton";
import { MatchStarsChip } from "@/components/city/MatchStars";
import { XpBuckets } from "@/components/city/XpBuckets";
import { BottomSheet, Button, Touchable } from "@/components/ui";
import type { CityState, CityXp } from "@/lib/puzzle/api";
import { ARENA_TITLES, CITY2_UI, CITY_UI } from "@/lib/puzzle/cityPalette";
import { colors, fonts, hairline, radius, space, textScale, type } from "@/theme";

const fmt = (n: number) => n.toLocaleString("tr-TR");
const TOP = { x: 0.5, y: 0 } as const;
const BOTTOM = { x: 0.5, y: 1 } as const;

export type WalletStars = Pick<CityState["stars"], "puzzle" | "arena" | "arena_today" | "arena_by_game" | "match" | "match_detail" | "tribun" | "daily" | "xp"> & {
  available: number;
  total: number;
  /** Şehir 2.0 taşımasında iade edilen yıldız. */
  refund?: number;
  /** Şehir 2.1: Kulüp Arenası haftalık ödülü ve jeton takası (yalnız kazanılmışsa). */
  club?: number;
  coin?: number;
};

export function StarWallet({
  stars,
  xp,
  collecting,
  onCollect,
  onHow,
  onMatch,
}: {
  stars: WalletStars;
  xp: CityXp;
  collecting: boolean;
  onCollect: () => void;
  onHow: () => void;
  onMatch: () => void;
}) {
  const s = stars;
  const claim = xp.claimable_stars;
  const v2 = Boolean(xp.buckets?.length);
  return (
    <View style={styles.wallet}>
      <LinearGradient colors={CITY2_UI.panel} start={TOP} end={BOTTOM} style={StyleSheet.absoluteFill} />
      <View style={styles.walletTop}>
        <LinearGradient colors={CITY_UI.gold} start={TOP} end={BOTTOM} style={styles.walletStar}>
          <Ionicons name="star" size={28} color={CITY_UI.white} />
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
          <Ionicons name="help-circle-outline" size={24} color={CITY2_UI.panelMuted} />
        </Touchable>
      </View>
      <View style={styles.sources}>
        <Source icon="extension-puzzle" label="Lig Yolu" value={s.puzzle} />
        <Source icon="game-controller" label="Oyunlar" value={s.arena} extra={s.arena_today ? `bugün +${s.arena_today}` : null} />
        {s.match != null ? <Source icon="football" label="Maç" value={s.match} /> : null}
        {s.tribun != null ? <Source icon="podium" label="Lig oyunları" value={s.tribun} /> : null}
        {s.daily != null ? <Source icon="calendar" label="Giriş" value={s.daily} /> : null}
        {s.club ? <Source icon="shield-half" label="Kulüp Arenası" value={s.club} /> : null}
        {s.coin ? <Source icon="disc" label="Jeton takası" value={s.coin} /> : null}
        <Source icon="flash" label="XP yıldızı" value={s.xp} />
        {s.refund ? <Source icon="return-down-back" label="İade" value={s.refund} /> : null}
      </View>
      {s.match_detail ? <MatchStarsChip detail={s.match_detail} onPress={onMatch} /> : null}
      <XpBuckets xp={xp} />
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
          ? `${fmt(xp.pending)} XP bekliyor = ${fmt(claim)} yıldız · ${xp.per_star} XP = 1 yıldız`
          : xp.pending > 0
            ? `${fmt(xp.pending)} XP birikti · ${xp.per_star} XP'de bir yıldız`
            : v2
              ? "XP sahadan ve haftalık görevlerden gelir; 3 gün içinde burada yıldıza çevir."
              : "XP sahadan ve haftalık görevlerden gelir; burada yıldıza çevir."}
      </Text>
    </View>
  );
}

function Source({ icon, label, value, extra }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number; extra?: string | null }) {
  return (
    <View style={styles.source}>
      <Ionicons name={icon} size={15} color={CITY2_UI.panelMuted} />
      <Text style={styles.sourceValue} {...textScale.dense}>
        {fmt(value)}
      </Text>
      <Text style={styles.sourceLabel} numberOfLines={1} {...textScale.badge}>
        {label}
      </Text>
      {extra ? (
        <Text style={styles.sourceExtra} numberOfLines={1} {...textScale.badge}>
          {extra}
        </Text>
      ) : null}
    </View>
  );
}

/* ═════════════════════════ NASIL KAZANILIR ═════════════════════════ */

export function HowSheet({
  visible,
  onClose,
  stars,
  xp,
  onGames,
  onQuests,
}: {
  visible: boolean;
  onClose: () => void;
  stars?: WalletStars;
  xp?: CityXp;
  onGames: () => void;
  onQuests: () => void;
}) {
  const byGame = Object.entries(stars?.arena_by_game ?? {}).sort((a, b) => b[1] - a[1]);
  const rules = stars?.match_detail?.rules;
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Yıldız nasıl kazanılır?" snap="full">
      <View style={styles.how}>
        <HowRow icon="extension-puzzle" title="Lig Yolu" text="Elit Üçlü, Üçle Kazan, Soyunma Odası, Kantin ve Kariyer Yolu: her seviye 1–3 yıldız." />
        <HowRow
          icon="game-controller"
          title="Oyunlar"
          text="Bölümlü oyunlarda (Penaltı, Savunma Hattı, Kadro Koşusu) geçtiğin her bölüm yaklaşık bir yıldız; puanlı oyunlarda (Slalom, Top Sektir, yarışmalar) puan eşikleri giderek uzar. Bir oyundan günde en çok 15, bütün oyunlardan 30 yıldız."
        />
        <HowRow
          icon="football"
          title="Maç: gerçek maçlarda oyna"
          text={`Yayınlanan her maçın ${rules?.base ?? 25} yıldız + performans bonusu (gol, asist, reyting, galibiyet, gol yemeden, maçın oyuncusu; en çok +${rules?.bonus_cap ?? 50}). Haftada en çok ${rules?.week_matches ?? 2} maç sayılır.`}
        />
        <HowRow
          icon="calendar"
          title="Günlük giriş ve seri"
          text="Her gün gir, günlük ödülünü al: 5'ten 25 yıldıza 7 günlük döngü, jeton, joker ve haftanın sandığı. 14, 30, 60 ve 100 günlük serilerde şehrine sembol yapılar açılır."
        />
        <HowRow
          icon="podium"
          title="Tahmin Ligi ve Fantezi"
          text="Tutan tahminlerinin puanı ve biten Fantezi haftalarının puanı yıldız olarak gelir (haftalık tavanla). Bunlar XP vermez."
        />
        <HowRow
          icon="flash"
          title="XP: saha ve görevler"
          text={`Oyunlar XP vermez. XP gerçek maçlardaki performansından ve haftalık görevlerden gelir: ${xp?.per_star ?? 10} XP = 1 yıldız. "Yıldızları topla" ile havuza aktar.${xp?.buckets?.length ? " Toplanmayan XP en çok 3 gün bekler; sonra yanar (yıldıza dönmez, XP sıralamasında sayılır)." : ""}`}
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

const styles = StyleSheet.create({
  wallet: { borderRadius: radius.xxl, padding: space.lg, gap: space.md, overflow: "hidden", borderWidth: hairline, borderColor: CITY2_UI.panelEdge },
  walletTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  walletStar: { width: 52, height: 52, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  walletTexts: { flex: 1, gap: 2 },
  walletBig: { ...type.display, fontFamily: fonts.bold, color: CITY_UI.white },
  walletSub: { ...type.bodySm, color: CITY2_UI.panelMuted },
  walletHow: { padding: space.xs },
  walletHint: { ...type.caption, color: CITY2_UI.panelMuted, textAlign: "center" },
  sources: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  source: { width: "30%", flexGrow: 1, alignItems: "center", gap: 2, paddingVertical: space.sm, borderRadius: radius.lg, backgroundColor: CITY2_UI.panelChip },
  sourceValue: { ...type.h3, fontFamily: fonts.bold, color: CITY_UI.white },
  sourceLabel: { ...type.caption, color: CITY2_UI.panelMuted },
  sourceExtra: { ...type.micro, fontFamily: fonts.bold, color: CITY2_UI.star },

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
