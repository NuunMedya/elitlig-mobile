/**
 * TAKIM MÜSAİTLİĞİ (web TeamAvailabilityAdmin) — GET /api/team-availability/admin.
 *
 * Takımların gönderdiği saha tercihleri (oynarız / zorda kalırsak / uymaz)
 * ve her sahadaki haftalık gün × saat uygunlukları. Üç görünüm:
 *   · Takımlar     — takım başına saha tercihleri; dokununca gün gün saat aralıkları
 *   · Sahalar      — saha başına gün × saat ısı tablosu; hücreye dokununca o
 *                    saatte uygun / zorda kalırsa oynayan takımlar
 *   · Çöp kutusu   — tablodan kaldırılan takımlar; geri al
 *
 * Çöpe taşıma / geri alma yalnız `venues.manage` yetkisiyle (sunucu
 * `can_manage` ile söyler) görünür ve onay ister.
 */

import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { AdminList, AdminScreen, Panel, RecordCard, confirmAction, useAdminMutation } from "@/components/admin";
import { BottomSheet, Button, Chip, ChipGroup, SegmentedControl, Touchable } from "@/components/ui";
import { timeAgo } from "@/lib/admin/format";
import {
  PREFERENCE_LABELS,
  getAvailabilityAdmin,
  restoreAvailabilityTeam,
  trashAvailabilityTeam,
  type AvailabilityAdminResponse,
  type AvailabilityAdminVenue,
  type AvailabilityPref,
} from "@/lib/api/admin/matches";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

const PERMS = ["venues.view"] as const;
const KEY = ["admin", "availability"] as const;

type Mode = "teams" | "venues" | "trash";
type TeamEntry = AvailabilityAdminResponse["teams"][number];

const PREF_TONE: Record<AvailabilityPref, "win" | "warn" | "danger"> = { yes: "win", maybe: "warn", no: "danger" };
const PREF_SHORT: Record<AvailabilityPref, string> = { yes: "Oynarız", maybe: "Zorda kalırsak", no: "Uymaz" };

/** Ardışık işaretli dilimleri "18:00–21:00" aralıklarına çevirir. */
function dayRanges(venue: AvailabilityAdminVenue, slots: Record<string, string>, status: "yes" | "maybe") {
  const times = venue.weekly.times;
  const step = venue.slot_minutes || 60;
  const toMin = (key: string) => {
    const [h, m] = key.split(":").map(Number);
    return h * 60 + m;
  };
  const fmt = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  return venue.weekly.days
    .map((d) => {
      const ranges: string[] = [];
      let start: number | null = null;
      let prev: number | null = null;
      times.forEach((t, i) => {
        const on = slots[`${d.weekday}:${t.key}`] === status;
        if (on && start == null) start = i;
        if (on) prev = i;
        if ((!on || i === times.length - 1) && start != null && prev != null) {
          ranges.push(`${times[start].label}–${fmt(toMin(times[prev].key) + step)}`);
          start = null;
          prev = null;
        }
      });
      return { label: d.label, ranges };
    })
    .filter((d) => d.ranges.length);
}

