/**
 * AYARLAR — uygulamanın TEK ayar ekranı.
 *
 * NE: Profil'deki tek "Ayarlar" satırı ve başlık ikonu buraya açılır. Ayarlar
 * daha önce Profil menüsünde üç gruba (bildirim ayarları · ayarlar · oturum)
 * ve hesabım ekranına dağılmıştı; kullanıcı "bunu nereden kapatırım"ı tek
 * yerde bulsun diye hepsi burada, beş grup hâlinde durur:
 *
 *   1. Bildirimler      — Bildirim türleri (app/bildirim-tercihleri.tsx, alt
 *                         ekran: sunucu tercihleri + cihaz izni) ve Takip
 *                         ettiklerim için (app/takip-bildirimleri.tsx; özet
 *                         hooks/useFollowSettings.ts ile aynı önbellekten).
 *   2. Görünüm          — Açık / Koyu / Sistem (Profil'den taşındı).
 *   3. Lig              — lig/sezon ve şehir: kapsam alt sayfası (tek örnek,
 *                         app/_layout.tsx) `openScopeSheet()` ile açılır.
 *   4. Hesap ve güvenlik — Hesabım, Şifre değiştir, Engellediğim üyeler.
 *   4b. Gizlilik        — "Altyapı oyunlarında adım kullanılmasın" (Kulüp
 *                         Şehri akademisi; GET/PUT /api/users/me/privacy-
 *                         preferences). Sunucu tanımıyorsa (404) grup çizilmez.
 *                         Aynı anahtar akademinin bilgi penceresinde de var.
 *   5. Oturum           — Çıkış yap ve Hesabı sil. Hesap silme AYRI ve görünür
 *                         bir satırdır: App Store (5.1.1-v) ve Google Play
 *                         silme kapısının "kolayca bulunur" olmasını ister
 *                         (bkz. app/hesap-sil.tsx). Hesabım ▸ Hesabı sil yolu
 *                         da yerinde durur.
 *
 * KURGU (Gece teması · ikinci tur): en üstte hesap kartı (misafirde giriş
 * çağrısı); her grup ikonlu başlık + tek kart (components/account/MenuBlocks).
 * Görünüm, ekran maketli ÜÇ KARO ile seçilir (Açık · Koyu · Sistem); renk
 * paleti açılışta donduğu için seçim etkin temayı değiştiriyorsa uygulama bir
 * kez tazelenir (ayrıntı chooseTheme). Oturum grubu (çıkış, hesabı sil)
 * kırmızı ikonlarla en altta, ayrı karttadır.
 *
 * MİSAFİR: bildirim ve hesap satırları giriş ister; görünüm ve lig seçimi
 * cihazda saklandığı için misafirde de çalışır. Hesap grubu yerine tek
 * "Giriş yap" satırı çizilir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Alert, Appearance, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { shortLeague, shortSeason } from "@/components/LeaguePicker";
import { MenuGroup, type MenuItemSpec } from "@/components/account/MenuBlocks";
import {
  Avatar,
  BottomSheet,
  Button,
  IconTile,
  Reveal,
  Toggle,
  ScreenHeader,
  SectionHeader,
  Touchable,
  useHeaderScroll,
  useToast,
} from "@/components/ui";
import { THEME_STORAGE_KEY, getStoredTheme, setStoredTheme } from "@/constants/themePreference";
import { reloadForTheme } from "@/lib/themeTransition";
import { useFollowSettings } from "@/hooks/useFollowSettings";
import { usePrivacyPreferences } from "@/lib/puzzle/useCity2";
import { formatNumber } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, elevate, glowStyle, hairline, isDark, layout, paletteFor, radius, space, textScale, type } from "@/theme";

/* ============================ GÖRÜNÜM SEÇİMİ ============================ */

type ThemeChoice = "light" | "dark" | "system";

