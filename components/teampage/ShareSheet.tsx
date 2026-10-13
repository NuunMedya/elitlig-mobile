/**
 * PAYLAŞIM KARTI — takımın sezon karnesi, iki boyda (hikâye 9:16, gönderi 3:4).
 *
 * KART SAHNEDİR: paylaşılan görsel, takımın uygulama dışındaki kimliğidir;
 * Arena'da kimlik anları grafit sahnede durur (palette: `inkBlock` →
 * "paylaşım kartı"). Eski kart beyazdı ve bir sohbet akışında beyaz bir
 * dikdörtgen olarak kayboluyordu; koyu kart, armayı ve rakamları öne çıkarır.
 *
 * Görsel `react-native-view-shot` ile yakalanır ve sistem paylaşımına verilir;
 * akış eski sürümle aynıdır.
 */

import { LinearGradient } from "expo-linear-gradient";
import * as Sharing from "expo-sharing";
import React, { useCallback, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import ViewShot, { captureRef } from "react-native-view-shot";
import {
  BottomSheet,
  Button,
  FormChips,
  SegmentedControl,
  TeamLogo,
  type SegmentedItem,
} from "@/components/ui";
import type { StandingRow } from "@/lib/types";
import { colors, radius, space, textScale, type, upperTR } from "@/theme";
import { signed } from "./model";

type ShareFormat = "story" | "post";

const SHARE_WIDTH = 264;
const SHARE_FORMATS: Record<ShareFormat, { label: string; height: number }> = {
  story: { label: "Hikâye 9:16", height: Math.round((SHARE_WIDTH * 16) / 9) },
  post: { label: "Gönderi 3:4", height: Math.round((SHARE_WIDTH * 4) / 3) },
};

const SHARE_ITEMS: SegmentedItem<ShareFormat>[] = [
  { key: "story", label: SHARE_FORMATS.story.label },
  { key: "post", label: SHARE_FORMATS.post.label },
];

/* Sahne gradyanı — yatay, sağdan sola (Arena gradyan kuralı). */
const INK_START = { x: 1, y: 0.5 } as const;
const INK_END = { x: 0, y: 0.5 } as const;

export function TeamShareSheet({
  visible,
  onClose,
  teamName,
  logo,
  context,
  rank,
  row,
  onError,
}: {
  visible: boolean;
  onClose: () => void;
  teamName: string;
  logo: string | null;
  /** "FREELİG · 15. SEZON" gibi bağlam satırı. */
  context: string;
  rank: number | null;
  row: StandingRow | null;
  onError: () => void;
}) {
  const [format, setFormat] = useState<ShareFormat>("story");
  const [busy, setBusy] = useState(false);
  const shotRef = useRef<View>(null);
  const story = format === "story";

  const share = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await captureRef(shotRef, { format: "png", quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png" });
      } else {
        onError();
      }
    } catch {
      onError();
    } finally {
      setBusy(false);
    }
  }, [busy, onError]);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Takımı paylaş"
      snap="full"
    >
      <SegmentedControl
        items={SHARE_ITEMS}
        value={format}
        onChange={setFormat}
      />

      <View style={styles.wrap}>
        <ViewShot ref={shotRef} options={{ format: "png", quality: 1 }}>
          <View style={[styles.card, { height: SHARE_FORMATS[format].height }]}>
            <LinearGradient
              colors={colors.gradientInk}
              start={INK_START}
              end={INK_END}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.top}>
              <Text style={styles.brand} {...textScale.badge}>
                elitlig
              </Text>
              <Text
                style={styles.kicker}
                numberOfLines={1}
                {...textScale.badge}
              >
                {upperTR("Sezon karnesi")}
              </Text>
            </View>

            <View
              style={[styles.identity, story ? styles.identityStory : null]}
            >
              <TeamLogo name={teamName} logo={logo} size={story ? 72 : 52} />
              <Text style={styles.name} numberOfLines={2} {...textScale.badge}>
                {teamName}
              </Text>
              {context ? (
                <Text
                  style={styles.context}
                  numberOfLines={1}
                  {...textScale.badge}
                >
                  {context}
                </Text>
              ) : null}
            </View>

            {row ? (
              <>
                <View style={styles.strip}>
                  {rank != null ? (
                    <ShareStat label="Sıra" value={`${rank}.`} />
                  ) : null}
                  <ShareStat
                    label="Puan"
                    value={String(row.display_points)}
                    divided={rank != null}
                  />
                  <ShareStat
                    label="Averaj"
                    value={signed(row.goal_diff)}
                    divided
                  />
                </View>

                {/* Gönderi boyu (3:4) kısadır: ayrıntı ızgarası yalnız hikâyede. */}
                {story ? (
                  <View style={styles.grid}>
                    <ShareStat label="Maç" value={String(row.played)} small />
                    <ShareStat label="G" value={String(row.wins)} small />
                    <ShareStat label="B" value={String(row.draws)} small />
                    <ShareStat label="M" value={String(row.losses)} small />
                    <ShareStat
                      label="Atılan"
                      value={String(row.goals_for)}
                      small
                    />
                    <ShareStat
                      label="Yenilen"
                      value={String(row.goals_against)}
                      small
                    />
                  </View>
                ) : null}

                {row.last5 ? (
                  <View style={styles.form}>
                    <Text style={styles.formLabel} {...textScale.badge}>
                      FORM
                    </Text>
                    <FormChips form={row.last5} size="sm" />
                  </View>
                ) : null}
              </>
            ) : (
              <Text style={styles.noData} {...textScale.badge}>
                Bu kapsamda sezon verisi yok
              </Text>
            )}

            <View style={styles.spacer} />
            <Text style={styles.footer} {...textScale.badge}>
              ELİTLİG.COM
            </Text>
          </View>
        </ViewShot>
      </View>

      <Button
        label={busy ? "Hazırlanıyor" : "Paylaş"}
        icon="share-social"
        onPress={share}
        loading={busy}
        fullWidth
      />
      <Text style={styles.hint} {...textScale.dense}>
        İndirmek için: Paylaş → Görüntüyü Kaydet
      </Text>
    </BottomSheet>
  );
}

