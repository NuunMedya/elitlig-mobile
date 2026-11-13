/**
 * Mobil stüdyo — "Ayarlar" sekmesi: kamera, ses ve yayın kalitesi.
 *
 *   Kamera   ön / arka, yakınlaştırma, fener (yerel modül destekliyorsa)
 *   Ses      mikrofon aç / kapa
 *   Kalite   çözünürlük ön ayarı, kare hızı, bit hızı (yayın sürerken kilitli)
 *   Kayıt    yayını telefon hafızasına da kaydet (yayın sürerken de açılıp kapanır)
 *
 * Yakınlaştırma ve fener yerel modüle sonradan eklendi; mağazadaki eski
 * derlemede yoksa satırların yerine kısa bir açıklama görünür.
 */

import React from "react";
import { StyleSheet, View } from "react-native";

import { estimateStorage, estimateText, formatBytes, saveLocationText } from "@/lib/live/localRecording";
import { BITRATE_OPTIONS, FPS_OPTIONS, QUALITY_PRESETS, type EncoderConfig } from "@/lib/live/rig";
import type { StudioSettings } from "@/lib/live/studioSettings";
import { space } from "@/theme";
import type { CameraCapabilities, StorageInfo } from "@/modules/elitlig-live";

import { Btn, GroupTitle, Hint, Note, OptionRow, SegRow, ToggleRow } from "./rigUi";

export interface SettingsPanelProps {
  nativeReady: boolean;
  encoderOn: boolean;
  facing: "back" | "front";
  onFlip: () => void;
  muted: boolean;
  onMute: () => void;
  /** null → yerel modül yakınlaştırma / feneri desteklemiyor. */
  caps: CameraCapabilities | null;
  controlsSupported: boolean;
  zoom: number;
  onZoom: (level: number) => void;
  torchOn: boolean;
  onTorch: (on: boolean) => void;
  settings: StudioSettings;
  onChange: (patch: Partial<StudioSettings>) => void;
  encoder: EncoderConfig;
  /** Yerel modül yayını telefona kaydedebiliyor mu (yeni derleme). */
  recordSupported: boolean;
  storage: StorageInfo | null;
  /** Şu an telefona kayıt yapılıyor mu. */
  recordingOn: boolean;
  onSaveLocal: (next: boolean) => void;
}

const ZOOM_STEPS = [1, 1.5, 2, 3, 4, 6, 8];
const FPS = FPS_OPTIONS.map((f) => ({ value: f, label: `${f} fps` }));
const zoomLabel = (z: number) => `${Number.isInteger(z) ? z : z.toFixed(1).replace(".", ",")}×`;

