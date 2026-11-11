/**
 * Mobil stüdyo — "Skorbord" sekmesi: yayına gömülen skorbordun görünümü.
 *
 *   göster / gizle · çeşit (köşe çubuğu, kompakt, orta-alt bant) · köşe (sol /
 *   sağ) · saat + devre · kısa kodlar · takım şerit renkleri · GOL bandı ·
 *   sponsor yuvası (sabit ya da dönüşümlü).
 *
 * Logo ve renk teması buradan değişmez: maçın web "Yayın Tasarımı"ndan gelir
 * (GET /api/maclar/:id/overlay-branding) — web kaplaması, masaüstü stüdyo ve
 * telefon aynı kimliği gösterir.
 */

import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { Touchable } from "@/components/ui";
import type { BroadcastSponsor } from "@/lib/live/studioApi";
import type { SponsorMode, StudioSettings } from "@/lib/live/studioSettings";
import { RIG, TEAM_SWATCHES } from "@/lib/live/rig";
import { BUG_VARIANTS, teamShortCode } from "@/lib/live/scorebug";
import { radius, space, type } from "@/theme";

import { GroupTitle, Hint, OptionRow, SegRow, ToggleRow } from "./rigUi";

export interface ScoreboardPanelProps {
  settings: StudioSettings;
  onChange: (patch: Partial<StudioSettings>) => void;
  visible: boolean;
  onVisible: (next: boolean) => void;
  homeName: string;
  awayName: string;
  homeKey: string;
  awayKey: string;
  /** Maça özel yayın tasarımı (logo / tema) uygulanmış mı. */
  branded: boolean;
  sponsors: BroadcastSponsor[];
  /** Şu an yuvada görünen sponsor. */
  activeSponsor: BroadcastSponsor | null;
  onPickSponsor: (id: number) => void;
}

const CORNERS = [
  { value: "left", label: "Sol üst" },
  { value: "right", label: "Sağ üst" },
] as const;

const SPONSOR_MODES: { value: SponsorMode; label: string }[] = [
  { value: "off", label: "Kapalı" },
  { value: "fixed", label: "Sabit" },
  { value: "rotate", label: "Dönüşümlü" },
];

const SPONSOR_SECONDS = [
  { value: 10, label: "10 sn" },
  { value: 20, label: "20 sn" },
  { value: 30, label: "30 sn" },
  { value: 60, label: "1 dk" },
] as const;