interface ThemeOption {
  value: ThemeChoice;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const THEME_OPTIONS: ThemeOption[] = [
  { value: "light", label: "Açık", icon: "sunny-outline" },
  { value: "dark", label: "Koyu", icon: "moon-outline" },
  { value: "system", label: "Sistem", icon: "phone-portrait-outline" },
];

const THEME_LABELS: Record<ThemeChoice, string> = {
  light: "Açık",
  dark: "Koyu",
  system: "Sistem",
};

/** Cihazda saklı tema tercihi → üç durumlu seçim (null = seçilmemiş). */
function storedThemeChoice(): ThemeChoice {
  return getStoredTheme() ?? "system";
}

/** Seçim uygulandığında ekranın koyu olup olmayacağı. */
function willBeDark(choice: ThemeChoice): boolean {
  if (choice === "system") return Appearance.getColorScheme() === "dark";
  return choice === "dark";
}

/** "ElitLig Mobil v1.0.0 (12)" — yayın numarası yalnız derlenmiş uygulamada. */
function versionLabel(): string {
  const version = Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? "";
  const build = Constants.nativeBuildVersion;
  if (!version) return "ElitLig Mobil";
  return build ? `ElitLig Mobil v${version} (${build})` : `ElitLig Mobil v${version}`;
}

/* ================================= EKRAN ================================ */

export default function SettingsScreen() {
  const auth = useAuth();
  const scope = useScope();
  const router = useRouter();
  const toast = useToast();
  const { scrollY, scrollProps } = useHeaderScroll();
  const user = auth.user;

  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(storedThemeChoice);
  const [themeSheetOpen, setThemeSheetOpen] = useState(false);

  /** Takip bildirimlerinin özeti — takip bildirimleri ekranıyla aynı önbellek. */
  const follow = useFollowSettings({ enabled: Boolean(user) });
  const followSummary = useMemo(() => {
    const follows = follow.data?.follows;
    if (!follows) return undefined;
    if (follows.length === 0) return "Takip yok";
    const muted = follows.filter((item) => item.muted).length;
    const base = `${formatNumber(follows.length, 0)} takip`;
    return muted > 0 ? `${base} · ${formatNumber(muted, 0)} sessiz` : base;
  }, [follow.data]);

  /** Gizlilik tercihleri (akademi adı); eski sunucuda 404 → grup gizli. */
  const privacy = usePrivacyPreferences(Boolean(user));

  /* ------------------------------ EYLEMLER ------------------------------ */

  const go = useCallback((route: string) => router.push(route as never), [router]);

  const confirmSignOut = useCallback(() => {
    Alert.alert("Çıkış yap", "Oturumu kapatmak istediğine emin misin?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Çıkış yap",
        style: "destructive",
        onPress: () => {
          void auth.signOut().then(() => {
            toast.show({ message: "Çıkış yapıldı.", tone: "neutral" });
          });
        },
      },
    ]);
  }, [auth, toast]);

  /**
   * Tema tercihi: yaz, gerekiyorsa uygulamayı tazele.
   *
   * NEDEN lib/themeToggle.ts KULLANILMIYOR: o yardımcı ikili çalışır ve
   * "Sistem" durumunu ifade edemez; burada aynı depolama anahtarı üç durumla
   * yazılır.
   * NEDEN YENİDEN YÜKLEME: palet modül yüklenirken donuyor; seçim etkin temayı
   * DEĞİŞTİRİYORSA JS bir kez tazelenir, değiştirmiyorsa hiç tazelenmez.
   * NASIL TAZELENİR: `lib/themeTransition.ts` — geliştirmede
   * `DevSettings.reload()`, yayında `expo-updates` `reloadAsync()`. Yeniden
   * yükleme mümkün değilse kullanıcıya ne yapması gerektiği dürüstçe söylenir.
   */
  const chooseTheme = useCallback(
    (choice: ThemeChoice) => {
      setThemeChoice(choice);
      setThemeSheetOpen(false);

      const persist =
        choice === "system"
          ? AsyncStorage.removeItem(THEME_STORAGE_KEY)
          : AsyncStorage.setItem(THEME_STORAGE_KEY, choice);

      void persist
        .then(() => {
          setStoredTheme(choice === "system" ? null : choice);
          if (willBeDark(choice) === isDark) {
            toast.show({ message: `Görünüm: ${THEME_LABELS[choice]}`, tone: "success" });
            return;
          }
          /* PORTAL OPEN: ekranın görüntüsü alınır, uygulama yeniden yüklenir
             ve yeni tema eski görüntünün altından açılır (yayında da çalışır:
             expo-updates reloadAsync). */
          return reloadForTheme().then((reloaded) => {
            if (reloaded) return;
            toast.show({
            message: `Görünüm: ${THEME_LABELS[choice]}. Uygulamayı tamamen kapatıp yeniden açınca uygulanacak.`,
            tone: "warn",
            duration: 5000,
            });
          });
        })
        .catch(() => {
          setThemeChoice(storedThemeChoice());
          toast.show({ message: "Tema tercihi kaydedilemedi.", tone: "danger" });
        });
    },
    [toast]
  );

  /* ------------------------------- GRUPLAR ------------------------------ */

  const leagueValue = [
    scope.leagueLabel ? shortLeague(scope.leagueLabel) : "",
    scope.seasonLabel ? shortSeason(scope.seasonLabel) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const pinnedCount = scope.pinnedLeagues.length;

  const notifyItems = useMemo<MenuItemSpec[]>(
    () => [
      {
        key: "turler",
        icon: "notifications",
        tone: "violet",
        title: "Bildirim türleri",
        subtitle: "Gol, maç başlangıcı, sonuç, haber ve panel",
        onPress: () => go("/bildirim-tercihleri"),
      },
      {
        key: "takip",
        icon: "options",
        tone: "cyan",
        title: "Takip ettiklerim için",
        subtitle: "Her takım, lig ve maç için ayrı aç/kapat",
        value: user ? followSummary : undefined,
        onPress: () => go("/takip-bildirimleri"),
      },
    ],
    [followSummary, go, user]
  );

  const leagueItems = useMemo<MenuItemSpec[]>(
    () => [
      {
        key: "lig-sezon",
        icon: "trophy",
        tone: "gold",
        title: "Lig ve sezon",
        subtitle: [leagueValue || "Seç", pinnedCount > 0 ? `${formatNumber(pinnedCount, 0)} sabit lig` : ""]
          .filter(Boolean)
          .join(" · "),
        onPress: () => scope.openScopeSheet("league"),
      },
      {
        key: "sehir",
        icon: "location",
        tone: "cyan",
        title: "Şehir",
        value: scope.cityLabel || "Seç",
        onPress: () => scope.openScopeSheet("city"),
      },
    ],
    [leagueValue, pinnedCount, scope]
  );

  /* Şifre, engellenenler ve profil talepleri Hesabım'da (tek kapı). */
  const accountItems = useMemo<MenuItemSpec[]>(
    () =>
      user
        ? [
            {
              key: "hesabim",
              icon: "person",
              tone: "violet",
              title: "Hesabım",
              subtitle: "Bilgiler, şifre, profil talepleri",
              onPress: () => go("/hesabim"),
            },
            {
              key: "engel",
              icon: "ban",
              tone: "neutral",
              title: "Engellediğim üyeler",
              subtitle: "Mesaj ve yorumlarını görmediğin kişiler",
              onPress: () => go("/engellenenler"),
            },
          ]
        : [],
    [go, user]
  );

  /* Oturum — yıkıcı eylemler ayrı kartta, en altta. */
  const sessionItems = useMemo<MenuItemSpec[]>(
    () =>
      user
        ? [
            { key: "cikis", icon: "log-out", title: "Çıkış yap", subtitle: "Bu cihazdaki oturumu kapat", destructive: true, onPress: confirmSignOut },
            {
              key: "hesap-sil",
              icon: "trash",
              title: "Hesabı sil",
              subtitle: "Kalıcı olarak silinir, geri alınamaz",
              destructive: true,
              onPress: () => go("/hesap-sil"),
            },
          ]
        : [],
    [confirmSignOut, go, user]
  );

  const displayName = user ? (user.fullName ?? user.username) : "";

  /* -------------------------------- ÇİZİM ------------------------------- */

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Ayarlar" back scrollY={scrollY} />

      <ScrollView {...scrollProps} contentContainerStyle={styles.content}>
        {/* ÖZET — kim olarak ayarlıyorsun? Girişlide hesap kartı, misafirde çağrı. */}
        <Reveal>
          {user ? (
            <Touchable
              feedback="card"
              haptic="selection"
              onPress={() => go("/hesabim")}
              accessibilityRole="button"
              accessibilityLabel={`${displayName}. Hesabım`}
              style={styles.account}
            >
              <Avatar name={displayName} size={48} ring="brand" />
              <View style={styles.flex}>
                <Text style={styles.accountName} numberOfLines={1} {...textScale.dense}>
                  {displayName}
                </Text>
                <Text style={styles.accountMeta} numberOfLines={1} {...textScale.dense}>
                  {user.email ?? `@${user.username}`}
                </Text>
              </View>
              <View style={styles.accountChip}>
                <Text style={styles.accountChipText} {...textScale.badge}>
                  Hesabım
                </Text>
                <Ionicons name="chevron-forward" size={12} color={colors.brandAccent} />
              </View>
            </Touchable>
          ) : (
            <View style={styles.account}>
              <IconTile icon="person" tone="signature" size={44} />
              <View style={styles.flex}>
                <Text style={styles.accountName} {...textScale.dense}>
                  Misafir
                </Text>
                <Text style={styles.accountMeta} {...textScale.long}>
                  Görünüm ve lig seçimi bu cihazda saklanır.
                </Text>
              </View>
              <Button label="Giriş yap" size="sm" onPress={() => go("/giris")} />
            </View>
          )}
        </Reveal>

        <MenuGroup title="Bildirimler" icon="notifications" tone="violet" items={notifyItems} style={styles.group} />

        {/* GÖRÜNÜM — üç önizleme karosu; seçim anında uygulanır. */}
        <View style={styles.group}>
          <SectionHeader
            title="Görünüm"
            icon="color-palette"
            iconTone="pink"
            subtitle="Seçimde uygulama bir kez tazelenir"
            inset="flush"
          />
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map((option) => (
              <ThemeTile
                key={option.value}
                option={option}
                selected={option.value === themeChoice}
                onSelect={chooseTheme}
              />
            ))}
          </View>
        </View>

        <MenuGroup title="Lig" icon="trophy" tone="gold" items={leagueItems} style={styles.group} />

        {user ? (
          <>
            <MenuGroup title="Hesap ve güvenlik" icon="shield-checkmark" tone="cyan" items={accountItems} style={styles.group} />
            {privacy.supported ? (
              <MenuGroup title="Gizlilik" icon="eye-off" tone="violet" style={styles.group}>
                <Touchable
                  feedback="row"
                  onPress={() => !privacy.saving && privacy.set(!privacy.value)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: privacy.value, disabled: privacy.saving }}
                  accessibilityLabel={`${privacy.label}. ${privacy.value ? "açık" : "kapalı"}`}
                  style={styles.privacyRow}
                >
                  <IconTile icon="school" tone="violet" size={36} glow={false} />
                  <View style={styles.flex}>
                    <Text style={styles.privacyTitle} {...textScale.dense}>
                      {privacy.label}
                    </Text>
                    <Text style={styles.privacyHelp} {...textScale.long}>
                      {privacy.help ?? "Açarsan adın Kulüp Şehri akademilerinde oyuncu adı olarak kullanılmaz."}
                    </Text>
                  </View>
                  <Toggle value={privacy.value} onValueChange={privacy.set} disabled={privacy.saving} accessibilityLabel={privacy.label} />
                </Touchable>
              </MenuGroup>
            ) : null}
            <MenuGroup title="Oturum" icon="power" tone="red" items={sessionItems} style={styles.group} />
          </>
        ) : null}

        <View style={styles.footer}>
          <Ionicons name="football" size={14} color={colors.textDisabled} />
          <Text style={styles.version} {...textScale.dense}>
            {versionLabel()}
          </Text>
        </View>
      </ScrollView>

      {/* Eski alt sayfa durumu korunur (başka bir kapıdan açılırsa). */}
      <BottomSheet visible={themeSheetOpen} onClose={() => setThemeSheetOpen(false)} title="Görünüm" snap="content">
        <View style={styles.sheetRow}>
          {THEME_OPTIONS.map((option) => (
            <ThemeTile key={option.value} option={option} selected={option.value === themeChoice} onSelect={chooseTheme} />
          ))}
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

