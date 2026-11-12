/**
 * Mobil stüdyo — yayın başlamadan önceki "telefona da kaydedilsin mi?" istemi.
 *
 * Telefonun depolamasını gösterir (boş alan, doluluk çubuğu), seçili kalitenin
 * bit hızından kaydın ne kadar yer tutacağını ve boş alanın kaç dakikaya
 * yeteceğini hesaplar; "Telefona kaydet" anahtarı varsayılan olarak AÇIKtır ve
 * son seçim hatırlanır (stüdyo ayarı `saveLocal`).
 *
 *   · Boş alan 90 dakikalık maça yetmiyorsa uyarı gösterilir (kayıt yine başlar).
 *   · Boş alan güvenlik tabanının (300 MB) altındaysa anahtar kapanır ve kilitlenir.
 *   · Yerel modül kaydı desteklemiyorsa (eski derleme, Expo Go) bu açıklanır ve
 *     yayın kayıtsız başlar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { MATCH_MINUTES, durationText, estimateStorage, estimateText, formatBytes, saveLocationText } from "@/lib/live/localRecording";
import { RIG, type EncoderConfig } from "@/lib/live/rig";
import type { StorageInfo } from "@/modules/elitlig-live";
import { radius, space, type } from "@/theme";

import { Btn, Note, ToggleRow } from "./rigUi";

export interface LocalRecordPromptProps {
  /** Yerel modül telefona kaydı destekliyor mu. */
  supported: boolean;
  /** undefined → okunuyor, null → okunamadı. */
  storage: StorageInfo | null | undefined;
  encoder: EncoderConfig;
  /** Kayıtlı tercih (varsayılan açık). */
  value: boolean;
  onChange: (next: boolean) => void;
  /** record: bu yayın telefona kaydedilecek mi (boş alan yetmiyorsa false). */
  onStart: (record: boolean) => void;
  onCancel: () => void;
  busy?: boolean;
}

