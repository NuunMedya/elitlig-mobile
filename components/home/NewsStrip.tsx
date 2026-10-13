/**
 * NewsStrip — kapağı olan son haberler, yatay kaydırmalı kompakt kartlar.
 *
 * NEDEN EN ALTTA VE KÜÇÜK: Ana Sayfa bir ARAÇ sayfasıdır — önce maç, puan ve
 * gol; haber en altta. Eski 16:10 manşet karuseli sayfayı bir fotoğrafla
 * açıyor ve "dergi" gibi okutuyordu. Kart 216px, görsel 16:10, iki satır
 * başlık; bir sonraki kartın kenarı görünür kalır ki kaydırılabildiği belli
 * olsun.
 */

import React from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { Touchable } from "@/components/ui";
import { mediaUrl, timeAgo } from "@/lib/format";
import type { NewsItem } from "@/lib/types";
import { colors, elevate, layout, radius, space, textScale, type, upperTR } from "@/theme";

const CARD_WIDTH = 216;
/** elevate(1) gölgesinin taşma payı — gölge aşağı düştüğü için alt pay büyük;
    üst pay küçük tutulur ki şerit, başlıktaki "Tümü" düğmesinin üstüne binmesin. */
const SHADOW_TOP = space.sm;
const SHADOW_BOTTOM = space.xl;

export interface NewsStripProps {
  items: NewsItem[];
  onOpen: (id: NewsItem["id"]) => void;
}

export const NewsStrip = React.memo(function NewsStrip({ items, onOpen }: NewsStripProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroller}
      contentContainerStyle={styles.strip}
      decelerationRate="fast"
      snapToInterval={CARD_WIDTH + space.m}
      snapToAlignment="start"
    >
      {items.map((item) => {
        const category = item.category_label ?? item.category;
        return (
          <Touchable
            key={item.id}
            feedback="card"
            haptic="selection"
            onPress={() => onOpen(item.id)}
            style={styles.card}
            accessibilityRole="button"
            accessibilityLabel={item.title}
          >
            <Image
              source={{ uri: mediaUrl(item.cover_image_url) ?? undefined }}
              style={styles.image}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
            <View style={styles.body}>
              {category ? (
                <Text style={styles.eyebrow} numberOfLines={1} {...textScale.badge}>
                  {upperTR(String(category))}
                </Text>
              ) : null}
              <Text style={styles.title} numberOfLines={2} {...textScale.dense}>
                {item.title}
              </Text>
              <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
                {timeAgo(item.published_at)}
              </Text>
            </View>
          </Touchable>
        );
      })}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  /* Gölge ScrollView'un kenarında kırpılmasın diye şerit dikeyde gölge payı
     kadar genişletilir, kap aynı payı negatif boşlukla geri alır. */
  scroller: {
    marginTop: -SHADOW_TOP,
    marginBottom: -SHADOW_BOTTOM,
  },
  strip: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: SHADOW_TOP,
    paddingBottom: SHADOW_BOTTOM,
    gap: space.m,
  },
  card: {
    ...elevate(1),
    width: CARD_WIDTH,
    borderRadius: radius.xl,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    aspectRatio: 16 / 10,
    backgroundColor: colors.surface3,
  },
  body: {
    paddingHorizontal: space.md,
    paddingTop: space.m,
    paddingBottom: space.md,
    gap: space.xs,
  },
  eyebrow: {
    ...type.overline,
    color: colors.brandAccent,
  },
  title: {
    ...type.h4,
    color: colors.textPrimary,
    minHeight: type.h4.lineHeight * 2,
  },
  meta: {
    ...type.caption,
    color: colors.textTertiary,
  },
});
