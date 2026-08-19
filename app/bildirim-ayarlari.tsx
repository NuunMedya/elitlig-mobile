import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { patch } from "@/lib/http";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DetailHeader } from "@/components/ScreenHeader";
import { colors, radius, spacing, type } from "@/constants/theme";

/**
 * Bildirim Ayarları — kullanıcı hangi bildirimleri almak istediğini seçer.
 * Tercihler AsyncStorage'e kaydedilir ve sunucuya gönderilir.
 */

interface NotifSetting {
  key: string;
  icon: string;
  label: string;
  desc: string;
  defaultOn: boolean;
}

const SETTINGS: NotifSetting[] = [
  {
    key: "match_scheduled",
    icon: "calendar-outline",
    label: "Yeni Fikstür",
    desc: "Takımına yeni maç girildiğinde",
    defaultOn: true,
  },
  {
    key: "match_reminder",
    icon: "alarm-outline",
    label: "Maç Hatırlatması",
    desc: "Maçtan 24 saat ve 2 saat önce",
    defaultOn: true,
  },
  {
    key: "match_result",
    icon: "football-outline",
    label: "Maç Sonucu",
    desc: "Maç bitince skor bildirimi",
    defaultOn: true,
  },
  {
    key: "transfer_offer",
    icon: "swap-horizontal-outline",
    label: "Transfer Teklifi",
    desc: "Yeni transfer teklifi geldiğinde",
    defaultOn: true,
  },
  {
    key: "penalty",
    icon: "shield-outline",
    label: "Ceza Bildirimi",
    desc: "Ceza veya disiplin kararı girildiğinde",
    defaultOn: true,
  },
  {
    key: "message",
    icon: "chatbubble-outline",
    label: "Yönetim Mesajı",
    desc: "ElitLig yönetimi yanıt verdiğinde",
    defaultOn: true,
  },
  {
    key: "daily_challenge",
    icon: "brain-outline",
    label: "Günün Testi",
    desc: "Her sabah 09:00'da hatırlatma",
    defaultOn: true,
  },
  {
    key: "arena_reminder",
    icon: "game-controller-outline",
    label: "Arena Hatırlatması",
    desc: "Salı ve Perşembe öğleden sonra",
    defaultOn: false,
  },
  {
    key: "breaking_news",
    icon: "newspaper-outline",
    label: "Son Dakika Haberler",
    desc: "Sadece önemli duyurular",
    defaultOn: false,
  },
];

const SECTIONS = [
  { title: "⚽ MAÇ BİLDİRİMLERİ", keys: ["match_scheduled", "match_reminder", "match_result"] },
  { title: "📬 PANEL BİLDİRİMLERİ", keys: ["transfer_offer", "penalty", "message"] },
  { title: "🎮 OYUN BİLDİRİMLERİ", keys: ["daily_challenge", "arena_reminder"] },
  { title: "📰 HABERLER", keys: ["breaking_news"] },
];

const PREFS_STORAGE_KEY = "elitlig.notifPrefs.v1";

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const [prefs, setPrefs] = useState<Record<string, boolean>>(
    Object.fromEntries(SETTINGS.map((s) => [s.key, s.defaultOn]))
  );

  // Kayıtlı tercihleri geri yükle.
  useEffect(() => {
    AsyncStorage.getItem(PREFS_STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const stored = JSON.parse(raw);
          if (stored && typeof stored === "object") {
            setPrefs((prev) => ({ ...prev, ...stored }));
          }
        } catch {}
      })
      .catch(() => {});
  }, []);

  const toggle = (key: string, value: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      AsyncStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    // Sunucunun bildiği tek tercih: günlük test push'u (PATCH notification-preferences).
    if (key === "daily_challenge") {
      patch("/api/users/me/notification-preferences", { dailyQuiz: value }).catch(() => {});
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <DetailHeader title="Bildirim Ayarları" subtitle="Hangi bildirimleri almak istediğini seç" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={16} color={colors.turf} />
          <Text style={styles.infoText}>
            Push bildirimleri TestFlight ve App Store sürümünde aktiftir. Sık boğaz etmemek için oyun bildirimleri günde 1 kez gönderilir.
          </Text>
        </View>

        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionCard}>
              {section.keys.map((key, i) => {
                const setting = SETTINGS.find((s) => s.key === key)!;
                return (
                  <View key={key} style={[styles.row, i > 0 && styles.rowBorder]}>
                    <View style={styles.rowIcon}>
                      <Ionicons name={setting.icon as any} size={18} color={colors.turf} />
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowLabel}>{setting.label}</Text>
                      <Text style={styles.rowDesc}>{setting.desc}</Text>
                    </View>
                    <Switch
                      value={prefs[key]}
                      onValueChange={(v) => toggle(key, v)}
                      trackColor={{ false: colors.faint, true: colors.turf + "88" }}
                      thumbColor={prefs[key] ? colors.turf : colors.muted}
                    />
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.pitch },
  content: { padding: spacing.md, gap: spacing.md },
  infoCard: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.turfDim,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  infoText: { flex: 1, fontSize: 11, fontWeight: "600", color: colors.line, lineHeight: 18 },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8, color: colors.muted },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.faint,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.faint },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.turfDim,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 12, fontWeight: "700", color: colors.line },
  rowDesc: { fontSize: 11, fontWeight: "500", color: colors.muted, marginTop: 2 },
});
