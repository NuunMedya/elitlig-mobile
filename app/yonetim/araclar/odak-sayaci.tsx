/**
 * ODAK SAYACI — pomodoro, geri sayım ve tur kayıtlı kronometre
 * (web: /yonetim/araclar/odak-sayaci).
 *
 * SÜRE DOĞRULUĞU: sayaç "kalan saniye" saymaz; bitiş (ya da başlangıç)
 * ZAMAN DAMGASI saklanır ve ekran her tikte `Date.now()` ile yeniden
 * hesaplar. Uygulama arka plana gidip döndüğünde (AppState) ya da kapatılıp
 * açıldığında (durum AsyncStorage'da) süre kaldığı yerden DOĞRU devam eder;
 * setInterval yalnız ekranı tazeler.
 *
 * BİTİŞ: haptik (başarı titreşimi) + isteğe bağlı yerel bildirim. Bildirim
 * sayaç başlarken bitiş anına planlanır; böylece telefon cebinizdeyken de
 * süre dolduğunda haber verir. Duraklatma/sıfırlama planı iptal eder.
 *
 * Günlük istatistik (odak turu ve dakika) cihazda tutulur; Araçlar
 * Merkezi'ndeki kart da buradan okur (FOCUS_STATS_KEY).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { AdminScreen, ToggleField } from "@/components/admin";
import { isoDate } from "@/components/admin/tools/agendaUtils";
import { FOCUS_STATS_KEY, formatClock as clockOf, type FocusStats } from "@/components/admin/tools/focusUtils";
import { Button, Chip, ChipGroup, SegmentedControl, Stepper, Touchable } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { FOCUS_COLORS } from "@/lib/admin/toolPalette";
import { colors, hairline, radius, space, textScale, type } from "@/theme";


const STATE_KEY = "tools:focus:state";
const SETTINGS_KEY = "tools:focus:settings";
const NOTIFY_ID = "odak-sayaci";

type Mode = "pomodoro" | "countdown" | "stopwatch";
type Phase = "focus" | "short" | "long";

const MODES: { key: Mode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "pomodoro", label: "Pomodoro", icon: "bulb-outline" },
  { key: "countdown", label: "Geri sayım", icon: "hourglass-outline" },
  { key: "stopwatch", label: "Kronometre", icon: "stopwatch-outline" },
];
const PHASE_LABELS: Record<Phase, string> = { focus: "Odaklan", short: "Kısa mola", long: "Uzun mola" };
const PRESETS = [
  { label: "1 dk", min: 1 },
  { label: "5 dk", min: 5 },
  { label: "10 dk", min: 10 },
  { label: "Devre 20", min: 20 },
  { label: "Devre 25", min: 25 },
  { label: "Devre 30", min: 30 },
  { label: "Devre 45", min: 45 },
];

interface Settings {
  focus: number;
  short: number;
  long: number;
  every: number;
  countdown: number;
  haptic: boolean;
  notify: boolean;
}
const DEFAULT_SETTINGS: Settings = { focus: 25, short: 5, long: 15, every: 4, countdown: 25, haptic: true, notify: true };

interface TimerState {
  mode: Mode;
  phase: Phase;
  round: number;
  running: boolean;
  /** Geri sayımda bitiş anı (ms). */
  endsAt: number | null;
  remaining: number;
  duration: number;
  /** Kronometrede son başlatma anı (ms). */
  startedAt: number | null;
  elapsed: number;
  laps: number[];
}

const initialState = (s: Settings): TimerState => ({
  mode: "pomodoro",
  phase: "focus",
  round: 1,
  running: false,
  endsAt: null,
  remaining: s.focus * 60000,
  duration: s.focus * 60000,
  startedAt: null,
  elapsed: 0,
  laps: [],
});

const todayKey = () => isoDate(new Date());

/** Bitiş bildirimi: sayaç başlarken planlanır, durunca iptal edilir. */
async function scheduleEnd(at: number, title: string, body: string) {
  try {
    const Notifications = await import("expo-notifications");
    await Notifications.cancelScheduledNotificationAsync(NOTIFY_ID).catch(() => undefined);
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFY_ID,
      content: { title, body, data: { kind: "focus" } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at) },
    });
  } catch {
    /* bildirim modülü yok — sessiz */
  }
}
async function cancelEnd() {
  try {
    const Notifications = await import("expo-notifications");
    await Notifications.cancelScheduledNotificationAsync(NOTIFY_ID);
  } catch {
    /* sessiz */
  }
}

