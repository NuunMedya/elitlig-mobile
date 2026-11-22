/**
 * PAYLAŞIM TUVALİNİN YAPI TAŞLARI — her şablon bunlarla kurulur.
 *
 * Kurallar:
 *   · Bütün ölçüler `f.u(n)` ile (tasarım birimi, bkz. lib/share/canvas.ts).
 *   · Bütün renkler `f.t.*` (görsel teması, bkz. lib/share/palette.ts) —
 *     uygulamanın aktif teması tuvale SIZMAZ; görsel her cihazda aynıdır.
 *   · Işık ve degrade SVG ile çizilir (yakalamada gölge/elevation kaybolur,
 *     SVG kaybolmaz). Gradyan kimlikleri örnek başına tekildir: aynı ekranda
 *     önizleme + küçük resimler + yakalama kabı birlikte durur.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useRef, useState } from "react";
import { Image, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";

import { CANVAS_TYPE, SAFE, font, fitScale, type CanvasTypeKey } from "@/lib/share/canvas";
import { formLetters, upper } from "@/lib/share/format";
import { alpha } from "@/lib/share/palette";
import { fonts } from "@/theme";
import { initials, mediaUrl } from "@/lib/format";
import type { ShareFrame } from "./types";

const LOGO = require("../../../assets/images/splash-icon.png");

let svgSeq = 0;
/** SVG gradyan kimliği — örnek başına tekil, yeniden çizimde sabit. */
export function useSvgId(prefix: string): string {
  const ref = useRef<string | null>(null);
  if (!ref.current) {
    svgSeq += 1;
    ref.current = `${prefix}${svgSeq}`;
  }
  return ref.current;
}

/* ══════════════════════════ METİN ══════════════════════════ */

export function CText({
  f,
  k,
  scale = 1,
  color,
  lines = 1,
  align,
  style,
  children,
}: {
  f: ShareFrame;
  k: CanvasTypeKey;
  scale?: number;
  color?: string;
  lines?: number;
  align?: TextStyle["textAlign"];
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
}) {
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={lines}
      style={[font(f.u, k, scale), { color: color ?? f.t.ink }, align ? { textAlign: align } : null, style]}
    >
      {children}
    </Text>
  );
}

/**
 * Uzun ad: önce punto düşer, sonra iki satıra kırılır — kırpılmaz.
 * `room` tokenın tam puntosunda bir satıra sığan karakter sayısıdır.
 */
export function FitName({
  f,
  k = "name",
  text,
  room,
  width,
  lines = 2,
  scale = 1,
  min,
  color,
  align = "center",
  style,
  caps = false,
}: {
  f: ShareFrame;
  k?: CanvasTypeKey;
  text: string;
  /** Tam puntoda bir satıra sığan karakter sayısı (yaklaşık). */
  room?: number;
  /** Ya da kutunun genişliği (birim) — karakter sayısı puntodan hesaplanır. */
  width?: number;
  lines?: number;
  scale?: number;
  min?: number;
  color?: string;
  align?: TextStyle["textAlign"];
  style?: StyleProp<TextStyle>;
  caps?: boolean;
}) {
  const value = caps ? upper(text) : text;
  // Büyük harf glifleri geniştir: ad zaten büyük harfle girilmişse de öyle sayılır.
  const isCaps = value === upper(value);
  // `room` tam puntodaki karakter sayısıdır: küçültülmüş puntoda daha çok,
  // büyük harfte daha az karakter sığar. `width` verilirse ortalama glif
  // genişliğinden (büyük harf ~0.7 em, karışık ~0.58 em) hesaplanır.
  const chars =
    width != null
      ? width / (CANVAS_TYPE[k].size * scale * (isCaps ? 0.7 : 0.58))
      : ((room ?? 12) / scale) * (isCaps ? 0.88 : 1);
  const fit = fitScale(value, chars, min, lines);
  return (
    <CText f={f} k={k} scale={scale * fit} lines={lines} color={color} align={align} style={style}>
      {value}
    </CText>
  );
}

