/**
 * MyInquiries — üyenin taraf olduğu maç / konu incelemeleri ve savunma.
 *
 * Disiplin kurulu bir maç ya da konu hakkında inceleme başlattığında taraflar
 * (maçın takımları, kurulun belirttiği takım ya da oyuncu) inceleme SÜRERKEN
 * savunma yazabilir — oyuncu ceza dosyalarındaki savunmanın aynısı. Savunma
 * metni yalnız yazan tarafa ve kurula açıktır; kurulun değerlendirmesi aynı
 * kartta görünür. Disiplin Kurulu kararı açıklanınca savunma kapanır, itiraz açılır:
 * taraflar karara itiraz (CAS başvurusu) edebilir; itiraz üzerine verilen karar nihaidir.
 *
 * Takımım ▸ Disiplin ve Cezalarım ekranlarının başında gösterilir; taraf olunan
 * inceleme yoksa hiçbir şey çizmez.
 * VERİ: GET /api/penalties/inquiries/mine · POST /api/penalties/inquiries/:id/defense
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Badge, BottomSheet, Button, IconTile, Input, useToast, type Tone } from "@/components/ui";
import { getMyInquiries, submitInquiryDefense, submitInquiryObjection, type MyInquiry } from "@/lib/api/panel";
import { formatDateShort } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

const REVIEW_TONE: Record<string, Tone> = { pending: "warn", accepted: "win", rejected: "danger", noted: "info" };
const MIN_TEXT = 10;

export function MyInquiries() {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [writing, setWriting] = useState<MyInquiry | null>(null);
  const [text, setText] = useState("");

  const query = useQuery({
    queryKey: ["panel", "inquiries"],
    queryFn: getMyInquiries,
    enabled: Boolean(auth.user),
    staleTime: 60_000,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: () => (objecting ? submitInquiryObjection(writing!.public_id, text.trim()) : submitInquiryDefense(writing!.public_id, text.trim())),
    onSuccess: () => {
      setWriting(null);
      setText("");
      void queryClient.invalidateQueries({ queryKey: ["panel", "inquiries"] });
      toast.show({ message: objecting ? "İtirazın disiplin kuruluna iletildi." : "Savunman disiplin kuruluna iletildi.", tone: "success", icon: "checkmark-circle", haptic: "success" });
    },
    onError: (error: unknown) => {
      // Karar açıklandıysa sunucu 409 döner; liste tazelenir.
      if (error instanceof ApiError && error.status === 409) void queryClient.invalidateQueries({ queryKey: ["panel", "inquiries"] });
      toast.show({
        message: error instanceof ApiError ? error.userMessage : error instanceof Error ? error.message : "Gönderilemedi.",
        tone: "danger",
        icon: "alert-circle",
        duration: 4000,
      });
    },
  });

  // Disiplin Kurulu kararı açıklandıysa yazılan metin savunma değil, karara itirazdır (CAS başvurusu).
  const objecting = Boolean(writing?.can_object);
  const items = query.data ?? [];
  if (!items.length) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionLabel} {...textScale.badge}>
        İNCELEMELER
      </Text>
      {items.map((inquiry) => (
        <View key={inquiry.public_id} style={styles.card}>
          <View style={styles.top}>
            <IconTile icon={inquiry.kind === "match" ? "football" : "document-text"} tone={inquiry.is_decided ? "neutral" : "gold"} size={40} glow={false} />
            <View style={styles.texts}>
              <Text style={styles.title} numberOfLines={3} {...textScale.dense}>
                {inquiry.headline}
              </Text>
              <Text style={styles.meta} numberOfLines={2} {...textScale.dense}>
                {[inquiry.viewer_party_name, formatDateShort(inquiry.createdAt)].filter(Boolean).join(" · ")}
              </Text>
            </View>
          </View>
          <Badge label={inquiry.status_label} tone={inquiry.is_decided ? "win" : "warn"} size="sm" />

          {inquiry.my_defenses.map((defense) => (
            <View key={defense.id} style={styles.block}>
              <View style={styles.blockHead}>
                <Text style={styles.blockLabel} {...textScale.badge}>
                  {defense.kind === "objection" ? "İTİRAZIN" : "SAVUNMAN"}
                  {defense.entered_by_admin ? " (KURUL KAYDI)" : ""} · {formatDateShort(defense.createdAt)}
                </Text>
                <Badge label={defense.review_status_label} tone={REVIEW_TONE[defense.review_status] ?? "neutral"} size="xs" />
              </View>
              <Text style={styles.blockText} numberOfLines={6} {...textScale.long}>
                {defense.text}
              </Text>
              {defense.review_status !== "pending" ? (
                <Text style={styles.meta} {...textScale.dense}>
                  Kurul notu: {defense.review_note || "Ek not yazılmadı."}
                </Text>
              ) : null}
            </View>
          ))}

          {inquiry.interim_text ? (
            <View style={styles.block}>
              <Text style={styles.blockLabel} {...textScale.badge}>
                DİSİPLİN KURULU KARARI{inquiry.interim_at ? ` · ${formatDateShort(inquiry.interim_at)}` : ""}
              </Text>
              <Text style={styles.blockText} {...textScale.long}>
                {inquiry.interim_text}
              </Text>
            </View>
          ) : null}
          {inquiry.is_decided ? (
            <View style={styles.block}>
              <Text style={styles.blockLabel} {...textScale.badge}>
                CAS KARARI
              </Text>
              <Text style={styles.blockText} {...textScale.long}>
                {inquiry.decision_text || "Karar metni yayımlanmadı."}
              </Text>
            </View>
          ) : inquiry.can_defend || inquiry.can_object ? (
            <Button
              label={inquiry.can_object ? "Karara itiraz et (CAS)" : inquiry.my_defenses.length ? "Ek savunma yaz" : "Savunma yaz"}
              icon="create-outline"
              variant="primary"
              size="sm"
              onPress={() => {
                setText("");
                setWriting(inquiry);
              }}
            />
          ) : null}
        </View>
      ))}

      <BottomSheet
        visible={writing !== null}
        onClose={mutation.isPending ? () => undefined : () => setWriting(null)}
        title={objecting ? "CAS başvurusu (itiraz)" : "Savunma yaz"}
        snap="half"
        footer={
          <View style={styles.footer}>
            <Button label="Vazgeç" variant="ghost" onPress={() => setWriting(null)} disabled={mutation.isPending} style={styles.grow} />
            <Button
              label="Gönder"
              variant="primary"
              icon="send"
              onPress={() => mutation.mutate()}
              disabled={text.trim().length < MIN_TEXT || mutation.isPending}
              loading={mutation.isPending}
              style={styles.grow}
            />
          </View>
        }
      >
        <View style={styles.sheet}>
          <Text style={styles.meta} {...textScale.long}>
            {writing?.headline}. {objecting ? "İtirazın üzerine kurulun vereceği karar nihaidir." : "Savunman doğrudan Merkez Disiplin Kurulu'na iletilir."} Yazdıkların herkese açık sayfada yayımlanmaz.
          </Text>
          <Input value={text} onChangeText={setText} placeholder={objecting ? "Karara neden itiraz ettiğini gerekçesiyle yaz…" : "Olayı kendi tarafından anlat…"} multiline hint={`En az ${MIN_TEXT} karakter. Gönderildikten sonra düzenlenemez.`} />
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  sectionLabel: { ...type.nano, color: colors.textTertiary },
  card: { gap: space.md, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface1, borderWidth: hairline, borderColor: colors.border, alignItems: "flex-start" },
  top: { flexDirection: "row", alignItems: "flex-start", gap: space.md, alignSelf: "stretch" },
  texts: { flex: 1, minWidth: 0, gap: space.xxs },
  title: { ...type.h4, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textTertiary },
  block: { alignSelf: "stretch", gap: space.xs, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  blockHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  blockLabel: { ...type.nano, color: colors.textTertiary },
  blockText: { ...type.label, color: colors.textPrimary },
  footer: { flexDirection: "row", gap: space.md },
  grow: { flex: 1 },
  sheet: { gap: space.md },
});
