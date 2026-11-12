/**
 * YOUTUBE KAPAĞI — yayın açılırken otomatik üretilen 1280×720 küçük resim.
 *
 * Masaüstü stüdyo yayını açınca maçın kapağını üretip
 * POST /api/admin/live-streams/matches/:id/thumbnail ucuna yükler; telefon da
 * aynısını yapar: bu bileşen ekranın arkasında (görünmeden) bir kez çizilir,
 * react-native-view-shot ile 1280×720 JPEG'e çekilir ve aynı uca gönderilir.
 *
 * İçerik: marka logosu (yayın görünümünde yüklenmiş logo, yoksa Elitlig),
 * "ELİTLİG {LİG ADI}" + sezon, iki takımın arması ve adı, tarih / saat / saha,
 * CANLI rozeti. Renkler skorbordun renk takımından (maçın yayın teması) gelir.
 */

import { LinearGradient } from "expo-linear-gradient";
import React, { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { captureRef, releaseCapture } from "react-native-view-shot";

import type { BugPalette } from "@/lib/live/branding";
import { RIG } from "@/lib/live/rig";
import { fonts, radius } from "@/theme";

import { useBrandLogoSource } from "./ScoreBug";

/** Kapak çiziminin mantıksal boyu (dp); çekim 1280×720 piksele ölçeklenir. */
const W = 640;
const H = 360;
const OUT_W = 1280;
const OUT_H = 720;
/** Logolar en çok bu kadar beklenir; yüklenemeyen armanın yerine baş harf çizilir. */
const ASSET_WAIT_MS = 3500;
/**
 * Yazı ölçüleri yayın grafiği gibi ÇIKTI pikseliyle (1280 genişlik) verilir;
 * `PX` dp'ye çevirir. Arayüz yazısı değildir, tema tipografisine bağlanmaz
 * (ScoreBug'daki `scale` ile aynı yaklaşım).
 */
const PX = W / OUT_W;

export interface CoverData {
  /** "ELİTLİG ANKARA LİGİ" */
  headline: string;
  season: string;
  homeName: string;
  awayName: string;
  homeLogo: string | null;
  awayLogo: string | null;
  /** "20 Kasım 2026 · 21:00 · Ostim Arena" */
  when: string;
  logoUrl: string | null;
  palette: BugPalette;
}

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

/** "2026-11-20" + "21:00:00" + saha → "20 Kasım 2026 · 21:00 · Saha". */
export function coverWhen(date: string | null | undefined, time: string | null | undefined, field: string | null | undefined): string {
  const parts: string[] = [];
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date ?? ""));
  if (m) parts.push(`${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ""} ${m[1]}`.trim());
  const t = /^(\d{1,2}):(\d{2})/.exec(String(time ?? ""));
  if (t) parts.push(`${t[1].padStart(2, "0")}:${t[2]}`);
  const f = String(field ?? "").trim();
  if (f && f.toLowerCase() !== "none") parts.push(f);
  return parts.join(" · ");
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toLocaleUpperCase("tr-TR");

function Crest({ uri, name, onDone }: { uri: string | null; name: string; onDone: () => void }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!uri) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);
  return (
    <View style={styles.crest}>
      {uri && !failed ? (
        <Image
          source={{ uri }}
          style={styles.crestImg}
          resizeMode="contain"
          onLoad={onDone}
          onError={() => {
            setFailed(true);
            onDone();
          }}
        />
      ) : (
        <Text style={styles.crestText} allowFontScaling={false}>
          {initials(name) || "?"}
        </Text>
      )}
    </View>
  );
}

