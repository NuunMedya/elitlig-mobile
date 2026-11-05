/**
 * Tek dolap (askı): forma yığını, seçimde kalkan grup, geçersiz hamlede
 * sallanma, inişte sekme, takım hazır olunca arma + parıltı, kilitli dolabın
 * kapısı. React.memo — yalnız kendi verisi değişince yeniden çizilir.
 */
import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, textScale, type } from "@/theme";
import { SOYUNMA_LOCKER, SOYUNMA_TEAMS } from "@/lib/puzzle/soyunmaPalette";
import { SparkleBurst } from "./Effects";
import { bodyTop, liftOffset, slotTop, type BoardGeometry } from "./geometry";
import { Crest, Jersey } from "./Jersey";

export interface LockerProps {
  index: number;
  cap: number;
  items: number[];
  hidden: number;
  teamIds: number[];
  lock: number | null;
  unlocked: boolean;
  complete: boolean;
  /** Kalkmış (seçili) forma sayısı; 0 → seçili değil. */
  lift: number;
  /** Henüz inmemiş (uçan) üst forma sayısı — çizilmez. */
  incoming: number;
  shake: number;
  bump: number;
  hint: boolean;
  geom: BoardGeometry;
  onPress: (index: number) => void;
}

/* ───────────── forma yuvası: gizli → açık geçişinde döner ───────────── */

interface SlotProps {
  team: number;
  width: number;
  height: number;
  top: number;
  left: number;
}

const Slot = memo(function Slot({ team, width, height, top, left }: SlotProps) {
  const flip = useRef(new Animated.Value(1)).current;
  const prev = useRef(team);
  useEffect(() => {
    if (prev.current < 0 && team >= 0) {
      flip.setValue(0);
      Animated.spring(flip, { toValue: 1, damping: 11, stiffness: 220, mass: 0.7, useNativeDriver: true }).start();
    }
    prev.current = team;
  }, [team, flip]);
  return (
    <Animated.View
      style={{
        position: "absolute",
        top,
        left,
        width,
        height,
        transform: [{ scaleX: flip.interpolate({ inputRange: [0, 1], outputRange: [0.05, 1] }) }],
      }}
    >
      <Jersey team={team} width={width} height={height} />
    </Animated.View>
  );
});

/* ───────────── kilitli dolabın kapısı ───────────── */

function Door({ open, team, width, height, top }: { open: boolean; team: number; width: number; height: number; top: number }) {
  const v = useRef(new Animated.Value(open ? 1 : 0)).current;
  const [gone, setGone] = useState(open);
  useEffect(() => {
    if (open) {
      Animated.timing(v, { toValue: 1, duration: 520, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(
        ({ finished }) => finished && setGone(true),
      );
    } else {
      v.setValue(0);
      setGone(false);
    }
  }, [open, v]);
  if (gone) return null;
  const icon = Math.max(14, Math.round(width * 0.32));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.door,
        {
          top,
          width,
          height,
          opacity: v.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
          transform: [
            { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, -width / 2] }) },
            { scaleX: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.02] }) },
          ],
        },
      ]}
    >
      <View style={[styles.lockBadge, { width: icon + 10, height: icon + 10, borderRadius: (icon + 10) / 2 }]}>
        <Ionicons name="lock-closed" size={icon} color={SOYUNMA_LOCKER.lockDark} />
      </View>
      <Jersey team={team} width={width * 0.62} height={width * 0.52} />
      <View style={styles.doorSlit} />
      <View style={[styles.doorSlit, { marginTop: 3 }]} />
    </Animated.View>
  );
}

/* ───────────── dolap ───────────── */

