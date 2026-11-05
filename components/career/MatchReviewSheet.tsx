/**
 * MAÇ DEĞERLENDİRMESİ — oyuncunun oynadığı maçı puanlaması.
 *
 * NE: web Maçlarım ekranındaki "Değerlendir" (MatchCenter ReviewSheet,
 * oyuncu kapsamı). Mobilde yalnız takım başkanının maç merkezinde vardı;
 * oyuncu oynadığı maçı hiç puanlayamıyordu. Sunucu kuralı: yalnız kadrodaki
 * oyuncu (`can_review`) değerlendirebilir, altı alanın hepsi 1–10 zorunlu.
 *
 * Mevcut değerlendirme varsa `my-review` ile ön doldurulur; kaydetmek onu
 * günceller (sunucu maç + değerlendiren başına tek kayıt tutar).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { Badge, BottomSheet, Button, Input, Skeleton, Stepper, useToast } from "@/components/ui";
import {
  REVIEW_FIELDS,
  getMyReview,
  memberKeys,
  saveMyReview,
  type ReviewKey,
  type ReviewScores,
} from "@/lib/api/member/player";
import { ApiError } from "@/lib/http";
import { colors, hairline, space, textScale, type, upperTR } from "@/theme";

/** Puanlanmamış alan 0 tutulur: varsayılan 5 vermek "puanladım" yanılgısı yaratırdı. */
const EMPTY: ReviewScores = {
  announcer_score: 0,
  director_score: 0,
  referee_score: 0,
  photographer_score: 0,
  medic_score: 0,
  opponent_score: 0,
};

export function MatchReviewSheet({
  matchId,
  title,
  subtitle,
  onClose,
}: {
  matchId: number;
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [scores, setScores] = useState<ReviewScores>(EMPTY);
  const [comment, setComment] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  const [missing, setMissing] = useState(false);

  const review = useQuery({
    queryKey: memberKeys.review(matchId),
    queryFn: () => getMyReview(matchId),
    staleTime: 30_000,
    retry: false,
  });

  /* Kayıtlı değerlendirme geldiğinde BİR KEZ ön doldurulur. */
  useEffect(() => {
    if (prefilled || review.isLoading) return;
    const saved = review.data?.review;
    if (saved) {
      const next = { ...EMPTY };
      REVIEW_FIELDS.forEach(({ key }) => {
        const value = Number(saved[key]);
        if (Number.isFinite(value) && value > 0) next[key] = value;
      });
      setScores(next);
      setComment(saved.comment ?? "");
    }
    setPrefilled(true);
  }, [prefilled, review.data, review.isLoading]);

  const mutation = useMutation({
    mutationFn: () => saveMyReview(matchId, scores, comment.trim()),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: memberKeys.review(matchId) });
      toast.show({ message: result.message || "Değerlendirmen kaydedildi.", tone: "success" });
      onClose();
    },
    onError: (error: unknown) =>
      toast.show({
        message: error instanceof ApiError ? error.userMessage : "Değerlendirme kaydedilemedi.",
        tone: "danger",
      }),
  });

  const setScore = useCallback((key: ReviewKey, value: number) => {
    setMissing(false);
    setScores((prev) => ({ ...prev, [key]: value }));
  }, []);

  const submit = useCallback(() => {
    if (REVIEW_FIELDS.some(({ key }) => !scores[key])) {
      setMissing(true);
      return;
    }
    mutation.mutate();
  }, [mutation, scores]);

  const existing = Boolean(review.data?.review);
  const loading = review.isLoading && !prefilled;

  return (
    <BottomSheet
      visible
      onClose={onClose}
      title="Maçı değerlendir"
      snap="full"
      footer={
        <Button
          label={existing ? "Değerlendirmeyi güncelle" : "Değerlendirmeyi kaydet"}
          icon="checkmark"
          onPress={submit}
          loading={mutation.isPending}
          disabled={loading || mutation.isPending}
          haptic="success"
          fullWidth
        />
      }
    >
      <View style={styles.body}>
        <View style={styles.head}>
          <View style={styles.flex}>
            <Text style={styles.title} numberOfLines={1} {...textScale.dense}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {existing ? <Badge label="KAYITLI" tone="win" size="xs" /> : null}
        </View>

        <Text style={styles.note} {...textScale.long}>
          Maçın organizasyonunu puanla: yayın ekibi, hakem ve rakip. Puanlar ligin hizmet kalitesini
          ölçmek için kullanılır; adın rakibe gösterilmez.
        </Text>

        {loading ? (
          <View style={styles.loading}>
            <Skeleton width="100%" height={36} radius="md" />
            <Skeleton width="100%" height={36} radius="md" />
            <Skeleton width="100%" height={36} radius="md" />
          </View>
        ) : (
          <View style={styles.rows}>
            {REVIEW_FIELDS.map((field, index) => (
              <View key={field.key} style={[styles.row, index > 0 && styles.rowDivider]}>
                <Ionicons
                  name={field.icon}
                  size={15}
                  color={missing && !scores[field.key] ? colors.danger : colors.textTertiary}
                />
                <Text style={styles.label} numberOfLines={1} {...textScale.dense}>
                  {field.label}
                </Text>
                <Stepper
                  value={scores[field.key]}
                  onChange={(next) => setScore(field.key, next)}
                  min={1}
                  max={10}
                  size="sm"
                  accessibilityLabel={`${field.label} puanı`}
                />
              </View>
            ))}
          </View>
        )}

        {missing ? (
          <Text style={styles.error} {...textScale.dense}>
            Her alana 1–10 arasında bir puan ver; boş alan kalırsa sunucu değerlendirmeyi kabul etmez.
          </Text>
        ) : null}

        <Text style={styles.fieldLabel} {...textScale.badge}>
          {upperTR("Genel yorum (isteğe bağlı)")}
        </Text>
        <Input value={comment} onChangeText={setComment} placeholder="Maç hakkında not" multiline maxLength={1000} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  flex: { flex: 1, minWidth: 0 },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  title: { ...type.h3, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textTertiary, marginTop: space.xxs },
  note: { ...type.bodySm, color: colors.textSecondary },
  loading: { gap: space.sm },
  rows: {},
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm },
  rowDivider: { borderTopWidth: hairline, borderTopColor: colors.border },
  label: { ...type.label, color: colors.textPrimary, flex: 1 },
  error: { ...type.caption, color: colors.danger },
  fieldLabel: { ...type.micro, color: colors.textTertiary },
});
