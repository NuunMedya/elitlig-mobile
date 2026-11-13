/**
 * KARİYER MERDİVENİ — /kulup-sehri-merdiven
 *
 * Kulüp Şehri 2.0'ın 18 basamağı (16. basamak iki alt adım: 16a · 16b; toplam
 * 19 kademe). Her kademe: ulaşıldı / şu an / sıradaki / kilitli. Sıradaki
 * kademenin canlı koşulları (gelişim puanı, bina aşamaları, gerçek hayat
 * kilidi) ve "Basamak atla"; ileridekilerin koşulları ham tanımdan okunur.
 * Altta tırmanış geçmişi.
 *
 * FAZ 5 · PRESTİJ: 19. kademede (son basamak) en üstte prestij kartı:
 * önizleme (sıfırlananlar / korunanlar / kazanılanlar) → "anladım" → jetonla
 * onay → kutlama. Zirvede değilken merdivenin sonunda "son basamakta açılır"
 * tanıtımı. Özette arma (sezon çerçevesi + prestij yıldızları). Eski sunucuda
 * (`prestige` yok) hiçbiri çizilmez.
 *
 * Bütün adlar, eşikler ve koşullar sunucudan gelir (GET /city2 → ladder).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ChunkyButton } from "@/components/city/ChunkyButton";
import { GateSummary } from "@/components/city2/GateView";
import { StepCelebration, type StepResult } from "@/components/city2/Notices";
import { PrestigeCard, PrestigeCelebration, PrestigeSheet, PrestigeTeaser } from "@/components/city2/Prestige";
import { CrestBadge } from "@/components/city2/Season";
import { cardStyle, fmt } from "@/components/city2/shared";
import { NextRequirements, RungBadge } from "@/components/city2/StepCard";
import { EmptyState, ErrorState, ScreenHeader, SkeletonCard, refreshControlProps, useRefresh } from "@/components/ui";
import type { City2Building, City2History, City2PrestigePreviewResult, City2PrestigeResult, City2State, City2Step } from "@/lib/puzzle/city2";
import { useCity2, useCity2Actions, useCity2Prestige } from "@/lib/puzzle/useCity2";
import { useAuth } from "@/providers/AuthProvider";
import { colors, fonts, hairline, layout, radius, space, textScale, type } from "@/theme";

const dateText = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
};
const VIA_TEXT: Record<string, string> = { migration: "Eski şehirden taşındı", player: "Sahada hak edildi", fan: "Taraftar yolu", stars: "Yıldızla açıldı", prestige: "Prestijle yeniden başladı" };
const viaText = (h: City2History) => (h.via === "prestige" && h.level ? `${h.level}. prestij · yeniden başladı` : h.via ? VIA_TEXT[h.via] : null);

export default function ClubCityLadderScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { query, city2, legacy } = useCity2();
  const scroll = useRef<ScrollView>(null);
  const [currentY, setCurrentY] = useState<number | null>(null);
  const [stepResult, setStepResult] = useState<StepResult | null>(null);
  const slotsBefore = useRef(0);
  const scrolled = useRef(false);
  const actions = useCity2Actions({ onStep: (res) => setStepResult({ step: res.step, via: res.via, slotsBefore: slotsBefore.current }) });
  const [prestigeOpen, setPrestigeOpen] = useState(false);
  const [preview, setPreview] = useState<(City2PrestigePreviewResult & { receivedAt: number }) | null>(null);
  const [prestiged, setPrestiged] = useState<City2PrestigeResult | null>(null);
  const prestige = useCity2Prestige({
    onPreview: (res) => setPreview({ ...res, receivedAt: Date.now() }),
    onDone: (res) => {
      setPrestigeOpen(false);
      setPreview(null);
      scrolled.current = false;
      setPrestiged(res);
    },
  });
  const startPrestige = () => {
    setPreview(null);
    setPrestigeOpen(true);
    prestige.preview.mutate(undefined, { onError: () => setPrestigeOpen(false) });
  };
  const confirmPrestige = (token: string) =>
    prestige.confirm.mutate(token, {
      // Süresi dolmuş / kullanılmış jeton: yeni önizleme iste.
      onError: (e) => {
        const code = (e as { code?: string } | null)?.code;
        if (code === "TOKEN_EXPIRED" || code === "INVALID_TOKEN") {
          setPreview(null);
          prestige.preview.mutate(undefined);
        }
      },
    });
  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  useEffect(() => {
    if (currentY != null && !scrolled.current) {
      scrolled.current = true;
      scroll.current?.scrollTo({ y: Math.max(0, currentY - 120), animated: false });
    }
  }, [currentY]);

  if (!auth.user) return <Redirect href="/giris" />;
  const ladder = city2?.ladder;
  const lastNo = ladder?.steps[ladder.steps.length - 1]?.no ?? 18;
  const pr = city2?.prestige ?? null;
  const atTop = Boolean(ladder && pr && ladder.rung >= (pr.min_rung || ladder.max_rung));

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Kariyer merdiveni" subtitle={ladder ? `${ladder.current.no}/${lastNo} · ${ladder.current.title}` : "Mahalle arasından Avrupa'ya"} back />
      {query.isLoading ? (
        <View style={styles.content}>
          <SkeletonCard lines={6} />
        </View>
      ) : legacy ? (
        <EmptyState icon="trending-up-outline" title="Merdiven yakında" body="Kariyer merdiveni sunucu güncellemesiyle açılacak." variant="inline" />
      ) : query.isError || !city2 || !ladder ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <ScrollView
          ref={scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />}
        >
          {pr && atTop ? <PrestigeCard prestige={pr} crest={city2.crest} busy={prestige.preview.isPending} onStart={startPrestige} /> : null}
          <View style={styles.summary}>
            {city2.crest && (city2.crest.frame || city2.crest.prestige_stars > 0) ? (
              <>
                <View style={styles.stat}>
                  <CrestBadge crest={city2.crest} size={34} />
                  <Text style={styles.statLabel} numberOfLines={1} {...textScale.dense}>
                    {city2.crest.prestige_stars > 0 ? `${city2.crest.prestige_stars}. prestij` : "arma"}
                  </Text>
                </View>
                <View style={styles.summaryRule} />
              </>
            ) : null}
            <Stat label="gelişim puanı" value={fmt(city2.dev)} />
            <View style={styles.summaryRule} />
            <Stat label="kurulu aşama" value={fmt(city2.stages_built)} />
            <View style={styles.summaryRule} />
            <Stat label="güzellik" value={fmt(city2.beauty)} />
          </View>

          <View>
            {ladder.steps.map((s, i) => (
              <RungRow
                key={s.rung}
                s={s}
                city2={city2}
                last={i === ladder.steps.length - 1}
                history={[...ladder.history].reverse().find((h) => h.rung === s.rung) ?? null}
                busy={actions.step.isPending}
                onLayoutCurrent={s.rung === ladder.rung ? setCurrentY : undefined}
                onAdvance={(pay) => {
                  slotsBefore.current = city2.landmarks.grid.open_slots;
                  actions.step.mutate(pay);
                }}
                onBuilding={(key) => router.navigate({ pathname: "/kulup-sehri", params: { bina: key } })}
              />
            ))}
          </View>

          {pr && !atTop ? <PrestigeTeaser prestige={pr} crest={city2.crest} /> : null}

          {ladder.history.length ? (
            <View style={styles.history}>
              <Text style={styles.historyTitle} {...textScale.dense}>
                Tırmanış geçmişi
              </Text>
              {[...ladder.history].reverse().map((h, i) => (
                <HistoryRow key={`${h.rung}-${i}`} h={h} steps={ladder.steps} />
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
      <StepCelebration result={stepResult} city2={city2} onClose={() => setStepResult(null)} />
      <PrestigeSheet
        visible={prestigeOpen}
        onClose={() => setPrestigeOpen(false)}
        preview={preview}
        loading={prestige.preview.isPending}
        confirming={prestige.confirm.isPending}
        onRefresh={() => prestige.preview.mutate(undefined)}
        onConfirm={confirmPrestige}
      />
      <PrestigeCelebration
        result={prestiged}
        onClose={() => {
          setPrestiged(null);
          router.navigate("/kulup-sehri");
        }}
      />
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} {...textScale.dense}>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1} {...textScale.dense}>
        {label}
      </Text>
    </View>
  );
}

/** Uzak kademenin bina koşulları: "Stadyum 2. aşama (Tahta tribünlü saha)". */
function stageNeeds(stages: Record<string, number>, buildings: City2Building[]) {
  return Object.entries(stages).map(([key, need]) => {
    const b = buildings.find((x) => x.key === key);
    const title = b?.stages[need - 1]?.title;
    return { key, text: `${b?.title ?? key}: ${need}. aşama${title ? ` (${title})` : ""}`, ok: (b?.stage ?? 0) >= need };
  });
}

