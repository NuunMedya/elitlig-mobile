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
 * yüzden kararın ne anlama geldiğini anlatır, şartları göstermez. Kimin kimi
 * istediği bildirimin metninden okunur (takım + oyuncu adı orada yazar).
 *
 * KARAR SONRASI: sunucu izin BİLDİRİMİNİ okundu yapmaz; Kulübüm'deki "izin
 * isteniyor" işi ve Transfer masasındaki liste okunmamış bildirimden
 * türediği için karar verilmiş talep sonsuza dek "bekliyor" görünüyordu.
 * Karar (ya da "zaten karar verilmiş" 409'u) gelince bu teklifin izin
 * bildirimleri okundu işaretlenir ve ilgili önbellekler tazelenir.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Alert, StyleSheet, Text, View } from "react-native";

import { AuthCard, AuthNotice, AuthShell } from "@/components/account/AuthShell";
import { StageCard } from "@/components/league/kit";
import {
  Button,
  IconTile,
  Input,
  Reveal,
  Touchable,
  toneColors,
  useToast,
  type IconTileTone,
  type Tone,
} from "@/components/ui";
import { isReleaseRequest } from "@/lib/api/club/notifications";
import { getPanelNotifications, markNotifRead } from "@/lib/api/panel";
import { decideRelease } from "@/lib/api/transfers";
import { queryKeys } from "@/lib/queryKeys";
import { ApiError } from "@/lib/http";
import { colors, hairline, radius, space, textScale, type, upperTR } from "@/theme";

