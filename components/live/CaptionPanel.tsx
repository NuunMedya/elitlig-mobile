/**
 * Mobil stüdyo — "Altyazı" sekmesi: yayına gömülen alt bant (lower third).
 *
 *   · Serbest metin: etiket + başlık + alt satır → "Yayına ver".
 *   · Hazır şablonlar: maç bilgisi, skor, son gol / kart / değişiklik, oyuncu
 *     adı + takım (kadrodan seçilir), sponsor.
 *   · Web / masaüstü rejide yazılmış altyazı satırları (varsa) tek dokunuşla.
 *   · Süre: 6 / 10 / 20 sn sonra kendiliğinden kalkar ya da "Elle".
 *
 * Yazı alanları en üsttedir: yatay ekranda klavye açılınca görünür kalırlar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { Touchable } from "@/components/ui";
import { CAPTION_SECONDS, SUBTITLE_MAX, TAG_MAX, TITLE_MAX, captionSecondsLabel, makeCaption, type Caption, type CaptionSeconds } from "@/lib/live/lowerThird";
import { RIG } from "@/lib/live/rig";
import { radius, space, type } from "@/theme";

import { Btn, GroupTitle, Hint, SegRow, type IconName } from "./rigUi";

export interface CaptionTemplate {
  key: string;
  label: string;
  /** Şablonun üreteceği metnin özeti. */
  preview: string;
  icon: IconName;
  build: () => Caption | null;
}

export interface CaptionPanelProps {
  /** Yayındaki altyazı ve kalkmasına kalan süre (sn; null → elle). */
  onAir: Caption | null;
  remaining: number | null;
  seconds: CaptionSeconds;
  onSeconds: (s: CaptionSeconds) => void;
  onShow: (caption: Caption) => void;
  onHide: () => void;
  templates: CaptionTemplate[];
  /** Oyuncu şablonu: kadrodan oyuncu seçtir. */
  homeName: string;
  awayName: string;
  onPlayerTemplate: (side: "home" | "away") => void;
  /** Web / masaüstü rejide yazılmış satırlar. */
  headlines: { tag: string; text: string }[];
  /** Yayın kapalıyken altyazı yalnız önizlemede görünür. */
  encoderOn: boolean;
}

const SECONDS_OPTIONS = CAPTION_SECONDS.map((s) => ({ value: s, label: captionSecondsLabel(s) }));

