/**
 * Mobil reji — "Yayın" sekmesi: YouTube canlı yayınını aç, başlat, bitir.
 *
 * İKİ YOL:
 *   1. YouTube (önerilen) — sunucu kanalda maç için yayın açar, RTMP adresini
 *      ve anahtarı verir; telefon görüntüyü oraya basar. İzleme bağlantısı
 *      maç sayfasına kendiliğinden yazılır.
 *   2. Elle RTMP — sunucuda YouTube bağlantısı kurulmamışsa (ya da başka bir
 *      platform kullanılacaksa) YouTube Studio ▸ Canlı yayın ▸ Yayın anahtarı
 *      buraya yapıştırılır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import React, { useEffect, useState } from "react";
import { Share, StyleSheet, Text, TextInput, View } from "react-native";

import { Touchable } from "@/components/ui";
import { RIG } from "@/lib/live/rig";
import { DEFAULT_RTMP_URL, clearRtmpTarget, loadRtmpTarget, saveRtmpTarget, validateRtmp } from "@/lib/live/studioSettings";
import {
  PRIVACY_LABELS,
  streamStatusLabel,
  type LiveStreamConfig,
  type MatchLiveStream,
  type YoutubePrivacy,
} from "@/lib/live/youtube";
import { radius, space, type } from "@/theme";

export interface BroadcastPanelProps {
  config: LiveStreamConfig | null | undefined;
  configLoading?: boolean;
  stream: MatchLiveStream | null | undefined;
  /** Kodlayıcı (telefon) yayında mı / bağlanıyor mu. */
  encoderOn: boolean;
  busy: boolean;
  nativeReady: boolean;
  privacy: YoutubePrivacy;
  onPrivacy: (p: YoutubePrivacy) => void;
  onStartYoutube: () => void;
  onStartManual: (url: string) => void;
  onStop: () => void;
  onEndYoutube: () => void;
  onToast: (message: string, tone?: "success" | "danger") => void;
  /** Durum kartının altına eklenen içerik (yayın sağlığı). */
  health?: React.ReactNode;
}

