/**
 * OYUN ANA SAYFASI PENCERELERİ — can (sayaç · reklam · jeton), reklamla
 * ödüller (günlük hediye · reklamla can · ücretsiz güçlendirici · çark
 * kısayolu), kurallar, seri, "Diğer" (mağaza · reklam · seri · kurallar) ve
 * ayarlar. Hepsi aynı oyun kartı (`HomeModal`). Günlük Çark, Sandık Seç ve
 * Günün Penaltısı `./Rewards` içinde.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useAdminMutation } from "@/components/admin";
import { GameButton } from "@/components/puzzle/LevelSheets";
import { RewardedAd, WatchAdForLife } from "@/components/puzzle/RewardedLife";
import { Toggle, Touchable } from "@/components/ui";
import { GH } from "@/lib/game/gameHomePalette";
import { useOffline } from "@/lib/offline/net";
import { buyItem, type LifeGameKey, type PuzzleStreak } from "@/lib/puzzle/api";
import type { GameLives } from "@/lib/puzzle/useGameLives";
import { usePuzzleCache, usePuzzleMe } from "@/lib/puzzle/usePuzzle";
import { fonts, radius, space, textScale, type } from "@/theme";

import { HomeModal, ModalRow, StreakCrowns } from "./GameHomeKit";

/** Arena oyunlarıyla aynı ses anahtarı (components/game/ArenaGameScreen). */
export const GAME_SOUND_KEY = "elitlig.arena.sound.v1";

/* ═══════════════════════ CAN ═══════════════════════ */

export function LivesSheet({ visible, onClose, game, lives, title }: { visible: boolean; onClose: () => void; game: LifeGameKey; lives: GameLives; title: string }) {
  const router = useRouter();
  const offline = useOffline();
  const me = usePuzzleMe().data;
  const cache = usePuzzleCache();
  const refill = me?.catalog.shop.can_doldur;
  const buy = useAdminMutation(() => buyItem("can_doldur", game), {
    success: () => "Bu oyunun canları doldu.",
    onSuccess: (res) => cache(res.profile),
  });
  const full = lives.lives >= lives.max;
  const coins = me?.profile.coins ?? 0;
  return (
    <HomeModal
      visible={visible}
      onClose={onClose}
      top={title.toLocaleUpperCase("tr-TR")}
      title={full ? "Canların dolu" : lives.lives < 1 ? "Canın kalmadı" : "Canlar"}
      footer={
        lives.signedIn ? (
          full ? (
            <GameButton label="TAMAM" icon="checkmark" onPress={onClose} />
          ) : (
            <>
              {lives.profile?.ads?.life ? (
                <RewardedAd kind="life" game={game} profile={lives.profile} size="lg" variant="primary" />
              ) : lives.profile?.ad_lives ? (
                <WatchAdForLife profile={lives.profile} size="lg" />
              ) : null}
              {refill ? (
                <GameButton
                  label={`DOLDUR · ${refill.price} JETON`}
                  icon="heart"
                  small
                  disabled={buy.isPending || coins < refill.price || offline}
                  onPress={() => buy.mutate(undefined)}
                />
              ) : null}
            </>
          )
        ) : (
          <GameButton label="GİRİŞ YAP" icon="log-in-outline" onPress={() => router.push("/giris")} />
        )
      }
    >
      <View style={styles.heartRow}>
        {Array.from({ length: lives.max }, (_, i) => (
          <Ionicons key={i} name={i < lives.lives ? "heart" : "heart-outline"} size={34} color={i < lives.lives ? GH.heart : GH.panelEdge} />
        ))}
      </View>
      <Text style={styles.big} {...textScale.badge}>
        {lives.lives}/{lives.max}
      </Text>
      {!full && lives.label && lives.label !== "Dolu" ? (
        <View style={styles.timer}>
          <Ionicons name="time" size={18} color={GH.cardInk} />
          <Text style={styles.timerText} {...textScale.badge}>Sıradaki can: {lives.label}</Text>
        </View>
      ) : null}
      <Text style={styles.body} {...textScale.long}>
        {lives.signedIn
          ? "Her oyunun kendi 5 canı var; 30 dakikada bir can dolar. Reklam izleyerek ya da jetonla hemen doldurabilirsin."
          : "Misafir canların bu cihazda: 5 can, 30 dakikada bir dolar. Giriş yapınca reklamla ve jetonla da doldurabilirsin."}
      </Text>
      {offline && lives.signedIn && !full ? (
        <Text style={styles.note} {...textScale.long}>Çevrimdışısın: reklam ve mağaza için internet gerekir; canlar yine dolar.</Text>
      ) : null}
    </HomeModal>
  );
}

/* ═══════════════════════ REKLAMLA ÖDÜLLER ═══════════════════════ */