/** Büyük harf etiket — "MAÇ SONU", "PUAN DURUMU". */
export function Overline({
  f,
  children,
  color,
  scale = 1,
  align,
  style,
}: {
  f: ShareFrame;
  children: React.ReactNode;
  color?: string;
  scale?: number;
  align?: TextStyle["textAlign"];
  style?: StyleProp<TextStyle>;
}) {
  return (
    <CText f={f} k="label" scale={scale} color={color ?? f.t.accent} align={align} style={style}>
      {typeof children === "string" ? upper(children) : children}
    </CText>
  );
}

/* ══════════════════════════ ZEMİN ══════════════════════════ */

export type BackdropMood = "top" | "center" | "split" | "low";

const MOODS: Record<BackdropMood, [number, number, number][]> = {
  // [x oranı, y oranı, yarıçap (genişlik oranı)] — A, B, C ışıkları
  top: [[0.1, 0.1, 0.9], [1.02, 0.5, 0.66], [0.1, 1.0, 0.56]],
  center: [[0.5, 0.42, 0.86], [1.0, 0.06, 0.54], [0.0, 0.92, 0.56]],
  split: [[0.0, 0.22, 0.9], [1.0, 0.78, 0.9], [0.5, 0.5, 0.3]],
  low: [[0.9, 0.86, 0.9], [0.06, 0.3, 0.58], [0.62, 0.04, 0.46]],
};

/**
 * Sahne zemini — stilin dokusuna göre üç ayrı çizim:
 *
 *   aurora (gece, neon): dikey geçiş + kısık iki-üç ışık + üst yarıda
 *     çapraz ince tarama (aşağı doğru söner) + tek çapraz ışık kuşağı +
 *     kenar karartması. Gürültü yok: tarama %3–4 saydamlıktadır.
 *   pitch (saha): biçilmiş çim bantları (dikey, iki ton) + sahanın orta
 *     çizgisi ve santra yayı tebeşirle, alt yarıda kısmen görünür.
 *   paper (minimal): düz kâğıt; üst kenarda ince imza şeridi. Işık yok.
 *
 * Hepsinde büyük, çok soluk ElitLig filigranı sağ altta durur (isteğe bağlı).
 */
