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
 *
 * TASARIM (gece teması): üstte üç sayı (yayında · pasif · boş alan) ve üyelik
 * durumu satırı; alanlar iki sütunlu LOGO IZGARASI — her karo geniş bir logo
 * vitrini (görsel yoksa alan numarası ve kurdele ikonu), altında ad, konum
 * ve yayın hapı. Boş alan kesik çizgili "ekle" karosudur.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { Redirect } from "expo-router";
import React, { useState } from "react";
import { Alert, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Badge,
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  IconTile,
  Input,
  MetricGrid,
  MetricTile,
  Reveal,
  ScreenHeader,
  SectionHeader,
  Skeleton,
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
import { colors, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

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
  const slots = query.data?.sponsors ?? [];
  const live = slots.filter((slot) => slot.active && (slot.sponsor_name || slot.image_url)).length;
  const empty = slots.filter((slot) => !slot.sponsor_name && !slot.image_url).length;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Sponsorlar" subtitle="Takım sayfasındaki sponsor alanları" back scrollY={scrollY} />
      <ScrollView {...scrollProps} contentContainerStyle={styles.content} refreshControl={refresh.control}>
        {query.isLoading ? (
          <View style={styles.stack}>
            <Skeleton height={76} radius="xl" />
            <Skeleton height={64} radius="xl" />
            <View style={styles.grid}>
              {[0, 1, 2, 3].map((index) => (
                <View key={index} style={styles.cell}>
                  <Skeleton height={196} radius="xl" />
                </View>
              ))}
            </View>
          </View>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={query.refetch} />
        ) : (
          <>
            <Reveal index={0}>
              <MetricGrid columns={3}>
                <MetricTile label="Yayında" value={String(live)} icon="radio" tone="win" />
                <MetricTile label="Pasif" value={String(slots.length - live - empty)} icon="pause-circle" />
                <MetricTile label="Boş" value={String(empty)} icon="add-circle" tone={empty ? "brand" : "neutral"} />
              </MetricGrid>
            </Reveal>

            <Reveal index={1}>
              <View style={[styles.notice, premium ? styles.noticePremium : styles.noticeLocked]}>
                <IconTile icon={premium ? "sparkles" : "lock-closed"} tone={premium ? "signature" : "gold"} size={36} glow={false} />
                <View style={styles.flex}>
                  <Text style={styles.noticeTitle} {...textScale.dense}>
                    {premium ? "Premium üyelik açık" : "Düzenleme premium ister"}
                  </Text>
                  <Text style={styles.noticeText} {...textScale.long}>
                    {premium
                      ? "Değişiklikler yönetici onayından sonra takım sayfanda yayına alınır."
                      : "Mevcut alanları görebilirsin; düzenlemek için takım üyeliğini yükselt."}
                  </Text>
                </View>
              </View>
            </Reveal>

            <SectionHeader title="Sponsor alanları" meta={`${query.data?.slotCount ?? 3} alan`} inset="flush" style={styles.section} />
            {slots.length ? (
              <View style={styles.grid}>
                {slots.map((slot, index) => (
                  <View key={slot.slot_index} style={styles.cell}>
                    <Reveal index={index + 2} distance={8} scaleFrom={0.96}>
                      <SlotTile
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
                    </Reveal>
                  </View>
                ))}
              </View>
            ) : (
              <EmptyState variant="inline" icon="ribbon-outline" title="Sponsor alanı yok" body="Takımın için tanımlı bir sponsor alanı bulunamadı." />
            )}
          </>
        )}
      </ScrollView>

      <SponsorSheet slot={editing} onClose={() => setEditing(null)} onSaved={afterChange} />
    </SafeAreaView>
  );
}

