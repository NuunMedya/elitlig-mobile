/**
 * ZİYARETÇİ ANALİZİ — elitlig.com ziyaret raporu (web pages/management/analytics/SiteAnalytics.js).
 *
 * NE: süzgeçler (tarih aralığı + özel aralık, kim sayılsın, cihaz) tüm
 * bölümleri kapsar. Bölümler: Genel bakış (göstergeler önceki eşit döneme
 * göre, trafik grafiği, öne çıkanlar), Şu an (15 sn'de bir yenilenir),
 * Sayfalar, Kaynaklar (kampanya bağlantısı oluşturucu dahil), Aramalar, Kitle
 * ve cihaz (gün × saat yoğunluğu), Etkileşim, Hız ve hata.
 *
 * MOBİLDE YOK: Isı haritası — sayfanın canlı önizlemesini (iframe) üstüne
 * tıklama noktaları çizerek gösterir; telefonda WebView olmadan çizilemez.
 * "Bu tarayıcıyı sayma" anahtarı da yalnız web tarayıcısı için anlamlıdır.
 *
 * Tablolar telefonda sarmalayan satır olarak çizilir; her tablo "CSV
 * paylaş" ile dışa aktarılabilir.
 */

import * as Clipboard from "expo-clipboard";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AdminScreen, DateField, Panel } from "@/components/admin";
import { BarList, KpiGrid, KpiTile, TrendChart, WeekHourGrid } from "@/components/admin/system/charts";
import { DataList } from "@/components/admin/system/DataList";
import { Badge, Button, Chip, ChipGroup, ErrorState, Input, SkeletonCard, Tabs, useToast } from "@/components/ui";
import { formatDateTime, formatTime } from "@/lib/admin/format";
import {
  RANGE_PRESETS,
  RATING_LABELS,
  SITE_SECTIONS,
  VITAL_LABELS,
  audienceLabel,
  channelLabel,
  deviceLabel,
  fmtBucket,
  fmtDuration,
  fmtNum,
  fmtPct,
  fmtVital,
  getSiteReport,
  presetRange,
  systemKeys,
  type AnalyticsReport,
  type RangePreset,
  type SiteSection,
} from "@/lib/api/admin/system";
import { ROLE_LABELS } from "@/lib/api/admin";
import { colors, space, textScale, type } from "@/theme";

const PERMS = ["analytics.view"];
const AUDIENCES = [
  { key: "visitor", label: "Ziyaretçiler" },
  { key: "member", label: "Üyeler" },
  { key: "management", label: "Yönetim" },
];
const DEVICES = [
  { key: "", label: "Tüm cihazlar" },
  { key: "desktop", label: "Masaüstü" },
  { key: "mobile", label: "Mobil" },
  { key: "tablet", label: "Tablet" },
];

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
const list = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const bars = (rows: unknown, label: (r: Row) => string = (r) => r.key || "Bilinmiyor", field = "unique", note?: (r: Row) => string) =>
  list(rows).map((r, i) => ({ key: String(r.key ?? i), label: label(r), value: Number(r[field] ?? r.count ?? 0), note: note?.(r) }));