function LockerBase(p: LockerProps) {
  const { geom: g, cap, items, hidden, teamIds, lift, incoming } = p;
  const shakeV = useRef(new Animated.Value(0)).current;
  const liftV = useRef(new Animated.Value(0)).current;
  const bumpV = useRef(new Animated.Value(0)).current;
  const crestV = useRef(new Animated.Value(p.complete ? 1 : 0)).current;
  const hintV = useRef(new Animated.Value(0)).current;
  const [sparkle, setSparkle] = useState(0);
  const liftN = useRef(0);
  const prevItems = useRef(items);
  const prevComplete = useRef(p.complete);

  // Kalkan grubun boyu: seçimde prop'tan; geri inerken son değer korunur.
  if (lift > 0) liftN.current = lift;
  else if (items !== prevItems.current) liftN.current = 0;

  useEffect(() => {
    const changed = items !== prevItems.current;
    prevItems.current = items;
    if (lift > 0) {
      Animated.spring(liftV, { toValue: 1, damping: 14, stiffness: 320, mass: 0.6, useNativeDriver: true }).start();
    } else if (changed) {
      liftV.setValue(0);
    } else {
      Animated.timing(liftV, { toValue: 0, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    }
  }, [lift, items, liftV]);

  useEffect(() => {
    if (!p.shake) return;
    shakeV.setValue(0);
    Animated.timing(shakeV, { toValue: 1, duration: 360, easing: Easing.linear, useNativeDriver: true }).start();
  }, [p.shake, shakeV]);

  useEffect(() => {
    if (!p.bump) return;
    bumpV.setValue(0);
    Animated.timing(bumpV, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [p.bump, bumpV]);

  useEffect(() => {
    if (p.complete && !prevComplete.current) {
      crestV.setValue(0);
      Animated.spring(crestV, { toValue: 1, damping: 9, stiffness: 180, mass: 0.8, useNativeDriver: true }).start();
      setSparkle((n) => n + 1);
    } else if (!p.complete) {
      crestV.setValue(0);
    }
    prevComplete.current = p.complete;
  }, [p.complete, crestV]);

  useEffect(() => {
    if (!p.hint) return;
    hintV.setValue(0);
    const bounce = Animated.sequence([
      Animated.timing(hintV, { toValue: 1, duration: 380, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(hintV, { toValue: 0, duration: 380, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]);
    const loop = Animated.loop(bounce, { iterations: 30 });
    loop.start();
    return () => loop.stop();
  }, [p.hint, hintV]);

  const visible = items.length - incoming;
  const lifted = Math.min(liftN.current, visible);
  const top = bodyTop(g, cap);
  const jW = g.colW - g.pad * 2;
  const jH = g.slotH;
  const dy = visible > 0 ? liftOffset(g, visible - 1) : 0;
  const liftTranslate = liftV.interpolate({ inputRange: [0, 1], outputRange: [0, dy] });
  const locked = p.lock != null && !p.unlocked;
  const completeTeam = p.complete && items.length ? teamIds[items[0]] : -1;

  const slots: React.ReactNode[] = [];
  const raised: React.ReactNode[] = [];
  for (let j = 0; j < visible; j += 1) {
    const team = j < hidden ? -1 : teamIds[items[j]];
    const node = <Slot key={j} team={team} width={jW} height={jH} top={slotTop(g, j)} left={g.pad} />;
    if (j >= visible - lifted) raised.push(node);
    else slots.push(node);
  }
  // Boş kapasite yuvaları — dolabın ne kadar forma aldığı görünsün.
  const ghosts: React.ReactNode[] = [];
  for (let j = items.length; j < cap; j += 1) {
    ghosts.push(<View key={`g${j}`} style={[styles.ghost, { top: slotTop(g, j) + 3, left: g.pad + 3, width: jW - 6, height: jH - 6 }]} />);
  }

  const topTeam = items.length && items.length - 1 >= hidden ? SOYUNMA_TEAMS[teamIds[items[items.length - 1]]]?.name : null;
  const label = locked
    ? `Kilitli dolap ${p.index + 1}: ${SOYUNMA_TEAMS[teamIds[p.lock!]]?.name ?? ""} takımı hazır olunca açılır`
    : p.complete
      ? `Dolap ${p.index + 1}: ${SOYUNMA_TEAMS[completeTeam]?.name ?? ""} takımı hazır`
      : items.length === 0
        ? `Dolap ${p.index + 1}: boş, ${cap} forma alır`
        : `Dolap ${p.index + 1}: ${items.length}/${cap} forma, en üstte ${topTeam ?? "gizli forma"}`;

  const borderColor = p.complete ? colors.win : lift > 0 ? colors.brand : SOYUNMA_LOCKER.woodDark;

  return (
    <Animated.View
      style={[
        styles.root,
        {
          left: g.rackX[p.index],
          top: g.rackY[p.index],
          width: g.colW,
          height: g.rowH,
          transform: [
            {
              translateX: shakeV.interpolate({
                inputRange: [0, 0.15, 0.35, 0.55, 0.75, 1],
                outputRange: [0, -7, 6, -4, 2, 0],
              }),
            },
          ],
        },
      ]}
    >
      <Pressable
        onPress={() => p.onPress(p.index)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: lift > 0, disabled: locked || p.complete }}
        style={StyleSheet.absoluteFill}
      >
        {/* Askı rayı + kanca */}
        <View style={[styles.hook, { top: top - 6, left: g.colW / 2 - 4 }]} />
        <View
          style={[
            styles.body,
            {
              top,
              height: g.rowH - top,
              borderColor,
              borderWidth: lift > 0 || p.complete ? 2 : 1,
              borderRadius: Math.min(radius.md, g.colW / 5),
            },
          ]}
        >
          <View style={[styles.rail, { height: Math.max(4, g.headerH * 0.28), marginTop: g.headerH * 0.3 }]} />
        </View>
        <View style={[styles.interior, { top: top + g.headerH, height: g.rowH - top - g.headerH - 2, borderRadius: Math.min(radius.sm, g.colW / 7) }]} />
        {ghosts}
        <Animated.View
          style={[StyleSheet.absoluteFill, { transform: [{ translateY: bumpV.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 3, 0] }) }] }]}
          pointerEvents="none"
        >
          {slots}
        </Animated.View>
        {raised.length ? (
          <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: liftTranslate }] }]} pointerEvents="none">
            {raised}
          </Animated.View>
        ) : null}
        {p.lock != null ? (
          <Door
            open={p.unlocked}
            team={teamIds[p.lock]}
            width={g.colW}
            height={g.rowH - top - g.headerH}
            top={top + g.headerH}
          />
        ) : null}
        {cap < g.maxCap ? (
          <View style={[styles.capTag, { top: top + 2, right: 2 }]}>
            <Text {...textScale.badge} style={styles.capText}>
              {cap}
            </Text>
          </View>
        ) : null}
      </Pressable>
      {completeTeam >= 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.crest,
            {
              top: top - g.colW * 0.3,
              left: g.colW * 0.2,
              width: g.colW * 0.6,
              height: g.colW * 0.6,
              transform: [{ scale: crestV }, { rotate: crestV.interpolate({ inputRange: [0, 1], outputRange: ["-25deg", "0deg"] }) }],
            },
          ]}
        >
          <Crest team={completeTeam} size={g.colW * 0.6} />
        </Animated.View>
      ) : null}
      <View pointerEvents="none" style={[styles.sparkleHost, { top: top - g.colW * 0.3, height: g.colW * 0.6 }]}>
        <SparkleBurst token={sparkle} spread={g.colW * 0.85} />
      </View>
      {p.hint ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.hint,
            {
              top: Math.max(0, top - 30),
              left: g.colW / 2 - 12,
              transform: [{ translateY: hintV.interpolate({ inputRange: [0, 1], outputRange: [-4, 4] }) }],
            },
          ]}
        >
          <Ionicons name="arrow-down" size={24} color={colors.brandAccent} />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

