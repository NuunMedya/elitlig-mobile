/**
 * HAZIR STATÜ (web features/seasonStructure/StructureBuilder.js).
 *
 * Lig statüsünü üç parçadan kurar: grup aşaması (kaç grup, grupta kaç takım,
 * fikstürlü/serbest, rövanş), kim yükselir (gruplardan / genel tablodan /
 * eleme yok) ve eleme turları (rövanş, final rövanşı, üçüncülük, eşleşme
 * düzeni). Altta sunucunun ürettiği plan canlı önizlenir; "Statüyü kur" planı
 * tek işlemde kaydeder (mevcut gruplar kaldırılır, maçlar silinmez).
 */

import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { FieldLabel, SegmentField, ToggleField, confirmAction } from "@/components/admin";
import { BottomSheet, Button, Chip, ChipGroup, Stepper } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { buildStructure, previewStructure, type StructureTemplate } from "@/lib/api/admin/leagues";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

const QUALIFIER_OPTIONS = [2, 4, 8, 16, 32];

type Advance = "groups" | "overall" | "none";

interface Shape {
  useGroups: boolean;
  groupCount: number;
  groupSize: number;
  format: "fikstur" | "serbest";
  groupDouble: boolean;
  advance: Advance;
  perGroup: number;
  qualifiers: number;
  koDouble: boolean;
  finalDouble: boolean;
  thirdPlace: boolean;
  pairing: "auto" | "seeded";
}

const DEFAULT_SHAPE: Shape = {
  useGroups: true,
  groupCount: 4,
  groupSize: 4,
  format: "fikstur",
  groupDouble: false,
  advance: "groups",
  perGroup: 2,
  qualifiers: 4,
  koDouble: false,
  finalDouble: false,
  thirdPlace: false,
  pairing: "auto",
};

function toTemplate(shape: Shape): StructureTemplate {
  const groups = shape.useGroups
    ? { count: shape.groupCount, size: shape.groupSize, format: shape.format, doubleRound: shape.groupDouble }
    : { count: 0 };
  const advance = shape.useGroups ? shape.advance : shape.advance === "none" ? "none" : "overall";
  if (advance === "none") return { groups, knockout: { enabled: false } };
  return {
    groups,
    knockout: {
      enabled: true,
      ...(advance === "groups" ? { perGroup: shape.perGroup } : { qualifiers: shape.qualifiers }),
      doubleRound: shape.koDouble,
      finalDoubleRound: shape.finalDouble,
      thirdPlace: shape.thirdPlace,
      pairing: shape.pairing,
    },
  };
}