export default function SiteAnalyticsScreen() {
  const [section, setSection] = useState<SiteSection>("overview");
  const [preset, setPreset] = useState<RangePreset>("30");
  const [custom, setCustom] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
  const [audiences, setAudiences] = useState<string[]>(["visitor", "member"]);
  const [device, setDevice] = useState("");

  const range = preset === "custom" && custom.from && custom.to ? { from: custom.from, to: custom.to } : presetRange(preset === "custom" ? "30" : preset);
  const params = useMemo(
    () =>
      section === "realtime"
        ? { audiences: audiences.join(","), device: device || undefined }
        : { from: range.from, to: range.to, audiences: audiences.join(","), device: device || undefined },
    [section, range.from, range.to, audiences, device]
  );

  const query = useQuery({
    queryKey: systemKeys.site(section, params),
    queryFn: () => getSiteReport(section, params),
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[3] === section ? prev : undefined),
    refetchInterval: section === "realtime" ? 15_000 : false,
    staleTime: section === "realtime" ? 0 : 60_000,
  });

  const toggleAudience = (key: string) => {
    const next = audiences.includes(key) ? audiences.filter((a) => a !== key) : [...audiences, key];
    if (next.length) setAudiences(AUDIENCES.map((a) => a.key).filter((k) => next.includes(k)));
  };

  return (
    <AdminScreen
      title="Ziyaretçi analizi"
      permission={PERMS}
      onRefresh={query.refetch}
      refreshing={query.isRefetching}
      bottom={<Tabs items={SITE_SECTIONS} value={section} onChange={setSection} distribute="scroll" />}
    >
      {section !== "realtime" ? (
        <View style={styles.filters}>
          <ChipGroup scrollable contentPadding={0}>
            {RANGE_PRESETS.map((p) => (
              <Chip key={p.key} label={p.label} size="sm" selected={preset === p.key} onPress={() => setPreset(p.key)} />
            ))}
            <Chip label="Özel aralık" icon="calendar-outline" size="sm" selected={preset === "custom"} onPress={() => setPreset("custom")} />
          </ChipGroup>
          {preset === "custom" ? (
            <View style={styles.dates}>
              <View style={styles.flex}>
                <DateField label="Başlangıç" value={custom.from} onChange={(v) => setCustom((c) => ({ ...c, from: v }))} />
              </View>
              <View style={styles.flex}>
                <DateField label="Bitiş" value={custom.to} onChange={(v) => setCustom((c) => ({ ...c, to: v }))} />
              </View>
            </View>
          ) : null}
          <Text style={styles.rangeText} {...textScale.dense}>
            {fmtBucket(range.from)} – {fmtBucket(range.to)} · önceki eşit dönemle karşılaştırılır
          </Text>
        </View>
      ) : null}
      <ChipGroup scrollable contentPadding={0}>
        {AUDIENCES.map((a) => (
          <Chip key={a.key} label={a.label} size="sm" icon={audiences.includes(a.key) ? "checkmark" : undefined} selected={audiences.includes(a.key)} onPress={() => toggleAudience(a.key)} />
        ))}
        {DEVICES.map((d) => (
          <Chip key={d.key || "all"} label={d.label} size="sm" selected={device === d.key} onPress={() => setDevice(d.key)} />
        ))}
      </ChipGroup>

      {query.error ? <ErrorState error={query.error} onRetry={query.refetch} variant={query.data ? "banner" : "inline"} /> : null}
      {!query.data ? (
        query.isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : null
      ) : (
        <View style={[styles.stack, query.isFetching && section !== "realtime" ? styles.refreshing : null]}>
          <SectionBody section={section} data={query.data} />
        </View>
      )}

      <Text style={styles.foot} {...textScale.long}>
        Ziyaretçi, tarayıcıda tutulan rastgele bir kimlikle sayılır (kişisel bilgi ve IP saklanmaz). 30 dakika hareketsiz kalan ziyaret biter.
        Süreler yalnız sekme açıkken sayılır. Botlar sayılmaz. Saatler Türkiye saatidir. Yönetim paneli sayılmaz.
      </Text>
    </AdminScreen>
  );
}

function SectionBody({ section, data }: { section: SiteSection; data: AnalyticsReport }) {
  switch (section) {
    case "overview":
      return <Overview data={data} />;
    case "realtime":
      return <Realtime data={data} />;
    case "pages":
      return <Pages data={data} />;
    case "sources":
      return <Sources data={data} />;
    case "searches":
      return <Searches data={data} />;
    case "audience":
      return <Audience data={data} />;
    case "interactions":
      return <Interactions data={data} />;
    case "performance":
      return <Performance data={data} />;
    default:
      return null;
  }
}

/** Verilerden okunur cümleler — web OverviewTab.buildInsights. */
function insights(data: AnalyticsReport): string[] {
  const out: string[] = [];
  const c = data.current ?? {};
  const p = data.previous ?? {};
  if (!c.pageviews) return out;
  if (p.visitors) {
    const change = ((c.visitors - p.visitors) / p.visitors) * 100;
    out.push(`Ziyaretçi sayısı önceki döneme göre ${fmtPct(Math.abs(change))} ${change >= 0 ? "arttı" : "azaldı"} (${fmtNum(p.visitors)} → ${fmtNum(c.visitors)}).`);
  }
  const trend = data.trend ?? { points: [], granularity: "day" };
  const peak = [...list(trend.points)].sort((a, b) => b.pageviews - a.pageviews)[0];
  if (peak?.pageviews) out.push(`En yoğun ${trend.granularity === "hour" ? "saat" : "gün"} ${fmtBucket(peak.key, trend.granularity)}: ${fmtNum(peak.pageviews)} görüntüleme.`);
  const channels = list(data.channels);
  const totalSessions = channels.reduce((a, r) => a + Number(r.count || 0), 0);
  if (channels[0] && totalSessions) out.push(`Oturumların ${fmtPct((channels[0].count / totalSessions) * 100, 0)}'i "${channelLabel(channels[0].key)}" kanalından geldi.`);
  const devices = list(data.devices);
  const totalDevice = devices.reduce((a, r) => a + Number(r.count || 0), 0);
  const mobile = devices.find((d) => d.key === "mobile");
  if (mobile && totalDevice) out.push(`Görüntülemelerin ${fmtPct((mobile.count / totalDevice) * 100, 0)}'i mobil cihazlardan.`);
  const top = list(data.topPages)[0];
  if (top) out.push(`En çok görüntülenen sayfa ${top.key} (${fmtNum(top.count)}).`);
  const search = list(data.topSearches)[0];
  if (search) out.push(`Sitede en çok aranan sözcük "${search.key}" (${fmtNum(search.count)} kez).`);
  if (c.bounceRate >= 60) out.push(`Hemen çıkma oranı yüksek (${fmtPct(c.bounceRate)}): ziyaretçilerin çoğu tek sayfa görüp ayrılıyor.`);
  return out;
}