export default function ReleaseDecisionScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const offerId = String(Array.isArray(params.id) ? params.id[0] : params.id ?? "");
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [done, setDone] = useState<"approve" | "reject" | null>(null);
  const [choice, setChoice] = useState<"approve" | "reject" | null>(null);

  /* Kulübüm ve Transfer masasıyla ORTAK anahtar — ikinci istek atılmaz. */
  const notifications = useQuery({
    queryKey: ["club", "notifications"],
    queryFn: () => getPanelNotifications(1),
    staleTime: 30_000,
    retry: false,
  });
  const related = useMemo(
    () => (notifications.data?.items ?? []).filter((item) => isReleaseRequest(item) && item.entity_public_id === offerId),
    [notifications.data, offerId],
  );
  const summary = related[0]?.description ?? null;

  /** Bu teklifin izin bildirimlerini kapat, işi gösteren her listeyi tazele. */
  const settle = useCallback(async () => {
    await Promise.all(related.filter((item) => !item.is_read).map((item) => markNotifRead(item.id).catch(() => undefined)));
    void queryClient.invalidateQueries({ queryKey: ["club", "notifications"] });
    void queryClient.invalidateQueries({ queryKey: ["panel", "notifications"] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.unreadNotifCount() });
  }, [queryClient, related]);

  const decide = useMutation({
    mutationFn: (decision: "approve" | "reject") => decideRelease(offerId, decision, note.trim()),
    onSuccess: (data, decision) => {
      setDone(decision);
      toast.show({
        message: data?.message || (decision === "approve" ? "İzin verildi." : "İzin verilmedi."),
        tone: decision === "approve" ? "success" : "neutral",
      });
      void settle();
    },
    onError: (error) => {
      // Karar başka yerden (lig yönetimi, diğer yönetici) verilmiş: iş kapanmıştır.
      if (error instanceof ApiError && error.status === 409) void settle();
    },
  });

  const confirm = (decision: "approve" | "reject") =>
    Alert.alert(
      decision === "approve" ? "Transfere izin ver" : "Transfere izin verme",
      decision === "approve"
        ? "Oyuncu teklifi kabul ederse takımından ayrılır. Bu karar geri alınamaz."
        : "Teklif kapanır; teklifi veren takım ve oyuncu bilgilendirilir. Bu karar geri alınamaz.",
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: decision === "approve" ? "İzin ver" : "İzin verme",
          style: decision === "approve" ? "default" : "destructive",
          onPress: () => decide.mutate(decision),
        },
      ],
    );

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
      variant="form"
      overline="Takımım"
      heading="Serbest kalma kararı"
      icon="lock-open-outline"
      back
    >
      {/* 1) SAHNE — talebin kendisi ve durumu. */}
      <Reveal>
        <StageCard style={styles.hero}>
          <View style={styles.heroTop}>
            <IconTile
              icon={done === "approve" ? "lock-open" : done === "reject" ? "lock-closed" : "swap-horizontal"}
              tone={done === "approve" ? "mint" : done === "reject" ? "red" : "gold"}
              size={44}
            />
            <View style={styles.heroText}>
              <Text style={styles.heroOver} {...textScale.badge}>
                {upperTR("Serbest kalma izni")}
              </Text>
              <Text style={styles.heroTitle} {...textScale.dense}>
                {done === "approve" ? "İzin verdin" : done === "reject" ? "İzin vermedin" : "Kararını bekliyor"}
              </Text>
            </View>
          </View>
          <Text style={styles.heroBody} {...textScale.long}>
            {summary ??
              "Başka bir takım, sezon kadronda bildirdiğin bir oyuncuna teklif verdi. Oyuncu teklifi ancak senin ya da lig yönetiminin izniyle kabul edebilir."}
          </Text>

          {/* Akış: teklif → senin iznin → oyuncunun kararı. */}
          <View style={styles.flow}>
            {FLOW.map((step, index) => {
              const state = index === 0 ? "done" : index === 1 ? (done ? "done" : "active") : done === "approve" ? "active" : "idle";
              return (
                <View key={step} style={styles.flowStep}>
                  <View style={styles.flowNodeRow}>
                    {index > 0 ? <View style={[styles.flowLine, state !== "idle" ? styles.flowLineOn : null]} /> : <View style={styles.flowSpacer} />}
                    <View
                      style={[
                        styles.flowNode,
                        state === "done" ? styles.flowNodeDone : state === "active" ? styles.flowNodeActive : null,
                      ]}
                    >
                      {state === "done" ? (
                        <Ionicons name="checkmark" size={12} color={colors.textOnBrand} />
                      ) : (
                        <Text style={styles.flowNum} {...textScale.badge}>
                          {index + 1}
                        </Text>
                      )}
                    </View>
                    {index < FLOW.length - 1 ? (
                      <View style={[styles.flowLine, state === "done" ? styles.flowLineOn : null]} />
                    ) : (
                      <View style={styles.flowSpacer} />
                    )}
                  </View>
                  <Text style={[styles.flowLabel, state === "idle" ? styles.flowLabelIdle : null]} numberOfLines={2} {...textScale.dense}>
                    {step}
                  </Text>
                </View>
              );
            })}
          </View>
        </StageCard>
      </Reveal>

      {done ? (
        <Reveal index={1} style={styles.stack}>
          <AuthNotice
            tone={done === "approve" ? "success" : "danger"}
            message={
              done === "approve"
                ? "İzin verdin. Oyuncu artık teklifi kabul edip etmemeye kendisi karar verebilir."
                : "İzin vermedin. Teklif sahibi takım ve oyuncu bilgilendirildi."
            }
          />
          <Button label="Kulübüme dön" variant="secondary" icon="arrow-back" onPress={() => router.replace("/(tabs)/kulubum")} size="lg" fullWidth />
        </Reveal>
      ) : (
        <>
          {/* 2) SEÇENEKLER — iki kararın sonucu yan yana; seçilen kart vurgulanır. */}
          <Reveal index={1}>
            <Text style={styles.overline} {...textScale.badge}>
              {upperTR("Kararın")}
            </Text>
            <View style={styles.options}>
              {OPTIONS.map((option) => {
                const selected = choice === option.key;
                const tone = toneColors(option.tone);
                return (
                  <Touchable
                    key={option.key}
                    feedback="card"
                    haptic="selection"
                    onPress={() => setChoice(option.key)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${option.title}. ${option.body}`}
                    style={[styles.option, selected ? { borderColor: tone.fg, backgroundColor: tone.dim } : null]}
                  >
                    <View style={styles.optionHead}>
                      <IconTile icon={option.icon} tone={option.tile} size={32} glow={selected} />
                      <View style={[styles.radio, selected ? { borderColor: tone.fg } : null]}>
                        {selected ? <View style={[styles.radioDot, { backgroundColor: tone.fg }]} /> : null}
                      </View>
                    </View>
                    <Text style={styles.optionTitle} {...textScale.dense}>
                      {option.title}
                    </Text>
                    <Text style={styles.optionBody} {...textScale.long}>
                      {option.body}
                    </Text>
                  </Touchable>
                );
              })}
            </View>
          </Reveal>

          {/* 3) NOT */}
          <Reveal index={2}>
            <AuthCard title="Not (isteğe bağlı)">
              <Input
                value={note}
                onChangeText={setNote}
                placeholder="Örn. Sezon sonuna kadar kadromuzda kalmalı"
                multiline
                maxLength={500}
              />
              <Text style={styles.counter} {...textScale.dense}>
                {note.length}/500
              </Text>
            </AuthCard>
          </Reveal>

          {error ? <AuthNotice message={error} /> : null}

          <View style={styles.warnRow}>
            <Ionicons name="alert-circle-outline" size={14} color={colors.warn} />
            <Text style={styles.warnText} {...textScale.long}>
              Karar geri alınamaz. Lig yönetimi yine de ayrıca karar verebilir.
            </Text>
          </View>

          <Button
            label={choice === "approve" ? "İzin ver" : choice === "reject" ? "İzin verme" : "Bir karar seç"}
            icon={choice === "approve" ? "checkmark" : choice === "reject" ? "close" : undefined}
            variant={choice === "reject" ? "danger" : "primary"}
            onPress={() => (choice ? confirm(choice) : undefined)}
            loading={decide.isPending}
            disabled={decide.isPending || !offerId || !choice}
            size="lg"
            fullWidth
          />
        </>
      )}
    </AuthShell>
  );
}

/** Kararın üç durağı. */
const FLOW = ["Teklif geldi", "Senin iznin", "Oyuncunun kararı"] as const;

/** İki seçenek — sonuçlarıyla birlikte. */
const OPTIONS: {
  key: "approve" | "reject";
  title: string;
  body: string;
  icon: keyof typeof Ionicons.glyphMap;
  tile: IconTileTone;
  tone: Tone;
}[] = [
  {
    key: "approve",
    title: "İzin ver",
    body: "Oyuncu teklifi kabul ederse takımından ayrılır.",
    icon: "lock-open",
    tile: "mint",
    tone: "win",
  },
  {
    key: "reject",
    title: "İzin verme",
    body: "Teklif kapanır; teklifi veren takım ve oyuncu bilgilendirilir.",
    icon: "lock-closed",
    tile: "red",
    tone: "danger",
  },
];

const styles = StyleSheet.create({
  stack: { gap: space.md },
  hero: { padding: space.lg, gap: space.md },
  heroTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  heroText: { flex: 1, minWidth: 0, gap: space.xxs },
  heroOver: { ...type.overline, color: colors.brandOnDark },
  heroTitle: { ...type.h1, color: colors.onDark },
  heroBody: { ...type.bodySm, color: colors.onDarkMuted },

  flow: {
    flexDirection: "row",
    paddingTop: space.md,
    borderTopWidth: hairline,
    borderTopColor: colors.borderOnDark,
  },
  flowStep: { flex: 1, alignItems: "center", gap: space.s },
  flowNodeRow: { flexDirection: "row", alignItems: "center", alignSelf: "stretch" },
  flowSpacer: { flex: 1 },
  flowLine: { flex: 1, height: 2, backgroundColor: colors.inkTileBorder },
  flowLineOn: { backgroundColor: colors.brandOnDark },
  flowNode: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  flowNodeDone: { backgroundColor: colors.brand, borderColor: colors.brand },
  flowNodeActive: { borderColor: colors.brandOnDark, borderWidth: 2 },
  flowNum: { ...type.micro, color: colors.onDark },
  flowLabel: { ...type.labelXs, color: colors.onDark, textAlign: "center" },
  flowLabelIdle: { color: colors.onDarkMuted },

  overline: { ...type.overline, color: colors.textTertiary, marginBottom: space.sm, paddingHorizontal: space.xxs },
  options: { flexDirection: "row", gap: space.sm },
  option: {
    flex: 1,
    gap: space.s,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  optionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.xs },
  radio: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: { width: 10, height: 10, borderRadius: radius.pill },
  optionTitle: { ...type.h3, color: colors.textPrimary },
  optionBody: { ...type.bodySm, color: colors.textSecondary },
  counter: { ...type.caption, color: colors.textTertiary, textAlign: "right", marginTop: space.xs },
  warnRow: { flexDirection: "row", alignItems: "flex-start", gap: space.s, paddingHorizontal: space.xxs },
  warnText: { ...type.caption, color: colors.textSecondary, flex: 1 },
});
