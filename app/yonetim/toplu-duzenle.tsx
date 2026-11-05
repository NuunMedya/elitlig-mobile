/**
 * TOPLU MAÇ DÜZENLEME (web matchBulk/MatchBulkEdit + mobil zaman/durum modu).
 *
 * İKİ MOD:
 *   · Zaman ve durum — maçlar çoklu seçilir; tarih, saat, saha ve durum
 *     seçilenlerin hepsine birden yazılır (maç başına PATCH /maclar/:id; boş
 *     bırakılan alan değişmez). Sonuçta kaç maçın kaydedildiği söylenir.
 *   · İçerik — web tablosunun karşılığı: her maçın manşet, kapak, canlı yayın,
 *     röportaj ve fotoğraflar bağlantısı satır satır taslağa yazılır; "Tümünü
 *     kaydet" değişenleri tek PUT /maclar/toplu-icerik isteğinde gönderir.
 *
 * Masaüstündeki Excel'den yapıştırma ve hücreler arası klavye gezintisi
 * telefonda anlamsız olduğu için satır başına alt sayfa formuna çevrildi.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import {
  AdminList,
  AdminScreen,
  FieldBox,
  FormSheet,
  RecordCard,
  confirmAction,
  type FieldDef,
  type FormValues,
} from "@/components/admin";
import { ScopeFields, useInitialScope, type AdminScope } from "@/components/admin/matches/ScopeFields";
import { dayOf, hhmm, shortDay } from "@/components/admin/matches/model";
import { Note, statusTone } from "@/components/admin/matches/parts";
import { BottomSheet, Button, Chip, ChipGroup, SegmentedControl, useToast } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { errorText } from "@/lib/admin/errors";
import { isoDay } from "@/lib/admin/format";
import { getAdminMatches } from "@/lib/api/admin";
import {
  BULK_CONTENT_FIELDS,
  MATCH_STATUS_OPTIONS,
  getActiveVenues,
  normalizeMatchStatus,
  readBulkValue,
  saveBulkContent,
  statusLabelOf,
  updateMatch,
  validateBulkValue,
  type BulkContentKey,
} from "@/lib/api/admin/matches";
import type { ApiMatch } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { colors, layout, space, textScale, type } from "@/theme";

const PERMS = ["matches.bulk_edit"] as const;

type Mode = "schedule" | "content";

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Tarih ön ayarları (matchListFilters.DATE_PRESETS) — [başlangıç, bitiş) gün aralığı. */
const DATE_PRESETS: { key: string; label: string; range?: (today: string) => [string | null, string | null] }[] = [
  { key: "", label: "Tüm tarihler" },
  { key: "today", label: "Bugün", range: (t) => [t, addDays(t, 1)] },
  {
    key: "week",
    label: "Bu hafta",
    range: (t) => {
      const day = (new Date(`${t}T12:00:00`).getDay() + 6) % 7;
      const monday = addDays(t, -day);
      return [monday, addDays(monday, 7)];
    },
  },
  { key: "next7", label: "Gelecek 7 gün", range: (t) => [t, addDays(t, 7)] },
  { key: "last7", label: "Son 7 gün", range: (t) => [addDays(t, -6), addDays(t, 1)] },
  { key: "last30", label: "Son 30 gün", range: (t) => [addDays(t, -29), addDays(t, 1)] },
  { key: "past", label: "Geçmiş", range: (t) => [null, t] },
  { key: "upcoming", label: "Bugün ve sonrası", range: (t) => [t, null] },
];

type Drafts = Record<number, Partial<Record<BulkContentKey, string>>>;

