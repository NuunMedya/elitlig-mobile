/**
 * SPONSORLAR — takım sayfasında görünen üç sponsor alanı.
 *
 * Web: pages/panel/SponsorManager.js (scope="team"). Uçlar lib/api/club/
 * sponsors.ts'de. İki kural sunucunundur ve ekranda AÇIKÇA söylenir:
 *   · Yazma premium ister (402 PREMIUM_REQUIRED) — premium değilse alanlar
 *     okunur ama düzenle düğmesi yerine üyelik notu çıkar.
 *   · Değişiklik hemen yayınlanmaz; yönetici onayına `sponsor_update` talebi
 *     olarak gider (202). Bekleyen talepler Kulübüm ▸ onay bekleyenlerde.
 *
 * Görsel, galeriden seçilir ve doğrudan alanın görsel ucuna yüklenir
 * (multipart "image"); ad/konum/bağlantı ayrı PUT ile gider.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { Redirect } from "expo-router";
import React, { useState } from "react";
import { Alert, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PanelEmpty, PanelSection } from "@/components/club/Panel";
import {
  Badge,
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  ErrorState,
  Input,
  ScreenHeader,
  SkeletonCard,
  Toggle,
  Touchable,
  useHeaderScroll,
  useRefresh,
  useToast,
} from "@/components/ui";
import {
  SPONSOR_PLACEMENTS,
  clearTeamSponsor,
  getTeamSponsors,
  saveTeamSponsor,
  uploadTeamSponsorImage,
  type SponsorSlot,
} from "@/lib/api/club/sponsors";
import { mediaUrl } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

const placementLabel = (key: string | null) => SPONSOR_PLACEMENTS.find((item) => item.key === key)?.label ?? null;
const errorText = (error: unknown, fallback: string) =>
  error instanceof ApiError
    ? error.code === "PREMIUM_REQUIRED"
      ? "Sponsor alanları premium üyelere özel. Takım profili için üyeliğini yükselt."
      : error.userMessage
    : fallback;

export default function TeamSponsorsScreen() {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { scrollY, scrollProps } = useHeaderScroll();
  const [editing, setEditing] = useState<SponsorSlot | null>(null);

  const query = useQuery({
    queryKey: ["club", "sponsors"],
    queryFn: getTeamSponsors,
    enabled: Boolean(auth.user),
    staleTime: 60_000,
    retry: false,
  });
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  const afterChange = (message: string) => {
    toast.show({ message, tone: "success" });
    void queryClient.invalidateQueries({ queryKey: ["club", "sponsors"] });
    void queryClient.invalidateQueries({ queryKey: ["takim", "dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["panel", "me"] });
  };

  const clear = useMutation({
    mutationFn: (index: number) => clearTeamSponsor(index),
    onSuccess: (result) => afterChange(result.message ?? "Kaldırma isteği onaya gönderildi."),
    onError: (error) => toast.show({ message: errorText(error, "Sponsor kaldırılamadı."), tone: "danger" }),
  });

  if (!auth.user) return <Redirect href="/giris" />;

  const premium = Boolean(query.data?.isPremium);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Sponsorlar" subtitle="Takım sayfasındaki sponsor alanları" back scrollY={scrollY} />
      <ScrollView {...scrollProps} contentContainerStyle={styles.content} refreshControl={refresh.control}>
        {query.isLoading ? (
          <View style={styles.pad}>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
          </View>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={query.refetch} />
        ) : (
          <>
            <View style={[styles.pad, styles.notice]}>
              <Ionicons name={premium ? "sparkles" : "lock-closed"} size={16} color={premium ? colors.brandAccent : colors.warn} />
              <Text style={styles.noticeText} {...textScale.long}>
                {premium
                  ? "Değişiklikler yönetici onayından sonra takım sayfanda yayına alınır."
                  : "Sponsor alanlarını düzenlemek premium üyelik ister. Mevcut alanları görebilirsin."}
              </Text>
            </View>
            <PanelSection title="Alanlar" meta={`${query.data?.slotCount ?? 3} alan`}>
              <View style={styles.slots}>
                {(query.data?.sponsors ?? []).map((slot) => (
                  <SlotCard
                    key={slot.slot_index}
                    slot={slot}
                    editable={premium}
                    onEdit={() => setEditing(slot)}
                    onClear={() =>
                      Alert.alert("Sponsoru kaldır", `${slot.sponsor_name ?? `${slot.slot_index}. alan`} kaldırılsın mı? İstek yönetici onayına gider.`, [
                        { text: "Vazgeç", style: "cancel" },
                        { text: "Kaldır", style: "destructive", onPress: () => clear.mutate(slot.slot_index) },
                      ])
                    }
                  />
                ))}
                {!query.data?.sponsors?.length ? <PanelEmpty icon="megaphone-outline" text="Sponsor alanı bulunamadı." /> : null}
              </View>
            </PanelSection>
          </>
        )}
      </ScrollView>

      <SponsorSheet slot={editing} onClose={() => setEditing(null)} onSaved={afterChange} />
    </SafeAreaView>
  );
}

function SlotCard({ slot, editable, onEdit, onClear }: { slot: SponsorSlot; editable: boolean; onEdit: () => void; onClear: () => void }) {
  const filled = Boolean(slot.sponsor_name || slot.image_url);
  const image = mediaUrl(slot.image_url);
  return (
    <Touchable onPress={editable ? onEdit : undefined} disabled={!editable} feedback="card" style={styles.slot} accessibilityRole="button">
      <View style={styles.slotImage}>
        {image ? (
          <Image source={{ uri: image }} style={styles.slotImg} resizeMode="contain" />
        ) : (
          <Ionicons name="image-outline" size={22} color={colors.textTertiary} />
        )}
      </View>
      <View style={styles.slotBody}>
        <Text style={styles.slotIndex} {...textScale.badge}>
          {`${slot.slot_index}. ALAN`}
        </Text>
        <Text style={styles.slotName} numberOfLines={1} {...textScale.dense}>
          {slot.sponsor_name ?? (filled ? "Adsız sponsor" : "Boş alan")}
        </Text>
        <View style={styles.slotMeta}>
          {placementLabel(slot.placement) ? <Badge label={placementLabel(slot.placement)!} tone="info" size="xs" /> : null}
          <Badge label={slot.active ? "Yayında" : "Pasif"} tone={slot.active ? "win" : "neutral"} size="xs" />
        </View>
      </View>
      {editable ? (
        <View style={styles.slotActions}>
          <Ionicons name="create-outline" size={18} color={colors.brandAccent} />
          {filled ? (
            <Touchable onPress={onClear} hitSlop={10} accessibilityLabel="Sponsoru kaldır">
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </Touchable>
          ) : null}
        </View>
      ) : null}
    </Touchable>
  );
}

function SponsorSheet({ slot, onClose, onSaved }: { slot: SponsorSlot | null; onClose: () => void; onSaved: (message: string) => void }) {
  const [name, setName] = useState("");
  const [placement, setPlacement] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastIndex, setLastIndex] = useState<number | null>(null);

  // Alt sayfa her açıldığında o alanın değerleriyle dolar.
  if (slot && slot.slot_index !== lastIndex) {
    setLastIndex(slot.slot_index);
    setName(slot.sponsor_name ?? "");
    setPlacement(slot.placement);
    setLink(slot.link_url ?? "");
    setActive(slot.active || !slot.sponsor_name);
    setError(null);
  }

  const close = () => {
    setLastIndex(null);
    onClose();
  };

  const save = useMutation({
    mutationFn: () =>
      saveTeamSponsor(slot!.slot_index, {
        sponsor_name: name.trim() || null,
        placement,
        link_url: link.trim() || null,
        active,
      }),
    onSuccess: (result) => {
      onSaved(result.message ?? "Sponsor değişikliği onaya gönderildi.");
      close();
    },
    onError: (caught) => setError(errorText(caught, "Sponsor kaydedilemedi.")),
  });

  const upload = useMutation({
    mutationFn: async () => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error("Fotoğraflarına erişim izni gerekiyor.");
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
      if (result.canceled || !result.assets?.[0]) return null;
      const asset = result.assets[0];
      const mime = asset.mimeType ?? "image/jpeg";
      const ext = mime.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
      return uploadTeamSponsorImage(slot!.slot_index, {
        uri: asset.uri,
        name: asset.fileName ?? `sponsor-${Date.now()}.${ext}`,
        type: mime,
      });
    },
    onSuccess: (result) => {
      if (result) onSaved(result.message ?? "Sponsor görseli onaya gönderildi.");
    },
    onError: (caught) => setError(caught instanceof ApiError ? errorText(caught, "") : caught instanceof Error ? caught.message : "Görsel yüklenemedi."),
  });

  const linkInvalid = Boolean(link.trim()) && !/^https?:\/\/.+/i.test(link.trim());

  return (
    <BottomSheet
      visible={Boolean(slot)}
      onClose={close}
      title={slot ? `${slot.slot_index}. sponsor alanı` : "Sponsor"}
      snap="content"
      footer={
        <Button label="Onaya gönder" icon="paper-plane-outline" onPress={() => save.mutate()} loading={save.isPending} disabled={linkInvalid} fullWidth />
      }
    >
      <View style={styles.sheet}>
        <Button
          label={slot?.image_url ? "Görseli değiştir" : "Görsel yükle"}
          icon="image-outline"
          variant="secondary"
          onPress={() => upload.mutate()}
          loading={upload.isPending}
          fullWidth
        />
        <Input label="Sponsor adı" size="sm" value={name} onChangeText={setName} maxLength={120} />
        <Text style={styles.label} {...textScale.dense}>
          Konum
        </Text>
        <ChipGroup contentPadding={0}>
          {SPONSOR_PLACEMENTS.map((item) => (
            <Chip key={item.key} size="sm" label={item.label} selected={placement === item.key} onPress={() => setPlacement(placement === item.key ? null : item.key)} />
          ))}
        </ChipGroup>
        <Input
          label="Bağlantı"
          size="sm"
          value={link}
          onChangeText={setLink}
          placeholder="https://"
          autoCapitalize="none"
          keyboardType="url"
          error={linkInvalid ? "http(s):// ile başlayan bir bağlantı gir." : undefined}
        />
        <View style={styles.toggleRow}>
          <Text style={styles.toggleText} {...textScale.dense}>
            Takım sayfasında göster
          </Text>
          <Toggle value={active} onValueChange={setActive} accessibilityLabel="Takım sayfasında göster" />
        </View>
        {error ? (
          <Text style={styles.error} {...textScale.long}>
            {error}
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingTop: space.md, paddingBottom: space.giant },
  pad: { paddingHorizontal: layout.screenPadding, gap: space.md },
  notice: { flexDirection: "row", alignItems: "flex-start" },
  noticeText: { ...type.caption, color: colors.textSecondary, flex: 1 },
  slots: { gap: space.sm },
  slot: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  slotImage: {
    width: 64,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  slotImg: { width: "100%", height: "100%" },
  slotBody: { flex: 1, minWidth: 0, gap: space.xxs },
  slotIndex: { ...type.overline, color: colors.textTertiary },
  slotName: { ...type.h4, color: colors.textPrimary },
  slotMeta: { flexDirection: "row", gap: space.xs },
  slotActions: { flexDirection: "row", gap: space.md, alignItems: "center" },
  sheet: { gap: space.md, paddingBottom: space.md },
  label: { ...type.label, color: colors.textSecondary },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toggleText: { ...type.label, color: colors.textPrimary },
  error: { ...type.caption, color: colors.danger },
});