export default function FocusTimerScreen() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [state, setState] = useState<TimerState>(() => initialState(DEFAULT_SETTINGS));
  const [stats, setStats] = useState<FocusStats>({ day: todayKey(), sessions: 0, minutes: 0 });
  const [now, setNow] = useState(() => Date.now());
  const [showSettings, setShowSettings] = useState(false);
  const loaded = useRef(false);
  const finishedRef = useRef(false);

  // Cihazdaki durum, ayar ve istatistik.
  useEffect(() => {
    void (async () => {
      try {
        const [rawState, rawSettings, rawStats] = await Promise.all([
          AsyncStorage.getItem(STATE_KEY),
          AsyncStorage.getItem(SETTINGS_KEY),
          AsyncStorage.getItem(FOCUS_STATS_KEY),
        ]);
        const s = { ...DEFAULT_SETTINGS, ...(rawSettings ? JSON.parse(rawSettings) : {}) };
        setSettings(s);
        setState(rawState ? { ...initialState(s), ...JSON.parse(rawState) } : initialState(s));
        const st = rawStats ? (JSON.parse(rawStats) as FocusStats) : null;
        if (st?.day === todayKey()) setStats(st);
      } catch {
        /* bozuk kayıt — varsayılanlar */
      }
      loaded.current = true;
      setNow(Date.now());
    })();
  }, []);

  useEffect(() => {
    if (loaded.current) void AsyncStorage.setItem(STATE_KEY, JSON.stringify(state)).catch(() => undefined);
  }, [state]);
  useEffect(() => {
    if (loaded.current) void AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)).catch(() => undefined);
  }, [settings]);
  useEffect(() => {
    if (loaded.current) void AsyncStorage.setItem(FOCUS_STATS_KEY, JSON.stringify(stats)).catch(() => undefined);
  }, [stats]);

  // Ekran tazeleme: çalışırken tik; arka plandan dönünce hemen yeniden hesap.
  useEffect(() => {
    if (!state.running) return undefined;
    const timer = setInterval(() => setNow(Date.now()), state.mode === "stopwatch" ? 100 : 250);
    return () => clearInterval(timer);
  }, [state.running, state.mode]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") setNow(Date.now());
    });
    return () => sub.remove();
  }, []);

  const remaining = state.mode === "stopwatch" ? 0 : state.running && state.endsAt ? Math.max(0, state.endsAt - now) : state.remaining;
  const elapsed =
    state.mode === "stopwatch" ? (state.running && state.startedAt ? state.elapsed + (now - state.startedAt) : state.elapsed) : 0;
  const progress = state.mode === "stopwatch" ? (elapsed % 60000) / 60000 : state.duration ? 1 - remaining / state.duration : 0;

  const durationFor = useCallback((phase: Phase) => settings[phase] * 60000, [settings]);
  const stateRef = useRef(state);
  stateRef.current = state;

  const finish = useCallback(() => {
    const s = stateRef.current;
    if (settings.haptic) haptics.success();
    void cancelEnd();
    if (s.mode === "countdown") {
      setState({ ...s, running: false, endsAt: null, remaining: 0 });
      return;
    }
    if (s.phase === "focus") {
      const day = todayKey();
      setStats((st) => ({
        day,
        sessions: (st.day === day ? st.sessions : 0) + 1,
        minutes: (st.day === day ? st.minutes : 0) + Math.round(s.duration / 60000),
      }));
      const next: Phase = s.round % settings.every === 0 ? "long" : "short";
      setState({ ...s, phase: next, running: false, endsAt: null, remaining: durationFor(next), duration: durationFor(next) });
      return;
    }
    setState({ ...s, phase: "focus", round: s.round + 1, running: false, endsAt: null, remaining: durationFor("focus"), duration: durationFor("focus") });
  }, [settings, durationFor]);

  useEffect(() => {
    if (state.mode !== "stopwatch" && state.running && remaining <= 0 && !finishedRef.current) {
      finishedRef.current = true;
      finish();
    }
    if (remaining > 0) finishedRef.current = false;
  }, [remaining, state.running, state.mode, finish]);

  const endText = (s: TimerState) =>
    s.mode === "countdown"
      ? { title: "Süre doldu", body: "Geri sayım tamamlandı." }
      : s.phase === "focus"
        ? { title: "Odak süresi bitti", body: `${PHASE_LABELS[s.round % settings.every === 0 ? "long" : "short"]} zamanı.` }
        : { title: "Mola bitti", body: "Yeni odak turuna hazır mısınız?" };

  const toggle = useCallback(() => {
    const t = Date.now();
    setNow(t);
    const s = stateRef.current;
    let next: TimerState;
    if (s.mode === "stopwatch") {
      next = s.running ? { ...s, running: false, elapsed: s.elapsed + (t - (s.startedAt ?? t)), startedAt: null } : { ...s, running: true, startedAt: t };
    } else if (s.running) {
      next = { ...s, running: false, remaining: Math.max(0, (s.endsAt ?? t) - t), endsAt: null };
      void cancelEnd();
    } else {
      const rest = s.remaining > 0 ? s.remaining : s.duration;
      next = { ...s, running: true, endsAt: t + rest, remaining: rest };
      if (settings.notify) {
        const text = endText(s);
        void scheduleEnd(t + rest, text.title, text.body);
      }
    }
    haptics.light();
    setState(next);
  }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    void cancelEnd();
    setState((s) => {
      if (s.mode === "stopwatch") return { ...s, running: false, elapsed: 0, startedAt: null, laps: [] };
      const duration = s.mode === "countdown" ? settings.countdown * 60000 : durationFor(s.phase);
      return { ...s, running: false, endsAt: null, remaining: duration, duration };
    });
  };

  const switchMode = (mode: Mode) => {
    void cancelEnd();
    if (mode === "stopwatch") setState({ ...initialState(settings), mode, remaining: 0, duration: 0 });
    else if (mode === "countdown") setState({ ...initialState(settings), mode, remaining: settings.countdown * 60000, duration: settings.countdown * 60000 });
    else setState(initialState(settings));
  };
  const setPhase = (phase: Phase) => {
    void cancelEnd();
    setState((s) => ({ ...s, phase, running: false, endsAt: null, remaining: durationFor(phase), duration: durationFor(phase) }));
  };
  const setCountdown = (min: number) => {
    void cancelEnd();
    setSettings((st) => ({ ...st, countdown: min }));
    setState((s) => ({ ...s, running: false, endsAt: null, remaining: min * 60000, duration: min * 60000 }));
  };
  const addMinute = () =>
    setState((s) => {
      if (s.running && s.endsAt) {
        const next = { ...s, endsAt: s.endsAt + 60000, duration: s.duration + 60000 };
        if (settings.notify) {
          const text = endText(s);
          void scheduleEnd(next.endsAt, text.title, text.body);
        }
        return next;
      }
      return { ...s, remaining: s.remaining + 60000, duration: s.duration + 60000 };
    });
  const lap = () => setState((s) => ({ ...s, laps: [elapsed, ...s.laps].slice(0, 30) }));

  const changeSetting = (key: "focus" | "short" | "long" | "every", value: number) => {
    setSettings((st) => ({ ...st, [key]: value }));
    // Duran pomodoroda süre hemen yeni ayarı alır.
    if (key !== "every") {
      setState((s) =>
        s.mode === "pomodoro" && !s.running && s.phase === key ? { ...s, remaining: value * 60000, duration: value * 60000 } : s
      );
    }
  };

  const enableNotify = async (value: boolean) => {
    setSettings((st) => ({ ...st, notify: value }));
    if (!value) {
      void cancelEnd();
      return;
    }
    try {
      const Notifications = await import("expo-notifications");
      const perm = await Notifications.getPermissionsAsync();
      if (!perm.granted) await Notifications.requestPermissionsAsync();
    } catch {
      /* sessiz */
    }
  };

  const tone = state.mode === "pomodoro" ? FOCUS_COLORS[state.phase] : state.mode === "countdown" ? FOCUS_COLORS.countdown : FOCUS_COLORS.stopwatch;
  const SIZE = 260;
  const R = 116;
  const C = 2 * Math.PI * R;
  const display = state.mode === "stopwatch" ? clockOf(elapsed, true) : clockOf(remaining);
  const laps = state.laps.map((total, i) => ({ total, split: total - (state.laps[i + 1] || 0), n: state.laps.length - i }));
  const dots = Math.max(settings.every, stats.sessions);

  return (
    <AdminScreen
      title="Odak sayacı"
      bottom={
        <View style={styles.segment}>
          <SegmentedControl items={MODES} value={state.mode} onChange={switchMode} />
        </View>
      }
    >
      {state.mode === "pomodoro" ? (
        <ChipGroup contentPadding={0}>
          {(Object.keys(PHASE_LABELS) as Phase[]).map((key) => (
            <Chip key={key} label={PHASE_LABELS[key]} selected={state.phase === key} onPress={() => setPhase(key)} />
          ))}
        </ChipGroup>
      ) : null}
      {state.mode === "countdown" ? (
        <ChipGroup contentPadding={0}>
          {PRESETS.map((p) => (
            <Chip key={p.label} label={p.label} selected={settings.countdown === p.min} onPress={() => setCountdown(p.min)} />
          ))}
        </ChipGroup>
      ) : null}

      <View style={styles.dial} accessible accessibilityLabel={`${state.mode === "pomodoro" ? PHASE_LABELS[state.phase] : state.mode === "countdown" ? "Geri sayım" : "Kronometre"} ${display}`}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={colors.surface3} strokeWidth={12} fill="none" />
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke={tone}
            strokeWidth={12}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${C} ${C}`}
            strokeDashoffset={C * (1 - Math.min(1, Math.max(0, progress)))}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        </Svg>
        <View style={styles.dialCenter} pointerEvents="none">
          <Text style={styles.dialLabel} {...textScale.badge}>
            {state.mode === "pomodoro" ? `${PHASE_LABELS[state.phase]} · Tur ${state.round}` : state.mode === "countdown" ? "Geri sayım" : "Kronometre"}
          </Text>
          <Text style={styles.dialTime} {...textScale.badge}>
            {display}
          </Text>
          {state.mode !== "stopwatch" && remaining === 0 ? (
            <Text style={[styles.dialDone, { color: tone }]} {...textScale.badge}>
              Süre doldu
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.controls}>
        <Touchable feedback="icon" onPress={reset} style={styles.ghostBtn} accessibilityLabel="Sıfırla">
          <Ionicons name="refresh" size={26} color={colors.textPrimary} />
        </Touchable>
        <Touchable
          feedback="fab"
          onPress={toggle}
          style={[styles.mainBtn, { backgroundColor: tone }]}
          accessibilityLabel={state.running ? "Duraklat" : "Başlat"}
        >
          <Ionicons name={state.running ? "pause" : "play"} size={36} color={colors.onDark} />
        </Touchable>
        {state.mode === "stopwatch" ? (
          <Touchable feedback="icon" onPress={lap} disabled={!state.running} style={[styles.ghostBtn, !state.running ? styles.disabled : null]} accessibilityLabel="Tur">
            <Ionicons name="flag-outline" size={26} color={colors.textPrimary} />
          </Touchable>
        ) : (
          <Touchable feedback="icon" onPress={addMinute} style={styles.ghostBtn} accessibilityLabel="1 dakika ekle">
            <Text style={styles.plus} {...textScale.badge}>
              +1
            </Text>
          </Touchable>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle} {...textScale.dense}>
          Bugün
        </Text>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue} {...textScale.badge}>
              {stats.sessions}
            </Text>
            <Text style={styles.statLabel} {...textScale.badge}>
              odak turu
            </Text>
          </View>
          <View style={[styles.stat, styles.statDivided]}>
            <Text style={styles.statValue} {...textScale.badge}>
              {stats.minutes}
            </Text>
            <Text style={styles.statLabel} {...textScale.badge}>
              dakika
            </Text>
          </View>
        </View>
        <View style={styles.dots} accessibilityLabel={`${stats.sessions} tur`}>
          {Array.from({ length: dots }, (_, i) => (
            <View key={i} style={[styles.dot, i < stats.sessions ? { backgroundColor: FOCUS_COLORS.focus } : null]} />
          ))}
        </View>
      </View>

      {state.mode === "stopwatch" && laps.length ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle} {...textScale.dense}>
            Turlar
          </Text>
          {laps.map((l) => (
            <View key={l.n} style={styles.lapRow}>
              <Text style={styles.lapN} {...textScale.dense}>
                Tur {l.n}
              </Text>
              <Text style={styles.lapSplit} {...textScale.badge}>
                {clockOf(l.split, true)}
              </Text>
              <Text style={styles.lapTotal} {...textScale.badge}>
                {clockOf(l.total, true)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.card}>
        <Touchable feedback="row" onPress={() => setShowSettings((v) => !v)} style={styles.settingsHead} accessibilityRole="button" accessibilityState={{ expanded: showSettings }}>
          <Ionicons name="options-outline" size={20} color={colors.textSecondary} />
          <Text style={[styles.cardTitle, styles.flex]} {...textScale.dense}>
            Ayarlar
          </Text>
          <Ionicons name={showSettings ? "chevron-up" : "chevron-down"} size={18} color={colors.textTertiary} />
        </Touchable>
        {showSettings ? (
          <View style={styles.settings}>
            {(
              [
                ["focus", "Odak (dk)"],
                ["short", "Kısa mola (dk)"],
                ["long", "Uzun mola (dk)"],
                ["every", "Uzun mola her … turda"],
              ] as const
            ).map(([key, label]) => (
              <View key={key} style={styles.settingRow}>
                <Text style={[styles.settingLabel, styles.flex]} {...textScale.dense}>
                  {label}
                </Text>
                <Stepper value={settings[key]} onChange={(v) => changeSetting(key, v)} min={1} max={180} size="sm" repeatOnHold accessibilityLabel={label} />
              </View>
            ))}
            <ToggleField label="Bitişte titreşim" value={settings.haptic} onChange={(v) => setSettings((st) => ({ ...st, haptic: v }))} />
            <ToggleField
              label="Bitişte bildirim"
              hint="Telefon kilitliyken ya da uygulama arka plandayken süre dolunca haber verir."
              value={settings.notify}
              onChange={(v) => void enableNotify(v)}
            />
            <Button label="Bugünün sayacını sıfırla" variant="ghost" size="sm" icon="trash-outline" onPress={() => setStats({ day: todayKey(), sessions: 0, minutes: 0 })} />
          </View>
        ) : null}
      </View>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  segment: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  flex: { flex: 1 },
  dial: { alignSelf: "center", alignItems: "center", justifyContent: "center", marginVertical: space.md },
  dialCenter: { position: "absolute", alignItems: "center", gap: space.xs },
  dialLabel: { ...type.label, color: colors.textSecondary },
  dialTime: { ...type.scoreJumbo, color: colors.textPrimary },
  dialDone: { ...type.label },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xxl },
  ghostBtn: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  mainBtn: { width: 80, height: 80, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.4 },
  plus: { ...type.scoreXs, color: colors.textPrimary },
  card: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  cardTitle: { ...type.h3, color: colors.textPrimary },
  statsRow: { flexDirection: "row" },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statDivided: { borderLeftWidth: hairline, borderLeftColor: colors.separator },
  statValue: { ...type.metric, color: colors.textPrimary },
  statLabel: { ...type.caption, color: colors.textTertiary },
  dots: { flexDirection: "row", flexWrap: "wrap", gap: space.s, justifyContent: "center" },
  dot: { width: 12, height: 12, borderRadius: radius.pill, backgroundColor: colors.surface3 },
  lapRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.xs, borderTopWidth: hairline, borderTopColor: colors.separator },
  lapN: { flex: 1, ...type.bodySm, color: colors.textSecondary },
  lapSplit: { ...type.tableNumStrong, color: colors.textPrimary },
  lapTotal: { ...type.numSm, color: colors.textTertiary, minWidth: 72, textAlign: "right" },
  settingsHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  settings: { gap: space.md },
  settingRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  settingLabel: { ...type.body, color: colors.textPrimary },
});