function Overview({ data }: { data: AnalyticsReport }) {
  const c = data.current ?? {};
  const p = data.previous ?? {};
  const trend = data.trend ?? { points: [], granularity: "day" };
  const points = list(trend.points);
  const notes = insights(data);
  return (
    <>
      <KpiGrid>
        <KpiTile label="Ziyaretçi" value={c.visitors} previous={p.visitors} />
        <KpiTile label="Oturum" value={c.sessions} previous={p.sessions} />
        <KpiTile label="Sayfa görüntüleme" value={c.pageviews} previous={p.pageviews} />
        <KpiTile label="Oturum başına sayfa" value={c.pagesPerSession} previous={p.pagesPerSession} format={(v) => v.toLocaleString("tr-TR")} />
        <KpiTile label="Ortalama oturum süresi" value={c.avgSessionMs} previous={p.avgSessionMs} format={fmtDuration} />
        <KpiTile label="Sayfada ortalama süre" value={c.avgTimeOnPageMs} previous={p.avgTimeOnPageMs} format={fmtDuration} />
        <KpiTile label="Hemen çıkma oranı" value={c.bounceRate} previous={p.bounceRate} format={(v) => fmtPct(v)} lowerIsBetter />
        <KpiTile label="Ortalama kaydırma" value={c.avgScroll} previous={p.avgScroll} format={(v) => fmtPct(v)} />
        <KpiTile label="Yeni ziyaretçi" value={c.newVisitors} previous={p.newVisitors} />
        <KpiTile label="Geri dönen ziyaretçi" value={c.returningVisitors} previous={p.returningVisitors} />
        <KpiTile label="Giriş yapmış kullanıcı" value={c.loggedInUsers} previous={p.loggedInUsers} />
      </KpiGrid>
      <Panel title={`Trafik · ${trend.granularity === "hour" ? "saatlik" : "günlük"}`}>
        <TrendChart
          labels={points.map((pt) => fmtBucket(pt.key, trend.granularity))}
          series={[
            { label: "Görüntüleme", data: points.map((pt) => pt.pageviews) },
            { label: "Ziyaretçi", data: points.map((pt) => pt.visitors) },
            { label: "Oturum", data: points.map((pt) => pt.sessions) },
          ]}
        />
      </Panel>
      {notes.length ? (
        <Panel title="Öne çıkanlar">
          {notes.map((t) => (
            <Text key={t} style={styles.insight} {...textScale.long}>
              • {t}
            </Text>
          ))}
        </Panel>
      ) : null}
      <Panel title="Trafik kanalları">
        <BarList rows={bars(data.channels, (r) => channelLabel(r.key), "count")} />
      </Panel>
      <Panel title="Cihazlar">
        <BarList rows={bars(data.devices, (r) => deviceLabel(r.key))} />
      </Panel>
      <Panel title="En çok görüntülenen sayfalar">
        <BarList rows={bars(data.topPages, (r) => r.key, "count")} />
      </Panel>
      <Panel title="Sayfa türleri">
        <BarList rows={bars(data.pageTypes, (r) => r.key || "Diğer", "count")} />
      </Panel>
      <Panel title="En çok aranan sözcükler">
        <BarList rows={bars(data.topSearches, (r) => r.key, "count")} emptyText="Bu aralıkta site içinde arama yapılmadı." />
      </Panel>
    </>
  );
}