export function AdOffersSheet({
  visible,
  onClose,
  game,
  lives,
  boosters,
  onSpin,
  gift,
}: {
  visible: boolean;
  onClose: () => void;
  game: LifeGameKey;
  lives: GameLives;
  /** Bölümlü oyunlarda ücretsiz güçlendirici. */
  boosters: boolean;
  onSpin: () => void;
  /** Günlük hediye satırı (girişliyse). */
  gift?: { ready: boolean; onOpen: () => void } | null;
}) {
  const offline = useOffline();
  const profile = lives.profile;
  return (
    <HomeModal visible={visible} onClose={onClose} top="ÜCRETSİZ" title="Ödüller">
      {gift ? (
        <Touchable onPress={gift.onOpen} haptic="selection" accessibilityRole="button" accessibilityLabel={gift.ready ? "Günlük hediye hazır, aç" : "Günlük hediye"}>
          <ModalRow
            icon="gift"
            tint={GH.side.gift[1]}
            title="Günlük hediye"
            sub={gift.ready ? "Bugünkü hediyen hazır" : "Bugün alındı · yarın yine gel"}
            right={<Ionicons name="chevron-forward" size={18} color={GH.cardSoft} />}
          />
        </Touchable>
      ) : null}
      {!lives.signedIn ? (
        <Text style={styles.body} {...textScale.long}>Reklamla ödüller için giriş yap.</Text>
      ) : offline ? (
        <Text style={styles.body} {...textScale.long}>Çevrimdışısın: reklamlar için internet gerekir.</Text>
      ) : (
        <>
          <ModalRow
            icon="heart"
            tint={GH.heart}
            title="+1 can"
            sub={lives.lives >= lives.max ? "Canların dolu" : `Bu oyunda ${lives.lives}/${lives.max} can`}
            right={null}
          />
          {lives.lives < lives.max ? (
            profile?.ads?.life ? <RewardedAd kind="life" game={game} profile={profile} size="md" label="Reklam izle · +1 can" /> : profile?.ad_lives ? <WatchAdForLife profile={profile} size="md" /> : null
          ) : null}
          {boosters ? (
            <>
              <ModalRow icon="flash" tint={GH.side.shop[1]} title="Ücretsiz güçlendirici" sub={profile?.ads?.booster ? `Bugün ${profile.ads.booster.left}/${profile.ads.booster.per_day} hak` : "Yakında"} />
              {/* Kısa etiket: ödülü üstteki satır anlatıyor (uzun etiket 320px'te kesiliyordu). */}
              <RewardedAd
                kind="booster"
                game={game}
                profile={profile}
                size="md"
                label="Reklam izle"
                onRewarded={() => undefined}
              />
            </>
          ) : null}
          <ModalRow icon="sync-circle" tint={GH.side.spin[1]} title="Günlük çark" sub={profile?.ads?.spin ? `Bugün ${profile.ads.spin.left}/${profile.ads.spin.per_day} çevirme` : "Jeton, can, güçlendirici ya da yıldız"} />
          <GameButton label="ÇARKI AÇ" icon="sync-circle" small onPress={onSpin} />
        </>
      )}
    </HomeModal>
  );
}

/* ═══════════════════════ KURALLAR ═══════════════════════ */

export function RulesSheet({ visible, onClose, title, rules, starLine }: { visible: boolean; onClose: () => void; title: string; rules: string[]; starLine: string }) {
  return (
    <HomeModal visible={visible} onClose={onClose} top={title.toLocaleUpperCase("tr-TR")} title="Nasıl oynanır?" footer={<GameButton label="ANLADIM" icon="checkmark" onPress={onClose} />}>
      {rules.map((r, i) => (
        <ModalRow key={i} icon={i === 0 ? "game-controller" : i === 1 ? "bulb" : "trending-up"} tint={GH.side.rules[1]} title={r} />
      ))}
      <ModalRow icon="star" tint={GH.starDeep} title="Yıldız" sub={starLine} />
      <ModalRow icon="heart" tint={GH.heart} title="Can" sub="Oyun başına 5 can; 30 dakikada bir dolar. İnternet yokken de oynarsın, sonuçların bağlantı gelince kaydedilir." />
    </HomeModal>
  );
}

/* ═══════════════════════ SERİ ═══════════════════════ */

export function StreakSheet({ visible, onClose, streak }: { visible: boolean; onClose: () => void; streak: PuzzleStreak | undefined }) {
  const tier = streak?.tier ?? 0;
  return (
    <HomeModal visible={visible} onClose={onClose} top="ÜST ÜSTE KAZAN" title="Galibiyet serisi" footer={<GameButton label="OYNA" icon="play" onPress={onClose} />}>
      <StreakCrowns tier={tier} size={40} />
      <Text style={styles.big} {...textScale.badge}>{streak?.wins ?? 0} galibiyet</Text>
      <ModalRow icon="trophy" tint={GH.coinDeep} title="1. basamak" sub="Sıradaki bölüme 1 ücretsiz güçlendiriciyle başla" />
      <ModalRow icon="trophy" tint={GH.coinDeep} title="2. basamak" sub="2 ücretsiz güçlendirici" />
      <ModalRow icon="trophy" tint={GH.coinDeep} title="3. basamak" sub="3 ücretsiz güçlendirici · en güçlü başlangıç" />
      <Text style={styles.note} {...textScale.long}>
        {streak?.next_at != null ? `Sonraki basamağa ${Math.max(0, streak.next_at - streak.wins)} galibiyet kaldı. ` : ""}Kaybedince seri sıfırlanır.
      </Text>
    </HomeModal>
  );
}