export function Backdrop({
  f,
  mood = "top",
  grid = true,
  streaks = true,
  watermark = true,
}: {
  f: ShareFrame;
  mood?: BackdropMood;
  grid?: boolean;
  streaks?: boolean;
  watermark?: boolean;
}) {
  const id = useSvgId("bd");
  const { W, H, u, t } = f;
  const [a, b, c] = MOODS[mood];
  const p = t.glowPower;

  const glow = (gid: string, color: string, strength: number) => (
    <RadialGradient id={gid} cx="50%" cy="50%" r="50%">
      <Stop offset="0" stopColor={color} stopOpacity={0.5 * strength * p} />
      <Stop offset="0.5" stopColor={color} stopOpacity={0.16 * strength * p} />
      <Stop offset="1" stopColor={color} stopOpacity={0} />
    </RadialGradient>
  );

  /* Çapraz tarama: 45° ince çizgiler, yalnız tuvalin üst yarısında. */
  let hatch = "";
  if (grid && t.texture === "aurora") {
    const step = u(7);
    const reach = H * 0.55;
    for (let x = -reach; x < W; x += step) hatch += `M${x.toFixed(1)} ${reach.toFixed(1)}L${(x + reach).toFixed(1)} 0`;
  }

  /* Çim bantları: tuval genişliğinde 9 dikey şerit. */
  const bands = t.texture === "pitch" ? 9 : 0;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={W} height={H}>
        <Defs>
          <LinearGradient id={`${id}bg`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.bgTop} />
            <Stop offset="1" stopColor={t.bgBottom} />
          </LinearGradient>
          {glow(`${id}a`, t.glowA, 1)}
          {glow(`${id}b`, t.glowB, 0.75)}
          {glow(`${id}c`, t.glowC, 0.45)}
          <LinearGradient id={`${id}h`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.grid} stopOpacity={1} />
            <Stop offset="1" stopColor={t.grid} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={t.sigA} stopOpacity={0} />
            <Stop offset="0.5" stopColor={t.sigA} stopOpacity={t.dark ? 0.16 : 0.08} />
            <Stop offset="1" stopColor={t.sigB} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id={`${id}k`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={t.sigA} />
            <Stop offset="1" stopColor={t.sigB} />
          </LinearGradient>
          <RadialGradient id={`${id}v`} cx="50%" cy="45%" r="75%">
            <Stop offset="0.55" stopColor={t.bgBottom} stopOpacity={0} />
            <Stop offset="1" stopColor={t.bgBottom} stopOpacity={t.dark ? 0.75 : 0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={W} height={H} fill={`url(#${id}bg)`} />

        {bands
          ? Array.from({ length: bands }, (_, i) =>
              i % 2 ? <Rect key={i} x={(W / bands) * i} y={0} width={W / bands} height={H} fill={t.ink} opacity={0.03} /> : null,
            )
          : null}

        {p > 0 ? (
          <>
            <Circle cx={a[0] * W} cy={a[1] * H} r={a[2] * W} fill={`url(#${id}a)`} />
            <Circle cx={b[0] * W} cy={b[1] * H} r={b[2] * W} fill={`url(#${id}b)`} />
            <Circle cx={c[0] * W} cy={c[1] * H} r={c[2] * W} fill={`url(#${id}c)`} />
          </>
        ) : null}

        {hatch ? <Path d={hatch} stroke={`url(#${id}h)`} strokeWidth={Math.max(0.5, u(0.5))} /> : null}

        {t.texture === "pitch" && grid ? (
          <>
            <Path d={`M0 ${H * 0.86}H${W}`} stroke={t.grid} strokeWidth={u(1.2)} />
            <Circle cx={W / 2} cy={H * 0.86} r={W * 0.2} stroke={t.grid} strokeWidth={u(1.2)} fill="none" />
            <Circle cx={W / 2} cy={H * 0.86} r={u(2.4)} fill={t.grid} />
          </>
        ) : null}

        {streaks && t.texture !== "paper" ? (
          <Path
            d={`M${-0.1 * W} ${0.74 * H} L${1.1 * W} ${0.4 * H} L${1.1 * W} ${0.46 * H} L${-0.1 * W} ${0.8 * H} Z`}
            fill={`url(#${id}s)`}
          />
        ) : null}

        {t.texture === "paper" ? <Rect x={0} y={0} width={W} height={u(3)} fill={`url(#${id}k)`} /> : null}

        <Rect x={0} y={0} width={W} height={H} fill={`url(#${id}v)`} />
      </Svg>
      {watermark ? (
        <Image
          source={LOGO}
          resizeMode="contain"
          style={{
            position: "absolute",
            width: W * 1.1,
            height: W * 1.1,
            right: -W * 0.44,
            bottom: f.story ? H * 0.08 : -W * 0.32,
            opacity: t.dark ? 0.04 : 0.045,
            tintColor: t.logoTint ?? undefined,
            transform: [{ rotate: "-10deg" }],
          }}
        />
      ) : null}
    </View>
  );
}

/* ══════════════════════════ MARKA ══════════════════════════ */

/*
 * Logo görseli (1024²) çizimin çevresinde boşluk taşır: solda %15, üstte
 * %18, altta %18. Künyede çizim kenar çizgisine otursun diye bu pay negatif
 * kenar boşluğuyla geri alınır.
 */
const LOGO_PAD_X = 0.15;
const LOGO_PAD_Y = 0.18;

/** ElitLig logosu (beyaz çizim; açık zeminde marka moruna boyanır). */
export function Logo({ f, size, tint }: { f: ShareFrame; size: number; tint?: string }) {
  return (
    <Image
      source={LOGO}
      resizeMode="contain"
      style={{ width: f.u(size), height: f.u(size), tintColor: tint ?? f.t.logoTint ?? undefined }}
      accessible={false}
    />
  );
}

/** Logo — çizimin kendi iç boşluğu kırpılmış hâli (kenar çizgisine oturur). */
export function LogoMark({ f, size, tint }: { f: ShareFrame; size: number; tint?: string }) {
  const s = f.u(size);
  return (
    <View style={{ marginHorizontal: -s * LOGO_PAD_X, marginVertical: -s * LOGO_PAD_Y }}>
      <Logo f={f} size={size} tint={tint} />
    </View>
  );
}

/**
 * MARKA KÜNYESİ — her görselin sol üstü: ElitLig logosu | ince dikey çizgi |
 * lig adı (kalın) ve şehir · sezon (sönük). Sağ üst bilerek boş bırakılır;
 * şablon isterse oraya kısa bir etiket (`tag`: "MAÇ SONU") koyar.
 * Logo story'de 1080 px tuvalde ~190 px genişliğindedir — her paylaşımda
 * ilk okunan marka işaretidir.
 */
export function BrandHeader({
  f,
  title,
  meta,
  tag,
  style,
}: {
  f: ShareFrame;
  title?: string | null;
  meta?: string | null;
  tag?: string | null;
  style?: StyleProp<ViewStyle>;
}) {
  const { u, t, story } = f;
  const size = story ? 74 : 60;
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: u(SAFE[f.fmt].side),
          paddingTop: u(SAFE[f.fmt].top),
        },
        style,
      ]}
    >
      <LogoMark f={f} size={size} />
      {title || meta ? (
        <>
          <View style={{ width: Math.max(1, u(0.8)), height: u(story ? 30 : 26), backgroundColor: t.line, marginHorizontal: u(story ? 12 : 10) }} />
          <View style={{ flexShrink: 1, flexGrow: 1 }}>
            {title ? <FitName f={f} k="label" text={title} width={story ? 150 : 170} lines={1} caps scale={1.12} align="left" color={t.ink} /> : null}
            {meta ? (
              <FitName f={f} k="label" text={meta} width={story ? 160 : 180} lines={1} caps align="left" color={t.inkMuted} style={{ marginTop: u(3) }} />
            ) : null}
          </View>
        </>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      {tag ? (
        <View
          style={{
            paddingHorizontal: u(9),
            paddingVertical: u(4),
            borderRadius: u(20),
            borderWidth: Math.max(1, u(0.8)),
            borderColor: t.glassLine,
            backgroundColor: t.glass,
            marginLeft: u(8),
          }}
        >
          <Overline f={f} color={t.ink} scale={0.92}>
            {tag}
          </Overline>
        </View>
      ) : null}
    </View>
  );
}

