/**
 * MÜSAİTLİK TAKVİMİ — takım başkanı (web: AvailabilityPlanner).
 *
 * Üç adım tek ekranda: (1) her saha için tercih — Oynarız / Zorda kalırsak /
 * Uymaz; (2) oynanabilir sahada haftalık saat tablosu: hücreye dokundukça
 * boş → uygun (yeşil) → zorda kalırsak (sarı) → boş; (3) "Kaydet" ya da
 * "Yönetime gönder". Gönderilen takvim yönetimin maç planlamasında kullanılır.
 *
 * GET / PUT /api/team-availability/mine
 *
 * TASARIM (gece teması): üstte durum kartı (gönderim durumu + toplam uygun /
 * zorda saat, parçalı çubuk); her saha bir kart: IconTile + ad/konum, seçili
 * tercih hapı, üç seçenekli SegmentedControl; oynanabilir sahada haftalık
 * ızgara (gün başlıkları, saat sütunu, renk lejantı) ve saha özeti.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LegendItem, SplitBar } from "@/components/team/ClubKit";
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  IconTile,
  Reveal,
  ScreenHeader,
  SegmentedControl,
  Skeleton,
  Touchable,
  useHeaderScroll,
  useRefresh,
  useToast,
} from "@/components/ui";
import {
  getMyAvailability,
  saveMyAvailability,
  type AvailabilityVenue,
  type Preference,
  type SlotState,
} from "@/lib/api/availability";
import { formatDateShort } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

interface Draft {
  preference: Preference | null;
  slots: Record<string, SlotState>;
}

const PREFERENCES: { key: Preference; label: string; tone: "win" | "warn" | "danger" }[] = [
  { key: "yes", label: "Oynarız", tone: "win" },
  { key: "maybe", label: "Zorda kalırsak", tone: "warn" },
  { key: "no", label: "Uymaz", tone: "danger" },
];
const PREF_TILE = { yes: "mint", maybe: "gold", no: "red" } as const;

/** Taslaktaki uygun / zorda hücre sayısı (yalnız oynanabilir sahalar). */
function tally(draft: Draft): { yes: number; maybe: number } {
  if (draft.preference !== "yes" && draft.preference !== "maybe") return { yes: 0, maybe: 0 };
  const values = Object.values(draft.slots);
  return { yes: values.filter((v) => v === "yes").length, maybe: values.filter((v) => v === "maybe").length };
}

const NEXT: Record<string, SlotState | undefined> = { none: "yes", yes: "maybe", maybe: undefined };
const DAY_SHORT: Record<number, string> = { 1: "Pzt", 2: "Sal", 3: "Çar", 4: "Per", 5: "Cum", 6: "Cmt", 7: "Paz" };

