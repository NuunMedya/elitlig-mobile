/**
 * Kura düzenleyici — üç adım: Kurulum → Torbalar → Çekiliş.
 *
 * Web: draws/DrawAdmin.js (editor görünümü). Adımlar arasında geçiş serbest
 * ama her adım bir öncekini kaydeder: kura kaydı kurulumun sonunda oluşur.
 * Kadro değişirse çekilmiş sonuç geçersizdir; sunucu onu siler ve ekran bunu
 * söyler, sessizce veri kaybolmaz.
 *
 * ÇEKİLİŞ CANLANDIRMASI: takımlar sırayla açılır (toplam ~12 sn, adım en az
 * 220 ms); sayaç sona gelince durur — sonsuz döngü yok. "Azaltılmış hareket"
 * açıkken ve "Sonucu göster" ile doğrudan sonuç gösterilir.
 *
 * YAYIN KUMANDASI: basılan görünüm sunucuya yazılır, kaplama saniyeler içinde
 * o görünüme geçer. Kaplama adresi kopyalanır / tarayıcıda açılır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { OptionSheet, SelectField, ToggleField, confirmAction, useAdminMutation } from "@/components/admin";
import { Badge, Button, GradientBar, Input, Reveal, SegmentedControl, Stepper, TeamLogo, Touchable, useReduceMotion, useToast } from "@/components/ui";
import { BumpButtons, OpsGroup, OpsStage, StepRail } from "@/components/admin/matches/opsKit";
import { mediaUrl } from "@/lib/format";
import { hasAnyPermission } from "@/lib/admin/access";
import { WEB_BASE_URL } from "@/lib/config";
import {
  balancedSizes,
  bracketPreview,
  BROADCAST_VIEWS,
  createDraw,
  defaultGroupName,
  DRAW_FORMATS,
  DRAW_STATUS_LABELS,
  getDrawLeagues,
  getDrawSeasons,
  resetDraw,
  runDraw,
  saveRoster,
  searchDrawTeams,
  setBroadcastView,
  updateDraw,
  type BroadcastView,
  type Draw,
  type DrawFormat,
  type DrawTeam,
} from "@/lib/api/admin/draws";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

import { DrawFixtureView, DrawResultView } from "./DrawResultView";

type Step = "setup" | "pots" | "draw";

interface Setup {
  name: string;
  format: DrawFormat;
  teamCount: number;
  potCount: number;
  groupCount: number;
  groupNames: string[];
  doubleRound: boolean;
  leagueId: number | null;
  seasonId: number | null;
  notes: string;
}

const EMPTY: Setup = { name: "", format: "GROUP", teamCount: 16, potCount: 4, groupCount: 4, groupNames: [], doubleRound: false, leagueId: null, seasonId: null, notes: "" };

const setupFrom = (d: Draw): Setup => ({
  name: d.name || "",
  format: d.format,
  teamCount: d.teamCount,
  potCount: d.potCount,
  groupCount: d.groupCount || 2,
  groupNames: d.groupNames?.length ? d.groupNames : [],
  doubleRound: Boolean(d.doubleRound),
  leagueId: d.leagueId ?? null,
  seasonId: d.seasonId ?? null,
  notes: d.notes || "",
});

interface PotState {
  potNumber: number;
  capacity: number;
  teams: DrawTeam[];
}

export function DrawEditor({ initial, onClose }: { initial: Draw | null; onClose: () => void }) {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const reduceMotion = useReduceMotion();
  const canCreate = hasAnyPermission(auth.user, ["draws.create"]);
  const canUpdate = hasAnyPermission(auth.user, ["draws.update"]);
  const canRun = hasAnyPermission(auth.user, ["draws.run"]);

  const [current, setCurrent] = useState<Draw | null>(initial);
  const [step, setStep] = useState<Step>(
    !initial ? "setup" : initial.status === "COMPLETED" || initial.isRosterComplete ? "draw" : initial.pots?.length ? "pots" : "setup"
  );
  const [setup, setSetup] = useState<Setup>(initial ? setupFrom(initial) : EMPTY);
  const [pots, setPots] = useState<PotState[]>((initial?.pots ?? []).map((p) => ({ potNumber: p.potNumber, capacity: p.capacity, teams: p.teams || [] })));
  const [seasonOnly, setSeasonOnly] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
  const [revealCount, setRevealCount] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const leagues = useQuery({ queryKey: ["admin", "draws", "leagues"], queryFn: getDrawLeagues, staleTime: 300_000 });
  const seasons = useQuery({ queryKey: ["admin", "draws", "seasons"], queryFn: getDrawSeasons, staleTime: 300_000 });

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const apply = useCallback((d: Draw) => {
    setCurrent(d);
    setSetup(setupFrom(d));
    setPots((d.pots ?? []).map((p) => ({ potNumber: p.potNumber, capacity: p.capacity, teams: p.teams || [] })));
    void queryClient.invalidateQueries({ queryKey: ["admin", "draws", "list"] });
  }, [queryClient]);

  /* ───────────── 1) kurulum ───────────── */
  const isGroup = setup.format === "GROUP";
  const groupNames = useMemo(
    () => Array.from({ length: isGroup ? setup.groupCount : 0 }, (_, i) => (setup.groupNames[i] != null && setup.groupNames[i] !== "" ? setup.groupNames[i] : defaultGroupName(i))),
    [isGroup, setup.groupCount, setup.groupNames]
  );

  const setupProblem = useMemo(() => {
    if (!setup.name.trim()) return "Kuraya bir ad ver.";
    if (setup.teamCount < 2) return "Takım sayısı en az 2 olmalı.";
    if (setup.teamCount > 128) return "En fazla 128 takımla kura çekilebilir.";
    if (setup.potCount < 1) return "Torba sayısı en az 1 olmalı.";
    if (setup.potCount > setup.teamCount) return "Torba sayısı takım sayısından çok olamaz.";
    if (isGroup) {
      if (setup.groupCount < 1) return "Grup sayısı en az 1 olmalı.";
      if (setup.groupCount > setup.teamCount) return "Grup sayısı takım sayısından çok olamaz.";
      const t = groupNames.map((n) => n.trim().toLocaleLowerCase("tr-TR"));
      if (t.some((n) => !n)) return "Grup adları boş bırakılamaz.";
      if (new Set(t).size !== t.length) return "Grup adları birbirinden farklı olmalı.";
    }
    return null;
  }, [setup, isGroup, groupNames]);

  const saveSetup = useAdminMutation(
    async () => {
      if (setupProblem) throw new Error(setupProblem);
      const body = {
        name: setup.name.trim(),
        format: setup.format,
        teamCount: setup.teamCount,
        potCount: setup.potCount,
        groupCount: isGroup ? setup.groupCount : undefined,
        groupNames: isGroup ? groupNames : undefined,
        doubleRound: isGroup ? setup.doubleRound : undefined,
        leagueId: setup.leagueId,
        seasonId: setup.seasonId,
        notes: setup.notes || null,
      };
      if (!current) return { draw: await createDraw(body), rosterReset: false, created: true };
      const r = await updateDraw(current.id, body);
      return { ...r, created: false };
    },
    {
      success: (r) =>
        r.created ? "Kurulum kaydedildi. Şimdi torbaları doldur." : r.rosterReset ? "Kurulum değişti: torbalar yeniden oluşturuldu ve varsa çekilmiş sonuç silindi." : "Kurulum kaydedildi.",
      onSuccess: (r) => {
        apply(r.draw);
        setStep("pots");
      },
    }
  );

  /* ───────────── 2) torbalar ───────────── */
  const takenIds = useMemo(() => new Set(pots.flatMap((p) => p.teams.map((t) => Number(t.teamId)))), [pots]);
  const capacityTotal = pots.reduce((s, p) => s + Number(p.capacity || 0), 0);
  const rosterComplete = pots.length > 0 && pots.every((p) => p.teams.length === Number(p.capacity));
  const potsProblem =
    capacityTotal !== setup.teamCount
      ? `Torbalardaki takım sayıları toplamı ${capacityTotal}; kurulumda ${setup.teamCount} takım var.`
      : pots.some((p) => p.capacity < 1)
        ? "Her torbada en az 1 takım olmalı."
        : null;

  const setCapacity = (potNumber: number, capacity: number) =>
    setPots((prev) => prev.map((p) => (p.potNumber === potNumber ? { ...p, capacity, teams: p.teams.slice(0, capacity || p.teams.length) } : p)));
  const distribute = () => {
    const sizes = balancedSizes(setup.teamCount, pots.length);
    setPots((prev) => prev.map((p, i) => ({ ...p, capacity: sizes[i], teams: p.teams.slice(0, sizes[i]) })));
  };
  const addTeam = (potNumber: number, team: DrawTeam) =>
    setPots((prev) => prev.map((p) => (p.potNumber === potNumber && p.teams.length < p.capacity && !takenIds.has(Number(team.teamId)) ? { ...p, teams: [...p.teams, team] } : p)));
  const removeTeam = (potNumber: number, team: DrawTeam) =>
    setPots((prev) => prev.map((p) => (p.potNumber === potNumber ? { ...p, teams: p.teams.filter((t) => Number(t.teamId) !== Number(team.teamId)) } : p)));

  const doSaveRoster = async () => {
    if (!current) throw new Error("Önce kurulumu kaydet.");
    if (potsProblem) throw new Error(potsProblem);
    return saveRoster(
      current.id,
      pots.map((p) => ({ potNumber: p.potNumber, capacity: p.capacity, teamIds: p.teams.map((t) => t.teamId) }))
    );
  };
  const roster = useAdminMutation(doSaveRoster, {
    success: (d) => (d.isRosterComplete ? "Torbalar kaydedildi. Kura çekilişe hazır." : `Torbalar kaydedildi. ${d.teamCount - d.selectedTeamCount} takım daha seçilmeli.`),
    onSuccess: (d) => apply(d),
  });

  /* ───────────── 3) çekiliş ───────────── */
  const startReveal = useCallback(
    (d: Draw) => {
      if (timer.current) clearInterval(timer.current);
      const total = d.result?.order?.length || 0;
      if (!total || reduceMotion) return setRevealCount(total);
      setRevealCount(0);
      // Kalabalık kurada çekiliş dakikalarca sürmesin: toplam ~12 sn, adım en az 220 ms.
      const stepMs = Math.max(220, Math.round(12000 / total));
      timer.current = setInterval(() => {
        setRevealCount((c) => {
          const next = (c ?? 0) + 1;
          if (next >= total && timer.current) {
            clearInterval(timer.current);
            timer.current = null;
          }
          return Math.min(next, total);
        });
      }, stepMs);
    },
    [reduceMotion]
  );
  const skipReveal = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setRevealCount(current?.result?.order?.length || 0);
  };

  const run = useAdminMutation(
    async () => {
      if (!current) throw new Error("Önce kurulumu kaydet.");
      // Kadroda kaydedilmemiş değişiklik olabilir; önce onu yaz.
      const saved = rosterComplete ? await doSaveRoster() : current;
      return runDraw(saved.id);
    },
    {
      success: "Kura çekildi.",
      onSuccess: (d) => {
        apply(d);
        setStep("draw");
        startReveal(d);
      },
    }
  );
  const reset = useAdminMutation(() => resetDraw(current!.id), {
    success: "Çekiliş sonucu silindi. Torbalar duruyor.",
    onSuccess: (d) => {
      apply(d);
      setRevealCount(null);
    },
  });
  const doubleRound = useAdminMutation((value: boolean) => updateDraw(current!.id, { doubleRound: value }), {
    success: (_r, v) => (v ? "Fikstür çift devreli olarak yeniden üretildi." : "Fikstür tek devreye alındı."),
    onSuccess: (r) => apply(r.draw),
  });
  const broadcast = useAdminMutation((view: BroadcastView) => setBroadcastView(current!.id, view), {
    success: (_d, view) =>
      view === "draw"
        ? "Kura çekimi yayın ekranında başladı. Tören bitince ekran son görüntüde kalır."
        : view === "stage"
          ? "Yayın ekranı çekiliş aşamasına alındı. Çekiliş “Kura çekimine başla” ile başlar."
          : `Yayın ekranı “${BROADCAST_VIEWS.find((b) => b.value === view)?.label}” görünümüne alındı.`,
    onSuccess: (d) => setCurrent(d),
  });

  const order = current?.result?.order ?? [];
  const revealed = revealCount == null ? order.length : revealCount;
  const revealedIds = useMemo(() => (current?.result ? new Set(order.slice(0, revealed).map((o) => Number(o.teamId))) : null), [current, order, revealed]);
  const lastTeamId = revealed > 0 ? order[revealed - 1]?.teamId : null;
  const isRevealing = Boolean(current?.result && revealed < order.length);
  /** Son çekilen takım ve düştüğü yer (grup adı ya da eşleşme no) — çekiliş sahnesi için. */
  const lastTeam = useMemo(() => {
    const res = current?.result;
    if (!res || lastTeamId == null) return null;
    for (const g of res.groups ?? []) {
      const t = g.teams.find((x) => Number(x.teamId) === Number(lastTeamId));
      if (t) return { team: t, place: `${g.name} Grubu` };
    }
    for (const r of res.rounds ?? []) {
      for (const m of r.matches) {
        const t = [m.home, m.away].find((x) => x && Number(x.teamId) === Number(lastTeamId));
        if (t) return { team: t, place: `${m.matchNo}. maç` };
      }
    }
    return null;
  }, [current, lastTeamId]);
  const overlayUrl = current ? `${WEB_BASE_URL}/kura-overlay/${current.id}` : "";
  const editable = current ? canUpdate : canCreate;

  const seasonOptions = (seasons.data ?? []).filter((s) => !setup.leagueId || Number(s.leagueId) === Number(setup.leagueId));
  const pickingPot = pots.find((p) => p.potNumber === picking) ?? null;

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <Button label="Kura listesi" icon="chevron-back" variant="ghost" size="sm" onPress={onClose} disabled={isRevealing} />
        {current ? <Badge label={DRAW_STATUS_LABELS[current.status] || current.status} tone={current.status === "COMPLETED" ? "win" : current.status === "READY" ? "accent" : "neutral"} /> : null}
      </View>
      <StepRail<Step>
        items={[
          { key: "setup", label: "Kurulum", icon: "construct-outline", done: Boolean(current) },
          { key: "pots", label: "Torbalar", icon: "basket-outline", done: Boolean(current?.isRosterComplete), meta: current ? `${current.selectedTeamCount}/${current.teamCount}` : undefined },
          { key: "draw", label: "Çekiliş", icon: "shuffle-outline", done: current?.status === "COMPLETED" },
        ]}
        value={step}
        onChange={(s) => {
          if (s !== "setup" && !current) return void toast.show({ message: "Önce kurulumu kaydet.", tone: "warn" });
          setStep(s);
        }}
      />

      {step === "setup" ? (
        <View style={styles.wrap}>
          <OpsGroup title="Kura" icon="shuffle" tone="signature">
            <Input label="Kura adı *" floating value={setup.name} onChangeText={(t) => setSetup((s) => ({ ...s, name: t }))} placeholder="Örn. 2026 Bahar Kupası" editable={editable} />
            <SegmentedControl<DrawFormat>
              items={DRAW_FORMATS.map((f) => ({ key: f.value, label: f.label }))}
              value={setup.format}
              onChange={(f) => setSetup((s) => ({ ...s, format: f }))}
              stretch
              size="sm"
            />
            <Text style={styles.hint} {...textScale.long}>
              {DRAW_FORMATS.find((f) => f.value === setup.format)?.description}
            </Text>
          </OpsGroup>
          <OpsGroup title="Boyut" icon="grid-outline" tone="cyan">
            <View style={styles.cells}>
              <SizeCell label="Takım" value={setup.teamCount} min={2} max={128} disabled={!editable} onChange={(v) => setSetup((s) => ({ ...s, teamCount: v }))} />
              <SizeCell label="Torba" value={setup.potCount} min={1} max={Math.max(1, setup.teamCount)} disabled={!editable} onChange={(v) => setSetup((s) => ({ ...s, potCount: v }))} />
              {isGroup ? (
                <SizeCell label="Grup" value={setup.groupCount} min={1} max={Math.max(1, setup.teamCount)} disabled={!editable} onChange={(v) => setSetup((s) => ({ ...s, groupCount: v }))} />
              ) : null}
            </View>
            <View style={styles.previewLine}>
              <Ionicons name="albums-outline" size={14} color={colors.brandAccent} />
              <Text style={styles.hint} {...textScale.long}>
                Torba başına {balancedSizes(setup.teamCount, Math.max(1, setup.potCount)).join(" / ")} takım
                {isGroup ? ` · grup başına ${balancedSizes(setup.teamCount, Math.max(1, setup.groupCount)).join(" / ")}` : ""}
              </Text>
            </View>
            {!isGroup ? (
              <View style={styles.previewLine}>
                <Ionicons name="git-network-outline" size={14} color={colors.brandAccent} />
                <Text style={styles.hint} {...textScale.long}>
                  {(() => {
                    const b = bracketPreview(setup.teamCount);
                    return b.byes ? `${b.size}'lık ağaç kurulur; ${b.byes} takım ilk turu BAY geçer.` : `${b.size}'lık ağaç; BAY yok.`;
                  })()}
                </Text>
              </View>
            ) : null}
          </OpsGroup>
          {isGroup ? (
            <OpsGroup title="Gruplar" icon="layers-outline" tone="violet">
              <View style={styles.groupNames}>
                {groupNames.map((n, i) => (
                  <Input
                    // eslint-disable-next-line react/no-array-index-key
                    key={i}
                    size="sm"
                    containerStyle={styles.groupName}
                    label={`${i + 1}. grup`}
                    value={n}
                    editable={editable}
                    onChangeText={(t) =>
                      setSetup((s) => {
                        const next = [...groupNames];
                        next[i] = t;
                        return { ...s, groupNames: next };
                      })
                    }
                  />
                ))}
              </View>
              <ToggleField label="Çift devre (rövanşlı fikstür)" value={setup.doubleRound} onChange={(v) => setSetup((s) => ({ ...s, doubleRound: v }))} disabled={!editable} />
            </OpsGroup>
          ) : null}
          <OpsGroup title="Bağlantı" icon="link-outline" tone="gold">
          <SelectField<number>
            label="Lig (isteğe bağlı)"
            value={setup.leagueId}
            clearable
            options={(leagues.data ?? []).map((l) => ({ value: l.leagueId, label: l.leagueName }))}
            onChange={(v) => setSetup((s) => ({ ...s, leagueId: v, seasonId: null }))}
            disabled={!editable}
          />
          <SelectField<number>
            label="Sezon (isteğe bağlı)"
            value={setup.seasonId}
            clearable
            options={seasonOptions.map((s) => ({ value: s.seasonId, label: s.seasonName }))}
            onChange={(v) => setSetup((s) => ({ ...s, seasonId: v }))}
            hint="Torbalara il genelindeki tüm takımlardan seçilir; sezon kurayı ilişkilendirir ve torba adımında süzgeç sunar."
            disabled={!editable}
          />
          <Input label="Not" value={setup.notes} onChangeText={(t) => setSetup((s) => ({ ...s, notes: t }))} multiline editable={editable} />
          </OpsGroup>
          {setupProblem ? (
            <Text style={styles.problem} {...textScale.long}>
              {setupProblem}
            </Text>
          ) : null}
          {current?.result ? (
            <Text style={styles.warn} {...textScale.long}>
              Takım, torba ya da grup sayısını değiştirmek torbaları yeniden kurar ve çekilmiş sonucu siler.
            </Text>
          ) : null}
          {editable ? (
            <Button label={current ? "Kurulumu kaydet" : "Kurulumu kaydet ve devam et"} size="lg" icon="save-outline" fullWidth onPress={() => saveSetup.mutate(undefined)} loading={saveSetup.isPending} disabled={Boolean(setupProblem)} />
          ) : null}
        </View>
      ) : null}

      {step === "pots" && current ? (
        <View style={styles.wrap}>
          <View style={styles.potSummary}>
            <View style={styles.potSummaryHead}>
              <Text style={styles.potSummaryValue} {...textScale.badge}>
                {takenIds.size}
                <Text style={styles.potSummaryOf}>/{setup.teamCount}</Text>
              </Text>
              <View style={styles.flex}>
                <Text style={styles.potSummaryTitle} {...textScale.dense}>
                  takım torbalarda
                </Text>
                <Text style={styles.hint} {...textScale.dense}>
                  Kapasite toplamı {capacityTotal}
                </Text>
              </View>
              <Button label="Dengele" icon="git-compare-outline" size="sm" variant="secondary" onPress={distribute} disabled={!canUpdate} />
            </View>
            <GradientBar value={setup.teamCount ? takenIds.size / setup.teamCount : 0} height={6} />
          </View>
          {current.seasonId ? (
            <ToggleField label="Yalnız sezona kayıtlı takımlar" hint="Kapalıyken il genelindeki tüm takımlar listelenir." value={seasonOnly} onChange={setSeasonOnly} />
          ) : null}
          {pots.map((pot) => {
            const full = pot.capacity > 0 && pot.teams.length >= pot.capacity;
            return (
              <View key={pot.potNumber} style={styles.pot}>
                <View style={styles.potHead}>
                  <View style={[styles.potBall, full ? styles.potBallFull : null]}>
                    <Text style={styles.potNo} {...textScale.badge}>
                      {pot.potNumber}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.potTitle} {...textScale.dense}>
                      {pot.potNumber}. torba
                    </Text>
                    <Text style={[styles.hint, full ? { color: colors.win } : null]} {...textScale.dense}>
                      {pot.teams.length}/{pot.capacity} dolu
                    </Text>
                  </View>
                  <Text style={styles.capLabel} {...textScale.badge}>
                    KAPASİTE
                  </Text>
                  <Stepper value={pot.capacity} min={0} max={setup.teamCount} onChange={(v) => setCapacity(pot.potNumber, v)} disabled={!canUpdate} size="sm" accessibilityLabel={`${pot.potNumber}. torba kapasitesi`} />
                </View>
                <GradientBar value={pot.capacity ? pot.teams.length / pot.capacity : 0} height={3} gradient={full ? [colors.win, colors.win] : undefined} />
                {pot.teams.length ? (
                  <View style={styles.potTeams}>
                    {pot.teams.map((t) => (
                      <View key={t.teamId} style={styles.potTeam}>
                        <TeamLogo name={t.teamName} size={22} />
                        <Text style={styles.potTeamName} numberOfLines={1} {...textScale.dense}>
                          {t.teamName}
                        </Text>
                        {canUpdate ? (
                          <Touchable feedback="icon" onPress={() => removeTeam(pot.potNumber, t)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${t.teamName} takımını torbadan çıkar`}>
                            <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
                          </Touchable>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : null}
                {canUpdate && pot.teams.length < pot.capacity ? (
                  <Touchable onPress={() => setPicking(pot.potNumber)} feedback="row" style={styles.potAdd} accessibilityRole="button" accessibilityLabel={`${pot.potNumber}. torbaya takım ekle`}>
                    <Ionicons name="add" size={16} color={colors.brandAccent} />
                    <Text style={styles.potAddText} {...textScale.dense}>
                      Takım ekle · {pot.capacity - pot.teams.length} boş yer
                    </Text>
                  </Touchable>
                ) : null}
              </View>
            );
          })}
          {potsProblem ? (
            <Text style={styles.problem} {...textScale.long}>
              {potsProblem}
            </Text>
          ) : null}
          {canUpdate ? <Button label="Torbaları kaydet" size="lg" icon="save-outline" fullWidth onPress={() => roster.mutate(undefined)} loading={roster.isPending} disabled={Boolean(potsProblem)} /> : null}
          {rosterComplete ? <Button label="Çekiliş adımına geç" variant="secondary" icon="arrow-forward" iconPosition="right" onPress={() => setStep("draw")} /> : null}
        </View>
      ) : null}

      {step === "draw" && current ? (
        <View style={styles.wrap}>
          {!current.result ? (
            <OpsGroup title="Çekiliş" icon="shuffle" tone="signature">
              <Text style={styles.hint} {...textScale.long}>
                {rosterComplete
                  ? "Torbalar dolu. Kurayı başlat: takımlar torba prensibine göre dağılır ve tohumla kaydedilir."
                  : `Kura çekilmeden önce tüm torbalar dolmalı (${takenIds.size}/${setup.teamCount}).`}
              </Text>
              {canRun ? (
                <Button
                  label="Kurayı başlat"
                  icon="shuffle"
                  size="lg"
                  loading={run.isPending}
                  disabled={!rosterComplete}
                  haptic="success"
                  onPress={async () => {
                    if (await confirmAction({ title: "Kura çekilsin mi?", message: `${current.name} için çekiliş yapılacak.`, confirmLabel: "Kurayı çek" })) run.mutate(undefined);
                  }}
                />
              ) : null}
            </OpsGroup>
          ) : (
            <>
              {/* ÇEKİLİŞ SAHNESİ — son çekilen takım topun içinde yaylanarak belirir; altında ilerleme. */}
              <OpsStage height={200}>
                <View style={styles.row}>
                  <Text style={styles.stageLabel} {...textScale.badge}>
                    {isRevealing ? "KURA ÇEKİLİYOR" : "KURA TAMAMLANDI"}
                  </Text>
                  <Text style={styles.stageCount} {...textScale.badge}>
                    {revealed}/{order.length}
                  </Text>
                </View>
                {lastTeam ? (
                  <Reveal key={`${lastTeamId}-${revealed}`} scaleFrom={0.6} distance={0}>
                    <View style={styles.spot}>
                      <View style={styles.ball}>
                        <TeamLogo name={lastTeam.team.teamName} logo={mediaUrl(lastTeam.team.teamLogo)} size={44} />
                      </View>
                      <View style={styles.flexOne}>
                        <Text style={styles.spotName} numberOfLines={1} {...textScale.dense}>
                          {lastTeam.team.teamName}
                        </Text>
                        <Text style={styles.spotMeta} numberOfLines={1} {...textScale.dense}>
                          {[lastTeam.team.potNumber ? `${lastTeam.team.potNumber}. torba` : null, lastTeam.place].filter(Boolean).join(" → ")}
                        </Text>
                      </View>
                      {isRevealing ? <Ionicons name="sparkles" size={18} color={colors.adminAccent} /> : <Ionicons name="checkmark-circle" size={20} color={colors.win} />}
                    </View>
                  </Reveal>
                ) : (
                  <Text style={styles.spotMeta} {...textScale.dense}>
                    Toplar karıştırılıyor…
                  </Text>
                )}
                <GradientBar value={order.length ? revealed / order.length : 0} height={5} track={colors.inkPill} />
                {isRevealing ? (
                  <Button label="Sonucu göster" size="sm" variant="secondary" onDark onPress={skipReveal} />
                ) : (
                  <Button label="Çekilişi yeniden oynat" icon="play" size="sm" variant="secondary" onDark onPress={() => startReveal(current)} />
                )}
              </OpsStage>
              <DrawResultView result={current.result} revealedIds={isRevealing ? revealedIds : null} lastTeamId={isRevealing ? lastTeamId : null} />
              {!isRevealing && current.fixture ? (
                <OpsGroup title="Fikstür" icon="calendar-outline" tone="cyan">
                  {current.format === "GROUP" && canUpdate ? (
                    <ToggleField label="Çift devre (rövanşlı)" value={current.doubleRound} onChange={(v) => doubleRound.mutate(v)} disabled={doubleRound.isPending} />
                  ) : null}
                  <DrawFixtureView fixture={current.fixture} />
                </OpsGroup>
              ) : null}
              {canRun && !isRevealing ? (
                <Button
                  label="Sonucu sil (torbalar kalsın)"
                  icon="refresh"
                  variant="danger"
                  loading={reset.isPending}
                  onPress={async () => {
                    if (await confirmAction({ title: "Çekiliş sonucu silinsin mi?", message: "Torbalar yerinde kalır; kura yeniden çekilebilir.", confirmLabel: "Sil", destructive: true })) reset.mutate(undefined);
                  }}
                />
              ) : null}
            </>
          )}

          {canRun ? (
            <OpsGroup title="Yayın ekranı" icon="videocam-outline" tone="red">
              <Text style={styles.hint} {...textScale.long}>
                OBS'e tarayıcı kaynağı olarak bu adresi ekle. Çekiliş töreni kendiliğinden başlamaz: önce sahneye geç, sunuşun bitince “Kura çekimine başla”.
              </Text>
              <Text style={styles.url} selectable {...textScale.dense}>
                {overlayUrl}
              </Text>
              <View style={styles.row}>
                <Button
                  label="Adresi kopyala"
                  icon="copy-outline"
                  size="sm"
                  variant="secondary"
                  onPress={async () => {
                    await Clipboard.setStringAsync(overlayUrl);
                    toast.show({ message: "Adres kopyalandı.", tone: "success" });
                  }}
                />
                <Button label="Aç" icon="open-outline" size="sm" variant="ghost" onPress={() => void Linking.openURL(overlayUrl)} />
              </View>
              {BROADCAST_VIEWS.map((v) => {
                const live = current.broadcast?.view === v.value;
                return (
                  <Touchable
                    key={v.value}
                    onPress={() => broadcast.mutate(v.value)}
                    disabled={broadcast.isPending}
                    haptic="selection"
                    style={[styles.air, v.primary ? styles.airPrimary : null, live ? styles.airLive : null]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: live }}
                  >
                    <Ionicons name={live ? "radio" : "radio-outline"} size={20} color={live ? colors.live : colors.textSecondary} />
                    <View style={styles.flex}>
                      <Text style={styles.airLabel} {...textScale.dense}>
                        {v.label}
                      </Text>
                      <Text style={styles.hint} {...textScale.dense}>
                        {v.hint}
                      </Text>
                    </View>
                    {live ? <Badge label="Yayında" tone="live" size="xs" /> : null}
                  </Touchable>
                );
              })}
            </OpsGroup>
          ) : null}
        </View>
      ) : null}

      <OptionSheet<number>
        visible={picking != null}
        onClose={() => setPicking(null)}
        title={pickingPot ? `${pickingPot.potNumber}. torbaya takım ekle (${pickingPot.teams.length}/${pickingPot.capacity})` : "Takım ekle"}
        queryKey={["admin", "draws", "teams", current?.cityId ?? null, seasonOnly ? current?.seasonId ?? null : null, [...takenIds].join(",")]}
        loadOptions={async (q) => {
          const items = await searchDrawTeams({ search: q, cityId: current?.cityId, seasonId: seasonOnly ? current?.seasonId : null });
          return items.filter((t) => !takenIds.has(Number(t.teamId))).map((t) => ({ value: t.teamId, label: t.teamName }));
        }}
        onSelect={(v, opt) => {
          if (picking != null && v != null && !Array.isArray(v) && opt && !Array.isArray(opt)) {
            addTeam(picking, { teamId: Number(v), teamName: opt.label });
          }
          setPicking(null);
        }}
      />
    </View>
  );
}

/** Kurulum sayacı: versal etiket + büyük rakam + ± düğmeleri. */
function SizeCell({ label, value, min, max, disabled, onChange }: { label: string; value: number; min: number; max: number; disabled?: boolean; onChange: (v: number) => void }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel} {...textScale.badge}>
        {label.toLocaleUpperCase("tr-TR")}
      </Text>
      <Text style={styles.cellValue} {...textScale.badge}>
        {value}
      </Text>
      {disabled ? null : <BumpButtons value={value} min={min} max={max} onChange={onChange} label={label} />}
    </View>
  );
}

const styles = StyleSheet.create({
  cells: { flexDirection: "row", gap: space.sm },
  cell: {
    flex: 1,
    alignItems: "center",
    gap: space.xxs,
    paddingVertical: space.m,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  cellLabel: { ...type.overline, color: colors.textTertiary },
  cellValue: { ...type.scoreLg, color: colors.textPrimary, marginBottom: space.xs },
  previewLine: { flexDirection: "row", alignItems: "flex-start", gap: space.s },
  potSummary: {
    gap: space.m,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.brandDim,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
  },
  potSummaryHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  potSummaryValue: { ...type.scoreLg, color: colors.textPrimary },
  potSummaryOf: { ...type.scoreXs, color: colors.textTertiary },
  potSummaryTitle: { ...type.h4, color: colors.textPrimary },
  pot: {
    gap: space.m,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  potHead: { flexDirection: "row", alignItems: "center", gap: space.m },
  potBall: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandAccent,
  },
  potBallFull: { backgroundColor: colors.win },
  potNo: { ...type.scoreXs, color: colors.onDark },
  potTitle: { ...type.h3, color: colors.textPrimary },
  capLabel: { ...type.nano, color: colors.textTertiary },
  potTeams: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  potTeam: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    maxWidth: "100%",
    paddingLeft: space.xs,
    paddingRight: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.glassLine,
  },
  potTeamName: { ...type.labelSm, color: colors.textPrimary, flexShrink: 1 },
  potAdd: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    minHeight: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.brandBorder,
  },
  potAddText: { ...type.labelSm, color: colors.brandAccent },
  wrap: { gap: space.md },
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, flexWrap: "wrap" },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hint: { ...type.caption, color: colors.textSecondary },
  flexOne: { flex: 1, minWidth: 0 },
  stageLabel: { ...type.overline, color: colors.adminAccent },
  stageCount: { ...type.scoreSm, color: colors.onDark },
  spot: { flexDirection: "row", alignItems: "center", gap: space.md },
  ball: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.inkTile,
    borderWidth: 2,
    borderColor: colors.adminAccent,
  },
  spotName: { ...type.h2, color: colors.onDark },
  spotMeta: { ...type.caption, color: colors.onDarkMuted, marginTop: space.xxs },
  problem: { ...type.bodySm, color: colors.danger },
  warn: { ...type.bodySm, color: colors.warn },
  groupNames: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  groupName: { width: 96 },
  url: { ...type.caption, color: colors.textPrimary, padding: space.sm, backgroundColor: colors.surface3, borderRadius: radius.sm },
  air: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  airPrimary: { borderColor: colors.brandBorder },
  airLive: { borderColor: colors.live, backgroundColor: colors.liveDim },
  airLabel: { ...type.h4, color: colors.textPrimary },
});