export function BroadcastPanel(props: BroadcastPanelProps) {
  const { config, stream, encoderOn, busy } = props;
  const [manualOpen, setManualOpen] = useState(false);
  const [rtmp, setRtmp] = useState(DEFAULT_RTMP_URL);
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [remember, setRemember] = useState(true);
  const [saved, setSaved] = useState(false);

  // Cihazda saklı elle yayın hedefi (güvenli depo). Sunucuda YouTube bağlantısı
  // yoksa elle bölümü kendiliğinden açılır.
  useEffect(() => {
    let alive = true;
    void loadRtmpTarget().then((target) => {
      if (!alive || !target) return;
      setRtmp(target.url);
      setKey(target.key);
      setSaved(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  const noYoutube = config != null && !config.configured;
  useEffect(() => {
    if (noYoutube) setManualOpen(true);
  }, [noYoutube]);

  const startManual = async () => {
    const problem = validateRtmp(rtmp, key);
    if (problem) {
      props.onToast(problem, "danger");
      return;
    }
    if (remember) setSaved(await saveRtmpTarget({ url: rtmp, key }));
    props.onStartManual(`${rtmp.trim().replace(/\/+$/, "")}/${key.trim()}`);
  };

  const forget = async () => {
    await clearRtmpTarget();
    setSaved(false);
    setKey("");
    setRtmp(DEFAULT_RTMP_URL);
    props.onToast("Kayıtlı yayın anahtarı bu telefondan silindi.");
  };

  const watchUrl = stream?.watch_url ?? null;
  const ytDone = stream?.active === false || ["complete", "revoked", "deleted"].includes(String(stream?.status ?? "").toLowerCase());
  const ytOpen = Boolean(stream?.broadcast_id) && !ytDone;

  const share = async () => {
    if (!watchUrl) return;
    try {
      await Share.share({ message: watchUrl, url: watchUrl });
    } catch {
      /* paylaşım iptal */
    }
  };
  const copy = async () => {
    if (!watchUrl) return;
    try {
      await Clipboard.setStringAsync(watchUrl);
      props.onToast("İzleme bağlantısı kopyalandı.");
    } catch {
      props.onToast("Bağlantı kopyalanamadı.", "danger");
    }
  };

  return (
    <View style={styles.stack}>
      {!props.nativeReady ? (
        <Info
          tone="warn"
          icon="construct"
          text="Kamera yayını bu uygulama sürümünde yok (Expo Go / web). Mağazadaki yeni sürümle çalışır; reji kontrolleri bu ekranda yine kullanılabilir."
        />
      ) : null}

      {/* Durum */}
      <View style={styles.statusCard}>
        <View style={[styles.dot, { backgroundColor: encoderOn ? RIG.live : ytOpen ? RIG.warn : RIG.textMute }]} />
        <View style={styles.flex}>
          <Text style={styles.statusTitle} allowFontScaling={false}>
            {encoderOn ? "Telefon yayın gönderiyor" : ytOpen ? "YouTube yayını hazır" : "Yayın kapalı"}
          </Text>
          <Text style={styles.muted} allowFontScaling={false}>
            {stream ? streamStatusLabel(stream.status) : "Henüz YouTube yayını açılmadı"}
            {stream?.health_status ? ` · sinyal: ${stream.health_status}` : ""}
          </Text>
        </View>
      </View>

      {props.health}

      {watchUrl ? (
        <View style={styles.linkRow}>
          <Ionicons name="logo-youtube" size={16} color={RIG.live} />
          <Text style={styles.link} numberOfLines={1} allowFontScaling={false}>
            {watchUrl.replace(/^https?:\/\//, "")}
          </Text>
          <Touchable style={styles.iconBtn} onPress={() => void copy()} accessibilityLabel="Bağlantıyı kopyala">
            <Ionicons name="copy-outline" size={16} color={RIG.text} />
          </Touchable>
          <Touchable style={styles.iconBtn} onPress={() => void share()} accessibilityLabel="Bağlantıyı paylaş">
            <Ionicons name="share-outline" size={16} color={RIG.text} />
          </Touchable>
        </View>
      ) : null}

      {encoderOn ? (
        <>
          <Btn label="Görüntüyü durdur" icon="pause" tone="soft" onPress={props.onStop} disabled={busy} />
          {ytOpen ? <Btn label="Yayını bitir" icon="stop" tone="danger" onPress={props.onEndYoutube} disabled={busy} /> : null}
        </>
      ) : (
        <>
          {config?.configured ? (
            <>
              {!ytOpen ? (
                <View style={styles.segment}>
                  {(Object.keys(PRIVACY_LABELS) as YoutubePrivacy[]).map((p) => (
                    <Touchable
                      key={p}
                      style={[styles.segItem, props.privacy === p && styles.segOn]}
                      onPress={() => props.onPrivacy(p)}
                      accessibilityLabel={PRIVACY_LABELS[p]}
                    >
                      <Text style={[styles.segText, props.privacy === p && styles.segTextOn]} allowFontScaling={false}>
                        {PRIVACY_LABELS[p]}
                      </Text>
                    </Touchable>
                  ))}
                </View>
              ) : null}
              <Btn
                label={ytOpen ? "Yayına devam et" : "YouTube'da canlı yayını başlat"}
                icon="logo-youtube"
                tone="live"
                onPress={props.onStartYoutube}
                disabled={busy || !props.nativeReady}
              />
              {ytOpen ? <Btn label="YouTube yayınını kapat" icon="stop" tone="soft" onPress={props.onEndYoutube} disabled={busy} /> : null}
              <Text style={styles.muted} allowFontScaling={false}>
                Görüntü YouTube'a ulaşınca yayın kendiliğinden canlıya geçer (10–30 sn).
              </Text>
            </>
          ) : props.configLoading ? (
            <Text style={styles.muted} allowFontScaling={false}>
              YouTube bağlantısı denetleniyor…
            </Text>
          ) : (
            <Info
              tone="info"
              icon="information-circle"
              text={
                "Sunucuda YouTube kanal bağlantısı kurulmamış. Sistem yöneticisi kurana kadar YouTube Studio'daki yayın anahtarıyla elle yayın yapabilirsin."
              }
            />
          )}

          <Touchable style={styles.manualHead} onPress={() => setManualOpen((v) => !v)} accessibilityLabel="Elle RTMP">
            <Ionicons name={manualOpen ? "chevron-down" : "chevron-forward"} size={14} color={RIG.textSoft} />
            <Text style={styles.manualTitle} allowFontScaling={false}>
              Elle yayın anahtarı (RTMP)
            </Text>
          </Touchable>
          {manualOpen ? (
            <View style={styles.stack}>
              <TextInput
                value={rtmp}
                onChangeText={setRtmp}
                placeholder={DEFAULT_RTMP_URL}
                placeholderTextColor={RIG.textMute}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                disableFullscreenUI
                style={styles.input}
                accessibilityLabel="RTMP sunucu adresi"
              />
              <View style={styles.keyRow}>
                <TextInput
                  value={key}
                  onChangeText={setKey}
                  placeholder="Yayın anahtarı (xxxx-xxxx-xxxx-xxxx)"
                  placeholderTextColor={RIG.textMute}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={!showKey}
                  disableFullscreenUI
                  style={[styles.input, styles.flex]}
                  accessibilityLabel="Yayın anahtarı"
                />
                <Touchable style={styles.iconBtn} onPress={() => setShowKey((v) => !v)} accessibilityLabel={showKey ? "Anahtarı gizle" : "Anahtarı göster"} hitSlop={6}>
                  <Ionicons name={showKey ? "eye-off-outline" : "eye-outline"} size={16} color={RIG.text} />
                </Touchable>
              </View>
              <Touchable
                style={styles.remember}
                onPress={() => setRemember((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: remember }}
                accessibilityLabel="Anahtarı bu telefonda sakla"
              >
                <Ionicons name={remember ? "checkbox" : "square-outline"} size={18} color={remember ? RIG.brand : RIG.textMute} />
                <Text style={styles.manualTitle} allowFontScaling={false}>
                  Bu telefonda sakla (güvenli depo)
                </Text>
              </Touchable>
              <Btn
                label="Bu anahtarla yayına başla"
                icon="radio"
                tone="live"
                disabled={busy || !props.nativeReady || !rtmp.trim() || !key.trim()}
                onPress={() => void startManual()}
              />
              {saved ? <Btn label="Kayıtlı anahtarı sil" icon="trash-outline" tone="soft" disabled={busy} onPress={() => void forget()} /> : null}
              <Text style={styles.muted} allowFontScaling={false}>
                YouTube Studio ▸ Canlı yayın ▸ Yayın anahtarı. Anahtar yalnız bu telefonda tutulur; sunucuya gönderilmez.
              </Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

function Info({ text, icon, tone }: { text: string; icon: keyof typeof Ionicons.glyphMap; tone: "warn" | "info" }) {
  const fg = tone === "warn" ? RIG.warn : RIG.brand;
  return (
    <View style={[styles.info, { backgroundColor: tone === "warn" ? RIG.warnDim : RIG.brandDim }]}>
      <Ionicons name={icon} size={15} color={fg} />
      <Text style={styles.infoText} allowFontScaling={false}>
        {text}
      </Text>
    </View>
  );
}

export function Btn({
  label,
  icon,
  tone,
  onPress,
  disabled,
  compact,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone: "live" | "danger" | "soft" | "brand" | "ok";
  onPress: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const bg =
    tone === "live" ? RIG.live : tone === "danger" ? RIG.liveDim : tone === "brand" ? RIG.brand : tone === "ok" ? RIG.ok : RIG.panelStrong;
  const fg = tone === "danger" ? RIG.live : RIG.text;
  return (
    <Touchable
      style={[styles.btn, compact && styles.btnCompact, { backgroundColor: bg, opacity: disabled ? 0.45 : 1 }]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      haptic="light"
    >
      {icon ? <Ionicons name={icon} size={compact ? 14 : 16} color={fg} /> : null}
      <Text style={[styles.btnText, { color: fg }]} numberOfLines={1} allowFontScaling={false}>
        {label}
      </Text>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.sm },
  flex: { flex: 1, minWidth: 0 },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: RIG.panelSoft,
  },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  statusTitle: { ...type.label, color: RIG.text },
  muted: { ...type.caption, color: RIG.textMute },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingLeft: space.md,
    paddingRight: space.xs,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: RIG.panelSoft,
  },
  link: { ...type.caption, color: RIG.text, flex: 1 },
  iconBtn: { width: 32, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: RIG.panelStrong },
  segment: { flexDirection: "row", padding: space.xxs, borderRadius: radius.md, backgroundColor: RIG.panelSoft },
  segItem: { flex: 1, height: 30, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  segOn: { backgroundColor: RIG.panelStrong },
  segText: { ...type.caption, color: RIG.textMute },
  segTextOn: { color: RIG.text },
  manualHead: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingVertical: space.xs, marginTop: space.xs },
  manualTitle: { ...type.caption, color: RIG.textSoft },
  keyRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  remember: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 36 },
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
  info: { flexDirection: "row", gap: space.sm, padding: space.md, borderRadius: radius.md },
  infoText: { ...type.caption, color: RIG.text, flex: 1 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    height: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
  },
  btnCompact: { height: 36, paddingHorizontal: space.sm },
  btnText: { ...type.label },
});