function Realtime({ data }: { data: AnalyticsReport }) {
  const perMinute: number[] = Array.isArray(data.perMinute) ? data.perMinute : [];
  return (
    <>
      <Panel>
        <View style={styles.live}>
          <Badge label="Canlı" tone="live" dot />
          <Text style={styles.liveValue} {...textScale.badge}>
            {fmtNum(data.activeVisitors)}
          </Text>
          <Text style={styles.liveLabel} {...textScale.dense}>
            şu an sitede · {fmtNum(data.activeSessions)} açık ziyaret · {formatTime(data.at)} itibarıyla, 15 sn'de bir yenilenir
          </Text>
        </View>
      </Panel>
      <Panel title="Son 30 dakika · dakikalık görüntüleme">
        <TrendChart type="bar" labels={perMinute.map((_, i) => `${perMinute.length - i} dk önce`)} series={[{ label: "Görüntüleme", data: perMinute }]} height={120} />
      </Panel>
      <Panel title="Şu an açık sayfalar">
        <BarList rows={list(data.pages).map((p) => ({ key: p.path, label: p.path, value: p.visitors, note: p.pageType }))} emptyText="Şu an sitede kimse yok." />
      </Panel>
      <Panel title="Cihaz">
        <BarList rows={bars(data.devices, (r) => deviceLabel(r.key), "count")} emptyText="—" />
      </Panel>
      <Panel title="Kaynak">
        <BarList rows={bars(data.sources, (r) => r.key || "Bilinmiyor", "count")} emptyText="—" />
      </Panel>
      <Panel title="Canlı akış">
        <DataList
          rows={list(data.feed)}
          primary={(r) => r.path}
          primaryLabel="Sayfa"
          limit={15}
          columns={[
            { key: "at", label: "Saat", render: (r) => formatTime(r.at) },
            { key: "source", label: "Kaynak" },
            { key: "device", label: "Cihaz", render: (r) => `${deviceLabel(r.device)}${r.browser ? ` · ${r.browser}` : ""}` },
            { key: "audience", label: "Kim", render: (r) => audienceLabel(r.audience) },
          ]}
          emptyText="Son 30 dakikada görüntüleme yok."
        />
      </Panel>
    </>
  );
}

function Pages({ data }: { data: AnalyticsReport }) {
  const [q, setQ] = useState("");
  const [pageType, setPageType] = useState("");
  const pages = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr-TR");
    return list(data.pages)
      .filter((p) => (!needle || String(p.path).toLocaleLowerCase("tr-TR").includes(needle)) && (!pageType || p.pageType === pageType))
      .sort((a, b) => b.views - a.views);
  }, [data, q, pageType]);
  const entity = [
    { key: "views", label: "Görüntüleme" },
    { key: "visitors", label: "Ziyaretçi" },
  ];
  return (
    <>
      <Panel title="Tüm sayfalar">
        <Input variant="search" leadingIcon="search" value={q} onChangeText={setQ} placeholder="Sayfa yolunda ara" autoCapitalize="none" autoCorrect={false} />
        <ChipGroup scrollable contentPadding={0}>
          <Chip label="Tüm türler" size="sm" selected={!pageType} onPress={() => setPageType("")} />
          {list(data.pageTypes).map((t) => (
            <Chip key={t.key} label={t.key || "Diğer"} size="sm" selected={pageType === t.key} onPress={() => setPageType(t.key)} />
          ))}
        </ChipGroup>
        <DataList
          rows={pages}
          primary={(r) => r.path}
          primaryLabel="Sayfa"
          csvTitle="Sayfalar"
          columns={[
            { key: "pageType", label: "Tür" },
            { key: "views", label: "Görüntüleme" },
            { key: "visitors", label: "Ziyaretçi" },
            { key: "avgTimeMs", label: "Ort. süre", render: (r) => fmtDuration(r.avgTimeMs) },
            { key: "avgScroll", label: "Kaydırma", render: (r) => fmtPct(r.avgScroll, 0) },
            { key: "entries", label: "Giriş" },
            { key: "bounceRate", label: "Hemen çıkma", render: (r) => (r.entries ? fmtPct(r.bounceRate) : "—") },
            { key: "exits", label: "Çıkış" },
            { key: "exitRate", label: "Çıkış oranı", render: (r) => fmtPct(r.exitRate) },
          ]}
          emptyText="Süzgece uyan sayfa yok."
        />
      </Panel>
      <Panel title="Sayfa türleri">
        <BarList
          rows={list(data.pageTypes).map((t) => ({ key: t.key || "none", label: t.key || "Diğer", value: t.count, note: `${fmtNum(t.unique)} ziyaretçi` }))}
          onSelect={(row) => setPageType(row.key === "none" ? "" : row.key)}
          limit={12}
        />
      </Panel>
      <Panel title="İller · il sayfalarının görüntülenmesi">
        <BarList rows={list(data.cities).map((c) => ({ key: String(c.id), label: c.name, value: c.views, note: `${fmtNum(c.visitors)} ziyaretçi` }))} emptyText="İl sayfası görüntülenmedi." />
      </Panel>
      <Panel title="Giriş sayfaları">
        <DataList rows={list(data.entryPages)} primary={(r) => r.path} primaryLabel="Sayfa" csvTitle="Giriş sayfaları" columns={[{ key: "entries", label: "Giriş" }, { key: "bounceRate", label: "Hemen çıkma", render: (r) => fmtPct(r.bounceRate) }]} />
      </Panel>
      <Panel title="Çıkış sayfaları">
        <DataList rows={list(data.exitPages)} primary={(r) => r.path} primaryLabel="Sayfa" csvTitle="Çıkış sayfaları" columns={[{ key: "exits", label: "Çıkış" }, { key: "exitRate", label: "Çıkış oranı", render: (r) => fmtPct(r.exitRate) }]} />
      </Panel>
      <Panel title="En çok bakılan oyuncular">
        <DataList rows={list(data.players)} primary={(r) => r.name} primaryLabel="Oyuncu" columns={entity} emptyText="Oyuncu profili görüntülenmedi." />
      </Panel>
      <Panel title="En çok bakılan takımlar">
        <DataList rows={list(data.teams)} primary={(r) => r.name} primaryLabel="Takım" columns={entity} emptyText="Takım profili görüntülenmedi." />
      </Panel>
      <Panel title="En çok bakılan maçlar">
        <DataList rows={list(data.matches)} primary={(r) => r.name} primaryLabel="Maç" columns={entity} emptyText="Maç sayfası görüntülenmedi." />
      </Panel>
      <Panel title="Sayfa akışları">
        <DataList
          rows={list(data.flows)}
          primary={(r) => `${r.from} → ${r.to}`}
          primaryLabel="Akış"
          columns={[{ key: "count", label: "Geçiş" }]}
          emptyText="Birden fazla sayfa gezilen ziyaret yok."
        />
      </Panel>
    </>
  );
}

