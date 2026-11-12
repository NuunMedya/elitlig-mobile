/**
 * Mobil stüdyo — "Röportaj" sekmesi: masaüstündeki röportaj bandı.
 *
 *   · Bant başlığı: hazır başlıklar (MAÇ SONU RÖPORTAJI…) ya da elle.
 *   · Konuk: ad + görev elle yazılır ya da kadrodan seçilir (ev / deplasman).
 *   · Son konuklar: bu yayında banda konan kişiler tek dokunuşla geri gelir.
 *   · Bant süreyle kalkmaz; "Bandı kaldır" ile kapanır.
 *
 * Yazı alanları en üsttedir: yatay ekranda klavye açılınca görünür kalırlar.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { Touchable } from "@/components/ui";
import {
  INTERVIEW_NAME_MAX,
  INTERVIEW_ROLES,
  INTERVIEW_ROLE_MAX,
  INTERVIEW_TITLES,
  INTERVIEW_TITLE_MAX,
  cleanInterviewTitle,
  guestLine,
  makeGuest,
  type Interview,
  type InterviewGuest,
} from "@/lib/live/interview";
import { RIG } from "@/lib/live/rig";
import { radius, space, type } from "@/theme";

import { Btn, GroupTitle, Hint } from "./rigUi";

export interface InterviewPanelProps {
  /** Yayındaki bant (null → kapalı). */
  onAir: Interview | null;
  title: string;
  onTitle: (title: string) => void;
  /** Konuğu banda koy ve bandı aç. */
  onShow: (guest: InterviewGuest) => void;
  onHide: () => void;
  recents: InterviewGuest[];
  onForget: (guest: InterviewGuest) => void;
  homeName: string;
  awayName: string;
  /** Kadrodan konuk seçtir. */
  onPickPlayer: (side: "home" | "away") => void;
  encoderOn: boolean;
}

