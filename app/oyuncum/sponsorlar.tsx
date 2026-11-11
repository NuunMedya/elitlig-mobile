/**
 * SPONSORLUKLARIM — oyuncu profilindeki üç sponsor alanı.
 * `/oyuncum/sponsorlar`  (web: PlayerTeamPanel ▸ Sponsorluklarım → SponsorManager scope=player)
 *
 * UÇLAR (routes/panel.js): GET/PUT/DELETE /api/panel/me/sponsors/:i?scope=player,
 * POST …/:i/image. Her değişiklik bir ONAYLI TALEPTİR (202): canlı alan,
 * yönetici yayınlayana kadar değişmez — ekran bunu her kaydette söyler.
 *
 * DÜZENLEME KİLİDİ: sunucu yazma uçlarında premium üyelik ister (402
 * PREMIUM_REQUIRED). Web panelinde premium akışı şimdilik kapalı olduğu için
 * alanlar herkese salt okunur görünür. Mobil aynı sözleşmeyi izler: sunucu
 * `isPremium: true` dönerse düzenleme açılır, aksi hâlde alanlar okunur ve
 * neden kapalı olduğu yazar — kapalı düğme sebebini söylemeli.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { Redirect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

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
  clearSponsor,
  getMySponsors,
  memberKeys,
  saveSponsor,
  uploadSponsorImage,
  type SponsorSlot,
} from "@/lib/api/member/player";
import { mediaUrl } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

const SLOT_COUNT = 3;
const placementLabel = (value: string | null) =>
  SPONSOR_PLACEMENTS.find((item) => item.value === value)?.label ?? "Konum seçilmedi";

const emptySlot = (index: number): SponsorSlot => ({
  slot_index: index,
  sponsor_name: null,
  placement: null,
  image_url: null,
  link_url: null,
  active: false,
});

export default function MySponsorsScreen() {
  const auth = useAuth();
  const { scrollY, scrollProps } = useHeaderScroll();
  const [editing, setEditing] = useState<SponsorSlot | null>(null);

  const query = useQuery({
    queryKey: memberKeys.sponsors,
    queryFn: getMySponsors,
    enabled: Boolean(auth.user?.player_id),
    staleTime: 60_000,
    retry: false,
  });
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  if (!auth.user && !auth.initializing) return <Redirect href="/giris" />;

  const canEdit = Boolean(query.data?.isPremium);
  const list = query.data?.sponsors ?? [];
  const slots = Array.from({ length: query.data?.slotCount ?? SLOT_COUNT }, (_, i) => list[i] ?? emptySlot(i + 1));

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Sponsorluklarım" back scrollY={scrollY} />
      {query.isLoading ? (
        <View style={styles.loading}>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </View>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <ScrollView {...scrollProps} contentContainerStyle={styles.content} refreshControl={refresh.control}>
          <Text style={styles.intro} {...textScale.long}>
            Profil sayfanda üç sponsorluk alanı yönetebilirsin: sponsorun adı, sayfadaki konumu, görseli ve
            tıklanınca gideceği bağlantı. Her değişiklik yönetici onayından sonra yayınlanır.
          </Text>

          {!canEdit ? (
            <View style={styles.locked}>
              <Ionicons name="lock-closed" size={16} color={colors.warn} />
              <Text style={styles.lockedText} {...textScale.long}>
                Sponsorluk alanları şu anda düzenlemeye kapalıdır. Düzenleme premium oyuncu üyeliğiyle açılır;
                mevcut alanların burada görünür.
              </Text>
            </View>
          ) : null}

          {slots.map((slot, index) => (
            <SlotCard key={slot.slot_index ?? index} slot={slot} index={index + 1} canEdit={canEdit} onEdit={() => setEditing({ ...slot, slot_index: index + 1 })} />
          ))}
        </ScrollView>
      )}

      {editing ? <SlotEditor slot={editing} onClose={() => setEditing(null)} /> : null}
    </SafeAreaView>
  );
}

const SlotCard = React.memo(function SlotCard({
  slot,
  index,
  canEdit,
  onEdit,
}: {
  slot: SponsorSlot;
  index: number;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const image = mediaUrl(slot.image_url);
  const filled = Boolean(slot.sponsor_name || image);
  return (
    <Touchable
      feedback="card"
      onPress={canEdit ? onEdit : undefined}
      disabled={!canEdit}
      accessibilityRole={canEdit ? "button" : undefined}
      accessibilityLabel={`Sponsor alanı ${index}${slot.sponsor_name ? `, ${slot.sponsor_name}` : ", boş"}`}
      style={styles.slot}
    >
      <View style={styles.slotHead}>
        <Text style={styles.slotIndex} {...textScale.badge}>
          {upperTR(`Sponsor alanı ${index}`)}
        </Text>
        <Badge label={slot.active ? "YAYINDA" : "KAPALI"} tone={slot.active ? "win" : "neutral"} size="xs" />
      </View>
      <View style={styles.preview}>
        {image ? (
          <Image source={{ uri: image }} style={styles.previewImage} resizeMode="contain" />
        ) : (
          <View style={styles.previewEmpty}>
            <Ionicons name="image-outline" size={22} color={colors.textTertiary} />
            <Text style={styles.previewText} {...textScale.dense}>
              Görsel yok
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.slotName} numberOfLines={1} {...textScale.dense}>
        {slot.sponsor_name || (filled ? "Adsız sponsor" : "Boş alan")}
      </Text>
      <Text style={styles.slotMeta} numberOfLines={1} {...textScale.dense}>
        {[placementLabel(slot.placement), slot.link_url].filter(Boolean).join(" · ")}
      </Text>
      {canEdit ? (
        <View style={styles.slotCta}>
          <Ionicons name="create-outline" size={13} color={colors.brandAccent} />
          <Text style={styles.slotCtaText} {...textScale.dense}>
            Düzenle
          </Text>
        </View>
      ) : null}
    </Touchable>
  );
});

function SlotEditor({ slot, onClose }: { slot: SponsorSlot; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(slot.sponsor_name ?? "");
  const [placement, setPlacement] = useState(slot.placement ?? "");
  const [link, setLink] = useState(slot.link_url ?? "");
  const [active, setActive] = useState(slot.active ?? true);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => setLinkError(null), [link]);

  const done = useCallback(
    (message: string) => {
      toast.show({ message, tone: "success" });
      void queryClient.invalidateQueries({ queryKey: memberKeys.sponsors });
      void queryClient.invalidateQueries({ queryKey: ["panel", "me"] });
      onClose();
    },
    [onClose, queryClient, toast],
  );
  const fail = (fallback: string) => (error: unknown) =>
    toast.show({ message: error instanceof ApiError ? error.userMessage : fallback, tone: "danger" });

  const save = useMutation({
    mutationFn: () =>
      saveSponsor(slot.slot_index, {
        sponsor_name: name.trim() || null,
        placement: placement || null,
        link_url: link.trim() || null,
        active,
      }),
    onSuccess: () => done("Sponsorluk değişikliği onaya gönderildi; canlı alan henüz değişmedi."),
    onError: fail("Sponsorluk alanı kaydedilemedi."),
  });
  const clear = useMutation({
    mutationFn: () => clearSponsor(slot.slot_index),
    onSuccess: () => done("Sponsor silme talebi onaya gönderildi; canlı alan henüz değişmedi."),
    onError: fail("Sponsor alanı temizlenemedi."),
  });
  const upload = useMutation({
    mutationFn: (file: { uri: string; name: string; type: string }) => uploadSponsorImage(slot.slot_index, file),
    onSuccess: () => done("Sponsor görseli onaya gönderildi; canlı görsel henüz değişmedi."),
    onError: fail("Görsel yüklenemedi."),
  });

  const pickImage = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.show({ message: "Fotoğraflarına erişim izni gerekiyor.", tone: "warn" });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const mime = asset.mimeType ?? "image/jpeg";
    const ext = mime.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    upload.mutate({ uri: asset.uri, name: asset.fileName ?? `sponsor-${slot.slot_index}.${ext}`, type: mime });
  }, [slot.slot_index, toast, upload]);

  const submit = () => {
    if (link.trim() && !/^https?:\/\/.+/i.test(link.trim())) {
      setLinkError("http(s):// ile başlayan geçerli bir bağlantı gir.");
      return;
    }
    save.mutate();
  };

  const busy = save.isPending || clear.isPending || upload.isPending;

  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={`Sponsor alanı ${slot.slot_index}`}
      snap="full"
      footer={
        <View style={styles.footer}>
          <Button label="Temizle" variant="secondary" onPress={() =>
              Alert.alert("Sponsor alanını temizle", "Bu alandaki sponsor adı, görsel ve bağlantı kaldırılır. Devam edilsin mi?", [
                { text: "Vazgeç", style: "cancel" },
                { text: "Temizle", style: "destructive", onPress: () => clear.mutate() },
              ])
            }
            loading={clear.isPending} disabled={busy} style={styles.flex} />
          <Button label="Kaydet" icon="checkmark" onPress={submit} loading={save.isPending} disabled={busy} style={styles.flex} />
        </View>
      }
    >
      <View style={styles.editor}>
        <Button
          label={upload.isPending ? "Yükleniyor…" : slot.image_url ? "Görseli değiştir" : "Görsel yükle"}
          icon="cloud-upload-outline"
          variant="secondary"
          onPress={pickImage}
          loading={upload.isPending}
          disabled={busy}
          fullWidth
        />
        <Input label="Sponsorluk adı" value={name} onChangeText={setName} placeholder="Ör. Ana sponsor" maxLength={120} />
        <Text style={styles.fieldLabel} {...textScale.badge}>
          {upperTR("Konumlandırma")}
        </Text>
        <ChipGroup>
          {SPONSOR_PLACEMENTS.map((item) => (
            <Chip
              key={item.value}
              label={item.label}
              selected={placement === item.value}
              onPress={() => setPlacement((old) => (old === item.value ? "" : item.value))}
            />
          ))}
        </ChipGroup>
        <Input
          label="Bağlantı"
          value={link}
          onChangeText={setLink}
          placeholder="https://"
          autoCapitalize="none"
          keyboardType="url"
          error={linkError ?? undefined}
        />
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel} {...textScale.dense}>
            Yayında
          </Text>
          <Toggle value={active} onValueChange={setActive} accessibilityLabel="Sponsor alanı yayında" />
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  loading: { gap: space.md, padding: layout.screenPadding },
  content: { padding: layout.screenPadding, gap: space.md, paddingBottom: space.giant },
  intro: { ...type.bodySm, color: colors.textSecondary },
  locked: {
    flexDirection: "row",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.warnDim,
  },
  lockedText: { ...type.caption, color: colors.textSecondary, flex: 1 },
  slot: {
    padding: space.md,
    gap: space.xs,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  slotHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  slotIndex: { ...type.micro, color: colors.textTertiary },
  preview: {
    height: 96,
    marginVertical: space.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surface3,
    overflow: "hidden",
  },
  previewImage: { width: "100%", height: "100%" },
  previewEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.xs },
  previewText: { ...type.caption, color: colors.textTertiary },
  slotName: { ...type.h4, color: colors.textPrimary },
  slotMeta: { ...type.caption, color: colors.textTertiary },
  slotCta: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: space.xxs },
  slotCtaText: { ...type.labelSm, color: colors.brandAccent },
  editor: { gap: space.md },
  fieldLabel: { ...type.micro, color: colors.textTertiary },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toggleLabel: { ...type.label, color: colors.textPrimary },
  footer: { flexDirection: "row", gap: space.sm },
});