function CampaignBuilder() {
  const toast = useToast();
  const [form, setForm] = useState({ base: "https://elitlig.com/", source: "instagram", medium: "social", campaign: "" });
  const url = useMemo(() => {
    if (!form.base || !form.source) return "";
    try {
      const u = new URL(form.base.startsWith("http") ? form.base : `https://${form.base}`);
      u.searchParams.set("utm_source", form.source.trim());
      if (form.medium) u.searchParams.set("utm_medium", form.medium.trim());
      if (form.campaign) u.searchParams.set("utm_campaign", form.campaign.trim());
      return u.toString();
    } catch {
      return "";
    }
  }, [form]);
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <View style={styles.stackSm}>
      <Text style={styles.hint} {...textScale.long}>
        Paylaştığın bağlantıya kampanya bilgisi eklersen o paylaşımdan gelen ziyaretler "Kampanyalar" listesinde ayrı görünür (Instagram hikâyesi, WhatsApp grubu, afiş QR kodu).
      </Text>
      <Input label="Sayfa adresi" value={form.base} onChangeText={set("base")} autoCapitalize="none" keyboardType="url" />
      <Input label="Kaynak (utm_source)" value={form.source} onChangeText={set("source")} autoCapitalize="none" placeholder="instagram, whatsapp, afis" />
      <Input label="Kanal (utm_medium)" value={form.medium} onChangeText={set("medium")} autoCapitalize="none" placeholder="social, qr, email" />
      <Input label="Kampanya (utm_campaign)" value={form.campaign} onChangeText={set("campaign")} autoCapitalize="none" placeholder="final-2026" />
      <Text style={styles.code} selectable {...textScale.long}>
        {url || "Sayfa adresi ve kaynak gir"}
      </Text>
      <Button
        label="Bağlantıyı kopyala"
        icon="copy-outline"
        disabled={!url}
        onPress={async () => {
          await Clipboard.setStringAsync(url);
          toast.show({ message: "Kampanya bağlantısı kopyalandı.", tone: "success" });
        }}
      />
    </View>
  );
}

const sessionCols = [
  { key: "sessions", label: "Oturum" },
  { key: "visitors", label: "Ziyaretçi" },
  { key: "pagesPerSession", label: "Sayfa/oturum", render: (r: Row) => Number(r.pagesPerSession || 0).toLocaleString("tr-TR") },
  { key: "bounceRate", label: "Hemen çıkma", render: (r: Row) => fmtPct(r.bounceRate) },
];