export function InterviewPanel(props: InterviewPanelProps) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [customTitle, setCustomTitle] = useState("");

  const send = () => {
    const guest = makeGuest({ name, role, side: "other" });
    if (guest) props.onShow(guest);
  };
  const applyTitle = () => {
    if (customTitle.trim()) props.onTitle(cleanInterviewTitle(customTitle));
  };
  const isCurrent = (g: InterviewGuest) =>
    Boolean(props.onAir) && props.onAir!.guest.name === g.name && props.onAir!.guest.role === g.role && props.onAir!.guest.teamName === g.teamName;

  return (
    <View style={styles.stack}>
      {props.onAir ? (
        <View style={styles.onAir}>
          <View style={styles.onAirHead}>
            <View style={styles.liveDot} />
            <Text style={styles.onAirLabel} allowFontScaling={false}>
              {props.encoderOn ? "BANT YAYINDA" : "BANT ÖNİZLEMEDE"} · {props.onAir.title}
            </Text>
          </View>
          <Text style={styles.onAirTitle} numberOfLines={1} allowFontScaling={false}>
            {props.onAir.guest.name}
          </Text>
          {guestLine(props.onAir.guest) ? (
            <Text style={styles.sub} numberOfLines={1} allowFontScaling={false}>
              {guestLine(props.onAir.guest)}
            </Text>
          ) : null}
          <Btn label="Bandı kaldır" icon="close" tone="live" onPress={props.onHide} />
        </View>
      ) : null}

      <GroupTitle>KONUK · ELLE</GroupTitle>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Ad soyad"
        placeholderTextColor={RIG.textMute}
        maxLength={INTERVIEW_NAME_MAX}
        disableFullscreenUI
        returnKeyType="next"
        style={styles.input}
        accessibilityLabel="Konuğun adı"
      />
      <TextInput
        value={role}
        onChangeText={setRole}
        placeholder="Görev (Teknik direktör, kaptan…)"
        placeholderTextColor={RIG.textMute}
        maxLength={INTERVIEW_ROLE_MAX}
        disableFullscreenUI
        returnKeyType="send"
        onSubmitEditing={send}
        style={styles.input}
        accessibilityLabel="Konuğun görevi"
      />
      <View style={styles.chips}>
        {INTERVIEW_ROLES.map((r) => (
          <Touchable key={r} style={[styles.chip, role === r && styles.chipOn]} onPress={() => setRole(r)} accessibilityLabel={`Görev: ${r}`} haptic="light">
            <Text style={styles.chipText} allowFontScaling={false}>
              {r}
            </Text>
          </Touchable>
        ))}
      </View>
      <Btn label="Banda koy ve yayına ver" icon="mic" tone="brand" onPress={send} disabled={!name.trim()} />

      <GroupTitle>KONUK · KADRODAN</GroupTitle>
      <View style={styles.row}>
        {(["home", "away"] as const).map((side) => (
          <Touchable
            key={side}
            style={[styles.template, styles.flex]}
            onPress={() => props.onPickPlayer(side)}
            accessibilityLabel={`${side === "home" ? props.homeName : props.awayName} kadrosundan konuk seç`}
            haptic="light"
          >
            <Ionicons name="people" size={15} color={side === "home" ? RIG.home : RIG.away} />
            <View style={styles.flex}>
              <Text style={styles.templateTitle} numberOfLines={1} allowFontScaling={false}>
                Oyuncu seç
              </Text>
              <Text style={styles.sub} numberOfLines={1} allowFontScaling={false}>
                {side === "home" ? props.homeName : props.awayName}
              </Text>
            </View>
          </Touchable>
        ))}
      </View>

      {props.recents.length ? (
        <>
          <GroupTitle>SON KONUKLAR</GroupTitle>
          {props.recents.map((g, i) => {
            const cur = isCurrent(g);
            return (
              <View key={`${i}-${g.name}-${g.role}`} style={[styles.template, cur && styles.templateOn]}>
                <Touchable
                  style={[styles.row, styles.flex, styles.center]}
                  onPress={() => (cur ? props.onHide() : props.onShow(g))}
                  accessibilityLabel={cur ? `${g.name} bandını kaldır` : `${g.name} bandını yayına ver`}
                  haptic="light"
                >
                  <Ionicons name="person" size={15} color={g.side === "home" ? RIG.home : g.side === "away" ? RIG.away : RIG.textSoft} />
                  <View style={styles.flex}>
                    <Text style={styles.templateTitle} numberOfLines={1} allowFontScaling={false}>
                      {g.name}
                    </Text>
                    {guestLine(g) ? (
                      <Text style={styles.sub} numberOfLines={1} allowFontScaling={false}>
                        {guestLine(g)}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons name={cur ? "close-circle" : "arrow-up-circle"} size={18} color={cur ? RIG.live : RIG.brand} />
                </Touchable>
                {!cur ? (
                  <Touchable style={styles.forget} onPress={() => props.onForget(g)} accessibilityLabel={`${g.name} listeden çıkar`} haptic="light">
                    <Ionicons name="trash-outline" size={15} color={RIG.textMute} />
                  </Touchable>
                ) : null}
              </View>
            );
          })}
        </>
      ) : null}

      <GroupTitle>BANT BAŞLIĞI</GroupTitle>
      <View style={styles.chips}>
        {INTERVIEW_TITLES.map((t) => (
          <Touchable key={t} style={[styles.chip, props.title === t && styles.chipOn]} onPress={() => props.onTitle(t)} accessibilityLabel={`Başlık: ${t}`} haptic="light">
            <Text style={styles.chipText} allowFontScaling={false}>
              {t}
            </Text>
          </Touchable>
        ))}
      </View>
      <View style={styles.row}>
        <TextInput
          value={customTitle}
          onChangeText={(v) => setCustomTitle(v.toLocaleUpperCase("tr-TR"))}
          placeholder="Özel başlık"
          placeholderTextColor={RIG.textMute}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={INTERVIEW_TITLE_MAX}
          disableFullscreenUI
          returnKeyType="done"
          onSubmitEditing={applyTitle}
          style={[styles.input, styles.flex]}
          accessibilityLabel="Özel bant başlığı"
        />
        <Btn label="Uygula" tone="soft" compact onPress={applyTitle} disabled={!customTitle.trim()} />
      </View>

      <Hint>Röportaj bandı skorbordla aynı katmanda videoya gömülür ve siz kaldırana kadar ekranda kalır. Bant açıkken altyazı bandın üstünde çıkar.</Hint>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.sm },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: "row", gap: space.xs },
  center: { alignItems: "center", gap: space.sm },
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
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  chip: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: RIG.panelSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RIG.line,
  },
  chipOn: { backgroundColor: RIG.brandDim, borderColor: RIG.brand },
  chipText: { ...type.caption, color: RIG.text },
  onAir: { gap: space.xs, padding: space.sm, borderRadius: radius.md, backgroundColor: RIG.liveDim },
  onAirHead: { flexDirection: "row", alignItems: "center", gap: space.xs },
  liveDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: RIG.live },
  onAirLabel: { ...type.micro, color: RIG.text, flexShrink: 1 },
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
  templateOn: { backgroundColor: RIG.liveDim },
  templateTitle: { ...type.label, color: RIG.text },
  forget: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
});
