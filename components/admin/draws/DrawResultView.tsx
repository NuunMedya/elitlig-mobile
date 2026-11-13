/**
 * Kura sonucunun ve fikstürün mobil görünümü.
 *
 * Web: draws/DrawResult.js + DrawFixture.js. İki biçim:
 *   GROUP   → grup kartları; her satırda takımın torbası rozetle
 *   BRACKET → tur tur bölümler; BAY geçen takım üst turda hazır görünür
 *
 * Canlandırma sırasında bileşen "yarı dolu" çizilebilir: `revealedIds`
 * verilirse yalnız çekilmiş takımlar görünür, kalan yerler boş yuva olarak
 * bekler. Son çekilen takım tek seferlik (sonlu) bir solma ile belirir.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { LinearGradient } from "expo-linear-gradient";

import { Badge, Chip, ChipGroup, TeamLogo, useReduceMotion } from "@/components/ui";
import type { DrawFixture, DrawResult, DrawTeam } from "@/lib/api/admin/draws";
import { mediaUrl } from "@/lib/format";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

function TeamLine({ team, highlight, position }: { team: DrawTeam; highlight?: boolean; position?: number }) {
  const reduce = useReduceMotion();
  const fade = useRef(new Animated.Value(highlight && !reduce ? 0 : 1)).current;
  useEffect(() => {
    if (!highlight || reduce) return;
    fade.setValue(0);
    /* Yaylı yerleşme: yuvaya hafif büyüyerek oturur (tek seferlik). */
    Animated.spring(fade, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
  }, [highlight, reduce, fade]);
  const scale = fade.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });
  return (
    <Animated.View style={[styles.line, highlight ? styles.lineNew : null, { opacity: fade, transform: [{ scale }] }]}>
      {position != null ? (
        <Text style={styles.pos} {...textScale.badge}>
          {position}
        </Text>
      ) : null}
      <TeamLogo name={team.teamName} logo={mediaUrl(team.teamLogo)} size={24} />
      <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
        {team.teamName}
      </Text>
      {team.potNumber ? <Badge label={`T${team.potNumber}`} size="xs" tone="brand" /> : null}
    </Animated.View>
  );
}

function EmptyLine({ label = "Bekliyor" }: { label?: string }) {
  return (
    <View style={[styles.line, styles.lineEmpty]}>
      <Text style={styles.empty} {...textScale.dense}>
        {label}
      </Text>
    </View>
  );
}