export const YoutubeCover = forwardRef<View, { data: CoverData; onAssetsReady: () => void }>(function YoutubeCover({ data, onAssetsReady }, ref) {
  const C = data.palette;
  const pending = useRef(3);
  const done = useCallback(() => {
    pending.current -= 1;
    if (pending.current === 0) onAssetsReady();
  }, [onAssetsReady]);
  const brand = useBrandLogoSource(data.logoUrl, done);
  return (
    <View ref={ref} collapsable={false} style={styles.canvas}>
      <LinearGradient colors={[C.barTop, C.p900]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.glow, { backgroundColor: C.v700 }]} />
      <View style={styles.top}>
        <Image source={brand.source} onLoad={brand.onLoad} onError={brand.onError} style={styles.brandLogo} resizeMode="contain" />
        <View style={styles.flex}>
          <Text style={styles.headline} numberOfLines={1} allowFontScaling={false}>
            {data.headline}
          </Text>
          {data.season ? (
            <Text style={[styles.season, { color: C.v400 }]} numberOfLines={1} allowFontScaling={false}>
              {data.season.toLocaleUpperCase("tr-TR")}
            </Text>
          ) : null}
        </View>
        <View style={styles.live}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText} allowFontScaling={false}>
            CANLI
          </Text>
        </View>
      </View>

      <View style={styles.teams}>
        <View style={styles.team}>
          <Crest uri={data.homeLogo} name={data.homeName} onDone={done} />
          <Text style={styles.teamName} numberOfLines={2} allowFontScaling={false}>
            {data.homeName.toLocaleUpperCase("tr-TR")}
          </Text>
        </View>
        <View style={[styles.vs, { backgroundColor: C.v700 }]}>
          <Text style={styles.vsText} allowFontScaling={false}>
            VS
          </Text>
        </View>
        <View style={styles.team}>
          <Crest uri={data.awayLogo} name={data.awayName} onDone={done} />
          <Text style={styles.teamName} numberOfLines={2} allowFontScaling={false}>
            {data.awayName.toLocaleUpperCase("tr-TR")}
          </Text>
        </View>
      </View>

      {data.when ? (
        <View style={[styles.bottom, { backgroundColor: C.p900 }]}>
          <Text style={styles.when} numberOfLines={1} allowFontScaling={false}>
            {data.when}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

/**
 * Kapak üretici: `element` ekran ağacına (sahnenin arkasına) konur; `make`
 * kapağı çizer, logoları bekler ve 1280×720 JPEG dosyasının yolunu döndürür.
 * `release` dosyayı siler.
 */
export function useYoutubeCover() {
  const ref = useRef<View>(null);
  const [data, setData] = useState<CoverData | null>(null);
  const waiter = useRef<(() => void) | null>(null);
  const busy = useRef(false);

  const onAssetsReady = useCallback(() => {
    waiter.current?.();
  }, []);

  const make = useCallback(async (next: CoverData): Promise<string> => {
    if (busy.current) throw new Error("Kapak zaten hazırlanıyor.");
    busy.current = true;
    try {
      const ready = new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ASSET_WAIT_MS);
        waiter.current = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      setData(next);
      await ready;
      // Son kareyi ekrana oturt (görseller çizilsin).
      await new Promise((resolve) => setTimeout(resolve, 150));
      if (!ref.current) throw new Error("Kapak çizilemedi.");
      return await captureRef(ref, { format: "jpg", quality: 0.92, result: "tmpfile", width: OUT_W, height: OUT_H });
    } finally {
      waiter.current = null;
      busy.current = false;
      setData(null);
    }
  }, []);

  const release = useCallback((uri: string) => {
    try {
      releaseCapture(uri);
    } catch {
      /* geçici dosya: silinemezse işletim sistemi temizler */
    }
  }, []);

  // Ekranın arkasında, dokunulmaz; kapak çizilmediği sürece hiç yok.
  const element = data ? (
    <View pointerEvents="none" style={styles.host}>
      <YoutubeCover ref={ref} data={data} onAssetsReady={onAssetsReady} />
    </View>
  ) : null;

  return { element, make, release };
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: 0, top: 0, width: W, height: H, zIndex: -1 },
  canvas: { width: W, height: H, overflow: "hidden", backgroundColor: RIG.bg },
  flex: { flex: 1, minWidth: 0 },
  glow: { position: "absolute", width: W * 0.9, height: W * 0.9, borderRadius: radius.pill, left: W * 0.05, top: H * 0.18, opacity: 0.28 },
  top: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 26, paddingTop: 22 },
  brandLogo: { width: 54, height: 54 },
  headline: { fontFamily: fonts.bold, fontSize: PX * 48, lineHeight: PX * 56, color: RIG.text, letterSpacing: 0.4 },
  season: { fontFamily: fonts.display, fontSize: PX * 30, lineHeight: PX * 38, letterSpacing: 1.2 },
  live: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 30, borderRadius: radius.xs, backgroundColor: RIG.live },
  liveDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: RIG.text },
  liveText: { fontFamily: fonts.bold, fontSize: PX * 28, lineHeight: PX * 36, color: RIG.text, letterSpacing: 1.5 },
  teams: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 22, gap: 10 },
  team: { flex: 1, alignItems: "center", gap: 10 },
  crest: {
    width: 112,
    height: 112,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: RIG.panelStrong,
    borderWidth: 2,
    borderColor: RIG.line,
    overflow: "hidden",
  },
  crestImg: { width: 88, height: 88 },
  crestText: { fontFamily: fonts.bold, fontSize: PX * 76, lineHeight: PX * 88, color: RIG.text },
  teamName: { fontFamily: fonts.bold, fontSize: PX * 44, lineHeight: PX * 52, color: RIG.text, textAlign: "center" },
  vs: { width: 58, height: 58, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  vsText: { fontFamily: fonts.bold, fontSize: PX * 40, lineHeight: PX * 48, color: RIG.text },
  bottom: { height: 46, alignItems: "center", justifyContent: "center", opacity: 0.92 },
  when: { fontFamily: fonts.display, fontSize: PX * 34, lineHeight: PX * 42, color: RIG.text, letterSpacing: 0.6 },
});
