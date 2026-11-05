/**
 * PROFİL PAYLAŞIM KARTI — web ShareProfileCard'ın mobil karşılığı.
 *
 * NE: oyuncu, sezon istatistiklerini taşıyan dikey (4:5) bir kartı PNG olarak
 * yakalayıp sistem paylaşım menüsünü açar (Instagram, WhatsApp, "Görüntüyü
 * kaydet"…). Web'de kart indirilir; telefonda paylaşım menüsü hem indirmeyi
 * hem paylaşmayı karşılar, ayrı galeri izni gerekmez.
 *
 * RENKLER TEMADAN BAĞIMSIZ: dışa aktarılan görsel, paylaşanın telefonu açık
 * ya da koyu temada olsun BİREBİR aynı görünmeli. Bu yüzden kart tuvali
 * `dark` paletinin tokenlarını okur (`colors.*` değil) — çıplak hex yok,
 * yine de sabit bir görünüm. Uygulama kabuğu (düğmeler, perde) tema tokenıdır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import * as Sharing from "expo-sharing";
import { LinearGradient } from "expo-linear-gradient";
import React, { useRef, useState } from "react";
import { Alert, Modal, StyleSheet, Text, View } from "react-native";
import ViewShot, { captureRef } from "react-native-view-shot";

import { Avatar, Bloom, Button } from "@/components/ui";
import { dark as card, radius, space, textScale, type, upperTR } from "@/theme";

const START = { x: 1, y: 0.5 } as const;
const END = { x: 0, y: 0.5 } as const;

export interface ShareProfileData {
  name: string;
  image: string | null;
  position: string | null;
  teamName: string | null;
  /** "2025-26" ya da "KARİYER". */
  scopeLabel: string;
  matches: number;
  goals: number;
  assists: number;
  rating: string;
  /** Elit Kart genel değeri (varsa köşede). */
  ovr?: number | null;
  tierLabel?: string | null;
}

export function ShareProfileCard({
  visible,
  onClose,
  data,
}: {
  visible: boolean;
  onClose: () => void;
  data: ShareProfileData;
}) {
  const shotRef = useRef<ViewShot>(null);
  const [busy, setBusy] = useState(false);

  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await captureRef(shotRef, { format: "png", quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Profil kartını paylaş" });
      } else {
        Alert.alert("Paylaşım kullanılamıyor", "Bu cihazda paylaşım menüsü açılamadı.");
      }
    } catch {
      Alert.alert("Kart görseli oluşturulamadı", "Kartı yeniden oluşturmayı dene; sürerse uygulamayı kapatıp aç.");
    } finally {
      setBusy(false);
    }
  };

  const stats: [string, string][] = [
    [String(data.matches), "MAÇ"],
    [String(data.goals), "GOL"],
    [String(data.assists), "ASİST"],
    [data.rating, "PUAN"],
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <ViewShot ref={shotRef} options={{ format: "png", quality: 1 }}>
          <View style={styles.card}>
            <LinearGradient colors={card.gradientInk} start={START} end={END} style={StyleSheet.absoluteFill} />
            <Bloom width={320} height={260} color={card.brand} intensity={0.55} style={styles.bloom} />

            <View style={styles.cardTop}>
              <Text style={styles.brand} {...textScale.badge}>
                ELİTLİG
              </Text>
              {data.ovr != null ? (
                <View style={styles.ovr}>
                  <Text style={styles.ovrValue} {...textScale.badge}>
                    {data.ovr}
                  </Text>
                  <Text style={styles.ovrLabel} {...textScale.badge}>
                    {upperTR(data.tierLabel ?? "OVR")}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.photo}>
              <Avatar name={data.name} image={data.image} size={132} ring="brand" />
            </View>

            <Text style={styles.name} numberOfLines={2} {...textScale.badge}>
              {data.name}
            </Text>
            <Text style={styles.meta} numberOfLines={1} {...textScale.badge}>
              {[data.position, data.teamName ?? "Serbest oyuncu"].filter(Boolean).join("  ·  ")}
            </Text>
            <View style={styles.scope}>
              <Text style={styles.scopeText} {...textScale.badge}>
                {upperTR(data.scopeLabel)}
              </Text>
            </View>

            <View style={styles.stats}>
              {stats.map(([value, label], index) => (
                <View key={label} style={[styles.stat, index > 0 && styles.statDivider]}>
                  <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
                    {value}
                  </Text>
                  <Text style={styles.statLabel} {...textScale.badge}>
                    {label}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={styles.foot} {...textScale.badge}>
              elitlig.com
            </Text>
          </View>
        </ViewShot>

        <View style={styles.actions}>
          <Button label="Kapat" variant="secondary" onPress={onClose} onDark style={styles.flex} />
          <Button
            label={busy ? "Hazırlanıyor…" : "Paylaş"}
            icon="share-social"
            onPress={share}
            loading={busy}
            haptic="light"
            style={styles.flex}
          />
        </View>
        <View style={styles.hintRow}>
          <Ionicons name="information-circle-outline" size={13} color={card.onDarkMuted} />
          <Text style={styles.hint} {...textScale.dense}>
            Paylaşım menüsündeki "Görüntüyü kaydet" ile galeriye indirebilirsin.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const CARD_W = 300;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrim: {
    flex: 1,
    backgroundColor: card.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
    gap: space.lg,
  },
  card: {
    width: CARD_W,
    height: CARD_W * 1.25,
    borderRadius: radius.xxl,
    overflow: "hidden",
    alignItems: "center",
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    paddingBottom: space.md,
    backgroundColor: card.inkBlock,
    borderWidth: 1,
    borderColor: card.borderOnDark,
  },
  bloom: { position: "absolute", top: 10, left: (CARD_W - 320) / 2 },
  cardTop: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { ...type.overline, color: card.brandOnDark, letterSpacing: 3 },
  ovr: {
    alignItems: "center",
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.sm,
    backgroundColor: card.inkPill,
    borderWidth: 1,
    borderColor: card.inkPillBorder,
  },
  ovrValue: { ...type.scoreSm, color: card.onDark },
  ovrLabel: { ...type.nano, color: card.onDarkMuted },
  photo: { marginTop: space.md, marginBottom: space.md },
  name: { ...type.display, color: card.onDark, textAlign: "center" },
  meta: { ...type.caption, color: card.onDarkMuted, marginTop: space.xs, textAlign: "center" },
  scope: {
    marginTop: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: card.brandDim,
  },
  scopeText: { ...type.micro, color: card.brandOnDark },
  stats: {
    marginTop: "auto",
    alignSelf: "stretch",
    flexDirection: "row",
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: card.borderOnDark,
  },
  stat: { flex: 1, alignItems: "center" },
  statDivider: { borderLeftWidth: 1, borderLeftColor: card.borderOnDark },
  statValue: { ...type.scoreMd, color: card.onDark },
  statLabel: { ...type.micro, color: card.onDarkMuted, marginTop: space.xxs },
  foot: { ...type.micro, color: card.onDarkMuted, letterSpacing: 1.5 },
  actions: { flexDirection: "row", gap: space.sm, width: CARD_W },
  hintRow: { flexDirection: "row", alignItems: "center", gap: space.xs, width: CARD_W },
  hint: { ...type.caption, color: card.onDarkMuted, flex: 1 },
});