/** Alt bant: imza çizgisi + elitlig.com solda; sağda kısa not (instagram, şehir). */
export function Footer({ f, right }: { f: ShareFrame; right?: string | null }) {
  const { u, t } = f;
  return (
    <View
      style={{
        position: "absolute",
        left: u(SAFE[f.fmt].side),
        right: u(SAFE[f.fmt].side),
        bottom: u(SAFE[f.fmt].bottom - (f.story ? 16 : 2)),
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: u(7) }}>
        <SigBar f={f} width={16} height={2.4} />
        <CText f={f} k="body" color={t.ink} style={{ fontFamily: fonts.bold, letterSpacing: u(0.4) }}>
          elitlig.com
        </CText>
      </View>
      {right ? (
        <CText f={f} k="label" color={t.inkMuted} style={{ maxWidth: f.W * 0.55 }}>
          {upper(right)}
        </CText>
      ) : null}
    </View>
  );
}

/**
 * Bölüm başlığı — "— MAÇ SONU" gibi: kısa imza çizgisi + büyük harf etiket.
 * Bütün şablonlarda başlığın üstündeki tek tip giriş.
 */
export function Kicker({
  f,
  children,
  color,
  align = "left",
  style,
}: {
  f: ShareFrame;
  children: string;
  color?: string;
  align?: "left" | "center";
  style?: StyleProp<ViewStyle>;
}) {
  const { u } = f;
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: u(7), alignSelf: align === "center" ? "center" : "flex-start" }, style]}>
      <SigBar f={f} width={14} height={2.4} />
      <Overline f={f} color={color} scale={1.05}>
        {children}
      </Overline>
      {align === "center" ? <SigBar f={f} width={14} height={2.4} /> : null}
    </View>
  );
}