export function CaptionPanel(props: CaptionPanelProps) {
  const [tag, setTag] = useState("");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");

  const send = () => {
    const caption = makeCaption({ tag, title, subtitle, tone: "brand" });
    if (caption) props.onShow(caption);
  };

  const run = (build: () => Caption | null) => {
    const caption = build();
    if (caption) props.onShow(caption);
  };

  return (
    <View style={styles.stack}>
      {props.onAir ? (
        <View style={styles.onAir}>
          <View style={styles.onAirHead}>
            <View style={styles.liveDot} />
            <Text style={styles.onAirLabel} allowFontScaling={false}>
              {props.encoderOn ? "YAYINDA" : "ÖNİZLEMEDE"}
              {props.remaining != null ? ` · ${props.remaining} sn` : ""}
            </Text>
          </View>
          <Text style={styles.onAirTitle} numberOfLines={1} allowFontScaling={false}>
            {props.onAir.tag ? `${props.onAir.tag} · ` : ""}
            {props.onAir.title}
          </Text>
          {props.onAir.subtitle ? (
            <Text style={styles.sub} numberOfLines={1} allowFontScaling={false}>
              {props.onAir.subtitle}
            </Text>
          ) : null}
          <Btn label="Altyazıyı kaldır" icon="close" tone="live" onPress={props.onHide} />
        </View>
      ) : null}

      <View style={styles.row}>
        <TextInput
          value={tag}
          onChangeText={(v) => setTag(v.toLocaleUpperCase("tr-TR"))}
          placeholder="ETİKET"
          placeholderTextColor={RIG.textMute}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={TAG_MAX}
          disableFullscreenUI
          returnKeyType="next"
          style={[styles.input, styles.tagInput]}
          accessibilityLabel="Altyazı etiketi"
        />
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Başlık (ör. oyuncu adı)"
          placeholderTextColor={RIG.textMute}
          maxLength={TITLE_MAX}
          disableFullscreenUI
          returnKeyType="next"
          style={[styles.input, styles.flex]}
          accessibilityLabel="Altyazı başlığı"
        />
      </View>
      <TextInput
        value={subtitle}
        onChangeText={setSubtitle}
        placeholder="Alt satır (isteğe bağlı)"
        placeholderTextColor={RIG.textMute}
        maxLength={SUBTITLE_MAX}
        disableFullscreenUI
        returnKeyType="send"
        onSubmitEditing={send}
        style={styles.input}
        accessibilityLabel="Altyazı alt satırı"
      />
      <Btn label="Yayına ver" icon="text" tone="brand" onPress={send} disabled={!title.trim()} />

      <GroupTitle>EKRANDA KALMA SÜRESİ</GroupTitle>
      <SegRow options={SECONDS_OPTIONS} value={props.seconds} onChange={props.onSeconds} label="Altyazı süresi" />

      <GroupTitle>HAZIR ŞABLONLAR</GroupTitle>
      {props.templates.map((t) => (
        <Touchable key={t.key} style={styles.template} onPress={() => run(t.build)} accessibilityLabel={`${t.label}: ${t.preview}`} haptic="light">
          <Ionicons name={t.icon} size={16} color={RIG.textSoft} />
          <View style={styles.flex}>
            <Text style={styles.templateTitle} numberOfLines={1} allowFontScaling={false}>
              {t.label}
            </Text>
            <Text style={styles.sub} numberOfLines={1} allowFontScaling={false}>
              {t.preview}
            </Text>
          </View>
          <Ionicons name="arrow-up-circle" size={18} color={RIG.brand} />
        </Touchable>
      ))}
      <View style={styles.row}>
        {(["home", "away"] as const).map((side) => (
          <Touchable
            key={side}
            style={[styles.template, styles.flex]}
            onPress={() => props.onPlayerTemplate(side)}
            accessibilityLabel={`${side === "home" ? props.homeName : props.awayName} oyuncusu altyazısı`}
            haptic="light"
          >
            <Ionicons name="person" size={15} color={side === "home" ? RIG.home : RIG.away} />
            <View style={styles.flex}>
              <Text style={styles.templateTitle} numberOfLines={1} allowFontScaling={false}>
                Oyuncu
              </Text>
              <Text style={styles.sub} numberOfLines={1} allowFontScaling={false}>
                {side === "home" ? props.homeName : props.awayName}
              </Text>
            </View>
          </Touchable>
        ))}
      </View>

      {props.headlines.length ? (
        <>
          <GroupTitle>REJİ SATIRLARI (WEB / MASAÜSTÜ)</GroupTitle>
          {props.headlines.map((h, i) => (
            <Touchable
              key={`${i}-${h.text}`}
              style={styles.template}
              onPress={() => run(() => makeCaption({ tag: h.tag, title: h.text, tone: "brand" }))}
              accessibilityLabel={`Satırı yayına ver: ${h.text}`}
              haptic="light"
            >
              <Ionicons name="list" size={15} color={RIG.textSoft} />
              <Text style={[styles.templateTitle, styles.flex]} numberOfLines={2} allowFontScaling={false}>
                {h.tag ? `${h.tag} · ` : ""}
                {h.text}
              </Text>
              <Ionicons name="arrow-up-circle" size={18} color={RIG.brand} />
            </Touchable>
          ))}
        </>
      ) : null}

      <Hint>Altyazı skorbordla aynı katmanda videoya gömülür; yayına 1–2 saniyede yansır. Gol ve kart bandı skorbordun altında kendiliğinden çıkar.</Hint>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.sm },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: "row", gap: space.xs },
  sub: { ...type.caption, color: RIG.textMute },
  input: {
    ...type.bodySm,
    color: RIG.text,
    height: 44,
    paddingHorizontal: space.md,
    paddingVertical: 0,
    borderRadius: radius.md,
    backgroundColor: RIG.panelSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RIG.line,
  },
  tagInput: { width: 86, paddingHorizontal: space.sm },
  onAir: { gap: space.xs, padding: space.sm, borderRadius: radius.md, backgroundColor: RIG.liveDim },
  onAirHead: { flexDirection: "row", alignItems: "center", gap: space.xs },
  liveDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: RIG.live },
  onAirLabel: { ...type.micro, color: RIG.text },
  onAirTitle: { ...type.label, color: RIG.text },
  template: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.sm,
    paddingVertical: space.s,
    borderRadius: radius.md,
    backgroundColor: RIG.panelSoft,
  },
  templateTitle: { ...type.label, color: RIG.text },
});
