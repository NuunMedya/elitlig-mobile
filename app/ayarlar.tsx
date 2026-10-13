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
 *   5. Oturum           — Çıkış yap ve Hesabı sil. Hesap silme AYRI ve görünür
 *                         bir satırdır: App Store (5.1.1-v) ve Google Play
 *                         silme kapısının "kolayca bulunur" olmasını ister
 *                         (bkz. app/hesap-sil.tsx). Hesabım ▸ Hesabı sil yolu
 *                         da yerinde durur.
 *
 * NEDEN GÖRÜNÜM SEÇİMİ BİR SATIR + ALT SAYFA: renk paleti açılışta donuyor
 * (bkz. @/theme); tema değişimi sonucu anlatılabilen bir ayar satırıyla
 * yapılır, seçim gerekiyorsa uygulamayı bir kez tazeler (ayrıntı chooseTheme).
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
import { Alert, Appearance, DevSettings, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { shortLeague, shortSeason } from "@/components/LeaguePicker";
import {
  BottomSheet,
  ListRow,
  ScreenHeader,
  SectionHeader,
  useHeaderScroll,
  useToast,
  type Tone,
} from "@/components/ui";
import { THEME_STORAGE_KEY, getStoredTheme, setStoredTheme } from "@/constants/themePreference";
import { useFollowSettings } from "@/hooks/useFollowSettings";
import { formatNumber } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, isDark, layout, space, textScale, type } from "@/theme";

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

type RowPosition = "single" | "first" | "middle" | "last";