export default function AvailabilityAdminScreen() {
  const query = useQuery({ queryKey: KEY, queryFn: getAvailabilityAdmin });
  const data = query.data;
  const [mode, setMode] = useState<Mode>("teams");
  const [q, setQ] = useState("");
  const [venueFilter, setVenueFilter] = useState<number | null>(null);
  const [pref, setPref] = useState<"" | AvailabilityPref>("");
  const [teamOpen, setTeamOpen] = useState<TeamEntry | null>(null);
  const [venueOpen, setVenueOpen] = useState<AvailabilityAdminVenue | null>(null);

  const venueById = useMemo(() => new Map((data?.venues ?? []).map((v) => [Number(v.id), v])), [data]);
  const needle = q.trim().toLocaleLowerCase("tr-TR");

  const teams = useMemo(
    () =>
      (data?.teams ?? [])
        .filter((t) => (needle ? t.team.name.toLocaleLowerCase("tr-TR").includes(needle) : true))
        .filter((t) =>
          venueFilter || pref
            ? t.venues.some((v) => (!venueFilter || v.venue_id === venueFilter) && (!pref || v.preference === pref))
            : true
        )
        .sort((a, b) => a.team.name.localeCompare(b.team.name, "tr")),
    [data, needle, venueFilter, pref]
  );

  const venues = useMemo(
    () => (data?.venues ?? []).filter((v) => (needle ? v.name.toLocaleLowerCase("tr-TR").includes(needle) : true)),
    [data, needle]
  );
  const trash = useMemo(
    () => (data?.trash ?? []).filter((t) => (needle ? t.team.name.toLocaleLowerCase("tr-TR").includes(needle) : true)),
    [data, needle]
  );

  const trashMut = useAdminMutation((id: number) => trashAvailabilityTeam(id), {
    success: (res) => res?.message || "Takım çöp kutusuna taşındı.",
    invalidate: [KEY],
    onSuccess: () => setTeamOpen(null),
  });
  const restoreMut = useAdminMutation((id: number) => restoreAvailabilityTeam(id), {
    success: (res) => res?.message || "Takım geri alındı.",
    invalidate: [KEY],
  });

  const askTrash = async (t: TeamEntry) => {
    const ok = await confirmAction({
      title: "Çöp kutusuna taşı",
      message: `${t.team.name} müsaitlik tablosundan kaldırılır; verisi silinmez, Çöp kutusundan geri alınabilir.`,
      confirmLabel: "Taşı",
      destructive: true,
    });
    if (ok) trashMut.mutate(t.team.id);
  };

  const filters =
    mode === "teams"
      ? [
          { key: "", label: "Tüm tercihler" },
          { key: "yes", label: "Oynarız" },
          { key: "maybe", label: "Zorda kalırsak" },
          { key: "no", label: "Uymaz" },
        ]
      : undefined;

  const header = (
    <View style={styles.header}>
      <SegmentedControl<Mode>
        items={[
          { key: "teams", label: `Takımlar${data ? ` (${data.teams.length})` : ""}` },
          { key: "venues", label: "Sahalar" },
          { key: "trash", label: `Çöp${data?.trash.length ? ` (${data.trash.length})` : ""}` },
        ]}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setQ("");
        }}
        stretch
        size="sm"
      />
      {mode === "teams" && data?.venues.length ? (
        <ChipGroup scrollable contentPadding={0}>
          <Chip label="Tüm sahalar" size="sm" selected={venueFilter == null} onPress={() => setVenueFilter(null)} />
          {data.venues.map((v) => (
            <Chip key={v.id} label={v.name} size="sm" selected={venueFilter === Number(v.id)} onPress={() => setVenueFilter(Number(v.id))} />
          ))}
        </ChipGroup>
      ) : null}
    </View>
  );

  const common = {
    loading: query.isLoading,
    error: query.error,
    onRetry: query.refetch,
    refreshing: query.isRefetching,
    onRefresh: query.refetch,
    search: q,
    onSearch: setQ,
    extraHeader: header,
  };

  return (
    <AdminScreen title="Takım müsaitliği" subtitle={data ? `Güncellendi: ${timeAgo(data.generated_at)}` : undefined} permission={PERMS} scroll={false}>
      {mode === "teams" ? (
        <AdminList<TeamEntry>
          {...common}
          data={data ? teams : undefined}
          searchPlaceholder="Takım ara"
          filters={filters}
          filter={pref}
          onFilter={(k) => setPref(k as "" | AvailabilityPref)}
          summary={data ? `${teams.length} takım` : null}
          keyExtractor={(t) => String(t.team.id)}
          emptyIcon="time-outline"
          emptyTitle="Müsaitlik gönderen takım yok"
          emptyBody="Takımlar müsaitlik takvimini panelden gönderince burada görünür."
          renderItem={({ item }) => {
            const counts = { yes: 0, maybe: 0, no: 0 };
            item.venues.forEach((v) => v.preference && (counts[v.preference] += 1));
            return (
              <RecordCard
                title={item.team.name}
                subtitle={item.team.city || null}
                meta={item.submitted_at ? `Gönderildi: ${timeAgo(item.submitted_at)}` : "Taslak — henüz gönderilmedi"}
                avatar={{ name: item.team.name, image: item.team.logo }}
                badges={(Object.keys(counts) as AvailabilityPref[]).map((k) => (counts[k] ? { label: `${PREF_SHORT[k]} ${counts[k]}`, tone: PREF_TONE[k] } : null))}
                onPress={() => setTeamOpen(item)}
              />
            );
          }}
        />
      ) : mode === "venues" ? (
        <AdminList<AvailabilityAdminVenue>
          {...common}
          data={data ? venues : undefined}
          searchPlaceholder="Saha ara"
          summary={data ? `${venues.length} saha` : null}
          keyExtractor={(v) => String(v.id)}
          emptyIcon="location-outline"
          emptyTitle="Aktif saha yok"
          renderItem={({ item }) => {
            const cells = data?.heat?.[String(item.id)] ?? {};
            const teamCount = (data?.teams ?? []).filter((t) => t.venues.some((v) => v.venue_id === Number(item.id) && v.preference && v.preference !== "no")).length;
            const busy = Object.values(cells).filter((c) => c.yes + c.maybe >= 2).length;
            return (
              <RecordCard
                title={item.name}
                subtitle={[item.location, `${item.open_label}–${item.close_label} · ${item.slot_minutes} dk`].filter(Boolean).join(" · ")}
                meta={`${teamCount} takım oynayabilir · ${busy} saatte maç çıkar`}
                icon="location-outline"
                onPress={() => setVenueOpen(item)}
              />
            );
          }}
        />
      ) : (
        <AdminList<AvailabilityAdminResponse["trash"][number]>
          {...common}
          data={data ? trash : undefined}
          searchPlaceholder="Takım ara"
          summary={data ? `${trash.length} takım çöp kutusunda` : null}
          keyExtractor={(t) => String(t.team.id)}
          emptyIcon="trash-outline"
          emptyTitle="Çöp kutusu boş"
          renderItem={({ item }) => (
            <RecordCard
              title={item.team.name}
              subtitle={`${item.counts.yes} oynarız · ${item.counts.maybe} zorda kalırsak · ${item.counts.no} uymaz`}
              meta={[item.hidden_at ? `Kaldırıldı: ${timeAgo(item.hidden_at)}` : null, item.hidden_by?.username ? `kaldıran: ${item.hidden_by.username}` : null]
                .filter(Boolean)
                .join(" · ")}
              avatar={{ name: item.team.name, image: item.team.logo }}
              trailing={
                data?.can_manage ? (
                  <Button label="Geri al" size="sm" variant="secondary" icon="arrow-undo-outline" onPress={() => restoreMut.mutate(item.team.id)} loading={restoreMut.isPending && restoreMut.variables === item.team.id} />
                ) : undefined
              }
            />
          )}
        />
      )}

      {/* Takım ayrıntısı */}
      <BottomSheet visible={teamOpen != null} onClose={() => setTeamOpen(null)} title={teamOpen?.team.name} snap="full">
        {teamOpen ? (
          <View style={styles.stack}>
            {teamOpen.venues
              .slice()
              .sort((a, b) => ["yes", "maybe", "no", null].indexOf(a.preference) - ["yes", "maybe", "no", null].indexOf(b.preference))
              .map((v) => {
                const venue = venueById.get(v.venue_id);
                if (!venue) return null;
                const yes = dayRanges(venue, v.slots, "yes");
                const maybe = dayRanges(venue, v.slots, "maybe");
                return (
                  <Panel key={v.venue_id} title={venue.name.toLocaleUpperCase("tr-TR")}>
                    <Text style={[styles.pref, { color: v.preference ? toneColor(PREF_TONE[v.preference]) : colors.textTertiary }]} {...textScale.dense}>
                      {v.preference ? PREFERENCE_LABELS[v.preference] : "Tercih yok"}
                    </Text>
                    {yes.map((d) => (
                      <Text key={`y${d.label}`} style={styles.range} {...textScale.dense}>
                        <Text style={styles.rangeDay}>{d.label}: </Text>
                        {d.ranges.join(", ")}
                      </Text>
                    ))}
                    {maybe.length ? (
                      <Text style={styles.maybeTitle} {...textScale.dense}>
                        Zorda kalırsak
                      </Text>
                    ) : null}
                    {maybe.map((d) => (
                      <Text key={`m${d.label}`} style={styles.range} {...textScale.dense}>
                        <Text style={styles.rangeDay}>{d.label}: </Text>
                        {d.ranges.join(", ")}
                      </Text>
                    ))}
                    {v.preference !== "no" && !yes.length && !maybe.length ? (
                      <Text style={styles.muted} {...textScale.dense}>
                        Saat işaretlenmedi.
                      </Text>
                    ) : null}
                  </Panel>
                );
              })}
            {data?.can_manage ? (
              <Button label="Çöp kutusuna taşı" icon="trash-outline" variant="danger" onPress={() => void askTrash(teamOpen)} loading={trashMut.isPending} fullWidth />
            ) : null}
          </View>
        ) : null}
      </BottomSheet>

      {/* Saha ısı tablosu */}
      <VenueHeatSheet venue={venueOpen} data={data} onClose={() => setVenueOpen(null)} />
    </AdminScreen>
  );
}