export function DrawResultView({ result, revealedIds, lastTeamId }: { result: DrawResult; revealedIds?: Set<number> | null; lastTeamId?: number | null }) {
  const visible = (t: DrawTeam | null) => (!t ? null : !revealedIds || revealedIds.has(Number(t.teamId)) ? t : null);

  if (result.format === "BRACKET") {
    return (
      <View style={styles.wrap}>
        {result.rounds.map((round) => (
          <View key={round.round} style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle} {...textScale.dense}>
                {round.name}
              </Text>
              <Text style={styles.count} {...textScale.dense}>
                {round.matches.length} eşleşme
              </Text>
            </View>
            {round.matches.map((m) => {
              const home = visible(m.home);
              const away = visible(m.away);
              const src = (i: number) => (round.round === 1 ? "Bekliyor" : m.sources?.[i] ? `${m.sources[i].matchNo}. maçın galibi` : "Bekliyor");
              return (
                <View key={m.index} style={styles.match}>
                  <Text style={styles.matchNo} {...textScale.badge}>
                    {m.matchNo}
                  </Text>
                  <View style={styles.flex}>
                    {home ? <TeamLine team={home} highlight={Number(home.teamId) === Number(lastTeamId)} /> : <EmptyLine label={src(0)} />}
                    {m.bye ? <EmptyLine label="BAY — tur atladı" /> : away ? <TeamLine team={away} highlight={Number(away.teamId) === Number(lastTeamId)} /> : <EmptyLine label={src(1)} />}
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {result.groups.map((g) => {
        const shown = revealedIds ? g.teams.filter((t) => revealedIds.has(Number(t.teamId))) : g.teams;
        return (
          <View key={g.index} style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.letter}>
                <LinearGradient colors={colors.gradientSignature} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.letterFill]} />
                <Text style={styles.letterText} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
                  {g.name.replace(/\s*Grubu$/i, "").slice(0, 2)}
                </Text>
              </View>
              <Text style={[styles.cardTitle, styles.grow]} {...textScale.dense}>
                {g.name} Grubu
              </Text>
              <Text style={styles.count} {...textScale.dense}>
                {shown.length}/{g.capacity}
              </Text>
            </View>
            {shown.map((t, i) => (
              <TeamLine key={t.teamId} team={t} position={i + 1} highlight={Number(t.teamId) === Number(lastTeamId)} />
            ))}
            {Array.from({ length: Math.max(0, g.capacity - shown.length) }, (_, i) => (
              <EmptyLine key={`b-${i}`} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

export function DrawFixtureView({ fixture }: { fixture: DrawFixture }) {
  const [active, setActive] = useState(0);
  const round = fixture.rounds[active] ?? fixture.rounds[0];
  const isWeeks = fixture.type === "WEEKS";
  const blocks = useMemo(() => {
    if (!round) return [];
    if (!isWeeks) return [{ key: "all", label: null as string | null, matches: round.matches }];
    const map = new Map<string, typeof round.matches>();
    round.matches.forEach((m) => {
      const k = m.groupName || "—";
      map.set(k, [...(map.get(k) ?? []), m]);
    });
    return [...map.entries()].map(([label, matches]) => ({ key: label, label, matches }));
  }, [round, isWeeks]);

  if (!fixture.rounds?.length || !round) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.count} {...textScale.dense}>
        {isWeeks
          ? `${fixture.totalRounds} hafta · ${fixture.matchCount} maç${fixture.doubleRound ? " · çift devre (rövanşlı)" : " · tek devre"}`
          : `${fixture.totalRounds} etap · ${fixture.matchCount} maç`}
      </Text>
      <ChipGroup scrollable contentPadding={0}>
        {fixture.rounds.map((r, i) => (
          <Chip key={r.name} size="sm" label={r.name} selected={i === active} onPress={() => setActive(i)} />
        ))}
      </ChipGroup>
      {!round.matches.length ? (
        <Text style={styles.empty} {...textScale.long}>
          Bu haftada oynanacak maç yok.
        </Text>
      ) : (
        blocks.map((b) => (
          <View key={b.key} style={styles.card}>
            {b.label ? (
              <Text style={styles.cardTitle} {...textScale.dense}>
                {b.label} Grubu
              </Text>
            ) : null}
            {b.matches.map((m, i) => (
              <View key={`${b.key}-${i}`} style={styles.fxRow}>
                <Text style={styles.matchNo} {...textScale.badge}>
                  {m.matchNo ?? i + 1}
                </Text>
                <Text style={[styles.fxTeam, styles.right]} numberOfLines={1} {...textScale.dense}>
                  {m.home?.teamName || m.homeSource || "Belirlenecek"}
                </Text>
                <Text style={styles.vs} {...textScale.badge}>
                  {m.bye ? "BAY" : "–"}
                </Text>
                <Text style={styles.fxTeam} numberOfLines={1} {...textScale.dense}>
                  {m.bye ? "Rakipsiz tur atladı" : m.away?.teamName || m.awaySource || "Belirlenecek"}
                </Text>
              </View>
            ))}
          </View>
        ))
      )}
      {round.byes?.length ? (
        <Text style={styles.count} {...textScale.long}>
          Bu hafta maçı olmayan: {round.byes.map((b) => `${b.team.teamName}${b.groupName ? ` (${b.groupName})` : ""}`).join(", ")}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  flex: { flex: 1, gap: space.xs },
  card: {
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm, paddingBottom: space.xs },
  grow: { flex: 1 },
  letter: { width: 28, height: 28, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  letterFill: { borderRadius: radius.sm },
  letterText: { ...type.numSmStrong, color: colors.onDark },
  cardTitle: { ...type.h4, color: colors.textPrimary },
  count: { ...type.caption, color: colors.textTertiary },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.sm,
    minHeight: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
  },
  lineNew: { backgroundColor: colors.brandDim },
  lineEmpty: { backgroundColor: colors.surface3 },
  pos: { ...type.numSmStrong, color: colors.textTertiary, width: 16 },
  name: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  empty: { ...type.caption, color: colors.textTertiary },
  match: { flexDirection: "row", gap: space.sm, alignItems: "center", paddingVertical: space.xs },
  matchNo: { ...type.numSmStrong, color: colors.textTertiary, width: 20, textAlign: "center" },
  fxRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs, borderTopWidth: hairline, borderTopColor: colors.separator },
  fxTeam: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  right: { textAlign: "right" },
  vs: { ...type.numSmStrong, color: colors.textTertiary },
});