/** Grup içi konum — ListRow köşe yuvarlamasını ve ayracı buradan alır. */
function rowPosition(index: number, total: number): RowPosition {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

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

/* ================================ SATIR ================================= */

interface SettingRow {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  value?: string;
  tone?: Tone;
  destructive?: boolean;
  onPress: () => void;
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
   * NEDEN `__DEV__`: `DevSettings.reload()` yayın derlemesinde hata ATMAZ,
   * sessizce hiçbir şey yapmaz (RN DevSettings.js: `reload() {}`). Yayında
   * kullanıcıya ne yapması gerektiği dürüstçe söylenir.
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
          if (__DEV__) {
            DevSettings.reload();
            return;
          }
          toast.show({
            message: `Görünüm: ${THEME_LABELS[choice]}. Uygulamayı tamamen kapatıp yeniden açınca uygulanacak.`,
            tone: "warn",
            duration: 5000,
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

  const groups = useMemo<{ key: string; title?: string; rows: SettingRow[] }[]>(() => {
    const result: { key: string; title?: string; rows: SettingRow[] }[] = [];

    result.push({
      key: "bildirim",
      title: "Bildirimler",
      rows: [
        {
          key: "turler",
          icon: "notifications",
          title: "Bildirim türleri",
          subtitle: "Gol, maç başlangıcı, sonuç, haber ve panel",
          tone: "brand",
          onPress: () => go("/bildirim-tercihleri"),
        },
        {
          key: "takip",
          icon: "options",
          title: "Takip ettiklerim için",
          subtitle: "Her takım, lig ve maç için ayrı aç/kapat",
          value: user ? followSummary : undefined,
          onPress: () => go("/takip-bildirimleri"),
        },
      ],
    });

    result.push({
      key: "gorunum",
      title: "Görünüm",
      rows: [
        {
          key: "tema",
          icon: "contrast",
          title: "Tema",
          value: THEME_LABELS[themeChoice],
          onPress: () => setThemeSheetOpen(true),
        },
      ],
    });

    result.push({
      key: "lig",
      title: "Lig",
      rows: [
        {
          key: "lig-sezon",
          icon: "trophy",
          title: "Lig ve sezon",
          subtitle:
            [leagueValue || "Seç", pinnedCount > 0 ? `${formatNumber(pinnedCount, 0)} sabit lig` : ""]
              .filter(Boolean)
              .join(" · "),
          onPress: () => scope.openScopeSheet("league"),
        },
        {
          key: "sehir",
          icon: "location",
          title: "Şehir",
          value: scope.cityLabel || "Seç",
          onPress: () => scope.openScopeSheet("city"),
        },
      ],
    });

    if (user) {
      result.push({
        key: "hesap",
        title: "Hesap ve güvenlik",
        rows: [
          {
            key: "hesabim",
            icon: "person",
            title: "Hesabım",
            subtitle: "Üyelik bilgilerin ve taleplerin",
            onPress: () => go("/hesabim"),
          },
          {
            key: "sifre",
            icon: "key",
            title: "Şifre değiştir",
            subtitle: "Mevcut şifrenle doğrulanır",
            onPress: () => go("/sifre-degistir"),
          },
          {
            key: "engel",
            icon: "ban",
            title: "Engellediğim üyeler",
            subtitle: "Sohbette engellediklerin",
            onPress: () => go("/engellenenler"),
          },
        ],
      });
      result.push({
        key: "oturum",
        rows: [
          {
            key: "cikis",
            icon: "log-out",
            title: "Çıkış yap",
            tone: "danger",
            destructive: true,
            onPress: confirmSignOut,
          },
          {
            key: "hesap-sil",
            icon: "trash",
            title: "Hesabı sil",
            subtitle: "Kalıcı olarak silinir, geri alınamaz",
            tone: "danger",
            destructive: true,
            onPress: () => go("/hesap-sil"),
          },
        ],
      });
    } else {
      result.push({
        key: "hesap",
        title: "Hesap",
        rows: [
          {
            key: "giris",
            icon: "log-in",
            title: "Giriş yap",
            subtitle: "Bildirim türleri ve hesap ayarları için",
            tone: "brand",
            onPress: () => go("/giris"),
          },
        ],
      });
    }

    return result;
  }, [confirmSignOut, followSummary, go, leagueValue, pinnedCount, scope, themeChoice, user]);

  /* -------------------------------- ÇİZİM ------------------------------- */

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Ayarlar" back scrollY={scrollY} />

      <ScrollView {...scrollProps} contentContainerStyle={styles.content}>
        {groups.map((group) => (
          <View key={group.key} style={styles.group}>
            {group.title ? <SectionHeader title={group.title} inset="flush" /> : null}
            {group.rows.map((row, index) => (
              <SettingListRow key={row.key} row={row} position={rowPosition(index, group.rows.length)} />
            ))}
          </View>
        ))}

        <Text style={styles.version} {...textScale.dense}>
          {versionLabel()}
        </Text>
      </ScrollView>

      <BottomSheet visible={themeSheetOpen} onClose={() => setThemeSheetOpen(false)} title="Görünüm" snap="content">
        {/* Üç sabit seçenek — veri listesi değil, bu yüzden map yeterli. */}
        <View style={styles.sheetBody}>
          {THEME_OPTIONS.map((option, index) => (
            <ThemeOptionRow
              key={option.value}
              option={option}
              selected={option.value === themeChoice}
              position={rowPosition(index, THEME_OPTIONS.length)}
              onSelect={chooseTheme}
            />
          ))}
          <Text style={styles.sheetNote} {...textScale.dense}>
            Renkler uygulama açılırken sabitlendiği için tema değişiminde uygulama bir kez tazelenir.
          </Text>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

/* ============================== ALT BİLEŞENLER ============================ */

const SettingListRow = React.memo(function SettingListRow({
  row,
  position,
}: {
  row: SettingRow;
  position: RowPosition;
}) {
  const leading = useMemo(() => ({ icon: row.icon, tone: row.tone }), [row.icon, row.tone]);
  return (
    <ListRow
      leading={leading}
      title={row.title}
      subtitle={row.subtitle}
      value={row.value}
      destructive={row.destructive}
      position={position}
      onPress={row.onPress}
    />
  );
});

/** Görünüm alt sayfasının tek seçeneği. */
const ThemeOptionRow = React.memo(function ThemeOptionRow({
  option,
  selected,
  position,
  onSelect,
}: {
  option: ThemeOption;
  selected: boolean;
  position: RowPosition;
  onSelect: (choice: ThemeChoice) => void;
}) {
  const handlePress = useCallback(() => onSelect(option.value), [onSelect, option.value]);
  const leading = useMemo(
    () => ({ icon: option.icon, tone: selected ? ("brand" as Tone) : undefined }),
    [option.icon, selected]
  );

  return (
    <ListRow
      leading={leading}
      title={option.label}
      position={position}
      chevron={false}
      trailing={selected ? <Ionicons name="checkmark" size={18} color={colors.brandAccent} /> : undefined}
      onPress={handlePress}
    />
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
    paddingBottom: space.giant,
  },
  group: {
    marginBottom: layout.sectionGap,
  },
  version: {
    ...type.caption,
    color: colors.textTertiary,
    textAlign: "center",
  },
  sheetBody: {
    gap: space.xs,
    paddingBottom: space.sm,
  },
  sheetNote: {
    ...type.caption,
    color: colors.textTertiary,
    paddingHorizontal: layout.rowPaddingH,
    paddingTop: space.sm,
  },
});