export function SettingsPanel(props: SettingsPanelProps) {
  const { settings, onChange, caps } = props;
  const maxZoom = caps?.maxZoom ?? 1;
  const zoomOptions = ZOOM_STEPS.filter((z) => z === 1 || z <= maxZoom + 0.01)
    .slice(0, 5)
    .map((z) => ({ value: z, label: zoomLabel(z) }));
  const nearest = zoomOptions.reduce((best, o) => (Math.abs(o.value - props.zoom) < Math.abs(best - props.zoom) ? o.value : best), 1);
  const estimate = estimateStorage(props.encoder, props.storage?.freeBytes, props.storage?.minFreeBytes);
  const bitrateOptions = [{ value: 0, label: "Oto" }, ...BITRATE_OPTIONS.filter((b) => b !== 3500).map((b) => ({ value: b as number, label: `${b / 1000}`.replace(".", ",") }))];

  return (
    <View style={styles.stack}>
      <GroupTitle>KAMERA</GroupTitle>
      <Btn
        label={props.facing === "back" ? "Ön kameraya geç" : "Arka kameraya geç"}
        icon="camera-reverse"
        tone="soft"
        disabled={!props.nativeReady}
        onPress={props.onFlip}
      />
      {props.controlsSupported ? (
        <>
          {zoomOptions.length > 1 ? (
            <SegRow options={zoomOptions} value={nearest} onChange={props.onZoom} label="Yakınlaştırma" />
          ) : (
            <Hint>Bu kamera yakınlaştırmayı desteklemiyor.</Hint>
          )}
          <ToggleRow
            title="Fener"
            hint={caps?.torch ? "Karanlık sahada kameranın ışığını açar; pili hızlı tüketir" : "Bu kamerada fener yok"}
            icon="flashlight"
            value={props.torchOn}
            onChange={props.onTorch}
            disabled={!caps?.torch}
          />
        </>
      ) : props.nativeReady ? (
        <Hint>Yakınlaştırma ve fener bir sonraki mağaza sürümüyle gelir; bu sürümde yok.</Hint>
      ) : null}

      <GroupTitle>SES</GroupTitle>
      <ToggleRow
        title="Mikrofon"
        hint={props.muted ? "Yayına ses gitmiyor" : "Ortam sesi yayına gidiyor"}
        icon={props.muted ? "mic-off" : "mic"}
        value={!props.muted}
        onChange={props.onMute}
        disabled={!props.nativeReady}
      />

      <GroupTitle>TELEFONA KAYIT</GroupTitle>
      {props.recordSupported ? (
        <>
          <ToggleRow
            title="Telefona kaydet"
            hint={
              props.recordingOn
                ? "Kayıt sürüyor; kapatırsan dosya şimdi kaydedilir"
                : props.encoderOn
                  ? "Açarsan kayıt bu andan itibaren başlar"
                  : "Yayın başlarken sorulur; yayının tamamı MP4 olarak saklanır"
            }
            icon="save"
            value={props.encoderOn ? props.recordingOn : settings.saveLocal}
            onChange={props.onSaveLocal}
            disabled={estimate.belowFloor && !props.recordingOn}
          />
          <Hint>
            {props.storage
              ? `Boş alan ${formatBytes(props.storage.freeBytes)}${props.storage.totalBytes > 0 ? ` / ${formatBytes(props.storage.totalBytes)}` : ""} · ${estimateText(estimate)}. Kayıt yeri: ${saveLocationText(props.storage)}.`
              : "Telefonun boş alanı okunamadı."}
          </Hint>
          {estimate.belowFloor ? (
            <Note tone="danger" icon="alert-circle" text="Boş alan 300 MB'ın altında: telefona kayıt yapılamaz. Önce telefonda yer aç." />
          ) : estimate.tight ? (
            <Note tone="warn" icon="warning" text="Boş alan 90 dakikalık maça yetmeyebilir. Alan 300 MB'ın altına inince kayıt kendiliğinden kapatılır." />
          ) : null}
        </>
      ) : props.nativeReady ? (
        <Hint>Yayını telefona kaydetme bir sonraki mağaza sürümüyle gelir; bu sürümde yok.</Hint>
      ) : null}

      <GroupTitle>YAYIN KALİTESİ</GroupTitle>
      {QUALITY_PRESETS.map((q) => (
        <OptionRow key={q.key} title={q.label.split(" · ")[0]} hint={q.hint} selected={settings.quality === q.key} disabled={props.encoderOn} onPress={() => onChange({ quality: q.key })} />
      ))}
      <SegRow options={FPS} value={settings.fps} onChange={(fps) => onChange({ fps })} disabled={props.encoderOn} label="Kare hızı" />
      <GroupTitle>BİT HIZI (Mbps)</GroupTitle>
      <SegRow
        options={bitrateOptions}
        value={settings.bitrateKbps ?? 0}
        onChange={(v) => onChange({ bitrateKbps: v > 0 ? v : null })}
        disabled={props.encoderOn}
        label="Bit hızı"
      />
      <Hint>
        Gönderilecek: {props.encoder.width}×{props.encoder.height} · {props.encoder.fps} fps · {props.encoder.videoBitrateKbps} kbps görüntü + 128 kbps ses (H.264 High,
        2 sn anahtar kare). Yükleme hızın bunun en az 1,5 katı olmalı.
      </Hint>
      {settings.bitrateKbps != null && settings.bitrateKbps !== props.encoder.videoBitrateKbps ? (
        <Hint>Seçtiğin bit hızı bu çözünürlük için düşük; görüntü bozulmasın diye {props.encoder.videoBitrateKbps} kbps kullanılıyor.</Hint>
      ) : null}
      <Hint>Görüntü bulanık ya da bloklu görünüyorsa bit hızını yükselt; bağlantı sık kopuyorsa bir alt kaliteye geç.</Hint>
      {props.encoderOn ? (
        <Note tone="warn" icon="lock-closed" text="Kalite yayın sürerken değişmez. Değiştirmek için Yayın sekmesinden görüntüyü durdurup yeniden başlat." />
      ) : props.encoder.height >= 1080 ? (
        <Note tone="warn" icon="thermometer" text="1080p telefonu belirgin ısıtır ve pili hızlı tüketir. Uzun maçta 720p önerilir." />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.sm },
});
