/**
 * ŞİKAYET ET — bir üyeyi, mesajı, sohbeti ya da aramayı yönetime bildirme.
 *
 * NEDEN VAR: App Store (Guideline 1.2) ve Google Play, üyelerin birbirine
 * yazıp arayabildiği her uygulamadan uygunsuz içeriği şikayet etme ve kötüye
 * kullanan üyeyi engelleme yolu ister. Bu sayfa şikayeti alır; "bu üyeyi de
 * engelle" anahtarıyla ikisi tek dokunuşta yapılır.
 *
 * NE GÖNDERİR: POST /api/chat/reports { reason, details?, user_id?,
 * conversation_id?, message_id?, call_id?, block? }. Neden listesi sunucuyla
 * aynı (lib/api/chat.ts REPORT_REASONS). Başarıda şikayet yönetim gelen
 * kutusuna kart olarak düşer; kullanıcıya yalnız "alındı" denir.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BottomSheet, Button, Input, ListRow, errorMessage, useToast } from "@/components/ui";
import { REPORT_REASONS, reportAbuse, type ReportReason } from "@/lib/api/chat";
import { queryKeys } from "@/lib/queryKeys";
import { colors, radius, space, textScale, type } from "@/theme";

export interface ReportTarget {
  /** Şikayet edilen üye (biliniyorsa). Engelleme anahtarı buna bağlı. */
  userId?: number | null;
  userName?: string | null;
  conversationId?: number | null;
  messageId?: number | null;
  callId?: number | null;
  /** Kısa bağlam: mesaj alıntısı, "sesli arama" gibi. */
  excerpt?: string | null;
}

export interface ReportSheetProps {
  target: ReportTarget | null;
  onClose: () => void;
  /** Şikayetle birlikte engelleme yapıldıysa çağrılır (ekran şeridini yeniler). */
  onBlocked?: () => void;
}

export function ReportSheet({ target, onClose, onBlocked }: ReportSheetProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [block, setBlock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visible = Boolean(target);
  const canBlock = Boolean(target?.userId);

  useEffect(() => {
    if (!visible) return;
    setReason(null);
    setDetails("");
    setBlock(false);
    setError(null);
  }, [visible]);

  const send = useMutation({
    mutationFn: () => {
      if (!target) throw new Error("Hedef yok.");
      return reportAbuse({
        reason: reason as ReportReason,
        details: details.trim() || undefined,
        user_id: target.userId ?? undefined,
        conversation_id: target.conversationId ?? undefined,
        message_id: target.messageId ?? undefined,
        call_id: target.callId ?? undefined,
        block: canBlock && block,
      });
    },
    onSuccess: (data) => {
      toast.show({ message: data.message ?? "Şikayetin alındı.", tone: "success" });
      if (data.blocked) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.chatBlocks() });
        void queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations() });
        if (target?.conversationId) void queryClient.invalidateQueries({ queryKey: queryKeys.chatMessages(target.conversationId) });
        onBlocked?.();
      }
      onClose();
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  const submit = () => {
    if (!reason) {
      setError("Önce bir neden seç.");
      return;
    }
    if (reason === "other" && !details.trim()) {
      setError("\"Diğer\" için kısa bir açıklama yaz.");
      return;
    }
    setError(null);
    send.mutate();
  };

  const title = target?.messageId ? "Mesajı şikayet et" : target?.callId ? "Aramayı şikayet et" : target?.userName ? `${target.userName} için şikayet` : "Şikayet et";

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      snap="full"
      footer={<Button label="Şikayeti gönder" onPress={submit} loading={send.isPending} variant="danger" fullWidth />}
    >
      <Text style={styles.hint} {...textScale.long}>
        Şikayetin ElitLig Yönetimi'ne iletilir ve gizli tutulur; karşı taraf kimin bildirdiğini görmez.
      </Text>
      {target?.excerpt ? (
        <View style={styles.excerpt}>
          <Text style={styles.excerptText} numberOfLines={3} {...textScale.long}>{target.excerpt}</Text>
        </View>
      ) : null}

      <View style={styles.group}>
        {REPORT_REASONS.map((option, index) => (
          <ListRow
            key={option.key}
            title={option.label}
            subtitle={option.hint}
            position={index === 0 ? "first" : index === REPORT_REASONS.length - 1 ? "last" : "middle"}
            leading={{ icon: reason === option.key ? "radio-button-on" : "radio-button-off", tone: reason === option.key ? "danger" : "neutral" }}
            highlighted={reason === option.key}
            onPress={() => { setReason(option.key); setError(null); }}
            haptic="selection"
          />
        ))}
      </View>

      <Input
        label={reason === "other" ? "Açıklama" : "Açıklama (isteğe bağlı)"}
        value={details}
        onChangeText={(value) => { setDetails(value); setError(null); }}
        placeholder="Ne oldu? Kısaca anlat."
        multiline
        maxLength={1000}
        editable={!send.isPending}
      />

      {canBlock ? (
        <View style={styles.group}>
          <ListRow
            title={target?.userName ? `${target.userName} adlı üyeyi de engelle` : "Bu üyeyi de engelle"}
            subtitle="Sana yazamaz ve seni arayamaz; istersen sonra kaldırabilirsin."
            position="single"
            leading={{ icon: "ban", tone: "danger" }}
            toggle={{ value: block, onValueChange: setBlock, disabled: send.isPending }}
          />
        </View>
      ) : null}

      {error ? <Text style={styles.error} accessibilityRole="alert" {...textScale.long}>{error}</Text> : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  hint: { ...type.bodySm, color: colors.textSecondary, marginBottom: space.md, lineHeight: 19 },
  excerpt: { backgroundColor: colors.surfaceRaised, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, marginBottom: space.md },
  excerptText: { ...type.bodySm, color: colors.textPrimary, fontStyle: "italic" },
  group: { marginTop: space.md, marginBottom: space.sm },
  error: { ...type.caption, color: colors.danger, marginTop: space.sm },
});
