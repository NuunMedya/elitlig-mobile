/**
 * OLAY GİRİŞİ — reji panelindeki "oyuncu + olay" seçiminin mobil karşılığı.
 *
 * Taraf → olay kodu → oyuncu (değişiklikte çıkan + giren) → dakika / devre.
 * Dakika maç saatinden önerilir, elle değiştirilebilir. Aynı sayfa mevcut bir
 * olayı düzenlemek için de açılır (PUT /api/maclar/:id/olaylar/:olayId).
 *
 * SAHA KENARI İÇİN: oyuncu açılır listeden değil, forma numarası büyük yazılı
 * KAROLARDAN seçilir (48px+ dokunma hedefi, sahadakiler önce). Canlı akıştaki
 * hızlı düğmeler sayfayı olay kodu seçili açar; gol üç dokunuşta girilir
 * (Gol → oyuncu → Kaydet).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { SegmentField } from "@/components/admin";
import { BottomSheet, Button, Chip, ChipGroup, Input, Stepper, Touchable } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { EVENT_GROUPS, type EventBody, type MatchEvent } from "@/lib/api/admin/matches";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import type { Side, SquadPlayer } from "./model";
import { SidePicker } from "./parts";

export interface EventDraft {
  side: Side;
  code: string;
  playerId: string | null;
  inPlayerId: string | null;
  minute: number;
  period: number;
  note: string;
}

export function EventSheet({
  visible,
  onClose,
  initial,
  editing,
  homeName,
  awayName,
  squads,
  onPitch,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  initial: EventDraft;
  /** Düzenlenen olay (yoksa yeni olay). */
  editing?: MatchEvent | null;
  homeName: string;
  awayName: string;
  squads: Record<Side, SquadPlayer[]>;
  /** Sahadaki oyuncu kimlikleri (değişiklik adayları için). */
  onPitch: Record<Side, Set<string>>;
  onSubmit: (draft: EventDraft) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState<EventDraft>(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) setDraft(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const squad = squads[draft.side] ?? [];
  const sub = draft.code === "SUBSTITUTION";

  /** Çıkan / olayın oyuncusu: değişiklikte sahadakiler önce. */
  const playerList = useMemo(() => {
    const pitch = onPitch[draft.side];
    return [...squad.filter((p) => pitch.has(p.id)), ...squad.filter((p) => !pitch.has(p.id))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [squad, onPitch, draft.side]);

  /** Giren oyuncu: henüz oyuna girmemiş yedekler önce, sahadakiler hiç. */
  const inList = useMemo(() => {
    const pitch = onPitch[draft.side];
    const free = squad.filter((p) => p.id !== draft.playerId && !pitch.has(p.id));
    return [...free.filter((p) => p.role === "bench"), ...free.filter((p) => p.role !== "bench")];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [squad, onPitch, draft.side, draft.playerId]);

  const ready = Boolean(draft.code) && Boolean(draft.playerId) && (!sub || Boolean(draft.inPlayerId && draft.inPlayerId !== draft.playerId));

  const codeLabel = EVENT_GROUPS.flatMap((g) => g.items).find((i) => i.code === draft.code)?.label ?? null;
  const playerName = (id: string | null) => {
    if (!id) return null;
    const p = squad.find((x) => x.id === id);
    return p ? `${p.number ? `#${p.number} ` : ""}${p.name}` : null;
  };
  const receipt = [`${draft.minute}. dakika`, codeLabel, playerName(draft.playerId)].filter(Boolean).join(", ");

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      await onSubmit(draft);
      onClose();
    } catch (error) {
      Alert.alert("Olay kaydedilemedi", errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={busy ? () => undefined : onClose}
      title={editing ? "Olayı düzenle" : "Olay ekle"}
      snap="full"
      footer={<Button label={editing ? "Olayı güncelle" : "Olayı kaydet"} icon="checkmark" onPress={submit} loading={busy} disabled={!ready} fullWidth haptic="success" />}
    >
      <View style={styles.stack}>
        {/* Canlı makbuz: kaydedilecek olayın tek satırlık özeti. */}
        <View style={styles.receipt} accessible accessibilityLabel={`Özet: ${receipt}`}>
          <View style={styles.receiptMinute}>
            <Text style={styles.receiptMinuteText} {...textScale.badge}>
              {draft.minute}'
            </Text>
            <Text style={styles.receiptPeriod} {...textScale.badge}>
              {draft.period === 1 ? "1Y" : draft.period === 2 ? "2Y" : "UZ"}
            </Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.receiptTitle} numberOfLines={1} {...textScale.dense}>
              {codeLabel ?? "Olay seç"}
            </Text>
            <Text style={styles.receiptMeta} numberOfLines={1} {...textScale.dense}>
              {[draft.side === "home" ? homeName : awayName, playerName(draft.playerId), sub && draft.inPlayerId ? `↑ ${playerName(draft.inPlayerId)}` : null]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
          <Ionicons name={ready ? "checkmark-circle" : "ellipse-outline"} size={22} color={ready ? colors.win : colors.textTertiary} />
        </View>

        <Section index={1} title="Taraf" done>
          <SidePicker
            value={draft.side}
            onChange={(side) => setDraft((d) => ({ ...d, side, playerId: null, inPlayerId: null }))}
            homeName={homeName}
            awayName={awayName}
          />
        </Section>

        <Section index={2} title="Olay" done={Boolean(draft.code)}>
          {EVENT_GROUPS.map((group) => (
            <View key={group.key} style={styles.group}>
              <Text style={styles.groupTitle} {...textScale.dense}>
                {group.title.toLocaleUpperCase("tr-TR")}
              </Text>
              <ChipGroup scrollable={false} contentPadding={0}>
                {group.items.map((item) => (
                  <Chip
                    key={item.code}
                    label={item.label}
                    size="sm"
                    tone={group.key === "goals" ? "win" : group.key === "discipline" ? "warn" : "info"}
                    selected={draft.code === item.code}
                    onPress={() => setDraft((d) => ({ ...d, code: item.code, inPlayerId: item.code === "SUBSTITUTION" ? d.inPlayerId : null }))}
                  />
                ))}
              </ChipGroup>
            </View>
          ))}
        </Section>

        <Section index={3} title={sub ? "Oyuncular" : "Oyuncu"} done={Boolean(draft.playerId) && (!sub || Boolean(draft.inPlayerId))}>
          {squad.length === 0 ? (
            <Text style={styles.warn} {...textScale.long}>
              Bu takımın maç kadrosu boş. Olay girmek için önce Kadro adımında oyuncuları seç.
            </Text>
          ) : null}
          <PlayerGrid
            label={sub ? "Oyundan çıkan" : "Oyuncu"}
            players={playerList}
            value={draft.playerId}
            pitch={onPitch[draft.side]}
            onChange={(v) => setDraft((d) => ({ ...d, playerId: v, inPlayerId: d.inPlayerId === v ? null : d.inPlayerId }))}
          />
          {sub ? (
            <PlayerGrid
              label="Oyuna giren"
              players={inList}
              value={draft.inPlayerId}
              pitch={onPitch[draft.side]}
              emptyText="Oyuna girebilecek yedek kalmadı."
              onChange={(v) => setDraft((d) => ({ ...d, inPlayerId: v }))}
            />
          ) : null}
        </Section>

        <Section index={4} title="Zaman ve not" done>
          <View style={styles.inline}>
            <View>
              <Text style={styles.label} {...textScale.dense}>
                Dakika
              </Text>
              <Text style={styles.minuteBig} {...textScale.badge}>
                {draft.minute}'
              </Text>
            </View>
            <Stepper value={draft.minute} onChange={(minute) => setDraft((d) => ({ ...d, minute }))} min={0} max={130} repeatOnHold accessibilityLabel="Dakika" />
          </View>
          <SegmentField<string>
            label="Devre"
            value={String(draft.period)}
            onChange={(v) => setDraft((d) => ({ ...d, period: Number(v) }))}
            options={[
              { key: "1", label: "1. yarı" },
              { key: "2", label: "2. yarı" },
              { key: "3", label: "Uzatma" },
            ]}
          />
          <Input label="Not (isteğe bağlı)" floating value={draft.note} onChangeText={(note) => setDraft((d) => ({ ...d, note }))} maxLength={255} placeholder="Kısa açıklama" />
        </Section>
      </View>
    </BottomSheet>
  );
}

/** Numaralı form bölümü: sıra pulu (tamamsa yeşil onay) + versal başlık. */
function Section({ index, title, done, children }: { index: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={[styles.stepDot, done ? styles.stepDotDone : null]}>
          {done ? (
            <Ionicons name="checkmark" size={12} color={colors.textOnStatus} />
          ) : (
            <Text style={styles.stepNo} {...textScale.badge}>
              {index}
            </Text>
          )}
        </View>
        <Text style={styles.sectionTitle} accessibilityRole="header" {...textScale.dense}>
          {title.toLocaleUpperCase("tr-TR")}
        </Text>
      </View>
      {children}
    </View>
  );
}

/** Oyuncu karoları: forma numarası büyük, ad altında; iki sütun, 52px. */
function PlayerGrid({
  label,
  players,
  value,
  pitch,
  emptyText,
  onChange,
}: {
  label: string;
  players: SquadPlayer[];
  value: string | null;
  pitch: Set<string>;
  emptyText?: string;
  onChange: (id: string) => void;
}) {
  return (
    <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={styles.groupTitle} {...textScale.dense}>
        {label}
      </Text>
      {players.length === 0 ? (
        emptyText ? (
          <Text style={styles.warn} {...textScale.long}>
            {emptyText}
          </Text>
        ) : null
      ) : (
        <View style={styles.playerGrid}>
          {players.map((p) => {
            const on = value === p.id;
            return (
              <Touchable
                key={p.id}
                onPress={() => onChange(p.id)}
                haptic="selection"
                style={[styles.player, on ? styles.playerOn : null]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${p.number ? `${p.number} numara ` : ""}${p.name}${pitch.has(p.id) ? ", sahada" : ""}`}
              >
                <View style={[styles.playerShirt, on ? styles.playerShirtOn : null]}>
                  <Text style={[styles.playerNo, on ? styles.playerNoOn : null]} {...textScale.badge}>
                    {p.number || "–"}
                  </Text>
                  {pitch.has(p.id) ? <View style={styles.pitchDot} /> : null}
                </View>
                <View style={styles.playerTexts}>
                  <Text style={[styles.playerName, on ? styles.playerTextOn : null]} numberOfLines={1} {...textScale.dense}>
                    {p.name}
                  </Text>
                  <Text style={styles.playerMeta} numberOfLines={1} {...textScale.dense}>
                    {pitch.has(p.id) ? "Sahada" : p.role === "bench" ? "Yedek" : p.role === "starter" ? "Oyundan çıktı" : "Kadro dışı"}
                    {p.captain ? " · Kaptan" : ""}
                  </Text>
                </View>
                {on ? <Ionicons name="checkmark-circle" size={18} color={colors.brandAccent} /> : null}
              </Touchable>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** Taslaktan sunucu gövdesi. */
export function draftToBody(draft: EventDraft, teamId: number | null, userId?: number | null): EventBody {
  const sub = draft.code === "SUBSTITUTION";
  return {
    takim_id: teamId,
    olay_kodu: draft.code,
    dakika: Math.max(0, Math.floor(draft.minute)),
    devre: draft.period,
    oyuncu_id: sub ? null : Number(draft.playerId) || null,
    oyuncu_cikan_id: sub ? Number(draft.playerId) || null : null,
    oyuncu_giren_id: sub ? Number(draft.inPlayerId) || null : null,
    aciklama: draft.note.trim() || null,
    olusturan_kullanici_id: userId ?? null,
  };
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  flex: { flex: 1, minWidth: 0 },
  receipt: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.brandDim,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
  },
  receiptMinute: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface1,
  },
  receiptMinuteText: { ...type.scoreSm, color: colors.textPrimary },
  receiptPeriod: { ...type.nano, color: colors.brandAccent },
  receiptTitle: { ...type.h3, color: colors.textPrimary },
  receiptMeta: { ...type.caption, color: colors.textSecondary, marginTop: space.xxs },
  section: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  sectionTitle: { ...type.overline, color: colors.textSecondary },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface3,
  },
  stepDotDone: { backgroundColor: colors.win },
  stepNo: { ...type.numSmStrong, color: colors.textSecondary },
  group: { gap: space.xs },
  groupTitle: { ...type.overline, color: colors.textTertiary },
  inline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { ...type.caption, color: colors.textTertiary },
  minuteBig: { ...type.scoreLg, color: colors.textPrimary },
  warn: { ...type.bodySm, color: colors.warn },
  playerGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  player: {
    flexGrow: 1,
    flexBasis: "46%",
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.glassLine,
    backgroundColor: colors.surface2,
  },
  playerOn: { backgroundColor: colors.brandDim, borderColor: colors.brandBorder },
  playerShirt: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  playerShirtOn: { backgroundColor: colors.brandAccent, borderColor: colors.brandAccent },
  playerNo: { ...type.numSmStrong, color: colors.textPrimary },
  playerNoOn: { color: colors.onDark },
  pitchDot: {
    position: "absolute",
    right: -1,
    top: -1,
    width: 9,
    height: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.win,
    borderWidth: 1.5,
    borderColor: colors.surface2,
  },
  playerTexts: { flex: 1 },
  playerName: { ...type.label, color: colors.textPrimary },
  playerMeta: { ...type.caption, color: colors.textTertiary },
  playerTextOn: { color: colors.brandAccent },
});
