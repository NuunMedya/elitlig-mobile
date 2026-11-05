/**
 * PANORAMA REJİ KUMANDASI — tek yayının telefondan uzaktan kumandası.
 *
 * Web: panorama/PanoramaAdmin.js. Üç bölüm:
 *   REJİ     yayındaki sahne + "Tekrar göster"; sahne seç → gereken kaydı
 *            (oyuncu / takım / maç / tarih / sıra) seç → önizleme özeti →
 *            "YAYINA VER". Sahne iki adımlıdır: yanlış seçim yayına düşmez.
 *            Yayın açık/kapalı ve alt bant (kayan yazı) hızlı anahtarları.
 *   KURULUM  ad, bölüm başlığı, düzen (kaç kamera), konuklar, tema, künye
 *            başlığı ve logosu, varsayılan lig/sezon, notlar.
 *   LİNKLER  OBS'e verilecek kaplama adresleri (kopyala / aç).
 *
 * Görsel sahne önizlemesi (web'deki canlı kaplama çizimi) telefonda yoktur;
 * yerine sunucu önizlemesinin başlığı, eksik seçimler ve kayıt sayısı
 * gösterilir. Gelişmiş künye görünümü (renk/yazıtipi) web'den düzenlenir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { DateField, InfoLine, Panel, SelectField, ToggleField, confirmAction, useAdminMutation } from "@/components/admin";
import { Badge, Button, Chip, ChipGroup, Input, SegmentedControl, Stepper, useToast } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { formatDate, timeAgo } from "@/lib/admin/format";
import { WEB_BASE_URL } from "@/lib/config";
import {
  deleteBroadcast,
  getBroadcast,
  lookupAwardSets,
  lookupLeagues,
  lookupMatches,
  lookupPlayers,
  lookupSeasons,
  lookupTeams,
  missingParams,
  overlayLinks,
  PARAM_LABELS,
  previewScene,
  setScene,
  updateBroadcast,
  uploadPanoramaLogo,
  type PanoramaBroadcast,
  type PanoramaCatalog,
  type PanoramaGuest,
  type PanoramaLayout,
  type PanoramaPatch,
} from "@/lib/api/admin/broadcast";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { ImageUploadField } from "./ImageUploadField";

type Section = "reji" | "kurulum" | "linkler";
type Form = Record<string, unknown>;

const GUEST_LIMIT: Record<PanoramaLayout, number> = { solo: 1, duo: 2, trio: 3 };

export function PanoramaControl({ id, catalog, onClose }: { id: number; catalog: PanoramaCatalog; onClose: () => void }) {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canUpdate = hasAnyPermission(auth.user, ["panorama.update"]);
  const canAir = hasAnyPermission(auth.user, ["panorama.broadcast"]);
  const canDelete = hasAnyPermission(auth.user, ["panorama.delete"]);

  const key = ["admin", "panorama", "detail", id];
  const query = useQuery({ queryKey: key, queryFn: () => getBroadcast(id), refetchInterval: 15_000 });
  const b = query.data;
  const [section, setSection] = useState<Section>("reji");

  const setData = (next: PanoramaBroadcast) => {
    queryClient.setQueryData(key, next);
    void queryClient.invalidateQueries({ queryKey: ["admin", "panorama", "list"] });
  };
  const patchMut = useAdminMutation((body: PanoramaPatch) => updateBroadcast(id, body), { onSuccess: setData });

  if (!b) {
    return (
      <View style={styles.wrap}>
        <Button label="Yayın listesi" icon="chevron-back" variant="ghost" size="sm" onPress={onClose} />
        <Text style={styles.hint} {...textScale.long}>
          {query.isLoading ? "Yayın yükleniyor…" : "Yayın açılamadı."}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.rowBetween}>
        <Button label="Yayın listesi" icon="chevron-back" variant="ghost" size="sm" onPress={onClose} />
        <Badge label={b.isLive ? "Yayın açık" : "Yayın kapalı"} tone={b.isLive ? "live" : "neutral"} icon={b.isLive ? "radio" : "radio-outline"} />
      </View>
      <SegmentedControl<Section>
        items={[
          { key: "reji", label: "Reji" },
          { key: "kurulum", label: "Kurulum" },
          { key: "linkler", label: "Linkler" },
        ]}
        value={section}
        onChange={setSection}
        size="sm"
      />
      {section === "reji" ? <Director b={b} catalog={catalog} canAir={canAir} canUpdate={canUpdate} onData={setData} patch={(body) => patchMut.mutateAsync(body)} /> : null}
      {section === "kurulum" ? (
        <SetupPanel
          b={b}
          catalog={catalog}
          canUpdate={canUpdate}
          canDelete={canDelete}
          onSave={async (body) => {
            await patchMut.mutateAsync(body);
            toast.show({ message: "Yayın ayarları kaydedildi.", tone: "success" });
          }}
          onDelete={async () => {
            if (!(await confirmAction({ title: "Yayın silinsin mi?", message: `“${b.name}” ve tüm ayarları silinecek. Kaplama adresleri çalışmaz.`, confirmLabel: "Sil", destructive: true }))) return;
            try {
              await deleteBroadcast(id);
              void queryClient.invalidateQueries({ queryKey: ["admin", "panorama", "list"] });
              toast.show({ message: "Yayın silindi.", tone: "success" });
              onClose();
            } catch (e) {
              toast.show({ message: (e as Error).message, tone: "danger" });
            }
          }}
        />
      ) : null}
      {section === "linkler" ? <Links b={b} /> : null}
    </View>
  );
}

/** Lig / sezon seçenekleri küçük listelerdir; seçili değerin adı görünsün diye önceden çekilir. */
function useScopeOptions(cityId: number, leagueId: number | null) {
  const leagues = useQuery({
    queryKey: ["admin", "panorama", "lookup", "leagues", cityId],
    queryFn: () => lookupLeagues({ cityId }),
    staleTime: 300_000,
  });
  const seasons = useQuery({
    queryKey: ["admin", "panorama", "lookup", "seasons", cityId, leagueId],
    queryFn: () => lookupSeasons({ cityId, leagueId }),
    staleTime: 300_000,
  });
  return {
    leagueOptions: (leagues.data ?? []).map((l) => ({ value: l.id, label: l.name })),
    seasonOptions: (seasons.data ?? []).map((x) => ({ value: x.id, label: x.name })),
  };
}