export default function BulkEditScreen() {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const initial = useInitialScope();
  const canSchedule = hasAnyPermission(auth.user, ["matches.update"]);
  const canCover = hasAnyPermission(auth.user, ["matches.update"]);

  const [scopeOverride, setScopeOverride] = useState<AdminScope | null>(null);
  const scope = scopeOverride ?? initial;
  const [scopeOpen, setScopeOpen] = useState(false);
  const [scopeDraft, setScopeDraft] = useState<AdminScope | null>(null);

  const [mode, setMode] = useState<Mode>(canSchedule ? "schedule" : "content");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [preset, setPreset] = useState("upcoming");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [contentFor, setContentFor] = useState<ApiMatch | null>(null);
  const [saving, setSaving] = useState(false);

  const query = useQuery({
    queryKey: ["admin", "matches", "bulk", scope?.leagueId, scope?.seasonId],
    queryFn: () => getAdminMatches({ leagueId: scope?.leagueId ?? undefined, seasonId: scope?.seasonId ?? undefined, limit: 500 }),
    enabled: Boolean(scope?.leagueId && scope?.seasonId),
  });
  const venues = useQuery({ queryKey: ["admin", "matches", "venues"], queryFn: getActiveVenues, staleTime: 5 * 60_000 });

  const list = useMemo(() => {
    const today = isoDay();
    const range = DATE_PRESETS.find((p) => p.key === preset)?.range?.(today) ?? [null, null];
    const needle = q.trim().toLocaleLowerCase("tr-TR");
    return (query.data ?? [])
      .filter((m) => (status ? normalizeMatchStatus(m.mac_durumu) === status : true))
      .filter((m) => {
        const d = dayOf(m.date);
        if (range[0] && (!d || d < range[0])) return false;
        if (range[1] && (!d || d >= range[1])) return false;
        return true;
      })
      .filter((m) =>
        needle
          ? `${m.first_team_name} ${m.second_team_name} ${m.match_field ?? ""}`.toLocaleLowerCase("tr-TR").includes(needle)
          : true
      )
      .sort((a, b) => `${dayOf(a.date)}${a.time}`.localeCompare(`${dayOf(b.date)}${b.time}`));
  }, [query.data, status, preset, q]);

  const byId = useMemo(() => new Map((query.data ?? []).map((m) => [Number(m.id), m])), [query.data]);

  /* ───────── içerik taslakları ───────── */
  const changes = useMemo(() => {
    const items: ({ id: number } & Partial<Record<BulkContentKey, string>>)[] = [];
    let count = 0;
    Object.entries(drafts).forEach(([id, fields]) => {
      const match = byId.get(Number(id));
      if (!match) return;
      const item: { id: number } & Partial<Record<BulkContentKey, string>> = { id: Number(id) };
      (Object.entries(fields) as [BulkContentKey, string][]).forEach(([key, value]) => {
        if (value.trim() === readBulkValue(match, key)) return;
        item[key] = value.trim();
        count += 1;
      });
      if (Object.keys(item).length > 1) items.push(item);
    });
    return { items, count };
  }, [drafts, byId]);

  const saveContent = async () => {
    if (!changes.items.length) return;
    setSaving(true);
    try {
      const res = await saveBulkContent(changes.items);
      const failed = new Set((res.errors ?? []).map((e) => Number(e.id)));
      setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([id]) => failed.has(Number(id)))));
      void queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
      if (res.errors?.length) {
        Alert.alert(
          `${res.updated?.length ?? 0} maç kaydedildi`,
          res.errors
            .map((e) => {
              const m = byId.get(Number(e.id));
              return `${m ? `${m.first_team_name} – ${m.second_team_name}` : `#${e.id}`}: ${e.error}`;
            })
            .join("\n")
        );
      } else {
        toast.show({ message: res.message || "Maçlar kaydedildi.", tone: "success" });
      }
    } catch (error) {
      toast.show({ message: errorText(error), tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  /* ───────── zaman / durum toplu yazımı ───────── */
  const venueOptions = (venues.data ?? []).map((v) => ({ value: v.name, label: v.name }));
  const scheduleFields: FieldDef[] = [
    { key: "date", label: "Tarih", kind: "date", hint: "Boş bırakılırsa değişmez." },
    { key: "time", label: "Saat (SS:DD)", kind: "text", placeholder: "Ör. 20:30", hint: "Boş bırakılırsa değişmez.", maxLength: 5 },
    { key: "match_field", label: "Saha", kind: "select", options: venueOptions, placeholder: "Değişmesin" },
    {
      key: "mac_durumu",
      label: "Durum",
      kind: "select",
      options: MATCH_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
      placeholder: "Değişmesin",
    },
  ];

  const applySchedule = async (values: FormValues) => {
    const body: Record<string, unknown> = {};
    if (values.date) body.date = String(values.date).slice(0, 10);
    if (values.time) {
      const m = String(values.time).trim().match(/^(\d{1,2})[:.](\d{2})$/);
      if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error("Saat SS:DD biçiminde olmalı (ör. 20:30).");
      body.time = `${m[1].padStart(2, "0")}:${m[2]}`;
    }
    if (values.match_field) body.match_field = values.match_field;
    if (values.mac_durumu) body.mac_durumu = values.mac_durumu;
    if (!Object.keys(body).length) throw new Error("Değiştirilecek en az bir alan seç.");
    if (body.mac_durumu === "yayinlanmis" || body.mac_durumu === "taslak") {
      const ok = await confirmAction({
        title: `${selected.size} maç ${body.mac_durumu === "yayinlanmis" ? "tamamlanacak" : "taslağa alınacak"}`,
        message:
          body.mac_durumu === "yayinlanmis"
            ? "Skorlar kesinleşir, puan durumu yeniden hesaplanır ve üyelere sonuç bildirimi gider."
            : "Maçlar üye tarafında görünmez olur ve puan durumundan düşer.",
        confirmLabel: "Devam",
      });
      if (!ok) throw new Error("İşlem iptal edildi.");
    }
    const ids = [...selected];
    const failures: string[] = [];
    // Sıralı: sunucu her maçta puan durumunu ve bildirimleri ayrı ayrı işler.
    for (const id of ids) {
      try {
        await updateMatch(id, body);
      } catch (error) {
        const m = byId.get(id);
        failures.push(`${m ? `${m.first_team_name} – ${m.second_team_name}` : `#${id}`}: ${errorText(error)}`);
      }
    }
    void queryClient.invalidateQueries({ queryKey: ["admin", "matches"] });
    setSelected(new Set());
    if (failures.length) {
      Alert.alert(`${ids.length - failures.length} / ${ids.length} maç kaydedildi`, failures.join("\n"));
    } else {
      toast.show({ message: `${ids.length} maç güncellendi.`, tone: "success" });
    }
  };

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allVisibleSelected = list.length > 0 && list.every((m) => selected.has(Number(m.id)));

  const contentFields: FieldDef[] = BULK_CONTENT_FIELDS.map((f) => ({
    key: f.key,
    label: f.label,
    kind: f.kind === "url" ? "url" : "text",
    placeholder: f.placeholder,
    maxLength: 255,
    disabled: f.key === "match_picture" && !canCover,
    hint: f.key === "match_picture" && !canCover ? "Kapak için maç güncelleme yetkisi gerekir." : undefined,
  }));

  const scopeText = scope ? [scope.cityLabel, scope.leagueLabel, scope.seasonLabel].filter(Boolean).join(" · ") : "";

  const overlay =
    mode === "schedule" ? (
      selected.size ? (
        <View style={styles.bar}>
          <Button label={`Seçilenleri düzenle (${selected.size})`} icon="create-outline" onPress={() => setFormOpen(true)} fullWidth />
        </View>
      ) : null
    ) : changes.count ? (
      <View style={styles.bar}>
        <Button label={`Tümünü kaydet (${changes.count} değişiklik)`} icon="save-outline" onPress={saveContent} loading={saving} fullWidth haptic="success" />
      </View>
    ) : null;

  return (
    <AdminScreen title="Toplu düzenleme" subtitle={scopeText || undefined} permission={PERMS} scroll={false} overlay={overlay}>
      <AdminList
        data={query.data ? list : undefined}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        refreshing={query.isRefetching}
        onRefresh={query.refetch}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Takım ya da saha ara"
        filters={[{ key: "", label: "Tümü" }, ...MATCH_STATUS_OPTIONS.map((o) => ({ key: o.value, label: o.label }))]}
        filter={status}
        onFilter={setStatus}
        summary={query.data ? `${list.length} maç${mode === "schedule" && selected.size ? ` · ${selected.size} seçili` : ""}` : null}
        keyExtractor={(m) => String(m.id)}
        emptyIcon="football-outline"
        emptyTitle={scope?.seasonId ? "Maç bulunamadı" : "Kapsam seç"}
        emptyBody={scope?.seasonId ? "Tarih ya da durum süzgecini değiştir." : "Düzenlenecek maçlar için il, lig ve sezon seç."}
        emptyAction={!scope?.seasonId ? { label: "Kapsam seç", onPress: () => { setScopeDraft(scope); setScopeOpen(true); } } : undefined}
        extraHeader={
          <View style={styles.header}>
            <FieldBox
              value={scopeText || null}
              placeholder="İl · lig · sezon seç"
              icon="options-outline"
              onPress={() => {
                setScopeDraft(scope);
                setScopeOpen(true);
              }}
            />
            {canSchedule ? (
              <SegmentedControl<Mode>
                items={[
                  { key: "schedule", label: "Zaman ve durum" },
                  { key: "content", label: "İçerik", dot: changes.count > 0 },
                ]}
                value={mode}
                onChange={setMode}
                stretch
                size="sm"
              />
            ) : null}
            <ChipGroup scrollable contentPadding={0}>
              {DATE_PRESETS.map((p) => (
                <Chip key={p.key || "all"} label={p.label} size="sm" selected={preset === p.key} onPress={() => setPreset(p.key)} />
              ))}
            </ChipGroup>
            {mode === "schedule" && list.length ? (
              <ChipGroup scrollable={false} contentPadding={0}>
                <Chip
                  label={allVisibleSelected ? "Görünenlerin seçimini kaldır" : "Görünenlerin hepsini seç"}
                  icon={allVisibleSelected ? "close-circle-outline" : "checkbox-outline"}
                  size="sm"
                  onPress={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      list.forEach((m) => (allVisibleSelected ? next.delete(Number(m.id)) : next.add(Number(m.id))));
                      return next;
                    })
                  }
                />
                {selected.size ? <Chip label="Seçimi temizle" size="sm" onPress={() => setSelected(new Set())} /> : null}
              </ChipGroup>
            ) : null}
            {mode === "content" ? <Note text="Bir maça dokunup bağlantılarını gir; değişiklikler taslakta birikir, alttan hepsini birlikte kaydet." /> : null}
          </View>
        }
        renderItem={({ item }) => {
          const id = Number(item.id);
          const draft = drafts[id];
          const changedCount = draft
            ? (Object.entries(draft) as [BulkContentKey, string][]).filter(([k, v]) => v.trim() !== readBulkValue(item, k)).length
            : 0;
          const filled = BULK_CONTENT_FIELDS.filter((f) => (draft?.[f.key] ?? readBulkValue(item, f.key)) !== "").length;
          return (
            <RecordCard
              title={`${item.first_team_name} – ${item.second_team_name}`}
              subtitle={[shortDay(item.date), hhmm(item.time), item.match_field].filter(Boolean).join(" · ")}
              meta={mode === "content" ? `${filled} / ${BULK_CONTENT_FIELDS.length} bağlantı dolu` : null}
              icon={mode === "schedule" ? (selected.has(id) ? "checkbox" : "square-outline") : "link-outline"}
              iconTone={selected.has(id) ? "brand" : "neutral"}
              badges={[
                { label: statusLabelOf(item.mac_durumu), tone: statusTone(item.mac_durumu) },
                changedCount ? { label: `${changedCount} değişiklik`, tone: "warn" } : null,
              ]}
              onPress={() => (mode === "schedule" ? toggle(id) : setContentFor(item))}
            />
          );
        }}
        ListFooterComponent={<View style={styles.footer} />}
      />

      <FormSheet
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        title={`${selected.size} maçı düzenle`}
        intro="Doldurduğun alanlar seçili maçların hepsine yazılır; boş bırakılanlar değişmez. Tarih, saat ya da saha değişince oyunculara bildirim gider."
        fields={scheduleFields}
        initial={{}}
        submitLabel="Seçilenlere uygula"
        onSubmit={applySchedule}
      />

      <FormSheet
        visible={contentFor != null}
        onClose={() => setContentFor(null)}
        title={contentFor ? `${contentFor.first_team_name} – ${contentFor.second_team_name}` : "İçerik"}
        fields={contentFields}
        initial={
          contentFor
            ? Object.fromEntries(
                BULK_CONTENT_FIELDS.map((f) => [f.key, drafts[Number(contentFor.id)]?.[f.key] ?? readBulkValue(contentFor, f.key)])
              )
            : {}
        }
        submitLabel="Taslağa ekle"
        onSubmit={(values) => {
          if (!contentFor) return;
          const errors = BULK_CONTENT_FIELDS.map((f) => {
            const e = validateBulkValue(f.key, String(values[f.key] ?? ""));
            return e ? `${f.label}: ${e}` : "";
          }).filter(Boolean);
          if (errors.length) throw new Error(errors.join("\n"));
          setDrafts((d) => ({
            ...d,
            [Number(contentFor.id)]: Object.fromEntries(BULK_CONTENT_FIELDS.map((f) => [f.key, String(values[f.key] ?? "")])),
          }));
        }}
        secondary={
          contentFor && drafts[Number(contentFor.id)]
            ? {
                label: "Taslağı at",
                onPress: () => {
                  setDrafts((d) => {
                    const next = { ...d };
                    delete next[Number(contentFor.id)];
                    return next;
                  });
                  setContentFor(null);
                },
              }
            : undefined
        }
      />

      <BottomSheet
        visible={scopeOpen}
        onClose={() => setScopeOpen(false)}
        title="Kapsam"
        snap="content"
        footer={
          <Button
            label="Uygula"
            onPress={() => {
              if (scopeDraft) setScopeOverride(scopeDraft);
              setSelected(new Set());
              setScopeOpen(false);
            }}
            disabled={!scopeDraft?.seasonId}
            fullWidth
          />
        }
      >
        {scopeDraft ? <ScopeFields value={scopeDraft} onChange={setScopeDraft} /> : <Text style={styles.hint}>Kapsam yükleniyor…</Text>}
      </BottomSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.sm },
  bar: {
    position: "absolute",
    left: layout.screenPadding,
    right: layout.screenPadding,
    bottom: space.xl,
  },
  footer: { height: space.giant * 2 },
  hint: { ...type.caption, color: colors.textTertiary },
});
