/**
 * LİG YOLU SAHNESİ — seviyeli oyunların (Elit Üçlü, Üçle Kazan, Soyunma Odası,
 * Kantin, Kariyer Yolu) arkasındaki oyun dünyası.
 *
 * Oyuna özel renkli zemin (lib/puzzle/stagePalette): üstten aşağı derin bir
 * gece/ışık geçişi, iki köşeden düşen projektör hüzmeleri, tahtanın arkasında
 * parlama, tepede ışıkları yanan tribün silueti ve havada süzülen kıvılcımlar.
 * Açılışta bir kez belirir (sonlu animasyon); dokunuşları engellemez.
 */

import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, useWindowDimensions } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from "react-native-svg";

import { STAGE_THEMES } from "@/lib/puzzle/stagePalette";
import { colors } from "@/theme";
import type { PuzzleGameKey } from "@/lib/puzzle/types";

export function StageBackdrop({ game = "uclu" }: { game?: PuzzleGameKey }) {
  const { width, height } = useWindowDimensions();
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [fade]);
  const th = STAGE_THEMES[game] ?? STAGE_THEMES.uclu;

  // Tribün silueti + kalabalık ışıkları + kıvılcımlar: sabit tohumla.
  const scene = useMemo(() => {
    let a = 7;
    const r = () => {
      a = (a * 16807) % 2147483647;
      return a / 2147483647;
    };
    const standH = Math.min(120, height * 0.14);
    let d = `M 0 ${standH}`;
    const steps = 9;
    for (let i = 0; i <= steps; i += 1) {
      const x = (i / steps) * width;
      const y = standH * (0.35 + 0.25 * Math.sin(i * 1.3) + (i % 2 ? 0.1 : 0));
      d += ` L ${x} ${y}`;
    }
    d += ` L ${width} ${standH} Z`;
    const lights = Array.from({ length: 40 }, () => ({ x: r() * width, y: standH * (0.45 + r() * 0.5), s: 0.8 + r() * 1.4 }));
    const sparks = Array.from({ length: 14 }, () => ({ x: r() * width, y: standH + r() * (height - standH), s: 1 + r() * 2.2, o: 0.2 + r() * 0.5 }));
    return { standH, d, lights, sparks };
  }, [width, height]);

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: fade }]}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="stSky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={th.sky[0]} />
            <Stop offset="0.55" stopColor={th.sky[1]} />
            <Stop offset="1" stopColor={th.sky[2]} />
          </LinearGradient>
          <RadialGradient id="stGlow" cx="50%" cy="55%" r="55%">
            <Stop offset="0" stopColor={th.glow} stopOpacity={0.32} />
            <Stop offset="1" stopColor={th.glow} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="stBeamA" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={th.beamA} stopOpacity={0.3} />
            <Stop offset="1" stopColor={th.beamA} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id="stBeamB" x1="1" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={th.beamB} stopOpacity={0.24} />
            <Stop offset="1" stopColor={th.beamB} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#stSky)" />
        <Rect x={0} y={0} width={width} height={height} fill="url(#stGlow)" />
        <Polygon points={`0,0 ${width * 0.22},0 ${width * 0.85},${height * 0.75} ${width * 0.35},${height * 0.8}`} fill="url(#stBeamA)" />
        <Polygon points={`${width},0 ${width * 0.78},0 ${width * 0.15},${height * 0.75} ${width * 0.65},${height * 0.8}`} fill="url(#stBeamB)" />
        <Path d={scene.d} fill={th.crowd} opacity={0.9} />
        {scene.lights.map((l, i) => (
          <Circle key={`l${i}`} cx={l.x} cy={l.y} r={l.s} fill={i % 5 === 0 ? th.sparkle : colors.onDark} opacity={0.55} />
        ))}
        {scene.sparks.map((s, i) => (
          <Circle key={`s${i}`} cx={s.x} cy={s.y} r={s.s} fill={th.sparkle} opacity={s.o} />
        ))}
        <Circle cx={width * 0.08} cy={scene.standH * 0.3} r={9} fill={th.beamA} opacity={0.85} />
        <Circle cx={width * 0.92} cy={scene.standH * 0.3} r={9} fill={th.beamB} opacity={0.85} />
      </Svg>
    </Animated.View>
  );
}
