/**
 * KARİYERİM ANA SAYFASI PARÇALARI — eylem rayı, sıradaki maç, son performans.
 *
 * Hepsi kâğıt yüzeydir (beyaz kart + kıl çizgisi); renk yalnız ANLAM taşır:
 * eylem kartının sol şeridi ve ikon pulu işin tonunu, skor kutusu sonucu.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { AvailabilityPicker } from "@/components/club/AvailabilityPicker";
import { daysUntil, matchWhen } from "@/components/club/NextMatchCard";
import { Badge, GradientFill, TeamLogo, Touchable, toneColors, type Tone } from "@/components/ui";
import type { OverviewRecentRow } from "@/lib/api/member/player";
import type { MyMatch } from "@/lib/api/panel";
import { formatDateShort, formatDecimal } from "@/lib/format";
import { colors, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

type IconName = keyof typeof Ionicons.glyphMap;

/* ══════════════════════════ ŞİMDİ İLGİLEN ══════════════════════════ */

export interface HomeAction {
  key: string;
  icon: IconName;
  tone: Tone;
  title: string;
  subtitle: string;
  /** Büyük rakam — yoksa ikon tek başına durur. */
  count?: number;
  cta: string;
  /** Büyük olan önde: süre baskısı > karar > bilgi. */
  weight: number;
  onPress: () => void;
}

/**
 * Yatay kaydırılan eylem kartları. NEDEN YATAY: dikey listede beşinci iş
 * ekranın altına düşüyor ve "kaç işim var" sorusu ancak kaydırarak
 * yanıtlanıyordu. Rayda ilk iki kart tam, üçüncüsü yarım görünür — yarım kart
 * "daha var" der; sayı başlıkta yazar.
 */