/* ============================== ALT BİLEŞENLER ============================ */

/**
 * Görünüm karosu — küçük bir ekran maketi (zemin + kart + mor şerit) ve ad.
 * "Sistem" karosu ikiye bölünür: yarısı açık, yarısı koyu.
 */
const SWATCH = {
  light: { bg: paletteFor("light").bg, card: paletteFor("light").surface1, line: paletteFor("light").brand },
  dark: { bg: paletteFor("dark").bg, card: paletteFor("dark").surface1, line: paletteFor("dark").brand },
};

const ThemeTile = React.memo(function ThemeTile({
  option,
  selected,
  onSelect,
}: {
  option: ThemeOption;
  selected: boolean;
  onSelect: (choice: ThemeChoice) => void;
}) {
  const handlePress = useCallback(() => onSelect(option.value), [onSelect, option.value]);
  const halves: ("light" | "dark")[] =
    option.value === "system" ? ["light", "dark"] : [option.value === "dark" ? "dark" : "light"];
  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={handlePress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`Görünüm: ${option.label}`}
      style={[styles.themeTile, selected && styles.themeTileOn]}
    >
      <View style={styles.mock}>
        {halves.map((half) => (
          <View key={half} style={[styles.mockHalf, { backgroundColor: SWATCH[half].bg }]}>
            <View style={[styles.mockCard, { backgroundColor: SWATCH[half].card }]}>
              <View style={[styles.mockLine, { backgroundColor: SWATCH[half].line }]} />
              <View style={[styles.mockLineShort, { backgroundColor: SWATCH[half].line }]} />
            </View>
          </View>
        ))}
      </View>
      <View style={styles.themeFoot}>
        <Ionicons name={option.icon} size={13} color={selected ? colors.brandAccent : colors.textTertiary} />
        <Text style={[styles.themeLabel, selected && styles.themeLabelOn]} numberOfLines={1} {...textScale.dense}>
          {option.label}
        </Text>
        {selected ? (
          <View style={styles.themeCheck}>
            <Ionicons name="checkmark" size={10} color={colors.textOnBrand} />
          </View>
        ) : null}
      </View>
    </Touchable>
  );
});

