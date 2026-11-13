/**
 * GİDEN TEKLİF KARTI — Transfer yönetimi ve Giden teklifler ekranlarının
 * ortak teklif anatomisi.
 *
 *   [avatar]  Oyuncu adı                         [durum hapı]
 *             Gönderildi 12 Kas · v2
 *   ───────── süreç adımları: Gönderildi → Görüldü → Karar ─────────
 *   [!] Mevcut takımın izni bekleniyor   ·   ⏱ 20 saat kaldı
 *
 * Sıradaki hamle takımdaysa (oyuncu revizyon istedi) kart brandDim zemin ve
 * imza şeritle vurgulanır. Süre baskısı (24 saatten az) kırmızıdır.
 * Kartın tamamı teklif belgesini açar (/teklif/[id]).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Avatar, Badge, Touchable, type Tone } from "@/components/ui";
import type { OutboxOffer } from "@/lib/api/transfers";
import { formatDateShort, mediaUrl } from "@/lib/format";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

export const OFFER_STATUS: Record<string, { label: string; tone: Tone; icon: React.ComponentProps<typeof Ionicons>["name"] }> = {
  DRAFT: { label: "Taslak", tone: "neutral", icon: "create-outline" },
  SENT: { label: "Cevap bekliyor", tone: "warn", icon: "hourglass-outline" },
  REVISION_REQUESTED: { label: "Revizyon istendi", tone: "info", icon: "git-compare-outline" },
  ACCEPTED: { label: "Kabul edildi", tone: "win", icon: "checkmark-circle" },
  REJECTED: { label: "Reddedildi", tone: "danger", icon: "close-circle" },
  WITHDRAWN: { label: "Geri çekildi", tone: "neutral", icon: "arrow-undo" },
  EXPIRED: { label: "Süresi doldu", tone: "neutral", icon: "time-outline" },
  CANCELLED: { label: "İptal edildi", tone: "neutral", icon: "ban-outline" },
};

const OPEN = new Set(["SENT", "REVISION_REQUESTED"]);

/** "20 saat kaldı" / "3 gün kaldı"; geçmişse null. */
function remaining(value?: string | null): { text: string; urgent: boolean } | null {
  if (!value) return null;
  const ms = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 24) return { text: hours <= 0 ? "1 saatten az kaldı" : `${hours} saat kaldı`, urgent: true };
  return { text: `${Math.floor(hours / 24)} gün kaldı`, urgent: false };
}

