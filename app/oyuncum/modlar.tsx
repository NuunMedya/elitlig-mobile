/**
 * PROFİL MODLARI — oyuncu / takım başkanı alanını aç-kapat.
 * `/oyuncum/modlar`  (web: Ayarlar ▸ profil modları, PATCH /api/users/me/profile-type)
 *
 * KURALLAR (sunucunun — routes/User.js assertProfileTypeChange):
 *   · En az bir mod açık kalır ("oyuncu" | "takim_baskani" | "double").
 *   · Yönetilen takımı olan üye Takım Başkanı modunu kapatamaz; önce takımı
 *     devretmeli ya da istifa etmeli (409 TEAM_HANDOVER_REQUIRED). Ekran bu
 *     kuralı denemeden ÖNCE söyler; hata mesajına bırakmaz.
 *   · Modu kapatmak veri silmez; tekrar açınca kalınan yerden devam edilir.
 *
 * KAYNAK: güncel kapsam `/api/panel/me` → `profileScopes` (sunucunun kendi
 * kuralı); eski yanıtta yoksa web'deki yedek kural (`resolveProfileType`).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter, type Href } from "expo-router";
import React, { useCallback } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PanelCard, PanelRow, PanelSection } from "@/components/club/Panel";
import { ErrorState, ScreenHeader, SkeletonCard, Toggle, toneColors, useToast, type Tone } from "@/components/ui";
import {
  PROFILE_TYPE_LABELS,
  profileTypeFromScopes,
  resolveProfileType,
  scopesForProfileType,
  updateProfileType,
  type PanelMeExtras,
} from "@/lib/api/member/player";
import { getPanelMe } from "@/lib/api/panel";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

type Scope = "player" | "team";

const MODES: { scope: Scope; icon: keyof typeof Ionicons.glyphMap; tone: Tone; title: string; body: string }[] = [
  {
    scope: "player",
    icon: "person",
    tone: "brand",
    title: "Oyuncu modu",
    body: "Kariyerim alanı: maçların, istatistiklerin, teklif, sözleşme ve disiplin dosyaların.",
  },
  {
    scope: "team",
    icon: "shield-half",
    tone: "info",
    title: "Takım Başkanı modu",
    body: "Kulübüm alanı: kadro, maç alma, transfer, kasa ve takım bilgileri.",
  },
];

export default function ProfileModesScreen() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const me = useQuery({
    queryKey: ["panel", "me"],
    queryFn: getPanelMe,
    enabled: Boolean(auth.user),
    staleTime: 30_000,
    retry: false,
  });
  const data = me.data as (typeof me.data & PanelMeExtras) | undefined;
  const user = auth.user;

  const scopes =
    data?.profileScopes && typeof data.profileScopes.player === "boolean"
      ? data.profileScopes
      : scopesForProfileType(
          resolveProfileType({
            profile_type: data?.profileType ?? user?.profile_type,
            player_id: user?.player_id,
            managed_team_id: user?.managed_team_id,
          }),
        );
  const managesTeam = Boolean(data?.team ?? user?.managed_team_id);

  const mutation = useMutation({
    mutationFn: (next: { player: boolean; team: boolean }) => updateProfileType(profileTypeFromScopes(next)),
    onSuccess: (_result, next) => {
      const label = PROFILE_TYPE_LABELS[profileTypeFromScopes(next)];
      toast.show({ message: `Üye profilin “${label}” olarak güncellendi.`, tone: "success" });
      void queryClient.invalidateQueries({ queryKey: ["panel", "me"] });
      void queryClient.invalidateQueries({ queryKey: ["takim", "dashboard"] });
    },
    onError: (error: unknown) =>
      toast.show({
        message:
          error instanceof ApiError
            ? error.code === "TEAM_HANDOVER_REQUIRED"
              ? "Takım başkanı modunu kapatmak için önce takımı başka bir üyeye devret ya da takımdan istifa et."
              : error.userMessage
            : "Profil modu güncellenemedi.",
        tone: "danger",
      }),
  });

  const toggle = useCallback(
    (scope: Scope, on: boolean) => {
      const next = { ...scopes, [scope]: on };
      if (!next.player && !next.team) {
        Alert.alert("En az bir mod açık kalmalı", "Oyuncu ya da takım başkanı modlarından en az biri açık olmalı.");
        return;
      }
      if (scope === "team" && !on && managesTeam) {
        Alert.alert(
          "Önce takımı bırak",
          "Takım Başkanı modundan çıkabilmek için önce takımı başka bir üyeye devret ya da takımdan istifa et. " +
            "Takım yönetimi başkalarına karşı bir sorumluluk; takım başkansız bırakılamaz.",
        );
        return;
      }
      if (on) {
        mutation.mutate(next);
        return;
      }
      Alert.alert(
        scope === "team" ? "Takım Başkanı modunu kapat" : "Oyuncu modunu kapat",
        `${scope === "team" ? "Kulübüm" : "Kariyerim"} alanı yönetim menüsünden kaldırılacak. Verilerin silinmez; ` +
          "modu tekrar açtığında kaldığın yerden devam edersin.",
        [
          { text: "Vazgeç", style: "cancel" },
          { text: "Modu kapat", style: "destructive", onPress: () => mutation.mutate(next) },
        ],
      );
    },
    [managesTeam, mutation, scopes],
  );

  if (!user && !auth.initializing) return <Redirect href="/giris" />;

  const go = (href: string) => router.push(href as Href);
  const current = PROFILE_TYPE_LABELS[profileTypeFromScopes(scopes)];

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Profil modları" back />
      {me.isLoading ? (
        <View style={styles.loading}>
          <SkeletonCard lines={3} />
        </View>
      ) : me.isError && !data ? (
        <ErrorState error={me.error} onRetry={me.refetch} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.intro} {...textScale.long}>
            Üye profilin hangi yönetim alanlarının açık olacağını belirler. Şu an: <Text style={styles.strong}>{current}</Text>.
          </Text>

          {MODES.map((mode) => {
            const on = Boolean(scopes[mode.scope]);
            const tc = toneColors(mode.tone);
            const locked = mode.scope === "team" && on && managesTeam;
            return (
              <View key={mode.scope} style={[styles.mode, on && { borderColor: tc.fg }]}>
                <View style={[styles.icon, { backgroundColor: tc.dim }]}>
                  <Ionicons name={mode.icon} size={18} color={tc.fg} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.title} {...textScale.dense}>
                    {mode.title}
                  </Text>
                  <Text style={styles.body} {...textScale.long}>
                    {mode.body}
                  </Text>
                  {locked ? (
                    <Text style={styles.lock} {...textScale.dense}>
                      Takım yönettiğin için kapatılamaz.
                    </Text>
                  ) : null}
                </View>
                <Toggle
                  value={on}
                  onValueChange={(value) => toggle(mode.scope, value)}
                  disabled={mutation.isPending}
                  accessibilityLabel={mode.title}
                />
              </View>
            );
          })}

          <PanelSection title="Profil bağlantıları" style={styles.section}>
            <PanelCard padded={false}>
              <PanelRow
                icon="person-add"
                tone="brand"
                title={user?.player_id ? "Oyuncu profilim" : "Oyuncu profili bağla"}
                hint={user?.player_id ? "Kişisel bilgiler ve taleplerim" : "Kaydını bul ve sahiplen ya da yeni profil aç"}
                onPress={() => go(user?.player_id ? "/oyuncum/profil" : "/oyuncum/bagla")}
              />
              <PanelRow
                icon="shield"
                tone="info"
                title={managesTeam ? "Takımım" : "Takım yönetimi iste"}
                hint={managesTeam ? "Kulübüm alanında yönet" : "Takımını bul ya da yeni takım kur"}
                onPress={() => go(managesTeam ? "/kulubum?rol=takim" : "/oyuncum/bagla?tur=takim")}
                last
              />
            </PanelCard>
          </PanelSection>

          <Text style={styles.note} {...textScale.long}>
            Mod değişikliği hesabına hemen işlenir; Yönetim sekmesindeki alanlar oturumun bir sonraki
            tazelenmesinde (uygulamaya döndüğünde) güncellenir.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1, minWidth: 0 },
  loading: { padding: layout.screenPadding },
  content: { padding: layout.screenPadding, gap: space.md, paddingBottom: space.giant },
  intro: { ...type.bodySm, color: colors.textSecondary },
  strong: { ...type.label, color: colors.textPrimary },
  mode: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  icon: { width: 38, height: 38, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  title: { ...type.h4, color: colors.textPrimary },
  body: { ...type.caption, color: colors.textSecondary, marginTop: space.xxs },
  lock: { ...type.caption, color: colors.warn, marginTop: space.xs },
  section: { paddingHorizontal: 0, marginTop: space.sm },
  note: { ...type.caption, color: colors.textTertiary },
});