/* ───────────────────────────── REJİ ───────────────────────────── */

function Director({
  b,
  catalog,
  canAir,
  canUpdate,
  onData,
  patch,
}: {
  b: PanoramaBroadcast;
  catalog: PanoramaCatalog;
  canAir: boolean;
  canUpdate: boolean;
  onData: (b: PanoramaBroadcast) => void;
  patch: (body: PanoramaPatch) => Promise<unknown>;
}) {
  const groups = useMemo(() => [...new Set(catalog.scenes.map((s) => s.group))], [catalog]);
  const [group, setGroup] = useState(groups[0] ?? "");
  const [sceneKey, setSceneKey] = useState<string>(b.scene.type || "bos");
  const [form, setForm] = useState<Form>({});
  const [debounced, setDebounced] = useState<Form>({});
  const [ticker, setTicker] = useState(b.tickerText ?? "");
  const scene = catalog.scenes.find((s) => s.key === sceneKey);
  const onAir = catalog.scenes.find((s) => s.key === b.scene.type);
  const limit = catalog.listLimit ?? { DEFAULT: 12, MIN: 3, MAX: 30 };

  // Sahne değişince form, yayının varsayılan kapsamıyla yeniden kurulur.
  useEffect(() => {
    setForm({ leagueId: b.leagueId, seasonId: b.seasonId, from: 1, to: limit.DEFAULT });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneKey]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(form), 350);
    return () => clearTimeout(t);
  }, [form]);
  useEffect(() => setTicker(b.tickerText ?? ""), [b.tickerText]);

  const missing = missingParams(scene, form);
  const preview = useQuery({
    queryKey: ["admin", "panorama", "preview", b.id, sceneKey, JSON.stringify(debounced)],
    queryFn: () => previewScene(b.id, sceneKey, debounced),
    enabled: Boolean(scene) && !missing.length,
    staleTime: 10_000,
    retry: false,
  });

  const air = useAdminMutation((v: { type: string; params: Form }) => setScene(b.id, v.type, v.params), {
    success: (_r, v) => `“${catalog.scenes.find((s) => s.key === v.type)?.label ?? v.type}” yayına verildi.`,
    onSuccess: onData,
  });

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const cityId = b.cityId;
  const leagueId = (form.leagueId as number | null) ?? null;
  const seasonId = (form.seasonId as number | null) ?? null;
  const scopeOptions = useScopeOptions(cityId, leagueId);
  const awardSets = useQuery({
    queryKey: ["admin", "panorama", "lookup", "awards", cityId, seasonId],
    queryFn: () => lookupAwardSets({ cityId, seasonId }),
    enabled: Boolean(scene?.params.includes("awardSetId")),
    staleTime: 60_000,
  });

  const payloadInfo = preview.data?.payload;
  const payloadCount = payloadInfo ? Object.values(payloadInfo).find((v) => Array.isArray(v)) : null;

  return (
    <View style={styles.wrap}>
      <Panel title="Yayında">
        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <Text style={styles.onAir} {...textScale.dense}>
              {onAir?.label ?? b.scene.type}
            </Text>
            <Text style={styles.hint} {...textScale.dense}>
              #{b.scene.sequence}
              {b.scene.updatedAt ? ` · ${timeAgo(b.scene.updatedAt)}` : ""}
            </Text>
          </View>
          {canAir ? (
            <Button
              label="Tekrar göster"
              icon="refresh"
              size="sm"
              variant="secondary"
              loading={air.isPending}
              onPress={() => air.mutate({ type: b.scene.type, params: b.scene.params })}
            />
          ) : null}
        </View>
        {canAir && b.scene.type !== "bos" ? (
          <Button label="Temiz ekran" icon="eye-off-outline" size="sm" variant="ghost" onPress={() => air.mutate({ type: "bos", params: {} })} />
        ) : null}
      </Panel>

      {canUpdate ? (
        <Panel title="Hızlı ayarlar">
          <ToggleField label="Yayın açık" hint="Kapalıyken kaplama içerik göstermez." value={b.isLive} onChange={(v) => void patch({ isLive: v })} />
          <ToggleField label="Alt bant görünsün" value={b.tickerVisible} onChange={(v) => void patch({ tickerVisible: v })} />
          <Input label="Alt bant yazısı" value={ticker} onChangeText={setTicker} multiline maxLength={1000} />
          {ticker !== (b.tickerText ?? "") ? <Button label="Alt bandı kaydet" size="sm" onPress={() => void patch({ tickerText: ticker })} /> : null}
        </Panel>
      ) : null}

      <Text style={styles.section} {...textScale.dense}>
        Sahne seç
      </Text>
      <ChipGroup scrollable contentPadding={0}>
        {groups.map((g) => (
          <Chip key={g} size="sm" label={g} selected={group === g} onPress={() => setGroup(g)} />
        ))}
      </ChipGroup>
      <ChipGroup>
        {catalog.scenes
          .filter((s) => s.group === group)
          .map((s) => (
            <Chip key={s.key} size="sm" label={s.label} selected={sceneKey === s.key} tone={b.scene.type === s.key ? "live" : undefined} onPress={() => setSceneKey(s.key)} />
          ))}
      </ChipGroup>

      {scene ? (
        <Panel title={scene.label}>
          <Text style={styles.hint} {...textScale.long}>
            {scene.hint}
          </Text>
          {scene.params.map((p) => {
            switch (p) {
              case "scope":
                return (
                  <View key={p} style={styles.wrap}>
                    <SelectField<number>
                      label="Lig"
                      value={leagueId}
                      options={scopeOptions.leagueOptions}
                      clearable
                      onChange={(v) => setForm((f) => ({ ...f, leagueId: v, seasonId: null }))}
                    />
                    <SelectField<number>
                      label="Sezon"
                      value={seasonId}
                      options={scopeOptions.seasonOptions}
                      clearable
                      onChange={(v) => set("seasonId", v)}
                      hint={b.leagueId && leagueId === b.leagueId ? "Yayının varsayılan kapsamı." : undefined}
                    />
                  </View>
                );
              case "range":
                return (
                  <View key={p} style={styles.row}>
                    <Stepper label="Sıradan" value={Number(form.from) || 1} min={1} max={200} onChange={(v) => setForm((f) => ({ ...f, from: v, to: Math.max(v, Number(f.to) || v) }))} size="sm" />
                    <Stepper
                      label="Sıraya"
                      value={Number(form.to) || limit.DEFAULT}
                      min={Number(form.from) || 1}
                      max={(Number(form.from) || 1) + limit.MAX - 1}
                      onChange={(v) => set("to", v)}
                      size="sm"
                    />
                  </View>
                );
              case "date":
                return <DateField key={p} label="Tarih (boşsa bugün)" value={(form.date as string) ?? null} clearable onChange={(v) => set("date", v)} />;
              case "dateRange":
                return (
                  <View key={p} style={styles.wrap}>
                    <DateField label="Başlangıç" value={(form.dateFrom as string) ?? null} clearable onChange={(v) => set("dateFrom", v)} />
                    <DateField label="Bitiş" value={(form.dateTo as string) ?? null} clearable onChange={(v) => set("dateTo", v)} hint="Tek tarih seçersen yalnız o günün maçları gelir." />
                  </View>
                );
              case "matchId":
                return (
                  <SelectField<number>
                    key={p}
                    label={PARAM_LABELS[p]}
                    value={(form.matchId as number) ?? null}
                    queryKey={["admin", "panorama", "lookup", "matches", cityId, leagueId, seasonId]}
                    loadOptions={async (q) =>
                      (await lookupMatches({ q, cityId, leagueId, seasonId })).map((m) => ({
                        value: m.id,
                        label: m.homeScore != null && m.awayScore != null ? `${m.homeName} ${m.homeScore}-${m.awayScore} ${m.awayName}` : `${m.homeName} - ${m.awayName}`,
                        hint: [m.date ? formatDate(m.date) : null, m.leagueName].filter(Boolean).join(" · "),
                      }))
                    }
                    clearable
                    onChange={(v) => set("matchId", v)}
                  />
                );
              case "playerId":
              case "playerId2":
                return (
                  <SelectField<number>
                    key={p}
                    label={PARAM_LABELS[p]}
                    value={(form[p] as number) ?? null}
                    queryKey={["admin", "panorama", "lookup", "players", cityId, leagueId, seasonId]}
                    loadOptions={async (q) =>
                      (await lookupPlayers({ q, cityId, leagueId, seasonId })).map((x) => ({ value: x.id, label: x.name, hint: [x.teamName, x.position].filter(Boolean).join(" · ") }))
                    }
                    clearable
                    onChange={(v) => set(p, v)}
                  />
                );
              case "teamId":
              case "teamId2":
                return (
                  <SelectField<number>
                    key={p}
                    label={PARAM_LABELS[p]}
                    value={(form[p] as number) ?? null}
                    queryKey={["admin", "panorama", "lookup", "teams", cityId, leagueId, seasonId]}
                    loadOptions={async (q) => (await lookupTeams({ q, cityId, leagueId, seasonId })).map((x) => ({ value: x.id, label: x.name, hint: x.league }))}
                    clearable
                    onChange={(v) => set(p, v)}
                  />
                );
              case "awardSetId":
                return (
                  <SelectField<number>
                    key={p}
                    label={PARAM_LABELS[p]}
                    value={(form.awardSetId as number) ?? null}
                    options={(awardSets.data ?? []).map((a) => ({
                      value: a.id,
                      label: a.title || "Haftanın enleri",
                      hint: [a.startDate ? formatDate(a.startDate) : null, a.endDate ? formatDate(a.endDate) : null].filter(Boolean).join(" – "),
                    }))}
                    clearable
                    onChange={(v) => set("awardSetId", v)}
                  />
                );
              case "title":
                return <Input key={p} label="Başlık" value={(form.title as string) ?? ""} maxLength={120} onChangeText={(t) => set("title", t)} />;
              case "text":
                return <Input key={p} label="Metin *" value={(form.text as string) ?? ""} maxLength={1200} multiline onChangeText={(t) => set("text", t)} />;
              default:
                return null;
            }
          })}

          <View style={styles.preview}>
            <Ionicons name={missing.length ? "alert-circle-outline" : preview.isError ? "warning-outline" : "eye-outline"} size={18} color={missing.length || preview.isError ? colors.warn : colors.textSecondary} />
            <Text style={styles.previewText} {...textScale.long}>
              {missing.length
                ? `Eksik seçim: ${missing.map((m) => PARAM_LABELS[m] ?? m).join(", ")}`
                : preview.isLoading
                  ? "Önizleme hazırlanıyor…"
                  : preview.isError
                    ? (preview.error as Error)?.message || "Önizleme alınamadı."
                    : payloadInfo
                      ? [payloadInfo.title, payloadInfo.subtitle, Array.isArray(payloadCount) ? `${payloadCount.length} kayıt` : null].filter(Boolean).join(" · ") || "Önizleme hazır."
                      : "Önizleme hazır."}
            </Text>
          </View>

          {canAir ? (
            <Button
              label="YAYINA VER"
              icon="radio"
              size="lg"
              haptic="success"
              loading={air.isPending}
              disabled={missing.length > 0}
              onPress={() => air.mutate({ type: sceneKey, params: form })}
            />
          ) : (
            <Text style={styles.hint} {...textScale.long}>
              Sahneyi yayına vermek için panorama.broadcast yetkisi gerekir.
            </Text>
          )}
        </Panel>
      ) : null}
    </View>
  );
}