/* ═══════════════════════ DİĞER ═══════════════════════ */

/** Ana sayfanın ikincil eylemleri: mağaza, seri, kurallar (+ oyunun ekledikleri). */
export function MoreSheet({
  visible,
  onClose,
  title,
  onShop,
  onAds,
  streak,
  onStreak,
  onRules,
  extra,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  onShop?: () => void;
  /** Reklamla ücretsiz can / güçlendirici penceresi. */
  onAds?: () => void;
  /** undefined: oyunda seri yok; null: seri henüz başlamadı. */
  streak?: PuzzleStreak | null;
  onStreak: () => void;
  onRules: () => void;
  extra?: { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; sub?: string | null; onPress: () => void }[];
}) {
  const router = useRouter();
  return (
    <HomeModal visible={visible} onClose={onClose} top={title.toLocaleUpperCase("tr-TR")} title="Diğer">
      {onShop ? <SettingsLink icon="flash" title="Güçlendirici mağazası" sub="Jetonla güçlendirici ve can" onPress={onShop} /> : null}
      {onAds ? <SettingsLink icon="play-circle" title="Reklamla ücretsiz ödül" sub="+1 can, ücretsiz güçlendirici, çark çevirmesi" onPress={onAds} /> : null}
      {streak !== undefined ? (
        <SettingsLink icon="trophy" title="Galibiyet serisi" sub={streak && streak.tier > 0 ? `${streak.tier}/3 basamak · ${streak.wins} galibiyet` : "Üst üste kazan, ücretsiz güçlendirici al"} onPress={onStreak} />
      ) : null}
      <SettingsLink icon="book" title="Nasıl oynanır?" onPress={onRules} />
      {(extra ?? []).map((x) => (
        <SettingsLink key={x.key} icon={x.icon} title={x.label} sub={x.sub} onPress={x.onPress} />
      ))}
      <SettingsLink
        icon="business"
        title="Kulüp Şehri"
        sub="Yıldızlarını harca"
        onPress={() => {
          onClose();
          router.push("/kulup-sehri");
        }}
      />
    </HomeModal>
  );
}

/* ═══════════════════════ AYARLAR ═══════════════════════ */

export function SettingsSheet({ visible, onClose, onRules, onBoard }: { visible: boolean; onClose: () => void; onRules: () => void; onBoard: () => void }) {
  const router = useRouter();
  const [sound, setSound] = useState(true);
  useEffect(() => {
    if (!visible) return;
    void AsyncStorage.getItem(GAME_SOUND_KEY)
      .then((v) => setSound(v !== "0"))
      .catch(() => undefined);
  }, [visible]);
  const toggle = (next: boolean) => {
    setSound(next);
    void AsyncStorage.setItem(GAME_SOUND_KEY, next ? "1" : "0").catch(() => undefined);
  };
  return (
    <HomeModal visible={visible} onClose={onClose} top="OYUN" title="Ayarlar" footer={<GameButton label="KAPAT" icon="close" small onPress={onClose} />}>
      <ModalRow icon={sound ? "volume-high" : "volume-mute"} tint={GH.side.settings[1]} title="Oyun sesi" right={<Toggle value={sound} onValueChange={toggle} accessibilityLabel="Oyun sesi" />} />
      <SettingsLink icon="book" title="Nasıl oynanır?" onPress={onRules} />
      <SettingsLink icon="podium" title="Sıralama" onPress={onBoard} />
      <SettingsLink icon="business" title="Kulüp Şehri" onPress={() => router.push("/kulup-sehri")} />
      <SettingsLink
        icon="options"
        title="Uygulama ayarları (hareketi azalt, bildirimler)"
        onPress={() => {
          onClose();
          router.push("/ayarlar");
        }}
      />
    </HomeModal>
  );
}

function SettingsLink({ icon, title, sub, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; sub?: string | null; onPress: () => void }) {
  return (
    <GameLinkRow onPress={onPress} label={title}>
      <ModalRow icon={icon} tint={GH.side.settings[1]} title={title} sub={sub} right={<Ionicons name="chevron-forward" size={18} color={GH.cardSoft} />} />
    </GameLinkRow>
  );
}

function GameLinkRow({ onPress, label, children }: { onPress: () => void; label: string; children: React.ReactNode }) {
  return (
    <Touchable onPress={onPress} haptic="selection" accessibilityRole="button" accessibilityLabel={label}>
      {children}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  heartRow: { flexDirection: "row", justifyContent: "center", gap: space.xs },
  big: { ...type.h1, fontFamily: fonts.bold, color: GH.cardInk, textAlign: "center" },
  timer: { flexDirection: "row", alignSelf: "center", alignItems: "center", gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: GH.panel },
  timerText: { ...type.label, fontFamily: fonts.bold, color: GH.cardInk },
  body: { ...type.bodySm, color: GH.cardSoft, textAlign: "center" },
  note: { ...type.caption, color: GH.cardSoft, textAlign: "center" },
});