export default function AvailabilityScreen() {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { scrollY, scrollProps } = useHeaderScroll();
  const [drafts, setDrafts] = useState<Record<number, Draft> | null>(null);
  const [dirty, setDirty] = useState(false);

  const query = useQuery({ queryKey: ["takim", "availability"], queryFn: getMyAvailability, enabled: Boolean(auth.user) });
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  useEffect(() => {
    if (!query.data || dirty) return;
    setDrafts(Object.fromEntries(query.data.venues.map((venue) => [venue.id, { preference: venue.preference, slots: { ...venue.slots } }])));
  }, [dirty, query.data]);

  const save = useMutation({
    mutationFn: (submit: boolean) =>
      saveMyAvailability({
        venues: Object.entries(drafts ?? {}).map(([venueId, draft]) => ({
          venue_id: Number(venueId),
          preference: draft.preference,
          slots: draft.preference === "yes" || draft.preference === "maybe" ? draft.slots : {},
        })),
        submit,
      }),
    onSuccess: async (data) => {
      toast.show({ message: data.message, tone: "success" });
      // Taslak, kaydedilen hâl sunucudan gelene kadar korunur; aksi hâlde
      // eski veriyle yeniden kurulup tablo bir an eski hâline dönerdi.
      try {
        await queryClient.refetchQueries({ queryKey: ["takim", "availability"] });
        setDirty(false);
      } catch {
        // Yenileme düşerse ekrandaki (kaydedilmiş) taslak kalır.
      }
    },
    onError: (error) => toast.show({ message: error instanceof ApiError ? error.userMessage : "Kaydedilemedi.", tone: "danger" }),
  });

  const update = (venueId: number, next: (draft: Draft) => Draft) => {
    setDirty(true);
    setDrafts((current) => {
      if (!current) return current;
      const draft = current[venueId] ?? { preference: null, slots: {} };
      return { ...current, [venueId]: next(draft) };
    });
  };

  if (!auth.user) return <Redirect href="/giris" />;

  const venues = query.data?.venues ?? [];
  const submittedAt = query.data?.submitted_at;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Müsaitlik takvimi"
        subtitle={submittedAt ? `Son gönderim ${formatDateShort(submittedAt)}` : "Henüz yönetime gönderilmedi"}
        back
        scrollY={scrollY}
      />
      {query.isLoading || (query.data && !drafts) ? (
        <View style={styles.pad}>
          <Skeleton height={104} radius="xl" />
          <Skeleton height={260} radius="xl" />
          <Skeleton height={120} radius="xl" />
        </View>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : !venues.length ? (
        <EmptyState icon="location-outline" title="Saha yok" body="İline açık bir saha bulunmuyor. Lig yönetimiyle iletişime geç." />
      ) : (
        <>
          <ScrollView {...scrollProps} contentContainerStyle={styles.content} refreshControl={refresh.control}>
            <Reveal index={0}>
              <SummaryCard
                submittedAt={submittedAt ?? null}
                dirty={dirty}
                venues={venues.length}
                playable={Object.values(drafts ?? {}).filter((d) => d.preference === "yes" || d.preference === "maybe").length}
                totals={Object.values(drafts ?? {}).reduce(
                  (sum, d) => {
                    const t = tally(d);
                    return { yes: sum.yes + t.yes, maybe: sum.maybe + t.maybe };
                  },
                  { yes: 0, maybe: 0 },
                )}
              />
            </Reveal>
            <Text style={styles.lede} {...textScale.long}>
              Her saha için tercihini seç. Oynayabileceğin sahalarda saat hücrelerine dokun: bir dokunuş uygun, iki dokunuş zorda kalırsak, üç
              dokunuş temizler.
            </Text>
            {venues.map((venue, index) => (
              <Reveal key={venue.id} index={index + 1} limit={6}>
              <VenueCard
                key={venue.id}
                venue={venue}
                draft={drafts?.[venue.id] ?? { preference: null, slots: {} }}
                onPreference={(preference) => update(venue.id, (draft) => ({ ...draft, preference }))}
                onCell={(key) =>
                  update(venue.id, (draft) => {
                    const next = NEXT[draft.slots[key] ?? "none"];
                    const slots = { ...draft.slots };
                    if (next) slots[key] = next;
                    else delete slots[key];
                    return { ...draft, slots };
                  })
                }
              />
              </Reveal>
            ))}
          </ScrollView>
          <View style={styles.bar}>
            <Button label="Kaydet" variant="secondary" onPress={() => save.mutate(false)} loading={save.isPending && save.variables === false} disabled={save.isPending} />
            <Button label="Yönetime gönder" icon="paper-plane-outline" onPress={() => save.mutate(true)} loading={save.isPending && save.variables === true} disabled={save.isPending} style={styles.flex} />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const VenueCard = React.memo(function VenueCard({
  venue,
  draft,
  onPreference,
  onCell,
}: {
  venue: AvailabilityVenue;
  draft: Draft;
  onPreference: (preference: Preference) => void;
  onCell: (key: string) => void;
}) {
  const playable = draft.preference === "yes" || draft.preference === "maybe";
  const { days, times } = venue.weekly;
  const pref = PREFERENCES.find((item) => item.key === draft.preference) ?? null;
  const counts = tally(draft);
  return (
    <View style={[styles.card, draft.preference === "no" && styles.cardOff]}>
      <View style={styles.venueHead}>
        <IconTile icon="location" tone={pref ? PREF_TILE[pref.key] : "neutral"} size={40} glow={false} />
        <View style={styles.flex}>
          <Text style={styles.venueName} numberOfLines={1} {...textScale.dense}>
            {venue.name}
          </Text>
          <Text style={styles.venueMeta} numberOfLines={1} {...textScale.dense}>
            {[venue.location, `${venue.open_label}–${venue.close_label}`].filter(Boolean).join(" · ")}
          </Text>
        </View>
        {pref ? <Badge label={pref.label} tone={pref.tone} size="xs" /> : <Badge label="Seçilmedi" tone="neutral" size="xs" />}
      </View>
      {/* Seçim yokken kaydırmalı göstergenin ilk seçeneği "seçili" gibi
          göstermemesi için tercih yapılana dek ayrı haplar çizilir. */}
      {draft.preference ? (
        <SegmentedControl
          items={PREFERENCES.map((item) => ({ key: item.key, label: item.label }))}
          value={draft.preference}
          onChange={(key) => onPreference(key as Preference)}
        />
      ) : (
        <View style={styles.chips}>
          {PREFERENCES.map((item) => (
            <Chip key={item.key} size="sm" label={item.label} tone={item.tone} selected={false} onPress={() => onPreference(item.key)} />
          ))}
        </View>
      )}
      {playable && days.length && times.length ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={styles.gridRow}>
                <View style={styles.timeCell} />
                {days.map((day) => (
                  <Text key={day.weekday} style={styles.dayHead} {...textScale.badge}>
                    {DAY_SHORT[day.weekday] ?? day.label}
                  </Text>
                ))}
              </View>
              {times.map((time) => (
                <View key={time.key} style={styles.gridRow}>
                  <Text style={[styles.timeCell, styles.timeText]} {...textScale.badge}>
                    {time.label}
                  </Text>
                  {days.map((day) => {
                    const key = `${day.weekday}:${time.key}`;
                    const state = draft.slots[key];
                    return (
                      <Touchable
                        key={key}
                        feedback="icon"
                        haptic="selection"
                        onPress={() => onCell(key)}
                        style={[styles.cell, state === "yes" && styles.cellYes, state === "maybe" && styles.cellMaybe]}
                        accessibilityRole="button"
                        accessibilityLabel={`${day.label} ${time.label}: ${state === "yes" ? "uygun" : state === "maybe" ? "zorda kalırsak" : "uygun değil"}`}
                      >
                        {state ? <Ionicons name={state === "yes" ? "checkmark" : "remove"} size={14} color={colors.onDark} /> : null}
                      </Touchable>
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
          <View style={styles.legend}>
            <LegendItem color={colors.win} label="Uygun" value={counts.yes} />
            <LegendItem color={colors.warn} label="Zorda kalırsak" value={counts.maybe} />
          </View>
        </>
      ) : draft.preference === "no" ? (
        <Text style={styles.venueMeta} {...textScale.dense}>
          Bu sahada maç planlanmaz.
        </Text>
      ) : null}
    </View>
  );
});

function SummaryCard({
  submittedAt,
  dirty,
  venues,
  playable,
  totals,
}: {
  submittedAt: string | null;
  dirty: boolean;
  venues: number;
  playable: number;
  totals: { yes: number; maybe: number };
}) {
  return (
    <View style={styles.summary}>
      <View style={styles.venueHead}>
        <IconTile icon={submittedAt && !dirty ? "checkmark-done" : "calendar"} tone={submittedAt && !dirty ? "mint" : "violet"} size={40} />
        <View style={styles.flex}>
          <Text style={styles.venueName} {...textScale.dense}>
            {dirty ? "Kaydedilmemiş değişiklik var" : submittedAt ? "Yönetime gönderildi" : "Henüz gönderilmedi"}
          </Text>
          <Text style={styles.venueMeta} numberOfLines={1} {...textScale.dense}>
            {`${playable}/${venues} sahada oynanabilir${submittedAt ? ` · son gönderim ${formatDateShort(submittedAt)}` : ""}`}
          </Text>
        </View>
      </View>
      <SplitBar
        height={8}
        parts={[
          { key: "yes", value: totals.yes, color: colors.win },
          { key: "maybe", value: totals.maybe, color: colors.warn },
        ]}
      />
      <View style={styles.legend}>
        <LegendItem color={colors.win} label="Uygun saat" value={totals.yes} />
        <LegendItem color={colors.warn} label="Zorda kalırsak" value={totals.maybe} />
      </View>
    </View>
  );
}

const CELL = 36;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  pad: { padding: layout.screenPadding, gap: space.md },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: space.md, paddingBottom: space.giant, gap: space.md },
  lede: { ...type.caption, color: colors.textSecondary },
  card: {
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.glassLine,
    backgroundColor: colors.surface1,
  },
  cardOff: { borderColor: colors.border },
  summary: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.glassLine,
    backgroundColor: colors.surface1,
  },
  venueHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  venueName: { ...type.h4, color: colors.textPrimary },
  venueMeta: { ...type.caption, color: colors.textTertiary },
  legend: { flexDirection: "row", gap: space.lg },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  gridRow: { flexDirection: "row", alignItems: "center", gap: space.xxs, marginTop: space.xxs },
  timeCell: { width: 48 },
  timeText: { ...type.caption, color: colors.textTertiary },
  dayHead: { width: CELL, textAlign: "center", ...type.caption, color: colors.textSecondary },
  cell: {
    width: CELL,
    height: CELL - 8,
    borderRadius: radius.sm,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  cellYes: { backgroundColor: colors.win, borderColor: colors.win },
  cellMaybe: { backgroundColor: colors.warn, borderColor: colors.warn },
  bar: {
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space.md,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
    backgroundColor: colors.bg,
  },
});