export const OfferCard = React.memo(function OfferCard({ offer, onPress }: { offer: OutboxOffer; onPress: (publicId: string) => void }) {
  const meta = OFFER_STATUS[offer.status] ?? { label: offer.status, tone: "neutral" as Tone, icon: "document-outline" as const };
  const open = OPEN.has(offer.status);
  const yourMove = offer.status === "REVISION_REQUESTED";
  const left = open ? remaining(offer.expires_at) : null;
  const decided = !open && offer.status !== "DRAFT";

  const notes: { icon: React.ComponentProps<typeof Ionicons>["name"]; text: string; color: string }[] = [];
  if (yourMove) notes.push({ icon: "arrow-redo", text: "Sıra sende: yeni sürüm hazırla", color: colors.brandAccent });
  if (offer.release_status === "PENDING") notes.push({ icon: "hand-left-outline", text: "Mevcut takımın izni bekleniyor", color: colors.warn });
  if (offer.release_status === "REJECTED") notes.push({ icon: "hand-left", text: "Mevcut takım izin vermedi", color: colors.danger });
  if (open && (offer.awaiting_admin_approval || (offer.requires_admin_approval && (offer.admin_status ?? "PENDING") === "PENDING")))
    notes.push({ icon: "shield-half-outline", text: "Yönetim onayında", color: colors.info });

  const decisionColor = meta.tone === "win" ? colors.win : meta.tone === "danger" ? colors.danger : colors.textTertiary;
  const steps = [
    { key: "sent", label: "Gönderildi", done: Boolean(offer.sent_at) },
    { key: "seen", label: "Görüldü", done: Boolean(offer.viewed_at) || decided },
    { key: "decision", label: decided ? meta.label : "Karar", done: decided },
  ];

  return (
    <Touchable
      onPress={() => onPress(offer.public_id)}
      feedback="card"
      accessibilityRole="button"
      accessibilityLabel={[offer.player?.player_name, meta.label, left?.text].filter(Boolean).join(", ")}
      style={[styles.card, yourMove && styles.cardMove, !open && styles.cardDone]}
    >
      {yourMove ? <LinearGradient colors={colors.gradientSignature} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.stripe} /> : null}
      <View style={styles.top}>
        <Avatar name={offer.player?.player_name ?? "?"} image={mediaUrl(offer.player?.player_img ?? null)} size={44} />
        <View style={styles.texts}>
          <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
            {offer.player?.player_name ?? "Oyuncu"}
          </Text>
          <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
            {[offer.sent_at ? `Gönderildi ${formatDateShort(offer.sent_at)}` : null, offer.version > 1 ? `${offer.version}. sürüm` : null].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <Badge label={meta.label} tone={meta.tone} icon={meta.icon} size="sm" />
      </View>

      <View style={styles.steps}>
        {steps.map((step, index) => (
          <React.Fragment key={step.key}>
            {index > 0 ? <View style={[styles.line, step.done && styles.lineDone]} /> : null}
            <View style={styles.step}>
              <View style={[styles.dot, step.done && styles.dotDone, index === 2 && decided && { backgroundColor: decisionColor, borderColor: decisionColor }]} />
              <Text style={[styles.stepLabel, step.done && styles.stepLabelDone]} numberOfLines={1} {...textScale.badge}>
                {step.label}
              </Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {notes.length || left ? (
        <View style={styles.footer}>
          {notes.map((note) => (
            <View key={note.text} style={styles.note}>
              <Ionicons name={note.icon} size={13} color={note.color} />
              <Text style={[styles.noteText, { color: note.color }]} numberOfLines={1} {...textScale.dense}>
                {note.text}
              </Text>
            </View>
          ))}
          {left ? (
            <View style={styles.note}>
              <Ionicons name="time-outline" size={13} color={left.urgent ? colors.danger : colors.textTertiary} />
              <Text style={[styles.noteText, { color: left.urgent ? colors.danger : colors.textTertiary }]} numberOfLines={1} {...textScale.dense}>
                {`Son gün ${formatDateShort(offer.expires_at)} · ${left.text}`}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Touchable>
  );
});

const styles = StyleSheet.create({
  card: {
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.glassLine,
    overflow: "hidden",
  },
  cardMove: { backgroundColor: colors.brandDim, borderColor: colors.brandBorder },
  cardDone: { borderColor: colors.border },
  stripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  top: { flexDirection: "row", alignItems: "center", gap: space.md },
  texts: { flex: 1, minWidth: 0, gap: space.xxs },
  name: { ...type.h3, color: colors.textPrimary },
  meta: { ...type.caption, color: colors.textTertiary },
  steps: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: space.xs },
  step: { alignItems: "center", gap: space.xs, width: 84 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.surface3, borderWidth: hairline, borderColor: colors.borderStrong },
  dotDone: { backgroundColor: colors.brand, borderColor: colors.brand },
  line: { flex: 1, height: 2, marginTop: 4, marginHorizontal: -space.xl, backgroundColor: colors.surface3 },
  lineDone: { backgroundColor: colors.brand },
  stepLabel: { ...type.micro, color: colors.textTertiary, letterSpacing: 0 },
  stepLabelDone: { color: colors.textSecondary },
  footer: { gap: space.xs, paddingTop: space.sm, borderTopWidth: hairline, borderTopColor: colors.separator },
  note: { flexDirection: "row", alignItems: "center", gap: space.xs },
  noteText: { ...type.caption, flexShrink: 1 },
});