function RungRow({
  s,
  city2,
  last,
  history,
  busy,
  onLayoutCurrent,
  onAdvance,
  onBuilding,
}: {
  s: City2Step;
  city2: City2State;
  last: boolean;
  history: City2History | null;
  busy: boolean;
  onLayoutCurrent?: (y: number) => void;
  onAdvance: (pay?: boolean) => void;
  onBuilding: (key: string) => void;
}) {
  const ladder = city2.ladder;
  const current = s.rung === ladder.rung;
  const isNext = ladder.next?.rung === s.rung;
  const state = current ? "current" : s.reached ? "done" : isNext ? "next" : "locked";
  const opens = city2.buildings.filter((b) => b.opens === s.rung && s.rung > 1);
  return (
    <View style={styles.rung} onLayout={onLayoutCurrent ? (e) => onLayoutCurrent(e.nativeEvent.layout.y) : undefined}>
      <View style={styles.rail}>
        <RungBadge label={s.label} size={36} tone={state === "done" ? "done" : state === "locked" ? "off" : "brand"} />
        {!last ? <View style={[styles.railLine, s.reached && !current ? styles.railLineDone : null]} /> : null}
      </View>
      <View style={[styles.rungBody, state === "current" ? styles.rungCurrent : state === "next" ? styles.rungNext : null]}>
        <View style={styles.rungHead}>
          <Text style={[styles.rungTitle, state === "locked" ? styles.rungTitleLocked : null]} numberOfLines={2} {...textScale.dense}>
            {s.title}
          </Text>
          {state === "current" ? (
            <Text style={styles.tagNow} {...textScale.badge}>
              ŞU AN
            </Text>
          ) : state === "done" ? (
            <Ionicons name="checkmark-circle" size={18} color={colors.win} />
          ) : state === "locked" ? (
            <Ionicons name="lock-closed" size={14} color={colors.textTertiary} />
          ) : null}
        </View>
        {history && (state === "done" || state === "current") ? (
          <Text style={styles.rungMeta} {...textScale.dense}>
            {[dateText(history.at), viaText(history)].filter(Boolean).join(" · ")}
          </Text>
        ) : null}

        {state === "next" && ladder.next ? (
          <View style={styles.nextBox}>
            <NextRequirements next={ladder.next} buildings={city2.buildings} onBuilding={onBuilding} busy={busy} onPay={() => onAdvance(true)} />
            {ladder.next.can_advance ? (
              <ChunkyButton label={busy ? "ÇIKILIYOR…" : `BASAMAK ATLA · ${s.label}`} icon="arrow-up-circle" tone="green" disabled={busy} onPress={() => onAdvance()} />
            ) : null}
          </View>
        ) : state === "locked" ? (
          <View style={styles.reqs}>
            {s.dev > 0 ? (
              <Text style={styles.req} {...textScale.dense}>
                {fmt(s.dev)} gelişim puanı
              </Text>
            ) : null}
            {stageNeeds(s.stages, city2.buildings).map((n) => (
              <View key={n.key} style={styles.reqRow}>
                <Ionicons name={n.ok ? "checkmark" : "ellipse-outline"} size={11} color={n.ok ? colors.win : colors.textTertiary} />
                <Text style={styles.req} numberOfLines={2} {...textScale.dense}>
                  {n.text}
                </Text>
              </View>
            ))}
            {s.gate ? <GateSummary gate={s.gate} metrics={city2.gate_metrics} /> : null}
          </View>
        ) : null}

        {opens.length && state !== "done" && state !== "current" ? (
          <View style={styles.opens}>
            <Ionicons name="business-outline" size={12} color={colors.brandAccent} />
            <Text style={styles.opensText} numberOfLines={2} {...textScale.dense}>
              Açılır: {opens.map((b) => b.title).join(", ")}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function HistoryRow({ h, steps }: { h: City2History; steps: City2Step[] }) {
  const s = steps.find((x) => x.rung === h.rung);
  return (
    <View style={styles.historyRow}>
      <RungBadge label={s?.label ?? String(h.rung)} size={28} tone="done" />
      <View style={styles.historyTexts}>
        <Text style={styles.historyName} numberOfLines={1} {...textScale.dense}>
          {s?.title ?? `${h.rung}. kademe`}
        </Text>
        <Text style={styles.historyMeta} {...textScale.dense}>
          {[dateText(h.at), viaText(h), h.via === "stars" && h.cost ? `${fmt(h.cost)} yıldız` : null].filter(Boolean).join(" · ")}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: space.md, paddingBottom: space.giant * 2, gap: space.lg },
  summary: { ...cardStyle, flexDirection: "row", alignItems: "center", paddingVertical: space.md },
  summaryRule: { width: hairline, alignSelf: "stretch", backgroundColor: colors.border },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { ...type.metricSm, color: colors.textPrimary },
  statLabel: { ...type.caption, color: colors.textTertiary },

  rung: { flexDirection: "row", gap: space.md },
  rail: { width: 36, alignItems: "center" },
  railLine: { flex: 1, width: 2, minHeight: space.md, marginVertical: space.xxs, borderRadius: radius.pill, backgroundColor: colors.surface3 },
  railLineDone: { backgroundColor: colors.win },
  rungBody: { flex: 1, gap: space.xs, paddingVertical: space.s, paddingHorizontal: space.md, marginBottom: space.md, borderRadius: radius.lg },
  rungCurrent: { backgroundColor: colors.brandDim, borderWidth: hairline, borderColor: colors.brandBorder },
  rungNext: { ...cardStyle, paddingVertical: space.md, gap: space.md },
  rungHead: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 24 },
  rungTitle: { ...type.h3, color: colors.textPrimary, flex: 1 },
  rungTitleLocked: { color: colors.textSecondary },
  rungMeta: { ...type.caption, color: colors.textTertiary },
  tagNow: { ...type.micro, fontFamily: fonts.bold, color: colors.brandAccent },
  nextBox: { gap: space.md },
  reqs: { gap: 3 },
  reqRow: { flexDirection: "row", alignItems: "flex-start", gap: space.xs },
  req: { ...type.caption, color: colors.textTertiary, flex: 1 },
  opens: { flexDirection: "row", alignItems: "center", gap: space.xs },
  opensText: { ...type.caption, color: colors.brandAccent, flex: 1 },

  history: { ...cardStyle, padding: space.md, gap: space.sm },
  historyTitle: { ...type.h3, color: colors.textPrimary },
  historyRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  historyTexts: { flex: 1, gap: 1 },
  historyName: { ...type.labelSm, color: colors.textPrimary },
  historyMeta: { ...type.caption, color: colors.textTertiary },
});