export function ScoreboardPanel(props: ScoreboardPanelProps) {
  const { settings, onChange } = props;

  const setCode = (key: string, value: string) => {
    const clean = value.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 3).toLocaleUpperCase("tr-TR");
    const next = { ...settings.teamCodes };
    if (clean) next[key] = clean;
    else delete next[key];
    onChange({ teamCodes: next });
  };
  const setColor = (key: string, color: string | null) => {
    const next = { ...settings.teamColors };
    if (color) next[key] = color;
    else delete next[key];
    onChange({ teamColors: next });
  };

  const teamEditor = (name: string, key: string, fallback: string) => {
    const selected = settings.teamColors[key] ?? null;
    return (
      <View style={styles.team}>
        <View style={styles.teamTop}>
          <Text style={styles.teamName} numberOfLines={1} allowFontScaling={false}>
            {name}
          </Text>
          <TextInput
            value={settings.teamCodes[key] ?? ""}
            onChangeText={(v) => setCode(key, v)}
            placeholder={teamShortCode(name)}
            placeholderTextColor={RIG.textMute}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={3}
            disableFullscreenUI
            style={styles.codeInput}
            accessibilityLabel={`${name} kısa kodu`}
          />
        </View>
        <View style={styles.swatches}>
          <Touchable
            style={[styles.swatch, { backgroundColor: fallback }, !selected && styles.swatchOn]}
            onPress={() => setColor(key, null)}
            accessibilityLabel={`${name} şerit rengi: varsayılan`}
            accessibilityState={{ selected: !selected }}
            hitSlop={4}
          />
          {TEAM_SWATCHES.filter((c) => c !== fallback).map((c) => (
            <Touchable
              key={c}
              style={[styles.swatch, { backgroundColor: c }, selected === c && styles.swatchOn]}
              onPress={() => setColor(key, c)}
              accessibilityLabel={`${name} şerit rengi ${c}`}
              accessibilityState={{ selected: selected === c }}
              hitSlop={4}
            />
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.stack}>
      <ToggleRow
        title="Skorbord yayında"
        hint={props.visible ? "İzleyici skorbordu görüyor" : "Skorbord gizli"}
        icon={props.visible ? "eye" : "eye-off"}
        value={props.visible}
        onChange={props.onVisible}
      />

      <GroupTitle>ÇEŞİT</GroupTitle>
      {BUG_VARIANTS.map((v) => (
        <OptionRow key={v.key} title={v.label} hint={v.hint} selected={settings.bugVariant === v.key} onPress={() => onChange({ bugVariant: v.key })} />
      ))}

      {settings.bugVariant !== "bottom" ? (
        <>
          <GroupTitle>KONUM</GroupTitle>
          <SegRow options={CORNERS} value={settings.bugCorner} onChange={(bugCorner) => onChange({ bugCorner })} label="Skorbord konumu" />
        </>
      ) : null}

      <ToggleRow
        title="Saat ve devre"
        hint="Kapalıyken yalnız takımlar ve skor görünür"
        icon="time"
        value={settings.showClock}
        onChange={(showClock) => onChange({ showClock })}
      />
      <ToggleRow
        title="GOL bandı"
        hint="Golde ekranda büyük “GOL!” yazısı, ardından golcü ve skor"
        icon="football"
        value={settings.goalFlash}
        onChange={(goalFlash) => onChange({ goalFlash })}
      />

      <GroupTitle>TAKIMLAR · KISA KOD VE ŞERİT RENGİ</GroupTitle>
      {teamEditor(props.homeName, props.homeKey, RIG.home)}
      {teamEditor(props.awayName, props.awayKey, RIG.away)}

      <GroupTitle>SPONSOR YUVASI</GroupTitle>
      {props.sponsors.length ? (
        <>
          <SegRow options={SPONSOR_MODES} value={settings.sponsorMode} onChange={(sponsorMode) => onChange({ sponsorMode })} label="Sponsor yuvası" />
          {settings.sponsorMode === "rotate" ? (
            <SegRow options={SPONSOR_SECONDS} value={settings.sponsorSeconds} onChange={(sponsorSeconds) => onChange({ sponsorSeconds })} label="Sponsor süresi" />
          ) : null}
          {settings.sponsorMode === "fixed"
            ? props.sponsors.map((s) => (
                <OptionRow key={s.id} title={s.name} hint={s.tagline || undefined} selected={props.activeSponsor?.id === s.id} onPress={() => props.onPickSponsor(s.id)} />
              ))
            : null}
          <Hint>
            {settings.sponsorMode === "off"
              ? "Açıkken sponsor logosu skorbordun karşı üst köşesinde yayına gömülür."
              : settings.sponsorMode === "rotate"
                ? `${props.sponsors.length} sponsor sırayla gösterilir. Tekrar oynarken yuva gizlenir.`
                : "Seçilen sponsor yayın boyunca köşede kalır. Tekrar oynarken yuva gizlenir."}
          </Hint>
        </>
      ) : (
        <Hint>Bu maçın ilinde yayına açık sponsor yok. Sponsorlar web yönetim panelindeki “Sponsorlar” sayfasından eklenir.</Hint>
      )}

      <Hint>
        {props.branded
          ? "Logo ve renk teması bu maçın web “Yayın Tasarımı” ayarından geliyor."
          : "Logo ve renk teması web reji panelindeki “Yayın Tasarımı”ndan değiştirilebilir."}
      </Hint>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.sm },
  team: { gap: space.sm, padding: space.sm, borderRadius: radius.md, backgroundColor: RIG.panelSoft },
  teamTop: { flexDirection: "row", alignItems: "center", gap: space.sm },
  teamName: { ...type.label, color: RIG.text, flex: 1 },
  codeInput: {
    ...type.label,
    color: RIG.text,
    width: 64,
    height: 40,
    textAlign: "center",
    paddingVertical: 0,
    borderRadius: radius.sm,
    backgroundColor: RIG.panelStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RIG.line,
  },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  swatch: { width: 26, height: 26, borderRadius: radius.pill, borderWidth: 2, borderColor: RIG.panelStrong },
  swatchOn: { borderColor: RIG.text },
});
