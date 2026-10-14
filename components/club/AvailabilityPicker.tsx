/**
 * "GELİYOR MUSUN?" — oyuncunun sıradaki maç için tek dokunuşluk yoklama yanıtı.
 *
 * NEDEN BURADA DA VAR: yoklama yanıtı yalnız Oyuncu Paneli → Maçlarım
 * sekmesinde veriliyordu (üç dokunuş derinlikte). Başkanın en büyük derdi
 * "yanıtsız" oyuncudur; yanıtı Yönetim sekmesinin ilk ekranına taşımak o sayıyı
 * doğrudan düşürür.
 *
 * ÖNBELLEK: `["takim","availability-mine",matchId]` — `app/oyuncum/index.tsx`
 * ile BİREBİR aynı anahtar ve aynı iyimser güncelleme; iki yerde verilen yanıt
 * birbirini anında görür.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Chip, useToast, type Tone } from "@/components/ui";
import {
  getMyAvailability,
  setMyAvailability,
  type AvailabilityStatus,
} from "@/lib/api/team";
import { ApiError } from "@/lib/http";
import { colors, space, textScale, type } from "@/theme";

/* Kısa etiketler: üç seçenek tek satıra eşit genişlikte sığmalı ("Gelemiyorum"
   360px'lik telefonda kırpılıyordu). */
const OPTIONS: { status: AvailabilityStatus; tone: Tone; short: string }[] = [
  { status: "coming", tone: "win", short: "Geliyorum" },
  { status: "maybe", tone: "warn", short: "Belki" },
  { status: "not_coming", tone: "danger", short: "Gelemem" },
];

export const availabilityMineKey = (matchId: number) => ["takim", "availability-mine", matchId] as const;

export function AvailabilityPicker({ matchId }: { matchId: number }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const queryKey = availabilityMineKey(matchId);

  const query = useQuery({
    queryKey,
    queryFn: () => getMyAvailability(matchId),
    staleTime: 60_000,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (status: AvailabilityStatus) => setMyAvailability(matchId, status),
    // İyimser: seçim anında boyanır, hata olursa geri alınır.
    onMutate: async (status) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<{ status: AvailabilityStatus | null }>(queryKey);
      queryClient.setQueryData(queryKey, { status });
      return { previous };
    },
    onError: (error, _status, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.show({
        message: error instanceof ApiError ? error.userMessage : "Yanıt kaydedilemedi.",
        tone: "danger",
      });
    },
    onSuccess: () => toast.show({ message: "Yanıtın takımına iletildi.", tone: "success" }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const current = query.data?.status ?? null;

  const choose = useCallback(
    (status: AvailabilityStatus) => {
      if (current === status || mutation.isPending) return;
      mutation.mutate(status);
    },
    [current, mutation],
  );

  return (
    <View style={styles.wrap}>
      <Text style={[styles.prompt, current ? null : styles.promptOpen]} {...textScale.dense}>
        {current ? "Yanıtın kaydedildi — değiştirebilirsin." : "Geliyor musun? Başkanın kadroyu buna göre kuracak."}
      </Text>
      <View style={styles.options}>
        {OPTIONS.map((option) => (
          <Chip
            key={option.status}
            label={option.short}
            selected={current === option.status}
            tone={option.tone}
            disabled={mutation.isPending || query.isLoading}
            onPress={() => choose(option.status)}
            style={styles.chip}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.sm,
  },
  prompt: {
    ...type.bodySm,
    color: colors.textTertiary,
  },
  promptOpen: {
    color: colors.textSecondary,
  },
  options: {
    flexDirection: "row",
    gap: space.s,
  },
  chip: {
    flex: 1,
    justifyContent: "center",
  },
});
