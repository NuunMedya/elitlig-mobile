/**
 * Bekleyen değişiklik talebi kartı — onaylı profil formlarının tepesinde.
 * Aynı türde tek bekleyen talep olabildiği için form bu sırada kilitlidir;
 * "Talebi geri çek" talebi siler ve form yeniden açılır.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button, useToast } from "@/components/ui";
import { cancelChangeRequest } from "@/lib/api/profile";
import { formatDateShort } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

export function PendingChangeNotice({
  changeId,
  createdAt,
  subject,
}: {
  changeId: number;
  createdAt?: string | null;
  subject: string;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const cancel = useMutation({
    mutationFn: () => cancelChangeRequest(changeId),
    onSuccess: (data) => {
      toast.show({ message: data.message || "Talebin geri çekildi.", tone: "success" });
      void queryClient.invalidateQueries({ queryKey: ["panel", "me"] });
    },
    onError: (error) =>
      toast.show({
        message: error instanceof ApiError ? error.userMessage : "Talep geri çekilemedi.",
        tone: "danger",
      }),
  });

  return (
    <View style={styles.card} accessibilityRole="alert">
      <Text style={styles.title} {...textScale.dense}>
        {subject} yönetim onayında
      </Text>
      <Text style={styles.body} {...textScale.long}>
        {createdAt ? `${formatDateShort(createdAt)} tarihinde gönderildi. ` : ""}
        Onaylanana kadar yeni değişiklik gönderemezsin; yanlış gönderdiysen talebi geri çekip yeniden düzenle.
      </Text>
      <Button
        label="Talebi geri çek"
        variant="secondary"
        size="sm"
        icon="arrow-undo-outline"
        onPress={() => cancel.mutate()}
        loading={cancel.isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.s,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.warn,
    backgroundColor: colors.warnDim,
  },
  title: { ...type.label, color: colors.textPrimary },
  body: { ...type.caption, color: colors.textSecondary },
});