function toneColor(tone: "win" | "warn" | "danger") {
  return tone === "win" ? colors.win : tone === "warn" ? colors.warn : colors.danger;
}

function VenueHeatSheet({
  venue,
  data,
  onClose,
}: {
  venue: AvailabilityAdminVenue | null;
  data: AvailabilityAdminResponse | undefined;
  onClose: () => void;
}) {
  const [cell, setCell] = useState<string | null>(null);
  const [onlyYes, setOnlyYes] = useState(false);
  const heat = venue ? data?.heat?.[String(venue.id)] ?? {} : {};
  const count = (key: string) => {
    const c = heat[key];
    return c ? c.yes + (onlyYes ? 0 : c.maybe) : 0;
  };
  const max = Math.max(1, ...Object.keys(heat).map(count));

  const cellTeams = useMemo(() => {
    if (!venue || !cell) return { yes: [] as string[], maybe: [] as string[] };
    const yes: string[] = [];
    const maybe: string[] = [];
    for (const t of data?.teams ?? []) {
      const v = t.venues.find((x) => x.venue_id === Number(venue.id));
      if (!v || v.preference === "no") continue;
      const s = v.slots[cell];
      if (s === "yes") yes.push(t.team.name);
      else if (s === "maybe") maybe.push(t.team.name);
    }
    return { yes, maybe };
  }, [venue, cell, data]);

  const cellTitle = (() => {
    if (!venue || !cell) return "";
    const [day, ...rest] = cell.split(":");
    return `${venue.weekly.days.find((d) => String(d.weekday) === day)?.label ?? day} ${rest.join(":")}`;
  })();

  return (
    <BottomSheet
      visible={venue != null}
      onClose={() => {
        setCell(null);
        onClose();
      }}
      title={venue?.name}
      snap="full"
    >
      {venue ? (
        <View style={styles.stack}>
          <ChipGroup scrollable={false} contentPadding={0}>
            <Chip label="Sarı saatleri de say" size="sm" selected={!onlyYes} onPress={() => setOnlyYes(false)} />
            <Chip label="Yalnız uygun" size="sm" selected={onlyYes} onPress={() => setOnlyYes(true)} />
          </ChipGroup>
          <Text style={styles.muted} {...textScale.dense}>
            Hücredeki sayı o saatte oynayabilecek takım sayısı. İki ve üstü bir maç çıkarır. Dokununca takımlar listelenir.
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={styles.gridRow}>
                <View style={styles.timeCell} />
                {venue.weekly.days.map((d) => (
                  <Text key={d.weekday} style={styles.dayHead} numberOfLines={1} {...textScale.badge}>
                    {d.label.slice(0, 3)}
                  </Text>
                ))}
              </View>
              {venue.weekly.times.map((t) => (
                <View key={t.key} style={styles.gridRow}>
                  <Text style={styles.timeCell} {...textScale.badge}>
                    {t.label}
                  </Text>
                  {venue.weekly.days.map((d) => {
                    const key = `${d.weekday}:${t.key}`;
                    const n = count(key);
                    const strong = n >= 2;
                    return (
                      <Touchable
                        key={key}
                        onPress={() => setCell(key)}
                        style={[
                          styles.cell,
                          n ? { backgroundColor: strong ? colors.winDim : colors.warnDim, opacity: 0.45 + 0.55 * (n / max) } : null,
                          cell === key ? styles.cellOn : null,
                        ]}
                        accessibilityLabel={`${d.label} ${t.label}: ${n} takım`}
                      >
                        <Text style={styles.cellText} {...textScale.badge}>
                          {n || ""}
                        </Text>
                      </Touchable>
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
          {cell ? (
            <Panel title={cellTitle.toLocaleUpperCase("tr-TR")}>
              <Text style={styles.pref} {...textScale.dense}>
                {cellTeams.yes.length} uygun · {cellTeams.maybe.length} zorda kalırsak
                {cellTeams.yes.length + cellTeams.maybe.length >= 2 ? ` · ${Math.floor((cellTeams.yes.length + cellTeams.maybe.length) / 2)} maç çıkar` : ""}
              </Text>
              {cellTeams.yes.map((n) => (
                <Text key={`y${n}`} style={styles.range} {...textScale.dense}>
                  <Text style={{ color: colors.win }}>Uygun · </Text>
                  {n}
                </Text>
              ))}
              {cellTeams.maybe.map((n) => (
                <Text key={`m${n}`} style={styles.range} {...textScale.dense}>
                  <Text style={{ color: colors.warn }}>Zorda kalırsak · </Text>
                  {n}
                </Text>
              ))}
            </Panel>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}

const CELL = 40;

const styles = StyleSheet.create({
  header: { gap: space.sm },
  stack: { gap: space.md },
  pref: { ...type.label, color: colors.textPrimary },
  range: { ...type.bodySm, color: colors.textSecondary },
  rangeDay: { ...type.label, color: colors.textPrimary },
  maybeTitle: { ...type.overline, color: colors.warn, marginTop: space.xs },
  muted: { ...type.caption, color: colors.textTertiary },
  gridRow: { flexDirection: "row", gap: 2, marginBottom: 2 },
  timeCell: { width: 48, ...type.micro, color: colors.textTertiary, alignSelf: "center" },
  dayHead: { width: CELL, ...type.micro, color: colors.textSecondary, textAlign: "center" },
  cell: {
    width: CELL,
    height: 28,
    borderRadius: radius.xs,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: hairline,
    borderColor: colors.border,
  },
  cellOn: { borderColor: colors.brand, borderWidth: 2 },
  cellText: { ...type.labelXs, color: colors.textPrimary },
});