export const Locker = memo(LockerBase);

const styles = StyleSheet.create({
  root: { position: "absolute" },
  hook: {
    position: "absolute",
    width: 8,
    height: 9,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: SOYUNMA_LOCKER.railDark,
  },
  body: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: SOYUNMA_LOCKER.wood,
    paddingHorizontal: 4,
  },
  rail: {
    backgroundColor: SOYUNMA_LOCKER.rail,
    borderRadius: 2,
    borderBottomWidth: 1,
    borderBottomColor: SOYUNMA_LOCKER.railDark,
  },
  interior: {
    position: "absolute",
    left: 3,
    right: 3,
    backgroundColor: SOYUNMA_LOCKER.woodDark,
  },
  ghost: {
    position: "absolute",
    borderRadius: 4,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: SOYUNMA_LOCKER.wood,
  },
  door: {
    position: "absolute",
    left: 0,
    backgroundColor: SOYUNMA_LOCKER.wood,
    borderWidth: 1,
    borderColor: SOYUNMA_LOCKER.woodDark,
    borderRadius: radius.xs,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  lockBadge: {
    backgroundColor: SOYUNMA_LOCKER.lockBody,
    alignItems: "center",
    justifyContent: "center",
  },
  doorSlit: { width: "60%", height: 2, borderRadius: 1, backgroundColor: SOYUNMA_LOCKER.woodDark },
  capTag: {
    position: "absolute",
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: SOYUNMA_LOCKER.rail,
    alignItems: "center",
    justifyContent: "center",
  },
  capText: { ...type.nano, color: SOYUNMA_LOCKER.woodDark },
  crest: { position: "absolute" },
  sparkleHost: { position: "absolute", left: 0, right: 0 },
  hint: { position: "absolute" },
});
