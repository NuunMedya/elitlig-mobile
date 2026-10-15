/**
 * SERBEST KALMA İZNİ — oyuncunun mevcut takımının kararı.
 *
 * Başka bir takım, sezon kadrosuna bildirilmiş (ya da serbest kalma maddesi
 * olmayan aktif sözleşmeli) oyuncuna teklif verdiğinde oyuncu teklifi ancak
 * mevcut takımı ya da lig yönetimi izin verirse kabul edebilir
 * (services/transfer/releaseService.js). Bildirim (TRANSFER_RELEASE_REQUESTED)
 * buraya iner.
 *
 *   POST /api/transfer-offers/:id/release/approve
 *   POST /api/transfer-offers/:id/release/reject   { note }
 *
 * Teklif belgesi bu takıma açık değildir (teklif başka takımın); ekran bu
 * yüzden kararın ne anlama geldiğini anlatır, şartları göstermez.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";

import { AuthCard, AuthNotice, AuthShell } from "@/components/account/AuthShell";
import { Button, Input, useToast } from "@/components/ui";
import { decideRelease } from "@/lib/api/transfers";
import { ApiError } from "@/lib/http";
import { colors, textScale, type } from "@/theme";

export default function ReleaseDecisionScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const offerId = String(Array.isArray(params.id) ? params.id[0] : params.id ?? "");
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [done, setDone] = useState<"approve" | "reject" | null>(null);

  const decide = useMutation({
    mutationFn: (decision: "approve" | "reject") => decideRelease(offerId, decision, note.trim()),
    onSuccess: (data, decision) => {
      setDone(decision);
      toast.show({
        message: data?.message || (decision === "approve" ? "İzin verildi." : "İzin verilmedi."),
        tone: decision === "approve" ? "success" : "neutral",
      });
      void queryClient.invalidateQueries({ queryKey: ["panel", "notifications"] });
    },
  });

  const error = decide.error
    ? decide.error instanceof ApiError
      ? decide.error.status === 409
        ? "Bu teklif için karar zaten verilmiş ya da teklif artık geçerli değil."
        : decide.error.userMessage
      : "Karar kaydedilemedi."
    : null;

  return (
    <AuthShell
      title="Transfer izni"
      overline="Takımım"
      heading="Transfer izni bekleniyor"
      lede="Başka bir takım, sezon kadronda bildirdiğin bir oyuncuna teklif verdi. Oyuncu teklifi ancak senin ya da lig yönetiminin izniyle kabul edebilir."
      icon="lock-open-outline"
      back
    >
      {done ? (
        <AuthNotice
          tone={done === "approve" ? "success" : "danger"}
          message={
            done === "approve"
              ? "İzin verdin. Oyuncu artık teklifi kabul edip etmemeye kendisi karar verebilir."
              : "İzin vermedin. Teklif sahibi takım ve oyuncu bilgilendirildi."
          }
        />
      ) : (
        <>
          <AuthCard title="Ne anlama geliyor?">
            <Text style={styles.text} {...textScale.long}>
              İzin verirsen oyuncu teklifi kabul ettiğinde takımından ayrılır. İzin vermezsen teklif bu hâliyle kabul edilemez;
              lig yönetimi yine de ayrıca karar verebilir.
            </Text>
          </AuthCard>
          <AuthCard title="Not (isteğe bağlı)">
            <Input
              value={note}
              onChangeText={setNote}
              placeholder="Örn. Sezon sonuna kadar kadromuzda kalmalı"
              multiline
              maxLength={500}
            />
          </AuthCard>
          {error ? <AuthNotice message={error} /> : null}
          <Button
            label="İzin ver"
            icon="checkmark"
            onPress={() => decide.mutate("approve")}
            loading={decide.isPending && decide.variables === "approve"}
            disabled={decide.isPending || !offerId}
            size="lg"
            fullWidth
          />
          <Button
            label="İzin verme"
            variant="danger"
            onPress={() => decide.mutate("reject")}
            loading={decide.isPending && decide.variables === "reject"}
            disabled={decide.isPending || !offerId}
            size="lg"
            fullWidth
          />
        </>
      )}
      {done ? <Button label="Kulübüme dön" variant="secondary" onPress={() => router.replace("/(tabs)/kulubum")} fullWidth /> : null}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  text: { ...type.body, color: colors.textSecondary },
});