function Sources({ data }: { data: AnalyticsReport }) {
  const trend = data.channelTrend ?? { days: [], series: [] };
  return (
    <>
      <Panel title="Kanallara göre günlük oturum">
        {list(trend.series).length ? (
          <TrendChart labels={(trend.days ?? []).map((d: string) => fmtBucket(d))} series={list(trend.series).slice(0, 7).map((s) => ({ label: channelLabel(s.key), data: s.values }))} />
        ) : null}
        <DataList rows={list(data.channels)} primary={(r) => channelLabel(r.key)} primaryLabel="Kanal" csvTitle="Kanallar" columns={sessionCols} />
      </Panel>
      <Panel title="Kaynaklar">
        <DataList
          rows={list(data.sources)}
          primary={(r) => `${r.source} · ${channelLabel(r.medium)}`}
          primaryLabel="Kaynak"
          csvTitle="Kaynaklar"
          columns={sessionCols}
        />
      </Panel>
      <Panel title="Yönlendiren siteler">
        <DataList rows={list(data.referrers)} primary={(r) => r.key} primaryLabel="Site" columns={[{ key: "unique", label: "Oturum" }]} emptyText="Başka bir siteden gelen ziyaret yok." />
      </Panel>
      <Panel title="Yönlendiren sayfalar">
        <DataList rows={list(data.referrerUrls)} primary={(r) => r.key} primaryLabel="Adres" columns={[{ key: "unique", label: "Oturum" }]} emptyText="Başka bir siteden gelen ziyaret yok." />
      </Panel>
      <Panel title="Kampanyalar">
        <DataList
          rows={list(data.campaigns)}
          primary={(r) => [r.source, r.medium, r.campaign].filter(Boolean).join(" / ")}
          primaryLabel="Kampanya"
          columns={[{ key: "sessions", label: "Oturum" }]}
          emptyText="Kampanya bağlantısıyla gelen ziyaret yok. Aşağıdaki oluşturucuyla bağlantı hazırlayabilirsin."
        />
      </Panel>
      <Panel title="Arama motorundan gelen sözcükler">
        <DataList rows={list(data.engineTerms)} primary={(r) => r.key} primaryLabel="Sözcük" columns={[{ key: "unique", label: "Oturum" }]} emptyText="Bu aralıkta sözcük bilgisi gelmedi." />
        <Text style={styles.hint} {...textScale.long}>
          Google aranan sözcükleri sitelere iletmez; burada yalnız Bing, Yandex gibi motorların ilettikleri görünür.
        </Text>
      </Panel>
      <Panel title="Kampanya bağlantısı oluşturucu">
        <CampaignBuilder />
      </Panel>
    </>
  );
}

function Searches({ data }: { data: AnalyticsReport }) {
  const t = data.totals ?? {};
  const trend = list(data.trend);
  return (
    <>
      <KpiGrid>
        <KpiTile label="Toplam arama" value={t.searches} />
        <KpiTile label="Farklı sözcük" value={t.uniqueTerms} />
        <KpiTile label="Arama yapan ziyaretçi" value={t.searchers} />
        <KpiTile label="Aramalı ziyaret payı" value={t.sessionShare} format={(v) => fmtPct(v)} />
        <KpiTile label="Ziyaret başına arama" value={t.perSearchSession} format={(v) => v.toLocaleString("tr-TR")} />
      </KpiGrid>
      <Panel title="Günlük arama sayısı">
        <TrendChart type="bar" labels={trend.map((p) => fmtBucket(p.key))} series={[{ label: "Arama", data: trend.map((p) => p.count) }]} height={140} />
      </Panel>
      <Panel title="En çok aranan sözcükler">
        <DataList
          rows={list(data.terms)}
          primary={(r) => r.term}
          primaryLabel="Sözcük"
          csvTitle="Aranan sözcükler"
          columns={[
            { key: "count", label: "Arama" },
            { key: "visitors", label: "Ziyaretçi" },
            { key: "path", label: "Sayfa" },
            { key: "lastAt", label: "Son", render: (r) => formatDateTime(r.lastAt) },
          ]}
        />
      </Panel>
      <Panel title="Aramadan sonra tıklamadan ayrılanlar">
        <DataList rows={list(data.noClickAfter)} primary={(r) => r.term} primaryLabel="Sözcük" columns={[{ key: "sessions", label: "Ziyaret" }]} emptyText="Yok." />
      </Panel>
      <Panel title="Arama yapılan sayfalar">
        <DataList
          rows={list(data.byPage)}
          primary={(r) => r.path}
          primaryLabel="Sayfa"
          columns={[
            { key: "input", label: "Kutu" },
            { key: "count", label: "Arama" },
            { key: "terms", label: "Sözcük" },
          ]}
        />
      </Panel>
      <Panel title="Son aramalar">
        <DataList
          rows={list(data.recent)}
          primary={(r) => r.term}
          primaryLabel="Sözcük"
          limit={15}
          columns={[
            { key: "at", label: "Zaman", render: (r) => formatDateTime(r.at) },
            { key: "path", label: "Sayfa" },
            { key: "device", label: "Cihaz", render: (r) => deviceLabel(r.device) },
            { key: "audience", label: "Kim", render: (r) => audienceLabel(r.audience) },
          ]}
        />
      </Panel>
    </>
  );
}

