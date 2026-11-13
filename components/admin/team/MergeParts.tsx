/**
 * Birleştirme merkezlerinin ortak parçaları (takım + oyuncu).
 *
 *   ConflictList  çakışan her alan için "hangi kaydın değeri kalsın?" seçimi;
 *                 tek kayıtta dolu ya da aynı olan alanlar otomatik korunur.
 *   MergeHistory  geçmiş birleştirmeler; yürürlükteki geri alınabilir.
 *
 * Masaüstündeki yan yana karşılaştırma tablosu telefonda okunmuyor: her alan
 * kendi satırında, seçenekler çip olarak listelenir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useMemo, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { LinearGradient } from "expo-linear-gradient";

import { FieldLabel, confirmAction } from "@/components/admin";
import { Badge, Button, Chip, ChipGroup, EmptyState, ErrorState, IconTile, Input, SkeletonListRow, TeamLogo, Touchable } from "@/components/ui";
import { formatDateTime } from "@/lib/admin/format";
import { foldText } from "@/lib/api/admin/lookups";
import { conflictValueText, type MergeConflict, type MergeHistoryRow } from "@/lib/api/admin/merge";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { EntityCard } from "./ManageKit";

/** Üst üste binen küçük arma yığını (birleştirme grubu). */
export function LogoStack({ teams, size = 34, max = 3 }: { teams: { id: number; team_name: string; logo?: string | null }[]; size?: number; max?: number }) {
  const shown = teams.slice(0, max);
  return (
    <View style={[styles.stackRow, { width: size + (shown.length - 1) * (size * 0.55) + (teams.length > max ? size * 0.55 : 0) }]}>
      {shown.map((t, i) => (
        <View key={t.id} style={[styles.stackItem, { left: i * size * 0.55, zIndex: max - i }]}>
          <TeamLogo name={t.team_name} logo={t.logo} size={size} />
        </View>
      ))}
      {teams.length > max ? (
        <View style={[styles.stackMore, { left: shown.length * size * 0.55, width: size, height: size }]}>
          <Text style={styles.stackMoreText} {...textScale.badge}>
            +{teams.length - max}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function ConflictList<K extends "team_id" | "player_id">({
  conflicts,
  idKey,
  fields,
  nameOf,
  canBlank,
  onPick,
}: {
  conflicts: MergeConflict<K>[];
  idKey: K;
  fields: Record<string, number | null>;
  nameOf: (id: number) => string;
  canBlank: (field: string) => boolean;
  onPick: (field: string, id: number | null) => void;
}) {
  return (
    <View style={styles.stack}>
      {conflicts.map((c) => {
        if (!c.options.length) {
          return (
            <View key={c.field} style={styles.field}>
              <FieldLabel label={c.label} />
              <Text style={styles.muted} {...textScale.dense}>
                Hiçbir kayıtta yok
              </Text>
            </View>
          );
        }
        if (!c.conflict) {
          return (
            <View key={c.field} style={styles.field}>
              <FieldLabel label={c.label} />
              <View style={styles.sameRow}>
                <ValueView kind={c.kind} value={c.options[0].value} />
                <Badge label={c.options.length > 1 ? "aynı" : "korunur"} tone="win" size="xs" icon="checkmark" />
              </View>
            </View>
          );
        }
        const chosen = fields[c.field];
        return (
          <View key={c.field} style={[styles.field, chosen === undefined ? styles.needs : null]}>
            <View style={styles.sameRow}>
              <FieldLabel label={c.label} />
              <Badge label={chosen === undefined ? "seçim gerekli" : "seçildi"} tone={chosen === undefined ? "warn" : "win"} size="xs" />
            </View>
            {/* SEÇENEK KAROLARI — değer büyük, kaynağı altında; seçili karo imza şeritli. */}
            <View style={styles.options}>
              {c.options.map((o) => {
                const id = (o as Record<string, number>)[idKey];
                const on = chosen === id;
                return (
                  <Touchable
                    key={id}
                    feedback="card"
                    haptic="selection"
                    onPress={() => onPick(c.field, id)}
                    style={[styles.option, on ? styles.optionOn : null]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${c.label}: ${c.kind === "image" ? "görsel" : conflictValueText(c.kind, o.value)}, ${nameOf(id)}`}
                  >
                    {on ? <LinearGradient colors={colors.gradientSignature} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.optionRail} /> : null}
                    {c.kind === "image" ? (
                      <Image source={{ uri: String(o.value) }} style={styles.thumb} accessibilityLabel={`${nameOf(id)} görseli`} />
                    ) : (
                      <Text style={[styles.optionValue, on ? styles.optionValueOn : null]} numberOfLines={2} {...textScale.dense}>
                        {conflictValueText(c.kind, o.value)}
                      </Text>
                    )}
                    <View style={styles.optionFoot}>
                      <Text style={styles.optionSource} numberOfLines={1} {...textScale.badge}>
                        {nameOf(id)} · #{id}
                      </Text>
                      <Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={16} color={on ? colors.brandAccent : colors.textTertiary} />
                    </View>
                  </Touchable>
                );
              })}
              {canBlank(c.field) ? (
                <Touchable
                  feedback="card"
                  onPress={() => onPick(c.field, null)}
                  style={[styles.option, styles.optionBlank, chosen === null ? styles.optionOn : null]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: chosen === null }}
                >
                  <Text style={styles.optionSource} {...textScale.dense}>
                    Boş bırak
                  </Text>
                </Touchable>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ValueView({ kind, value }: { kind?: string; value: unknown }) {
  if (kind === "image" && value) {
    return <Image source={{ uri: String(value) }} style={styles.thumb} accessibilityLabel="Görsel" />;
  }
  return (
    <Text style={styles.value} numberOfLines={2} {...textScale.dense}>
      {conflictValueText(kind, value)}
    </Text>
  );
}

export function MergeHistory({
  merges,
  loading,
  error,
  onRetry,
  busy,
  onUndo,
  countLabels,
  kind,
}: {
  merges: MergeHistoryRow[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  busy: boolean;
  onUndo: (m: MergeHistoryRow) => void;
  countLabels: Record<string, string>;
  kind: "team" | "player";
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const nameOf = (x?: { team_name?: string; player_name?: string } | null) => (kind === "team" ? x?.team_name : x?.player_name) ?? "";
  const list = useMemo(
    () =>
      merges.filter((m) => {
        if (status && (status === "undone") !== (m.status === "undone")) return false;
        const text = foldText([...m.sources.map(nameOf), nameOf(m.target), m.target_name].join(" "));
        return !q.trim() || text.includes(foldText(q));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [merges, q, status]
  );

  if (loading) return <SkeletonListRow count={4} />;
  if (error) return <ErrorState error={error} onRetry={onRetry} variant="inline" />;

  return (
    <View style={styles.stack}>
      <Input variant="search" leadingIcon="search" value={q} onChangeText={setQ} placeholder="Ada göre ara" autoCorrect={false} />
      <ChipGroup>
        {[
          ["", "Tümü"],
          ["merged", "Yürürlükte"],
          ["undone", "Geri alınanlar"],
        ].map(([key, label]) => (
          <Chip key={key} label={label} size="sm" selected={status === key} onPress={() => setStatus(key)} />
        ))}
      </ChipGroup>
      {!list.length ? (
        <EmptyState icon="time-outline" variant="inline" title={merges.length ? "Aramaya uyan birleştirme yok" : "Henüz birleştirme yapılmadı"} />
      ) : (
        list.map((m) => {
          const undone = m.status === "undone";
          const counts = Object.entries(m.summary ?? {}).filter(([k, n]) => countLabels[k] && n) as [string, number][];
          const targetId = kind === "team" ? m.target_team_id : m.target_player_id;
          return (
            <EntityCard
              key={m.id}
              muted={undone}
              leading={<IconTile icon={undone ? "arrow-undo" : "git-merge"} tone={undone ? "neutral" : "violet"} size={40} glow={false} />}
              overline={[formatDateTime(m.created_at), m.created_by?.name].filter(Boolean).join(" · ")}
              title={nameOf(m.target) || m.target_name || "?"}
              subtitle={`← ${m.sources.map((x) => nameOf(x) || `#${x.id}`).join(", ")}`}
              meta={targetId ? `#${targetId}${m.target ? "" : " · artık yok"}` : null}
              pills={[
                undone
                  ? { label: `Geri alındı${m.undone_at ? ` · ${formatDateTime(m.undone_at)}` : ""}`, icon: "arrow-undo-outline" }
                  : { label: "Yürürlükte", tone: "win" },
              ]}
              stats={counts.length ? counts.slice(0, 3).map(([k, n]) => ({ label: countLabels[k], value: n })) : undefined}
              trailing={
                undone ? null : (
                  <Button label="Geri al" icon="arrow-undo-outline" size="sm" variant="secondary" disabled={busy} onPress={() => onUndo(m)} />
                )
              }
            />
          );
        })
      )}
    </View>
  );
}

/** Geri al onayı (takım ve oyuncu için ortak metin). */
export const confirmUndo = (names: string, kind: "team" | "player") =>
  confirmAction({
    title: "Birleştirme geri alınsın mı?",
    message:
      kind === "team"
        ? `${names} eski adı ve bilgileriyle yeniden oluşturulacak. Aktarılan oyuncular, maçlar, istatistikler eski takımlarına döner; birleştirmeden sonra başka takıma geçmiş kayıtlara dokunulmaz.`
        : `${names} aynı kimlik ve bilgileriyle yeniden oluşturulacak; taşınan maç, gol, kadro ve transfer kayıtları geri döner.`,
    confirmLabel: "Geri al",
    destructive: true,
  });

const styles = StyleSheet.create({
  stack: { gap: space.md },
  field: { gap: space.xs },
  needs: {
    padding: space.sm,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.warn,
    backgroundColor: colors.warnDim,
  },
  sameRow: { flexDirection: "row", alignItems: "center", gap: space.sm, justifyContent: "space-between" },
  value: { ...type.body, color: colors.textPrimary, flex: 1 },
  muted: { ...type.caption, color: colors.textTertiary },
  options: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  option: {
    flexGrow: 1,
    flexBasis: "46%",
    gap: space.xs,
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  optionOn: { backgroundColor: colors.brandDim, borderColor: colors.brandBorder },
  optionBlank: { justifyContent: "center", alignItems: "center", borderStyle: "dashed" },
  optionRail: { position: "absolute", left: 0, right: 0, top: 0, height: 3 },
  optionValue: { ...type.label, color: colors.textSecondary },
  optionValueOn: { color: colors.textPrimary },
  optionFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.xs },
  optionSource: { ...type.caption, color: colors.textTertiary, flexShrink: 1 },
  stackRow: { height: 40, justifyContent: "center" },
  stackItem: { position: "absolute", top: 0, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.surface1 },
  stackMore: { position: "absolute", top: 2, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface3 },
  stackMoreText: { ...type.numSmStrong, color: colors.textSecondary },
  thumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.surface2 },
});