function SlotTile({ slot, editable, onEdit, onClear }: { slot: SponsorSlot; editable: boolean; onEdit: () => void; onClear: () => void }) {
  const filled = Boolean(slot.sponsor_name || slot.image_url);
  const image = mediaUrl(slot.image_url);
  const placement = placementLabel(slot.placement);
  return (
    <Touchable
      onPress={editable ? onEdit : undefined}
      disabled={!editable}
      feedback="card"
      accessibilityRole="button"
      accessibilityLabel={`${slot.slot_index}. alan, ${slot.sponsor_name ?? (filled ? "Adsız sponsor" : "boş")}${editable ? ", düzenle" : ""}`}
      style={[styles.tile, !filled && styles.tileEmpty]}
    >
      <View style={[styles.logo, !filled && styles.logoEmpty]}>
        {image ? (
          <Image source={{ uri: image }} style={styles.logoImg} resizeMode="contain" />
        ) : filled ? (
          <View style={styles.monogram}>
            <Text style={styles.monogramText} numberOfLines={1} {...textScale.badge}>
              {initials(slot.sponsor_name ?? "")}
            </Text>
          </View>
        ) : (
          <Ionicons name={editable ? "add-circle-outline" : "ribbon-outline"} size={28} color={colors.textTertiary} />
        )}
        <View style={styles.slotNo}>
          <Text style={styles.slotNoText} {...textScale.badge}>
            {slot.slot_index}
          </Text>
        </View>
        {editable && filled ? (
          <Touchable onPress={onClear} hitSlop={10} accessibilityRole="button" accessibilityLabel="Sponsoru kaldır" style={styles.trash}>
            <Ionicons name="trash-outline" size={14} color={colors.danger} />
          </Touchable>
        ) : null}
      </View>
      <View style={styles.tileBody}>
        <Text style={styles.slotIndex} {...textScale.badge}>
          {upperTR(placement ?? `${slot.slot_index}. alan`)}
        </Text>
        <Text style={[styles.slotName, !filled && styles.slotNameEmpty]} numberOfLines={1} {...textScale.dense}>
          {slot.sponsor_name ?? (filled ? "Adsız sponsor" : editable ? "Sponsor ekle" : "Boş alan")}
        </Text>
        {filled ? (
          <Badge label={slot.active ? "Yayında" : "Pasif"} tone={slot.active ? "win" : "neutral"} icon={slot.active ? "radio" : "pause"} size="xs" />
        ) : (
          <Text style={styles.slotHint} numberOfLines={1} {...textScale.dense}>
            {editable ? "Görsel ve bağlantı ekle" : "Premium ile açılır"}
          </Text>
        )}
      </View>
    </Touchable>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toLocaleUpperCase("tr-TR") ?? "")
    .join("");
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
  content: { paddingHorizontal: layout.screenPadding, paddingTop: space.md, paddingBottom: space.giant, gap: space.md },
  stack: { gap: space.md },
  flex: { flex: 1, minWidth: 0 },
  section: { marginTop: space.md },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    borderWidth: hairline,
  },
  noticePremium: { backgroundColor: colors.brandDim, borderColor: colors.brandBorder },
  noticeLocked: { backgroundColor: colors.warnDim, borderColor: colors.border },
  noticeTitle: { ...type.h4, color: colors.textPrimary },
  noticeText: { ...type.caption, color: colors.textSecondary },

  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -space.xs },
  cell: { width: "50%", padding: space.xs },
  tile: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.glassLine,
    overflow: "hidden",
  },
  tileEmpty: { borderStyle: "dashed", borderColor: colors.borderStrong },
  logo: {
    height: 112,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  logoEmpty: { backgroundColor: colors.surface1 },
  logoImg: { width: "80%", height: "80%" },
  monogram: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandDim,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
  },
  monogramText: { ...type.scoreMd, color: colors.brandAccent },
  slotNo: {
    position: "absolute",
    top: space.sm,
    left: space.sm,
    minWidth: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.glass,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  slotNoText: { ...type.numSmStrong, color: colors.textSecondary },
  trash: {
    position: "absolute",
    top: space.sm,
    right: space.sm,
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.dangerDim,
  },
  tileBody: { padding: space.md, gap: space.xs, alignItems: "flex-start" },
  slotIndex: { ...type.overline, color: colors.textTertiary },
  slotName: { ...type.h4, color: colors.textPrimary },
  slotNameEmpty: { color: colors.brandAccent },
  slotHint: { ...type.caption, color: colors.textTertiary },
  sheet: { gap: space.md, paddingBottom: space.md },
  label: { ...type.label, color: colors.textSecondary },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toggleText: { ...type.label, color: colors.textPrimary },
  error: { ...type.caption, color: colors.danger },
});