/* ══════════════════════════ DEGRADE ══════════════════════════ */

/** İmza degrade çizgi (mor → camgöbeği). */
export function SigBar({ f, width, height = 3, style }: { f: ShareFrame; width: number; height?: number; style?: StyleProp<ViewStyle> }) {
  const id = useSvgId("sb");
  const w = f.u(width);
  const h = f.u(height);
  return (
    <View style={[{ width: w, height: h }, style]}>
      <Svg width={w} height={h}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={f.t.sigA} />
            <Stop offset="1" stopColor={f.t.sigB} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={w} height={h} rx={h / 2} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/**
 * Degrade dolgulu kutu — içerik üstte. `tone`: imza (mor→camgöbeği),
 * `soft` (aynı degrade, kısık; vurgulu satır zemini), `gold`.
 */
export function FillBox({
  f,
  radius,
  tone = "sig",
  vertical = false,
  style,
  children,
}: {
  f: ShareFrame;
  radius: number;
  tone?: "sig" | "soft" | "gold" | "glass";
  vertical?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const id = useSvgId("fb");
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const { t } = f;
  const r = f.u(radius);
  const stops: [string, number, string, number] =
    tone === "gold"
      ? [t.gold[0], 1, t.gold[1], 1]
      : tone === "soft"
        ? [t.sigA, t.dark ? 0.34 : 0.16, t.sigB, t.dark ? 0.12 : 0.06]
        : tone === "glass"
          ? [t.ink, t.dark ? 0.1 : 0.05, t.ink, t.dark ? 0.03 : 0.02]
          : [t.sigA, 1, t.sigB, 1];
  return (
    <View
      style={[{ borderRadius: r, overflow: "hidden" }, style]}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (!size || Math.abs(size.w - width) > 0.5 || Math.abs(size.h - height) > 0.5) setSize({ w: width, h: height });
      }}
    >
      {size ? (
        <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2={vertical ? "0" : "1"} y2={vertical ? "1" : "0.35"}>
              <Stop offset="0" stopColor={stops[0]} stopOpacity={stops[1]} />
              <Stop offset="1" stopColor={stops[2]} stopOpacity={stops[3]} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size.w} height={size.h} rx={r} fill={`url(#${id})`} />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}

/** Cam kart — yarı saydam dolgu + ışıklı kıl kenar. */
export function Glass({
  f,
  radius = 16,
  strong = false,
  style,
  children,
}: {
  f: ShareFrame;
  radius?: number;
  strong?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  return (
    <View
      style={[
        {
          borderRadius: f.u(radius),
          backgroundColor: strong ? f.t.glassStrong : f.t.glass,
          borderWidth: Math.max(1, f.u(0.7)),
          borderColor: f.t.glassLine,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Yumuşak ışık halesi — arma/portre arkasına. Yerleşimi etkilemez. */
export function Halo({ f, size, color, power = 1 }: { f: ShareFrame; size: number; color?: string; power?: number }) {
  const id = useSvgId("ha");
  const s = f.u(size);
  return (
    <View pointerEvents="none" style={{ position: "absolute", width: s, height: s, alignSelf: "center" }}>
      <Svg width={s} height={s}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color ?? f.t.glowA} stopOpacity={0.7 * power * f.t.glowPower} />
            <Stop offset="0.5" stopColor={color ?? f.t.glowA} stopOpacity={0.22 * power * f.t.glowPower} />
            <Stop offset="1" stopColor={color ?? f.t.glowA} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={s / 2} cy={s / 2} r={s / 2} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/* ══════════════════════════ KİMLİK ══════════════════════════ */

/**
 * Takım arması — açık karo içinde (logoların çoğu beyaz zeminli); logo
 * yoksa imza degradeli karoda baş harfler.
 */
export function Crest({
  f,
  logo,
  name,
  size,
  halo = false,
  haloColor,
  dim = false,
}: {
  f: ShareFrame;
  logo?: string | null;
  name?: string | null;
  size: number;
  halo?: boolean;
  /** Hale rengi (karşılaştırmada taraf rengi). */
  haloColor?: string;
  dim?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const uri = failed ? null : mediaUrl(logo);
  const s = f.u(size);
  const r = s * 0.3;
  return (
    <View style={{ width: s, height: s, alignItems: "center", justifyContent: "center", opacity: dim ? 0.55 : 1 }}>
      {halo ? <Halo f={f} size={size * 2.1} color={haloColor} /> : null}
      {uri ? (
        <View
          style={{
            width: s,
            height: s,
            borderRadius: r,
            backgroundColor: f.t.crestTile,
            borderWidth: Math.max(1, f.u(0.7)),
            borderColor: f.t.glassLine,
            padding: s * 0.1,
            overflow: "hidden",
          }}
        >
          <Image source={{ uri }} resizeMode="contain" style={{ width: "100%", height: "100%" }} onError={() => setFailed(true)} />
        </View>
      ) : (
        <FillBox f={f} radius={size * 0.3} style={{ width: s, height: s, alignItems: "center", justifyContent: "center" }}>
          <Text
            allowFontScaling={false}
            style={[font(f.u, "numStrong", (size * 0.36) / 13), { color: f.t.onFill }]}
            numberOfLines={1}
          >
            {initials(name)}
          </Text>
        </FillBox>
      )}
    </View>
  );
}

/**
 * Oyuncu portresi — imza degradeli halka + fotoğraf; fotoğraf yoksa
 * baş harfler. `ring`: "sig" | "gold" | "none".
 */
export function Portrait({
  f,
  image,
  name,
  size,
  ring = "sig",
  ringColor,
  halo = false,
}: {
  f: ShareFrame;
  image?: string | null;
  name?: string | null;
  size: number;
  ring?: "sig" | "gold" | "none";
  /** Halka tek renk (karşılaştırmada taraf rengi). */
  ringColor?: string;
  halo?: boolean;
}) {
  const id = useSvgId("pr");
  const [failed, setFailed] = useState(false);
  const uri = failed ? null : mediaUrl(image);
  const s = f.u(size);
  const stroke = ring === "none" ? 0 : Math.max(1.5, s * 0.035);
  const gap = ring === "none" ? 0 : stroke * 1.1;
  const inner = s - (stroke + gap) * 2;
  const [c1, c2] = ringColor ? [ringColor, ringColor] : ring === "gold" ? f.t.gold : [f.t.sigA, f.t.sigB];
  return (
    <View style={{ width: s, height: s, alignItems: "center", justifyContent: "center" }}>
      {halo ? <Halo f={f} size={size * 1.9} color={ringColor ?? (ring === "gold" ? f.t.gold[1] : undefined)} /> : null}
      {ring !== "none" ? (
        <Svg width={s} height={s} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={c1} />
              <Stop offset="1" stopColor={c2} />
            </LinearGradient>
          </Defs>
          <Circle cx={s / 2} cy={s / 2} r={s / 2 - stroke / 2} stroke={`url(#${id})`} strokeWidth={stroke} fill="none" />
        </Svg>
      ) : null}
      <View
        style={{
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          overflow: "hidden",
          backgroundColor: f.t.glassStrong,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {uri ? (
          <Image source={{ uri }} resizeMode="cover" style={{ width: "100%", height: "100%" }} onError={() => setFailed(true)} />
        ) : (
          <Text allowFontScaling={false} style={[font(f.u, "numStrong", (size * 0.34) / 13), { color: f.t.ink }]}>
            {initials(name)}
          </Text>
        )}
      </View>
    </View>
  );
}

/* ══════════════════════════ VERİ ══════════════════════════ */

/** Form rozetleri G / B / M — renkli küçük karolar. */
export function FormRow({ f, last5, size = 13 }: { f: ShareFrame; last5: string | null | undefined; size?: number }) {
  const letters = formLetters(last5);
  if (!letters.length) return null;
  const s = f.u(size);
  const tr = { W: "G", D: "B", L: "M" } as const;
  const color = { W: f.t.win, D: f.t.draw, L: f.t.loss } as const;
  return (
    <View style={{ flexDirection: "row", gap: f.u(size * 0.22) }}>
      {letters.map((letter, index) => (
        <View
          key={index}
          style={{
            width: s,
            height: s,
            borderRadius: s * 0.3,
            backgroundColor: color[letter],
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text allowFontScaling={false} style={[font(f.u, "numStrong", (size * 0.6) / 13), { color: f.t.chipInk }]}>
            {tr[letter]}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Sayı karosu: büyük rakam + küçük etiket. */
export function StatTile({
  f,
  value,
  label,
  accent,
  scale = 1,
  style,
}: {
  f: ShareFrame;
  value: React.ReactNode;
  label: string;
  accent?: string;
  scale?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Glass f={f} radius={14} style={[{ flex: 1, paddingVertical: f.u(10 * scale), paddingHorizontal: f.u(8), alignItems: "center" }, style]}>
      <CText f={f} k="score" scale={0.36 * scale} color={accent ?? f.t.ink}>
        {value}
      </CText>
      <Overline f={f} color={f.t.inkMuted} scale={0.9} style={{ marginTop: f.u(3) }}>
        {label}
      </Overline>
    </Glass>
  );
}

/** Küçük ikon (top, yıldız) — vektör yazı tipi, yakalamada korunur. */
export function Glyph({ f, name, size, color }: { f: ShareFrame; name: keyof typeof Ionicons.glyphMap; size: number; color?: string }) {
  return <Ionicons name={name} size={f.u(size)} color={color ?? f.t.ink} />;
}

/** Sıra rozeti: ilk üç madalya degradesi, gerisi cam. */
export function RankChip({ f, rank, size = 20 }: { f: ShareFrame; rank: number; size?: number }) {
  const medal = rank === 1 ? f.t.gold : rank === 2 ? f.t.silver : rank === 3 ? f.t.bronze : null;
  const id = useSvgId("rk");
  const s = f.u(size);
  return (
    <View style={{ width: s, height: s, alignItems: "center", justifyContent: "center" }}>
      {medal ? (
        <Svg width={s} height={s} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={medal[0]} />
              <Stop offset="1" stopColor={medal[1]} />
            </LinearGradient>
          </Defs>
          <Circle cx={s / 2} cy={s / 2} r={s / 2} fill={`url(#${id})`} />
        </Svg>
      ) : (
        <View style={[StyleSheet.absoluteFill, { borderRadius: s / 2, backgroundColor: f.t.glassStrong }]} />
      )}
      <Text allowFontScaling={false} style={[font(f.u, "numStrong", (size * 0.5) / 13), { color: medal ? f.t.medalInk : f.t.ink }]}>
        {rank}
      </Text>
    </View>
  );
}

export { alpha };