export const ActionRail = React.memo(function ActionRail({ items }: { items: HomeAction[] }) {
  if (!items.length) {
    return (
      <View style={styles.allClear}>
        <View style={[styles.actionIcon, { backgroundColor: colors.winDim }]}>
          <Ionicons name="checkmark-done" size={18} color={colors.win} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.allClearTitle} {...textScale.dense}>
            Her şey yolunda
          </Text>
          <Text style={styles.allClearText} numberOfLines={2} {...textScale.dense}>
            Yanıt bekleyen teklif, davet, yoklama ya da disiplin dosyan yok.
          </Text>
        </View>
      </View>
    );
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.railBleed}
      contentContainerStyle={styles.rail}
      decelerationRate="fast"
      snapToInterval={ACTION_W + space.sm}
    >
      {items.map((item) => {
        const tc = toneColors(item.tone);
        return (
          <Touchable
            key={item.key}
            feedback="card"
            haptic="selection"
            onPress={item.onPress}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}${item.count ? `, ${item.count}` : ""}. ${item.subtitle}`}
            style={styles.action}
          >
            <View style={[styles.actionStripe, { backgroundColor: tc.fg }]} />
            <View style={styles.actionTop}>
              <View style={[styles.actionIcon, { backgroundColor: tc.dim }]}>
                <Ionicons name={item.icon} size={17} color={tc.fg} />
              </View>
              {item.count != null && item.count > 0 ? (
                <Text style={[styles.actionCount, { color: tc.fg }]} {...textScale.badge}>
                  {item.count > 99 ? "99+" : item.count}
                </Text>
              ) : null}
            </View>
            <Text style={styles.actionTitle} numberOfLines={1} {...textScale.dense}>
              {item.title}
            </Text>
            <Text style={styles.actionSubtitle} numberOfLines={2} {...textScale.dense}>
              {item.subtitle}
            </Text>
            <View style={styles.actionCta}>
              <Text style={[styles.actionCtaText, { color: tc.fg }]} numberOfLines={1} {...textScale.dense}>
                {item.cta}
              </Text>
              <Ionicons name="arrow-forward" size={13} color={tc.fg} />
            </View>
          </Touchable>
        );
      })}
    </ScrollView>
  );
});

/* ══════════════════════════ SIRADAKİ MAÇ ══════════════════════════ */

/**
 * Sıradaki maç: iki takım, tarih/saat/saha, geri sayım ve ALTINDA "geliyor
 * musun?" seçimi. Yoklama kartın içindedir — ayrı bir ekrana gitmeden tek
 * dokunuşla yanıtlanır (web Maçlarım'daki katılım yanıtı).
 */
export const NextMatchPanel = React.memo(function NextMatchPanel({
  match,
  teamName,
  teamLogo,
  onOpen,
}: {
  match: MyMatch;
  teamName: string | null;
  teamLogo: string | null;
  onOpen: () => void;
}) {
  const opponent = match.opponent_name ?? (match.is_home ? match.second_team_name : match.first_team_name);
  const ours = teamName ?? (match.is_home ? match.first_team_name : match.second_team_name);
  const home = match.is_home ? { name: ours, logo: teamLogo } : { name: opponent, logo: null };
  const away = match.is_home ? { name: opponent, logo: null } : { name: ours, logo: teamLogo };
  const countdown = daysUntil(match.date);

  return (
    <View style={styles.match}>
      <GradientFill tone="card" radius="xl" />
      <Touchable
        feedback="card"
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${opponent ?? "Rakip"} maçı, ${matchWhen(match.date, match.time)}`}
      >
        <View style={styles.matchHead}>
          <Text style={styles.matchEyebrow} numberOfLines={1} {...textScale.badge}>
            {upperTR(match.is_home ? "Ev sahibi" : "Deplasman")}
          </Text>
          {match.in_squad ? <Badge label="KADRODASIN" tone="win" size="xs" icon="checkmark" /> : null}
          <View style={styles.flex} />
          {countdown ? (
            <View style={styles.countdown}>
              <Text style={styles.countdownText} {...textScale.badge}>
                {upperTR(countdown)}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.board}>
          <View style={styles.side}>
            <TeamLogo name={home.name ?? "Ev"} logo={home.logo} size={40} />
            <Text style={styles.sideName} numberOfLines={2} {...textScale.dense}>
              {home.name ?? "Ev sahibi"}
            </Text>
          </View>
          <View style={styles.center}>
            <Text style={styles.vs} {...textScale.badge}>
              VS
            </Text>
            <Text style={styles.when} numberOfLines={2} {...textScale.dense}>
              {matchWhen(match.date, match.time)}
            </Text>
          </View>
          <View style={styles.side}>
            <TeamLogo name={away.name ?? "Dep"} logo={away.logo} size={40} />
            <Text style={styles.sideName} numberOfLines={2} {...textScale.dense}>
              {away.name ?? "Deplasman"}
            </Text>
          </View>
        </View>

        {match.match_field ? (
          <View style={styles.fieldRow}>
            <Ionicons name="location-outline" size={12} color={colors.textTertiary} />
            <Text style={styles.field} numberOfLines={1} {...textScale.dense}>
              {match.match_field}
            </Text>
          </View>
        ) : null}
      </Touchable>

      <View style={styles.rsvp}>
        <Text style={styles.rsvpLabel} {...textScale.badge}>
          {upperTR("Geliyor musun?")}
        </Text>
        <AvailabilityPicker matchId={match.id} />
      </View>
    </View>
  );
});

/* ══════════════════════════ SON PERFORMANS ══════════════════════════ */

const RESULT_TONE: Record<"W" | "D" | "L", { fg: string; bg: string }> = {
  W: { fg: colors.win, bg: colors.winDim },
  D: { fg: colors.draw, bg: colors.drawDim },
  L: { fg: colors.loss, bg: colors.lossDim },
};

/** Son maçlardaki KİŞİSEL performans: skor (sonuç renginde), gol/asist, puan. */
export const RecentForm = React.memo(function RecentForm({
  rows,
  onOpen,
}: {
  rows: OverviewRecentRow[];
  onOpen: (matchId: number) => void;
}) {
  return (
    <View style={styles.list}>
      {rows.map((row, index) => {
        const tone = RESULT_TONE[row.result] ?? RESULT_TONE.D;
        const contrib = [row.goals ? `${row.goals} gol` : null, row.assists ? `${row.assists} asist` : null]
          .filter(Boolean)
          .join(" · ");
        return (
          <Touchable
            key={row.match_id}
            onPress={() => onOpen(row.match_id)}
            accessibilityRole="button"
            accessibilityLabel={`${row.opponent ?? "Rakip"} maçı, ${row.score}`}
          >
            <View style={[styles.formRow, index > 0 && styles.formDivider]}>
              <View style={[styles.score, { backgroundColor: tone.bg }]}>
                <Text style={[styles.scoreText, { color: tone.fg }]} {...textScale.badge}>
                  {row.score}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.formTitle} numberOfLines={1} {...textScale.dense}>
                  {row.opponent ?? "Rakip"}
                </Text>
                <Text style={styles.formMeta} numberOfLines={1} {...textScale.dense}>
                  {[formatDateShort(row.date), row.started ? "İlk 11" : "Yedek", contrib || null]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
              {row.rating != null && Number(row.rating) > 0 ? (
                <View style={styles.rating}>
                  <Text style={styles.ratingText} {...textScale.badge}>
                    {formatDecimal(row.rating, 1)}
                  </Text>
                </View>
              ) : null}
              <Ionicons name="chevron-forward" size={13} color={colors.textTertiary} />
            </View>
          </Touchable>
        );
      })}
    </View>
  );
});

/* ══════════════════════════════ STİLLER ══════════════════════════════ */

const ACTION_W = 208;

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  /** Ray kenardan kenara kayar; bölümün kenar payı geri alınır. */
  railBleed: { marginHorizontal: -layout.screenPadding },
  rail: { paddingHorizontal: layout.screenPadding, gap: space.sm },
  action: {
    width: ACTION_W,
    padding: space.md,
    paddingLeft: space.md + space.xs,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
    gap: space.xs,
  },
  actionStripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  actionTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.xxs },
  actionIcon: { width: 34, height: 34, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  actionCount: { ...type.metric },
  actionTitle: { ...type.h4, color: colors.textPrimary },
  actionSubtitle: { ...type.caption, color: colors.textSecondary, minHeight: 30 },
  actionCta: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: space.xxs },
  actionCtaText: { ...type.labelSm },

  allClear: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  allClearTitle: { ...type.h4, color: colors.textPrimary },
  allClearText: { ...type.caption, color: colors.textSecondary, marginTop: space.xxs },

  match: {
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.border,
    padding: space.md,
    gap: space.md,
    backgroundColor: colors.surface1,
  },
  matchHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  matchEyebrow: { ...type.micro, color: colors.brandAccent },
  countdown: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.brandDim,
  },
  countdownText: { ...type.micro, color: colors.brandAccent },
  board: { flexDirection: "row", alignItems: "center", marginTop: space.md },
  side: { flex: 1, alignItems: "center", gap: space.xs },
  sideName: { ...type.label, color: colors.textPrimary, textAlign: "center" },
  center: { width: 96, alignItems: "center", gap: space.xxs },
  vs: { ...type.scoreSm, color: colors.textTertiary },
  when: { ...type.caption, color: colors.textSecondary, textAlign: "center" },
  fieldRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs, marginTop: space.sm },
  field: { ...type.caption, color: colors.textTertiary, flexShrink: 1 },
  rsvp: { gap: space.s, paddingTop: space.md, borderTopWidth: hairline, borderTopColor: colors.border },
  rsvpLabel: { ...type.micro, color: colors.textTertiary },

  list: {
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
    overflow: "hidden",
  },
  formRow: { flexDirection: "row", alignItems: "center", gap: space.m, paddingHorizontal: space.md, paddingVertical: space.m },
  formDivider: { borderTopWidth: hairline, borderTopColor: colors.border },
  score: { minWidth: 46, alignItems: "center", paddingVertical: space.xs, borderRadius: radius.sm },
  scoreText: { ...type.tableNumStrong },
  formTitle: { ...type.h4, color: colors.textPrimary },
  formMeta: { ...type.caption, color: colors.textTertiary, marginTop: space.xxs },
  rating: {
    paddingHorizontal: space.s,
    paddingVertical: space.xxs,
    borderRadius: radius.xs,
    backgroundColor: colors.brandDim,
  },
  ratingText: { ...type.numSmStrong, color: colors.brandAccent },
});
