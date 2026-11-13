/**
 * Junior Cup lig sayfası düzenleyici.
 *
 * Web: leaguePortals/LeaguePortalsAdmin.js. Altı sekme:
 *   Genel     ad, kısa ad, adres (slug), logo, SEO açıklaması, yayında mı
 *   Ligler    il seç → ligleri işaretle; varsayılan lig ve sezon
 *   Renkler   açık / koyu görünüm paleti ve görünüm modu; üst menü renkleri
 *   Üst menü  stil, sabit menü, giriş düğmesi; öğeler (ad, görünürlük, sıra)
 *             ve özel bağlantılar
 *   Anasayfa  manşet (başlık, alt başlık, görsel, hizalama) ve bölümler
 *             (başlık, görünürlük, sıra)
 *   Görünüm   yazıtipi, köşe, lig/sezon seçici, alt bilgi metni
 * Sürükle-bırak sıralama yerine yukarı / aşağı düğmeleri kullanılır.
 * Renk girişleri onaltılık koddur; yanında örnek kutu gösterilir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { MultiSelectField, SegmentField, SelectField, ToggleField } from "@/components/admin";
import { SysGroup } from "@/components/admin/system/SysKit";
import { ImageUploadField } from "@/components/admin/broadcast/ImageUploadField";
import { Button, Chip, ChipGroup, Input, Tabs, Touchable } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import {
  COLOR_LABELS,
  getMetaLeaguesAll,
  getMetaSeasonsAll,
  HEX_COLOR,
  MENU_COLOR_LABELS,
  moveItem,
  suggestSlug,
  THEME_MODES,
  uploadPortalImage,
  type PortalCatalog,
  type PortalPayload,
  type ThemeMode,
} from "@/lib/api/admin/portals";
import { getCities } from "@/lib/api/meta";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

type Tab = "general" | "leagues" | "colors" | "menu" | "home" | "layout";
const TABS: { key: Tab; label: string }[] = [
  { key: "general", label: "Genel" },
  { key: "leagues", label: "Ligler" },
  { key: "colors", label: "Renkler" },
  { key: "menu", label: "Üst menü" },
  { key: "home", label: "Anasayfa" },
  { key: "layout", label: "Görünüm" },
];

export function PortalEditor({
  initial,
  catalog,
  knownLeagues,
  canManage,
  isNew,
  onSave,
}: {
  initial: PortalPayload;
  catalog: PortalCatalog | undefined;
  /** Daha önce görülen lig adları (id → { label, cityId }). */
  knownLeagues: Record<number, { label: string; cityId: number | null }>;
  canManage: boolean;
  isNew: boolean;
  onSave: (body: PortalPayload) => Promise<unknown>;
}) {
  const [tab, setTab] = useState<Tab>("general");
  const [f, setF] = useState<PortalPayload>(initial);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [cityId, setCityId] = useState<number | null>(null);
  const [leagueNames, setLeagueNames] = useState(knownLeagues);
  const [palette, setPalette] = useState<"light" | "dark">("light");
  const set = (v: Partial<PortalPayload>) => setF((p) => ({ ...p, ...v }));
  const setLayout = (v: Partial<PortalPayload["layout"]>) => setF((p) => ({ ...p, layout: { ...p.layout, ...v } }));

  const cities = useQuery({ queryKey: ["admin", "portals", "cities"], queryFn: getCities, staleTime: 300_000 });
  const leagues = useQuery({
    queryKey: ["admin", "portals", "leagues", cityId],
    queryFn: async () => {
      const list = await getMetaLeaguesAll(cityId!);
      setLeagueNames((prev) => {
        const next = { ...prev };
        list.forEach((l) => (next[l.id] = { label: l.label, cityId }));
        return next;
      });
      return list;
    },
    enabled: cityId != null,
  });
  const defaultLeague = f.defaultLeagueId ?? f.leagueIds[0] ?? null;
  const defaultLeagueCity = defaultLeague != null ? leagueNames[defaultLeague]?.cityId ?? null : null;
  const seasons = useQuery({
    queryKey: ["admin", "portals", "seasons", defaultLeagueCity, defaultLeague],
    queryFn: () => getMetaSeasonsAll(defaultLeagueCity!, defaultLeague!),
    enabled: defaultLeague != null && defaultLeagueCity != null,
  });

  const save = async () => {
    if (!f.name.trim()) return setFailure("Sayfa adı zorunludur.");
    if (!f.slug.trim()) return setFailure("Sayfa adresi zorunludur (ör. juniorcup).");
    const badColor = [
      ...Object.entries(f.theme.light ?? {}),
      ...Object.entries(f.theme.dark ?? {}),
      ...Object.entries(f.theme.menu ?? {}),
    ].find(([, v]) => v && !HEX_COLOR.test(v));
    if (badColor) return setFailure(`Renk kodu geçersiz: ${badColor[1]}. # ile başlayan 3 ya da 6 haneli olmalı.`);
    setBusy(true);
    setFailure("");
    try {
      await onSave(f);
    } catch (e) {
      setFailure(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const items = f.layout.header?.items ?? [];
  const links = f.layout.header?.links ?? [];
  const home = f.layout.home ?? [];
  const sectionLabel = (key: string) => catalog?.sections.find((s) => s.key === key)?.label ?? key;
  const colorKeys = catalog?.colorKeys ?? Object.keys(COLOR_LABELS);
  const menuKeys = catalog?.menuColorKeys ?? Object.keys(MENU_COLOR_LABELS);
  const leagueOptions = useMemo(
    () => (leagues.data ?? []).map((l) => ({ value: l.id, label: `${l.label}${l.is_archived ? " (arşiv)" : ""}` })),
    [leagues.data]
  );

  return (
    <View style={styles.wrap}>
      <Tabs<Tab> items={TABS} value={tab} onChange={setTab} distribute="scroll" />

      {tab === "general" ? (
        <View style={styles.wrap}>
          <Input
            label="Sayfa adı *"
            value={f.name}
            editable={canManage}
            onChangeText={(t) => set({ name: t, ...(isNew && (!f.slug || f.slug === suggestSlug(f.name)) ? { slug: suggestSlug(t) } : {}) })}
            placeholder="Örn. Junior Cup"
          />
          <Input label="Kısa ad" value={f.shortName} editable={canManage} onChangeText={(t) => set({ shortName: t })} />
          <Input
            label="Adres *"
            value={f.slug}
            editable={canManage}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(t) => set({ slug: t.toLowerCase() })}
            hint={`elitlig.com/${f.slug || "adres"} — sitedeki sayfa adlarıyla çakışan adresler kullanılamaz.`}
          />
          <ImageUploadField label="Logo" value={f.logoUrl} disabled={!canManage} upload={uploadPortalImage} onChange={(url) => set({ logoUrl: url })} />
          <Input label="SEO açıklaması" value={f.seoDescription} editable={canManage} multiline onChangeText={(t) => set({ seoDescription: t })} />
          <ToggleField label="Yayında" hint="Kapalıyken adres ziyaretçiye açılmaz." value={f.active} onChange={(v) => set({ active: v })} disabled={!canManage} />
        </View>
      ) : null}

      {tab === "leagues" ? (
        <View style={styles.wrap}>
          <Text style={styles.hint} {...textScale.long}>
            Seçilen liglerin tüm sezonları bu sayfada görünür. Bir lig yalnız bir özel sayfaya atanabilir.
          </Text>
          <ChipGroup>
            {f.leagueIds.map((id) => (
              <Chip
                key={id}
                size="sm"
                label={leagueNames[id]?.label ?? `Lig #${id}`}
                selected={defaultLeague === id}
                onDismiss={
                  canManage
                    ? () => {
                        const next = f.leagueIds.filter((x) => x !== id);
                        set({ leagueIds: next, ...(f.defaultLeagueId === id ? { defaultLeagueId: null, defaultSeasonId: null } : {}) });
                      }
                    : undefined
                }
              />
            ))}
          </ChipGroup>
          <SelectField<number>
            label="İl seç (ligleri listelemek için)"
            value={cityId}
            options={(cities.data ?? []).map((c) => ({ value: c.id, label: c.label }))}
            onChange={setCityId}
          />
          {cityId != null ? (
            <MultiSelectField<number>
              label="Bu ilin ligleri"
              value={f.leagueIds.filter((id) => (leagues.data ?? []).some((l) => l.id === id))}
              options={leagueOptions}
              placeholder={leagues.isLoading ? "Yükleniyor…" : leagueOptions.length ? "Lig seç" : "Bu ilde lig yok"}
              onChange={(picked) => {
                const inCity = new Set((leagues.data ?? []).map((l) => l.id));
                const others = f.leagueIds.filter((id) => !inCity.has(id));
                const next = [...others, ...picked];
                set({ leagueIds: next, ...(f.defaultLeagueId && !next.includes(f.defaultLeagueId) ? { defaultLeagueId: null, defaultSeasonId: null } : {}) });
              }}
            />
          ) : null}
          <SelectField<number>
            label="Varsayılan lig"
            value={f.defaultLeagueId}
            clearable
            placeholder="İlk lig"
            options={f.leagueIds.map((id) => ({ value: id, label: leagueNames[id]?.label ?? `Lig #${id}` }))}
            onChange={(v) => set({ defaultLeagueId: v, defaultSeasonId: null })}
          />
          <SelectField<number>
            label="Varsayılan sezon"
            value={f.defaultSeasonId}
            clearable
            placeholder="Sitenin varsayılan kuralı"
            options={(seasons.data ?? []).map((s) => ({ value: s.id, label: `${s.label}${s.is_archived ? " (arşiv)" : ""}` }))}
            onChange={(v) => set({ defaultSeasonId: v })}
            hint={defaultLeague != null && defaultLeagueCity == null ? "Sezonları görmek için önce bu ligin ilini seç." : undefined}
          />
        </View>
      ) : null}

      {tab === "colors" ? (
        <View style={styles.wrap}>
          <SegmentField<string> label="Görünüm modu" value={f.theme.mode} options={THEME_MODES} onChange={(v) => set({ theme: { ...f.theme, mode: v as ThemeMode } })} />
          <SegmentField<string>
            label="Düzenlenen palet"
            value={palette}
            options={[
              { key: "light", label: "Açık görünüm" },
              { key: "dark", label: "Koyu görünüm" },
            ]}
            onChange={(v) => setPalette(v as "light" | "dark")}
          />
          <SysGroup icon="color-palette" tone="pink" title={palette === "light" ? "Açık görünüm renkleri" : "Koyu görünüm renkleri"}>
            {colorKeys.map((k) => (
              <ColorRow
                key={k}
                label={COLOR_LABELS[k] ?? k}
                value={f.theme[palette]?.[k] ?? ""}
                disabled={!canManage}
                onChange={(v) => set({ theme: { ...f.theme, [palette]: { ...(f.theme[palette] ?? {}), [k]: v } } })}
              />
            ))}
          </SysGroup>
          <SysGroup icon="menu" tone="violet" title="Üst menü renkleri">
            {menuKeys.map((k) => (
              <ColorRow
                key={k}
                label={MENU_COLOR_LABELS[k] ?? k}
                value={f.theme.menu?.[k] ?? ""}
                disabled={!canManage}
                onChange={(v) => set({ theme: { ...f.theme, menu: { ...(f.theme.menu ?? {}), [k]: v } } })}
              />
            ))}
          </SysGroup>
          {catalog ? (
            <Button
              label="Varsayılan renklere dön"
              variant="ghost"
              size="sm"
              icon="refresh"
              disabled={!canManage}
              onPress={() => set({ theme: JSON.parse(JSON.stringify(catalog.defaultTheme)) })}
            />
          ) : null}
        </View>
      ) : null}

      {tab === "menu" ? (
        <View style={styles.wrap}>
          <SegmentField<string>
            label="Menü stili"
            value={f.layout.header?.style ?? "bar"}
            options={(catalog?.headerStyles ?? [{ key: "bar", label: "Logo solda" }]).map((h) => ({ key: h.key, label: h.label }))}
            onChange={(v) => setLayout({ header: { ...f.layout.header, style: v } })}
          />
          <ToggleField label="Menü sabit kalsın" value={f.layout.header?.sticky ?? true} onChange={(v) => setLayout({ header: { ...f.layout.header, sticky: v } })} />
          <ToggleField label="Giriş / Kayıt düğmeleri" value={f.layout.header?.showLogin ?? true} onChange={(v) => setLayout({ header: { ...f.layout.header, showLogin: v } })} />
          <SysGroup icon="list" tone="cyan" title="Menü öğeleri">
            {items.map((it, i) => (
              <OrderRow
                key={it.key}
                index={i}
                count={items.length}
                visible={it.visible}
                onVisible={(v) => setLayout({ header: { ...f.layout.header, items: items.map((x, idx) => (idx === i ? { ...x, visible: v } : x)) } })}
                onMove={(d) => setLayout({ header: { ...f.layout.header, items: moveItem(items, i, d) } })}
              >
                <Input
                  size="sm"
                  value={it.label}
                  placeholder={catalog?.menuItems.find((m) => m.key === it.key)?.label}
                  onChangeText={(t) => setLayout({ header: { ...f.layout.header, items: items.map((x, idx) => (idx === i ? { ...x, label: t } : x)) } })}
                />
              </OrderRow>
            ))}
          </SysGroup>
          <SysGroup icon="link" tone="gold" title={`Özel bağlantılar (${links.length}/${catalog?.maxCustomLinks ?? 6})`}>
            {links.map((l, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <View key={i} style={styles.linkRow}>
                <Input containerStyle={styles.flex} size="sm" label="Ad" value={l.label} onChangeText={(t) => setLayout({ header: { ...f.layout.header, links: links.map((x, idx) => (idx === i ? { ...x, label: t } : x)) } })} />
                <Input
                  containerStyle={styles.flex}
                  size="sm"
                  label="Adres"
                  value={l.url}
                  autoCapitalize="none"
                  keyboardType="url"
                  onChangeText={(t) => setLayout({ header: { ...f.layout.header, links: links.map((x, idx) => (idx === i ? { ...x, url: t } : x)) } })}
                />
                <Touchable onPress={() => setLayout({ header: { ...f.layout.header, links: links.filter((_, idx) => idx !== i) } })} accessibilityLabel="Bağlantıyı kaldır" accessibilityRole="button" style={styles.remove}>
                  <Ionicons name="close" size={18} color={colors.danger} />
                </Touchable>
              </View>
            ))}
            {links.length < (catalog?.maxCustomLinks ?? 6) ? (
              <Button label="Bağlantı ekle" icon="add" size="sm" variant="secondary" onPress={() => setLayout({ header: { ...f.layout.header, links: [...links, { label: "", url: "" }] } })} />
            ) : null}
          </SysGroup>
        </View>
      ) : null}

      {tab === "home" ? (
        <View style={styles.wrap}>
          <SysGroup icon="image" tone="red" title="Manşet">
            <ToggleField label="Manşet gösterilsin" value={f.layout.hero?.enabled ?? true} onChange={(v) => setLayout({ hero: { ...f.layout.hero, enabled: v } })} />
            <Input label="Başlık" value={f.layout.hero?.title ?? ""} onChangeText={(t) => setLayout({ hero: { ...f.layout.hero, title: t } })} />
            <Input label="Alt başlık" value={f.layout.hero?.subtitle ?? ""} multiline onChangeText={(t) => setLayout({ hero: { ...f.layout.hero, subtitle: t } })} />
            <ImageUploadField label="Manşet görseli" wide value={f.layout.hero?.imageUrl} upload={uploadPortalImage} disabled={!canManage} onChange={(url) => setLayout({ hero: { ...f.layout.hero, imageUrl: url } })} />
            <SegmentField<string>
              label="Hizalama"
              value={f.layout.hero?.align ?? "left"}
              options={[
                { key: "left", label: "Sola" },
                { key: "center", label: "Ortaya" },
              ]}
              onChange={(v) => setLayout({ hero: { ...f.layout.hero, align: v as "left" | "center" } })}
            />
          </SysGroup>
          <SysGroup icon="grid" tone="mint" title="Bölümler">
            {home.map((h, i) => (
              <OrderRow
                key={h.key}
                index={i}
                count={home.length}
                visible={h.visible}
                onVisible={(v) => setLayout({ home: home.map((x, idx) => (idx === i ? { ...x, visible: v } : x)) })}
                onMove={(d) => setLayout({ home: moveItem(home, i, d) })}
              >
                <Input size="sm" value={h.title} placeholder={sectionLabel(h.key)} onChangeText={(t) => setLayout({ home: home.map((x, idx) => (idx === i ? { ...x, title: t } : x)) })} />
              </OrderRow>
            ))}
          </SysGroup>
        </View>
      ) : null}

      {tab === "layout" ? (
        <View style={styles.wrap}>
          <SelectField<string>
            label="Yazıtipi"
            value={f.layout.fontStyle}
            options={(catalog?.fontStyles ?? []).map((x) => ({ value: x.key, label: x.label }))}
            onChange={(v) => setLayout({ fontStyle: v ?? "default" })}
          />
          <SelectField<string>
            label="Köşeler"
            value={f.layout.cornerStyle}
            options={(catalog?.cornerStyles ?? []).map((x) => ({ value: x.key, label: x.label }))}
            onChange={(v) => setLayout({ cornerStyle: v ?? "default" })}
          />
          <ToggleField label="Lig / sezon seçici" hint="Portal içinde yalnız tanımlı ligler listelenir; il seçici gizlidir." value={f.layout.showScopePicker} onChange={(v) => setLayout({ showScopePicker: v })} />
          <Input label="Alt bilgi metni" value={f.layout.footerText ?? ""} multiline onChangeText={(t) => setLayout({ footerText: t })} />
        </View>
      ) : null}

      {failure ? (
        <Text style={styles.error} {...textScale.long}>
          {failure}
        </Text>
      ) : null}
      {canManage ? <Button label={isNew ? "Sayfayı oluştur" : "Kaydet"} onPress={() => void save()} loading={busy} haptic="success" /> : null}
    </View>
  );
}

function ColorRow({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const valid = HEX_COLOR.test(value);
  return (
    <View style={styles.colorRow}>
      <View style={[styles.swatch, valid ? { backgroundColor: value } : styles.swatchEmpty]} />
      <Text style={styles.colorLabel} numberOfLines={2} {...textScale.dense}>
        {label}
      </Text>
      <Input containerStyle={styles.colorInput} size="sm" value={value} autoCapitalize="none" autoCorrect={false} editable={!disabled} onChangeText={onChange} error={value && !valid ? " " : undefined} />
    </View>
  );
}

function OrderRow({ index, count, visible, onVisible, onMove, children }: { index: number; count: number; visible: boolean; onVisible: (v: boolean) => void; onMove: (d: number) => void; children: React.ReactNode }) {
  return (
    <View style={styles.orderRow}>
      <View style={styles.orderBtns}>
        <Touchable onPress={() => onMove(-1)} disabled={index === 0} accessibilityLabel="Yukarı taşı" accessibilityRole="button" hitSlop={6}>
          <Ionicons name="chevron-up" size={18} color={index === 0 ? colors.textDisabled : colors.textSecondary} />
        </Touchable>
        <Touchable onPress={() => onMove(1)} disabled={index === count - 1} accessibilityLabel="Aşağı taşı" accessibilityRole="button" hitSlop={6}>
          <Ionicons name="chevron-down" size={18} color={index === count - 1 ? colors.textDisabled : colors.textSecondary} />
        </Touchable>
      </View>
      <View style={styles.flex}>{children}</View>
      <Touchable onPress={() => onVisible(!visible)} accessibilityLabel={visible ? "Gizle" : "Göster"} accessibilityRole="switch" accessibilityState={{ checked: visible }} hitSlop={6}>
        <Ionicons name={visible ? "eye-outline" : "eye-off-outline"} size={20} color={visible ? colors.brandAccent : colors.textTertiary} />
      </Touchable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  flex: { flex: 1 },
  hint: { ...type.caption, color: colors.textSecondary },
  error: { ...type.bodySm, color: colors.danger },
  colorRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 2 },
  swatch: { width: 28, height: 28, borderRadius: radius.sm, borderWidth: hairline, borderColor: colors.borderStrong },
  swatchEmpty: { backgroundColor: colors.surface3 },
  colorLabel: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  colorInput: { width: 112 },
  orderRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs, borderBottomWidth: hairline, borderBottomColor: colors.separator },
  orderBtns: { gap: 2 },
  linkRow: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  remove: { padding: space.sm },
});