const ShareStat = React.memo(function ShareStat({
  label,
  value,
  divided = false,
  small = false,
}: {
  label: string;
  value: string;
  divided?: boolean;
  small?: boolean;
}) {
  return (
    <View
      style={[
        small ? styles.cell : styles.stat,
        divided ? styles.statDivided : null,
      ]}
    >
      <Text
        style={small ? styles.cellValue : styles.statValue}
        {...textScale.badge}
      >
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1} {...textScale.badge}>
        {upperTR(label)}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingVertical: space.lg,
  },
  card: {
    width: SHARE_WIDTH,
    borderRadius: radius.xxl,
    overflow: "hidden",
    backgroundColor: colors.inkBlock,
    padding: space.lg,
    gap: space.md,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  brand: {
    ...type.h3,
    color: colors.brandOnDark,
  },
  kicker: {
    ...type.overline,
    color: colors.onDarkMuted,
    flexShrink: 1,
  },
  identity: {
    alignItems: "center",
    gap: space.sm,
  },
  identityStory: {
    paddingVertical: space.xs,
  },
  name: {
    ...type.display,
    color: colors.onDark,
    textAlign: "center",
  },
  context: {
    ...type.overline,
    color: colors.brandOnDark,
  },
  strip: {
    flexDirection: "row",
    borderRadius: radius.lg,
    backgroundColor: colors.inkTile,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.inkTileBorder,
    paddingVertical: space.m,
  },
  stat: {
    flex: 1,
    alignItems: "center",
    gap: space.xxs,
  },
  statDivided: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.borderOnDark,
  },
  statValue: {
    ...type.metric,
    color: colors.onDark,
  },
  statLabel: {
    ...type.overline,
    color: colors.onDarkMuted,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: space.md,
  },
  cell: {
    width: "33.33%",
    alignItems: "center",
    gap: space.xxs,
  },
  cellValue: {
    ...type.scoreSm,
    color: colors.onDark,
  },
  form: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  formLabel: {
    ...type.overline,
    color: colors.onDarkMuted,
  },
  noData: {
    ...type.bodySm,
    color: colors.onDarkMuted,
    textAlign: "center",
  },
  spacer: {
    flex: 1,
  },
  footer: {
    ...type.overline,
    color: colors.onDarkMuted,
    textAlign: "center",
  },
  hint: {
    ...type.caption,
    color: colors.textTertiary,
    textAlign: "center",
    marginTop: space.sm,
  },
});