export function LocalRecordPrompt({ supported, storage, encoder, value, onChange, onStart, onCancel, busy }: LocalRecordPromptProps) {
  const estimate = estimateStorage(encoder, storage?.freeBytes, storage?.minFreeBytes);
  const loading = supported && storage === undefined;
  const blocked = supported && estimate.belowFloor;
  const canRecord = supported && !blocked;
  const record = canRecord && value;

  const total = storage?.totalBytes ?? 0;
  const free = storage?.freeBytes ?? 0;
  const usedRatio = total > 0 ? Math.min(1, Math.max(0, (total - free) / total)) : 0;
  const barColor = blocked ? RIG.live : estimate.tight ? RIG.warn : RIG.brand;

  return (
    <View style={styles.backdrop} accessibilityViewIsModal>
      <View style={styles.sheet}>
        <View style={styles.head}>
          <View style={styles.headIcon}>
            <Ionicons name="save" size={18} color={RIG.text} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.title} accessibilityRole="header" allowFontScaling={false}>
              Yayın telefona da kaydedilsin mi?
            </Text>
            <Text style={styles.subtitle} allowFontScaling={false}>
              Yayına giden görüntü (skorbord ve sesle) baştan sona MP4 olarak telefonun hafızasına yazılır.
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {!supported ? (
            <Note
              tone="warn"
              icon="construct"
              text="Telefona kayıt bu uygulama sürümünde yok; mağazadaki yeni sürümle gelir. Yayın kayıtsız, normal şekilde başlar."
            />
          ) : (
            <>
              <View style={styles.card}>
                <View style={styles.cardRow}>
                  <Ionicons name="phone-portrait" size={15} color={RIG.textSoft} />
                  <Text style={styles.cardLabel} allowFontScaling={false}>
                    TELEFON HAFIZASI
                  </Text>
                  <Text style={styles.cardValue} numberOfLines={1} allowFontScaling={false}>
                    {loading ? "Okunuyor…" : storage ? `Boş alan ${formatBytes(free)}${total > 0 ? ` / ${formatBytes(total)}` : ""}` : "Boş alan okunamadı"}
                  </Text>
                </View>
                <View
                  style={styles.bar}
                  accessibilityRole="progressbar"
                  accessibilityLabel="Telefon hafızası doluluğu"
                  accessibilityValue={{ min: 0, max: 100, now: Math.round(usedRatio * 100) }}
                >
                  <View style={[styles.barFill, { width: `${Math.round(usedRatio * 100)}%`, backgroundColor: barColor }]} />
                </View>
                {storage && total > 0 ? (
                  <Text style={styles.muted} allowFontScaling={false}>
                    Dolu {formatBytes(total - free)} · %{Math.round(usedRatio * 100)}
                  </Text>
                ) : null}
                <Text style={styles.estimate} allowFontScaling={false}>
                  {estimateText(estimate)}
                </Text>
                <Text style={styles.muted} allowFontScaling={false}>
                  {encoder.width}×{encoder.height} · {encoder.videoBitrateKbps} kbps görüntü + 128 kbps ses
                </Text>
              </View>

              {blocked ? (
                <Note
                  tone="danger"
                  icon="alert-circle"
                  text={`Boş alan 300 MB'ın altında (${formatBytes(free)}): telefona kayıt yapılamaz. Yayın kayıtsız başlar; kaydetmek için önce telefonda yer aç.`}
                />
              ) : estimate.tight && estimate.minutesLeft != null ? (
                <Note
                  tone="warn"
                  icon="warning"
                  text={`Boş alan ${MATCH_MINUTES} dakikalık maça yetmeyebilir: ${durationText(estimate.minutesLeft)} kayda yeter. Alan 300 MB'ın altına inince kayıt kendiliğinden kapatılır, o ana kadarki bölüm saklanır.`}
                />
              ) : null}

              <ToggleRow
                title="Telefona kaydet"
                hint={
                  blocked
                    ? "Yeterli boş alan yok"
                    : record
                      ? `Kaydedilecek yer: ${saveLocationText(storage)}`
                      : "Bu yayın telefona kaydedilmeyecek"
                }
                icon="save"
                value={record}
                onChange={onChange}
                disabled={!canRecord}
              />
            </>
          )}
        </ScrollView>

        <View style={styles.foot}>
          <View style={styles.footBtn}>
            <Btn label="Vazgeç" tone="soft" onPress={onCancel} disabled={busy} />
          </View>
          <View style={styles.footBtnWide}>
            <Btn label={record ? "Yayını başlat ve kaydet" : "Yayını başlat"} icon="radio" tone="live" onPress={() => onStart(record)} disabled={busy || loading} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: RIG.scrim,
    alignItems: "center",
    justifyContent: "center",
    padding: space.md,
  },
  sheet: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "100%",
    backgroundColor: RIG.sheet,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RIG.line,
    overflow: "hidden",
  },
  flex: { flex: 1, minWidth: 0 },
  head: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  headIcon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: RIG.brand },
  title: { ...type.h3, color: RIG.text },
  subtitle: { ...type.caption, color: RIG.textSoft, marginTop: space.xxs },
  body: { paddingHorizontal: space.lg, paddingBottom: space.sm, gap: space.sm },
  card: { gap: space.xs, padding: space.md, borderRadius: radius.md, backgroundColor: RIG.panelSoft },
  cardRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  cardLabel: { ...type.micro, color: RIG.textMute, flex: 1 },
  cardValue: { ...type.label, color: RIG.text },
  bar: { height: 8, borderRadius: radius.pill, backgroundColor: RIG.panelStrong, overflow: "hidden" },
  barFill: { height: 8, borderRadius: radius.pill },
  estimate: { ...type.caption, color: RIG.text },
  muted: { ...type.caption, color: RIG.textMute },
  foot: {
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: RIG.line,
  },
  footBtn: { flex: 1 },
  footBtnWide: { flex: 2 },
});