function Audience({ data }: { data: AnalyticsReport }) {
  const simple = (title: string, rows: unknown, label?: (r: Row) => string, field = "unique") => (
    <Panel title={title}>
      <BarList rows={bars(rows, label, field)} />
    </Panel>
  );
  return (
    <>
      <Panel title="Ziyaret yoğunluğu · gün ve saate göre görüntüleme">
        <WeekHourGrid grid={data.weekHour} />
      </Panel>
      {simple("Cihaz", data.devices, (r) => deviceLabel(r.key))}
      {simple("Ziyaretçi türü", data.audiences, (r) => audienceLabel(r.key))}
      <Panel title="Yeni / geri dönen">
        <BarList rows={list(data.newVsReturning).map((r) => ({ key: r.key, label: r.key, value: r.sessions, note: `${fmtNum(r.visitors)} ziyaretçi` }))} />
      </Panel>
      {simple("Tarayıcı", data.browsers)}
      {simple("İşletim sistemi", data.oses)}
      {simple("Pencere genişliği", data.viewports)}
      {simple("Ekran çözünürlüğü", data.screens)}
      {simple("Dil", data.langs)}
      {simple("Saat dilimi", data.tzs)}
      {simple("Oturum derinliği", data.sessionDepth, (r) => r.key, "count")}
      {simple("Oturum süresi", data.sessionDuration, (r) => r.key, "count")}
      {simple("Ziyaret sıklığı", data.visitFrequency, (r) => r.key, "count")}
      <Panel title="En aktif giriş yapmış kullanıcılar">
        <DataList
          rows={list(data.topUsers)}
          primary={(r) => r.username}
          primaryLabel="Kullanıcı"
          csvTitle="Aktif kullanıcılar"
          columns={[
            { key: "role", label: "Rol", render: (r) => ROLE_LABELS[r.role] || r.role || audienceLabel(r.audience) },
            { key: "pageviews", label: "Görüntüleme" },
            { key: "sessions", label: "Oturum" },
            { key: "lastAt", label: "Son", render: (r) => formatDateTime(r.lastAt) },
          ]}
          emptyText="Bu aralıkta giriş yapmış kullanıcı ziyareti yok."
        />
      </Panel>
    </>
  );
}

function Interactions({ data }: { data: AnalyticsReport }) {
  return (
    <>
      <KpiGrid>
        <KpiTile label="Toplam tıklama" value={data.totals?.clicks} />
        <KpiTile label="Tıklama yapılan ziyaret" value={data.totals?.sessions} />
      </KpiGrid>
      <Panel title="İletişim ve sosyal medya tıklamaları">
        <BarList
          rows={list(data.contact).map((r) => ({ key: r.key, label: r.key, value: r.count, note: `${fmtNum(r.visitors)} ziyaretçi` }))}
          emptyText="Bu aralıkta iletişim bağlantısına tıklanmadı."
        />
      </Panel>
      <Panel title="Sayfalara göre tıklama">
        <DataList
          rows={list(data.byPage)}
          primary={(r) => r.path}
          primaryLabel="Sayfa"
          columns={[
            { key: "clicks", label: "Tıklama" },
            { key: "rate", label: "Görüntüleme başına", render: (r) => (r.views ? (r.clicks / r.views).toLocaleString("tr-TR", { maximumFractionDigits: 1 }) : "0") },
          ]}
        />
      </Panel>
      <Panel title="Dış bağlantılar">
        <DataList rows={list(data.outbound)} primary={(r) => r.href} primaryLabel="Bağlantı" csvTitle="Dış bağlantılar" columns={[{ key: "count", label: "Tıklama" }, { key: "visitors", label: "Ziyaretçi" }]} />
      </Panel>
      <Panel title="En çok tıklanan öğeler">
        <DataList
          rows={list(data.elements)}
          primary={(r) => r.target}
          primaryLabel="Öğe"
          csvTitle="Tıklanan öğeler"
          columns={[
            { key: "href", label: "Bağlantı" },
            { key: "count", label: "Tıklama" },
            { key: "visitors", label: "Ziyaretçi" },
          ]}
        />
      </Panel>
    </>
  );
}