export function StructureSheet({
  visible,
  onClose,
  seasonId,
  hasExisting,
  onBuilt,
}: {
  visible: boolean;
  onClose: () => void;
  seasonId: number;
  hasExisting: boolean;
  onBuilt: (message: string) => void;
}) {
  const [shape, setShape] = useState<Shape>(DEFAULT_SHAPE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Shape>) => setShape((s) => ({ ...s, ...patch }));

  useEffect(() => {
    if (visible) {
      setShape(DEFAULT_SHAPE);
      setError(null);
    }
  }, [visible]);

  const template = useMemo(() => toTemplate(shape), [shape]);
  const advance: Advance = shape.useGroups ? shape.advance : shape.advance === "none" ? "none" : "overall";
  const qualifierCount = advance === "groups" ? shape.groupCount * shape.perGroup : advance === "overall" ? shape.qualifiers : 0;

  // Canlı önizleme: şablon değiştikçe sunucu planı üretir (anahtar şablonun kendisi).
  const preview = useQuery({
    queryKey: ["admin", "season-structure", "preview", JSON.stringify(template)],
    queryFn: () => previewStructure(template),
    enabled: visible,
    staleTime: 60_000,
  });

  const build = async () => {
    if (hasExisting) {
      const ok = await confirmAction({
        title: "Statü yeniden kurulsun mu?",
        message:
          "Bu sezonun mevcut grupları ve eleme etapları kaldırılıp yeni statü kurulacak. Maçlar, skorlar ve istatistikler silinmez; yalnızca grup bilgileri temizlenir.",
        confirmLabel: "Yeniden kur",
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      await buildStructure(seasonId, template);
      onBuilt("Statü kuruldu. Gruplara takımları yerleştirmek için kutulara dokun.");
      onClose();
    } catch (e) {
      setError(errorText(e, "Statü kurulamadı."));
    } finally {
      setBusy(false);
    }
  };

  const groupsPlan = (preview.data?.groups ?? []).filter((g) => g.kind === "grup");
  const stagesPlan = (preview.data?.groups ?? []).filter((g) => g.kind === "etap");

  return (
    <BottomSheet
      visible={visible}
      onClose={busy ? () => undefined : onClose}
      title="Hazır statü"
      snap="full"
      footer={
        <Button
          label={hasExisting ? "Statüyü yeniden kur" : "Statüyü kur"}
          icon="construct-outline"
          onPress={build}
          loading={busy}
          disabled={!preview.data || preview.isError}
          fullWidth
          haptic="success"
        />
      }
    >
      <View style={styles.stack}>
        <Text style={styles.section} {...textScale.dense}>
          1 · GRUP AŞAMASI
        </Text>
        <ToggleField label="Sezon gruplara bölünsün" value={shape.useGroups} onChange={(v) => set({ useGroups: v })} />
        {shape.useGroups ? (
          <>
            <Stepper label="Grup sayısı" value={shape.groupCount} min={1} max={16} onChange={(v) => set({ groupCount: v })} />
            <Stepper
              label="Grupta takım"
              value={shape.groupSize}
              min={2}
              max={32}
              onChange={(v) => set({ groupSize: v, perGroup: Math.min(shape.perGroup, v) })}
            />
            <SegmentField
              label="Maç düzeni"
              value={shape.format}
              onChange={(v) => set({ format: v })}
              options={[
                { key: "fikstur", label: "Fikstürlü" },
                { key: "serbest", label: "Serbest" },
              ]}
            />
            <ToggleField label="Grup maçları rövanşlı" value={shape.groupDouble} onChange={(v) => set({ groupDouble: v })} />
          </>
        ) : null}

        <Text style={styles.section} {...textScale.dense}>
          2 · ELEME TURUNA ÇIKANLAR
        </Text>
        <SegmentField<Advance>
          value={advance}
          onChange={(v) => set({ advance: v })}
          options={[
            ...(shape.useGroups ? [{ key: "groups" as Advance, label: "Gruplardan" }] : []),
            { key: "overall", label: "Genel tablodan" },
            { key: "none", label: "Eleme yok" },
          ]}
        />
        {advance === "groups" ? (
          <Stepper label="Her gruptan ilk" value={shape.perGroup} min={1} max={shape.groupSize} onChange={(v) => set({ perGroup: v })} />
        ) : null}
        {advance === "overall" ? (
          <View style={styles.field}>
            <FieldLabel label="Genel tablonun ilk" />
            <ChipGroup>
              {QUALIFIER_OPTIONS.map((n) => (
                <Chip key={n} label={String(n)} size="sm" selected={shape.qualifiers === n} onPress={() => set({ qualifiers: n })} />
              ))}
            </ChipGroup>
          </View>
        ) : null}

        {advance !== "none" ? (
          <>
            <Text style={styles.section} {...textScale.dense}>
              3 · ELEME TURLARI · {qualifierCount} TAKIM
            </Text>
            <ToggleField label="Eleme maçları rövanşlı" hint="Toplam skorla tur atlanır." value={shape.koDouble} onChange={(v) => set({ koDouble: v })} />
            <ToggleField label="Final rövanşlı" value={shape.finalDouble} onChange={(v) => set({ finalDouble: v })} />
            {qualifierCount >= 4 ? (
              <ToggleField label="Üçüncülük maçı oynansın" value={shape.thirdPlace} onChange={(v) => set({ thirdPlace: v })} />
            ) : null}
            {advance === "groups" ? (
              <SegmentField
                label="Eşleşme düzeni"
                value={shape.pairing}
                onChange={(v) => set({ pairing: v })}
                options={[
                  { key: "auto", label: "Çapraz (A1–B2)" },
                  { key: "seeded", label: "Sıralı" },
                ]}
              />
            ) : null}
          </>
        ) : null}

        <Text style={styles.section} {...textScale.dense}>
          ŞÖYLE KURULACAK
        </Text>
        {preview.isError ? (
          <Text style={styles.error} {...textScale.long}>
            {errorText(preview.error, "Önizleme alınamadı.")}
          </Text>
        ) : !preview.data ? (
          <Text style={styles.muted}>Hazırlanıyor…</Text>
        ) : (
          <View style={styles.plan}>
            {groupsPlan.length ? (
              <View style={styles.planCol}>
                <Text style={styles.planLabel} {...textScale.dense}>
                  Grup aşaması
                </Text>
                {groupsPlan.map((g) => (
                  <View key={g.name} style={styles.planCard}>
                    <Text style={styles.planTitle} {...textScale.dense}>
                      {g.name}
                    </Text>
                    <Text style={styles.muted} {...textScale.dense}>
                      {g.slots.length} takım · {g.format === "fikstur" ? "fikstürlü" : "serbest"}
                      {g.double_round ? " · rövanşlı" : ""}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            {stagesPlan.map((g) => (
              <View key={g.name} style={styles.planCol}>
                <Text style={styles.planLabel} {...textScale.dense}>
                  {g.name}
                  {g.double_round ? " · rövanşlı" : ""}
                </Text>
                {Array.from({ length: Math.ceil(g.slots.length / 2) }, (_, i) => (
                  <View key={i} style={styles.planCard}>
                    <Text style={styles.muted} numberOfLines={2} {...textScale.dense}>
                      {g.slots[i * 2]} – {g.slots[i * 2 + 1] ?? "?"}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}
        {error ? (
          <Text style={styles.error} {...textScale.long}>
            {error}
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  field: { gap: space.xs },
  section: { ...type.overline, color: colors.textTertiary, marginTop: space.sm },
  muted: { ...type.caption, color: colors.textTertiary },
  error: { ...type.bodySm, color: colors.danger },
  plan: { gap: space.md },
  planCol: { gap: space.xs },
  planLabel: { ...type.label, color: colors.textSecondary },
  planCard: {
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    gap: space.xxs,
  },
  planTitle: { ...type.bodySm, color: colors.textPrimary },
});