/* ───────────────────────────── KURULUM ───────────────────────────── */

function SetupPanel({
  b,
  catalog,
  canUpdate,
  canDelete,
  onSave,
  onDelete,
}: {
  b: PanoramaBroadcast;
  catalog: PanoramaCatalog;
  canUpdate: boolean;
  canDelete: boolean;
  onSave: (body: PanoramaPatch) => Promise<void>;
  onDelete: () => void;
}) {
  const [f, setF] = useState(() => ({
    name: b.name,
    episodeTitle: b.episodeTitle ?? "",
    layout: b.layout,
    theme: b.theme,
    brandTitle: b.brandTitle ?? "",
    brandLogoUrl: b.brandLogoUrl ?? "",
    leagueId: b.leagueId,
    seasonId: b.seasonId,
    notes: b.notes ?? "",
    guests: [0, 1, 2].map((i) => ({ name: b.guests[i]?.name ?? "", role: b.guests[i]?.role ?? "" })) as PanoramaGuest[],
  }));
  const [busy, setBusy] = useState(false);
  const set = (v: Partial<typeof f>) => setF((p) => ({ ...p, ...v }));
  const guestCount = GUEST_LIMIT[f.layout] ?? 2;
  const scopeOptions = useScopeOptions(b.cityId, f.leagueId);

  const save = async () => {
    setBusy(true);
    try {
      await onSave({
        name: f.name,
        episodeTitle: f.episodeTitle,
        layout: f.layout,
        theme: f.theme,
        brandTitle: f.brandTitle,
        brandLogoUrl: f.brandLogoUrl,
        leagueId: f.leagueId,
        seasonId: f.seasonId,
        notes: f.notes,
        guests: f.guests.slice(0, guestCount),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Input label="Yayın adı *" value={f.name} onChangeText={(t) => set({ name: t })} editable={canUpdate} />
      <Input label="Bölüm başlığı" value={f.episodeTitle} onChangeText={(t) => set({ episodeTitle: t })} editable={canUpdate} placeholder="Örn. 12. Hafta Değerlendirmesi" />
      <SegmentedControl<PanoramaLayout>
        items={catalog.layouts.map((l) => ({ key: l.value, label: l.label }))}
        value={f.layout}
        onChange={(v) => canUpdate && set({ layout: v })}
        stretch
        size="sm"
      />
      <Text style={styles.hint} {...textScale.long}>
        Düzen ekrandaki kamera penceresi sayısıdır. Değiştirmek OBS'teki kaynak adreslerini değiştirir.
      </Text>
      {f.guests.slice(0, guestCount).map((g, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <View key={i} style={styles.row}>
          <Input
            containerStyle={styles.flex}
            size="sm"
            label={`${i + 1}. konuk`}
            value={g.name}
            maxLength={60}
            editable={canUpdate}
            onChangeText={(t) => set({ guests: f.guests.map((x, idx) => (idx === i ? { ...x, name: t } : x)) })}
          />
          <Input
            containerStyle={styles.flex}
            size="sm"
            label="Ünvan"
            value={g.role}
            maxLength={60}
            editable={canUpdate}
            onChangeText={(t) => set({ guests: f.guests.map((x, idx) => (idx === i ? { ...x, role: t } : x)) })}
          />
        </View>
      ))}
      <Text style={styles.section} {...textScale.dense}>
        Tema
      </Text>
      <ChipGroup>
        {catalog.themes.map((t) => (
          <Chip key={t.key} size="sm" label={t.label} selected={f.theme === t.key} onPress={() => canUpdate && set({ theme: t.key })} />
        ))}
      </ChipGroup>
      <Text style={styles.hint} {...textScale.long}>
        {catalog.themes.find((t) => t.key === f.theme)?.hint}
      </Text>
      <Input label="Künye başlığı" value={f.brandTitle} onChangeText={(t) => set({ brandTitle: t })} maxLength={60} editable={canUpdate} />
      <ImageUploadField
        label="Künye logosu"
        value={f.brandLogoUrl}
        disabled={!canUpdate}
        upload={(file) => uploadPanoramaLogo(b.id, file)}
        onChange={(url) => set({ brandLogoUrl: url })}
        hint="Yükleme yayını değiştirmez; Kaydet ile yazılır."
      />
      <SelectField<number>
        label="Varsayılan lig"
        value={f.leagueId}
        options={scopeOptions.leagueOptions}
        clearable
        disabled={!canUpdate}
        onChange={(v) => set({ leagueId: v, seasonId: null })}
      />
      <SelectField<number>
        label="Varsayılan sezon"
        value={f.seasonId}
        options={scopeOptions.seasonOptions}
        clearable
        disabled={!canUpdate}
        onChange={(v) => set({ seasonId: v })}
        hint="Sahne kendi kapsamını seçmezse bu lig/sezon kullanılır."
      />
      <Input label="Notlar" value={f.notes} onChangeText={(t) => set({ notes: t })} multiline editable={canUpdate} />
      {canUpdate ? <Button label="Kaydet" onPress={() => void save()} loading={busy} haptic="success" /> : null}
      {canDelete ? <Button label="Yayını sil" icon="trash-outline" variant="danger" onPress={onDelete} /> : null}
    </View>
  );
}

/* ───────────────────────────── LİNKLER ───────────────────────────── */

function Links({ b }: { b: PanoramaBroadcast }) {
  const toast = useToast();
  const links = overlayLinks(WEB_BASE_URL, b.id, b.guests, b.layout);
  return (
    <View style={styles.wrap}>
      <Text style={styles.hint} {...textScale.long}>
        Her kamera düzeni için OBS'e ayrı tarayıcı kaynağı ekle. "+ İçerik" adresleri sahne panelini de gösterir.
      </Text>
      {links.map((l) => (
        <View key={l.key} style={styles.link}>
          <View style={styles.flex}>
            <Text style={styles.linkLabel} {...textScale.dense}>
              {l.label}
            </Text>
            <Text style={styles.hint} selectable numberOfLines={1} {...textScale.dense}>
              {l.url}
            </Text>
          </View>
          <Button
            label="Kopyala"
            size="sm"
            variant="secondary"
            onPress={async () => {
              await Clipboard.setStringAsync(l.url);
              toast.show({ message: "Adres kopyalandı.", tone: "success" });
            }}
          />
          <Button label="Aç" size="sm" variant="ghost" onPress={() => void Linking.openURL(l.url)} />
        </View>
      ))}
      <InfoLine label="Yayın no" value={String(b.id)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  flex: { flex: 1 },
  row: { flexDirection: "row", gap: space.sm, alignItems: "flex-end", flexWrap: "wrap" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  hint: { ...type.caption, color: colors.textSecondary },
  section: { ...type.overline, color: colors.textTertiary },
  onAir: { ...type.h3, color: colors.live },
  preview: {
    flexDirection: "row",
    gap: space.sm,
    alignItems: "flex-start",
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  previewText: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  link: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs, borderBottomWidth: hairline, borderBottomColor: colors.separator },
  linkLabel: { ...type.label, color: colors.textPrimary },
});
