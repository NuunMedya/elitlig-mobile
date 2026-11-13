/**
 * YAPILACAKLAR — başkanın bekleyen işleri, öncelik sırasıyla.
 *
 * İKİ KAT:
 *   1. ÖNCELİKLİ KART — en ağır iş (süre baskısı > karar > bilgi) tek başına,
 *      büyük: tonlu degrade ikon kutusu, başlık, neden, iri sayı ve "Şimdi
 *      ilgilen" eylemi. Başkan sayfayı açınca ilk göreceği iş budur.
 *   2. SIRADAKİLER — kalanlar tek kartta satır satır: IconTile + başlık/neden
 *      + sayı rozeti + chevron. Acil tonlu (danger/warn) satırların solunda
 *      3 px şerit.
 * Eski yatay raf, işlerin yarısını ekran dışında bırakıyordu; "kaç iş var,
 * hangisi önce?" ancak kaydırınca anlaşılıyordu.
 *
 * İş yoksa "her şey yolunda" satırı çizilir; boş bir başlık bırakmak "bir şey
 * yüklenmedi mi?" sorusunu doğuruyordu.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { ListCard, TILE_TONE, ToneRow } from "@/components/team/ClubKit";
import type { AttentionItem } from "@/components/club/useClubSignals";
import { Badge, IconTile, Reveal, Touchable, toneColors, withAlpha } from "@/components/ui";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

export const AttentionRail = React.memo(function AttentionRail({
  items,
  onPress,
}: {
  items: AttentionItem[];
  onPress: (item: AttentionItem) => void;
}) {
  if (!items.length) {
    return (
      <View style={styles.pad}>
        <ListCard>
          <ToneRow icon="checkmark-done" tone="mint" title="Bekleyen iş yok" meta="Teklif, başvuru, yoklama ve disiplin tarafında her şey güncel." last />
        </ListCard>
      </View>
    );
  }

  const [lead, ...rest] = items;
  const tc = toneColors(lead.tone);

  return (
    <View style={[styles.pad, styles.stack]}>
      <Touchable
        onPress={() => onPress(lead)}
        feedback="card"
        accessibilityRole="button"
        accessibilityLabel={`Öncelikli iş: ${lead.title}, ${lead.count}, ${lead.subtitle}`}
        style={[styles.lead, { borderColor: withAlpha(tc.fg, 0.35), backgroundColor: tc.dim }]}
      >
        <View style={[styles.leadStripe, { backgroundColor: tc.fg }]} />
        <View style={styles.leadTop}>
          <IconTile icon={lead.icon} tone={TILE_TONE[lead.tone]} size={44} />
          <View style={styles.leadTexts}>
            <Text style={[styles.leadOverline, { color: tc.fg }]} {...textScale.badge}>
              ÖNCELİKLİ
            </Text>
            <Text style={styles.leadTitle} numberOfLines={2} {...textScale.dense}>
              {lead.title}
            </Text>
          </View>
          <Text style={[styles.leadCount, { color: tc.fg }]} {...textScale.badge}>
            {lead.count > 99 ? "99+" : lead.count}
          </Text>
        </View>
        <Text style={styles.leadSubtitle} numberOfLines={2} {...textScale.dense}>
          {lead.subtitle}
        </Text>
        <View style={[styles.leadCta, { backgroundColor: tc.fg }]}>
          <Text style={[styles.leadCtaText, { color: tc.solidFg }]} {...textScale.badge}>
            Şimdi ilgilen
          </Text>
          <Ionicons name="arrow-forward" size={14} color={tc.solidFg} />
        </View>
      </Touchable>

      {rest.length ? (
        <ListCard>
          {rest.map((item, index) => {
            const urgent = item.tone === "danger" || item.tone === "warn";
            return (
              <Reveal key={item.key} index={index} limit={8} distance={6}>
                <ToneRow
                  icon={item.icon}
                  tone={TILE_TONE[item.tone]}
                  title={item.title}
                  meta={item.subtitle}
                  stripe={urgent ? toneColors(item.tone).fg : undefined}
                  trailing={<Badge label={item.count > 99 ? "99+" : item.count} tone={item.tone} variant={urgent ? "solid" : "soft"} size="sm" />}
                  onPress={() => onPress(item)}
                  last={index === rest.length - 1}
                  accessibilityLabel={`${item.title}, ${item.count}, ${item.subtitle}`}
                />
              </Reveal>
            );
          })}
        </ListCard>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  pad: { paddingHorizontal: layout.screenPadding },
  stack: { gap: space.sm },
  lead: {
    padding: space.lg,
    paddingLeft: space.lg + space.xxs,
    gap: space.sm,
    borderRadius: radius.xl,
    borderWidth: hairline,
    overflow: "hidden",
  },
  leadStripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  leadTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  leadTexts: { flex: 1, minWidth: 0, gap: space.xxs },
  leadOverline: { ...type.overline },
  leadTitle: { ...type.h2, color: colors.textPrimary },
  leadCount: { ...type.scoreLg },
  leadSubtitle: { ...type.bodySm, color: colors.textSecondary },
  leadCta: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.s,
    borderRadius: radius.pill,
    marginTop: space.xxs,
  },
  leadCtaText: { ...type.labelSm },
});