function Performance({ data }: { data: AnalyticsReport }) {
  const errTrend = list(data.errorTrend);
  const vitals = list(data.vitals);
  return (
    <>
      <Panel title="Sayfa hızı · gerçek ziyaretçiler (75. yüzdelik)">
        {vitals.length ? (
          vitals.map((v) => (
            <View key={v.name} style={styles.vital}>
              <View style={styles.flex}>
                <Text style={styles.vitalLabel} {...textScale.dense}>
                  {VITAL_LABELS[v.name] ?? v.name}
                </Text>
                <Text style={styles.hint} {...textScale.dense}>
                  {fmtNum(v.count)} ölçüm · iyi ≤ {fmtVital(v.name, v.thresholds?.[0])} · İyi {fmtPct(v.distribution?.good, 0)} · Zayıf {fmtPct(v.distribution?.poor, 0)}
                </Text>
              </View>
              <View style={styles.vitalRight}>
                <Text style={styles.vitalValue} {...textScale.badge}>
                  {fmtVital(v.name, v.p75)}
                </Text>
                {v.rating ? <Badge label={RATING_LABELS[v.rating] ?? v.rating} tone={v.rating === "good" ? "win" : v.rating === "poor" ? "danger" : "warn"} size="xs" /> : null}
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.hint} {...textScale.dense}>
            Bu aralıkta hız ölçümü gelmedi.
          </Text>
        )}
      </Panel>
      <Panel title="Sayfa türüne göre LCP">
        <DataList rows={list(data.lcpByPageType)} primary={(r) => r.key} primaryLabel="Sayfa türü" columns={[{ key: "p75", label: "LCP", render: (r) => fmtVital("LCP", r.p75) }, { key: "count", label: "Ölçüm" }]} />
      </Panel>
      <Panel title="Cihaza göre LCP">
        <DataList rows={list(data.lcpByDevice)} primary={(r) => deviceLabel(r.key)} primaryLabel="Cihaz" columns={[{ key: "p75", label: "LCP", render: (r) => fmtVital("LCP", r.p75) }, { key: "count", label: "Ölçüm" }]} />
      </Panel>
      <Panel title="Tarayıcı hataları">
        {errTrend.length ? (
          <TrendChart type="bar" labels={errTrend.map((p) => fmtBucket(p.key))} series={[{ label: "Hata", data: errTrend.map((p) => p.count), color: colors.danger }]} height={110} />
        ) : null}
        <DataList
          rows={list(data.errors)}
          primary={(r) => r.message}
          primaryLabel="Hata"
          csvTitle="Tarayıcı hataları"
          columns={[
            { key: "count", label: "Adet" },
            { key: "sessions", label: "Ziyaret" },
            { key: "path", label: "Sayfa" },
            { key: "browser", label: "Tarayıcı" },
            { key: "lastAt", label: "Son", render: (r) => formatDateTime(r.lastAt) },
          ]}
          emptyText="Hata yok."
        />
      </Panel>
      <Panel title="Hataların tarayıcılara dağılımı">
        <BarList rows={bars(data.errorBrowsers)} emptyText="Hata yok." />
      </Panel>
    </>
  );
}

/* eslint-enable @typescript-eslint/no-explicit-any */

const styles = StyleSheet.create({
  filters: { gap: space.sm },
  dates: { flexDirection: "row", gap: space.sm },
  flex: { flex: 1 },
  rangeText: { ...type.caption, color: colors.textTertiary },
  stack: { gap: space.md },
  stackSm: { gap: space.sm },
  refreshing: { opacity: 0.6 },
  insight: { ...type.bodySm, color: colors.textSecondary },
  live: { alignItems: "flex-start", gap: space.xs },
  liveValue: { ...type.scoreMd, color: colors.textPrimary },
  liveLabel: { ...type.caption, color: colors.textTertiary },
  hint: { ...type.caption, color: colors.textTertiary },
  code: { ...type.caption, color: colors.textPrimary, backgroundColor: colors.surface3, padding: space.sm },
  vital: { flexDirection: "row", gap: space.md, alignItems: "center", paddingVertical: space.xs },
  vitalLabel: { ...type.bodySm, color: colors.textPrimary },
  vitalRight: { alignItems: "flex-end", gap: space.xxs },
  vitalValue: { ...type.numSmStrong, color: colors.textPrimary },
  foot: { ...type.caption, color: colors.textTertiary, marginTop: space.md },
});