/* ================================ STİLLER ================================= */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.giant,
  },
  flex: { flex: 1, minWidth: 0 },
  group: {
    marginTop: space.xl,
  },

  account: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    ...elevate(1),
  },
  accountName: { ...type.h2, color: colors.textPrimary },
  accountMeta: { ...type.bodySm, color: colors.textTertiary, marginTop: 1 },
  accountChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.brandDim,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
  },
  accountChipText: { ...type.labelXs, color: colors.brandAccent },

  themeRow: { flexDirection: "row", gap: space.sm },
  privacyRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.md, paddingVertical: space.m },
  privacyTitle: { ...type.h3, color: colors.textPrimary },
  privacyHelp: { ...type.bodySm, color: colors.textTertiary, marginTop: 1 },
  sheetRow: { flexDirection: "row", gap: space.sm, paddingBottom: space.md },
  themeTile: {
    flex: 1,
    padding: space.s,
    gap: space.s,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  themeTileOn: {
    borderColor: colors.brand,
    backgroundColor: colors.brandDim,
    ...glowStyle(colors.glow, 1),
  },
  mock: {
    height: 64,
    flexDirection: "row",
    borderRadius: radius.sm,
    overflow: "hidden",
    borderWidth: hairline,
    borderColor: colors.border,
  },
  mockHalf: { flex: 1, padding: space.s, justifyContent: "flex-end" },
  mockCard: { borderRadius: radius.xs, padding: space.s, gap: 3 },
  mockLine: { height: 4, borderRadius: 2, width: "80%" },
  mockLineShort: { height: 4, borderRadius: 2, width: "45%", opacity: 0.5 },
  themeFoot: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.xxs },
  themeLabel: { ...type.labelSm, color: colors.textSecondary, flex: 1 },
  themeLabelOn: { color: colors.textPrimary },
  themeCheck: {
    width: 16,
    height: 16,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
  },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    marginTop: space.xxl,
  },
  version: {
    ...type.caption,
    color: colors.textTertiary,
    textAlign: "center",
  },
});
