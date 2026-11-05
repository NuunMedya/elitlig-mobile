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

import { FieldLabel, RecordCard, confirmAction } from "@/components/admin";
import { Badge, Chip, ChipGroup, EmptyState, ErrorState, Input, SkeletonListRow } from "@/components/ui";
import { formatDateTime } from "@/lib/admin/format";
import { foldText } from "@/lib/api/admin/lookups";
import { conflictValueText, type MergeConflict, type MergeHistoryRow } from "@/lib/api/admin/merge";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

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
            <ChipGroup>
              {c.options.map((o) => {
                const id = (o as Record<string, number>)[idKey];
                const text = c.kind === "image" ? `Görsel · ${nameOf(id)}` : `${conflictValueText(c.kind, o.value)} · #${id}`;
                return <Chip key={id} label={text} size="sm" selected={chosen === id} onPress={() => onPick(c.field, id)} />;
              })}
              {canBlank(c.field) ? <Chip label="Boş bırak" size="sm" selected={chosen === null} onPress={() => onPick(c.field, null)} /> : null}
            </ChipGroup>
            {c.kind === "image" ? (
              <View style={styles.images}>
                {c.options.map((o) => {
                  const id = (o as Record<string, number>)[idKey];
                  return (
                    <View key={id} style={[styles.thumbWrap, chosen === id ? styles.thumbOn : null]}>
                      <Image source={{ uri: String(o.value) }} style={styles.thumb} accessibilityLabel={`${nameOf(id)} görseli`} />
                    </View>
                  );
                })}
              </View>
            ) : null}
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
          const counts = Object.entries(m.summary ?? {})
            .filter(([k, n]) => countLabels[k] && n)
            .slice(0, 5)
            .map(([k, n]) => `${n} ${countLabels[k]}`);
          const targetId = kind === "team" ? m.target_team_id : m.target_player_id;
          return (
            <RecordCard
              key={m.id}
              title={`${m.sources.map((s) => nameOf(s) || `#${s.id}`).join(", ")} → ${nameOf(m.target) || m.target_name || "?"}`}
              subtitle={[formatDateTime(m.created_at), m.created_by?.name, targetId ? `#${targetId}${m.target ? "" : " · artık yok"}` : null].filter(Boolean).join(" · ")}
              meta={counts.join(" · ") || null}
              icon={undone ? "arrow-undo-outline" : "git-merge-outline"}
              iconTone={undone ? "neutral" : "brand"}
              muted={undone}
              badges={[
                undone
                  ? { label: `Geri alındı${m.undone_at ? ` · ${formatDateTime(m.undone_at)}` : ""}`, icon: "arrow-undo-outline" }
                  : { label: "Yürürlükte", tone: "win" },
              ]}
              onPress={undone || busy ? undefined : () => onUndo(m)}
              trailing={undone ? undefined : <Ionicons name="arrow-undo-outline" size={18} color={colors.textSecondary} />}
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
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.warn,
  },
  sameRow: { flexDirection: "row", alignItems: "center", gap: space.sm, justifyContent: "space-between" },
  value: { ...type.body, color: colors.textPrimary, flex: 1 },
  muted: { ...type.caption, color: colors.textTertiary },
  images: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  thumbWrap: { borderRadius: radius.sm, borderWidth: 2, borderColor: colors.border, overflow: "hidden" },
  thumbOn: { borderColor: colors.brandAccent },
  thumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.surface2 },
});
