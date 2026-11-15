/**
 * SOHBET MEDYASI — sesli mesaj kaydı, konum alma, harita açma, fotoğraf / video seçimi.
 *
 * expo-audio (kayıt/oynatma) ve expo-location Expo Go'da da çalışır; yalnız
 * izin gerektirir. İzin verilmezse fonksiyonlar açıklayıcı hata fırlatır,
 * çağıran ekran toast/alert ile gösterir.
 */

import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Linking, Platform } from "react-native";
import { useCallback, useRef, useState } from "react";
import { mapLinkFor, type ChatLocationMeta } from "@/lib/api/chat";

export const MAX_VOICE_MS = 5 * 60 * 1000;

export interface VoiceRecording {
  uri: string;
  durationMs: number;
  mime: string;
  name: string;
}

/** Kayıt kancası: start → stop(cancel?) → VoiceRecording. */
export function useVoiceRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const startedAt = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);

  const start = useCallback(async () => {
    if (busy || recorder.isRecording) return;
    setBusy(true);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error("Mikrofon izni verilmedi. Ayarlardan izin verip tekrar deneyin.");
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAt.current = Date.now();
    } finally {
      setBusy(false);
    }
  }, [busy, recorder]);

  const stop = useCallback(async (cancel = false): Promise<VoiceRecording | null> => {
    if (!recorder.isRecording && !startedAt.current) return null;
    const durationMs = startedAt.current ? Date.now() - startedAt.current : 0;
    startedAt.current = null;
    try {
      await recorder.stop();
    } catch {
      // kayıt zaten durmuş olabilir
    }
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    const uri = recorder.uri;
    if (cancel || !uri || durationMs < 700) return null;
    const ext = uri.split(".").pop()?.toLowerCase() ?? "m4a";
    const mime = ext === "caf" ? "audio/x-caf" : ext === "3gp" ? "audio/3gpp" : ext === "webm" ? "audio/webm" : "audio/m4a";
    return { uri, durationMs, mime, name: `sesli-mesaj.${ext === "caf" ? "m4a" : ext}` };
  }, [recorder]);

  return {
    start,
    stop,
    busy,
    isRecording: state.isRecording,
    elapsedMs: startedAt.current ? Date.now() - startedAt.current : 0,
    durationMs: Math.round((state.durationMillis ?? 0)),
  };
}

/** Konum alma süresi sınırı: GPS sinyali yoksa getCurrentPositionAsync hiç dönmeyebilir. */
export const LOCATION_TIMEOUT_MS = 10_000;
/** Bu kadar taze ve isabetli son bilinen konum beklemeden kullanılır. */
const LAST_KNOWN_FRESH = { maxAge: 2 * 60 * 1000, requiredAccuracy: 200 };
/** Zaman aşımında yedek olarak kabul edilen en eski son bilinen konum. */
const LAST_KNOWN_FALLBACK = { maxAge: 30 * 60 * 1000 };

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const toLatLng = (position: Location.LocationObject) => ({ lat: position.coords.latitude, lng: position.coords.longitude });

/**
 * Cihaz konumu. İzin yoksa, konum servisleri kapalıysa ya da süre dolarsa
 * açıklayıcı hata fırlatır; hiçbir adım sonsuza dek beklemez.
 *
 * 1) İzin: önce mevcut durum okunur, yalnız sorulabiliyorsa sistem penceresi açılır.
 * 2) Taze son bilinen konum varsa anında döner (çoğu durumda GPS beklenmez).
 * 3) Yoksa dengeli isabetle güncel konum istenir; 10 sn'de gelmezse daha eski
 *    son bilinen konuma düşülür, o da yoksa hata.
 */
export async function getCurrentLocation(): Promise<{ lat: number; lng: number }> {
  let permission = await Location.getForegroundPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    throw new Error(
      permission.canAskAgain
        ? "Konum izni verilmedi. Konum paylaşmak için izin verin."
        : "Konum izni kapalı. Ayarlar > ElitLig > Konum bölümünden izin verip tekrar deneyin.",
    );
  }
  const servicesOn = await Location.hasServicesEnabledAsync().catch(() => true);
  if (!servicesOn) throw new Error("Cihazın konum servisleri kapalı. Açıp tekrar deneyin.");

  const fresh = await Location.getLastKnownPositionAsync(LAST_KNOWN_FRESH).catch(() => null);
  if (fresh) return toLatLng(fresh);

  let current: Location.LocationObject | null = null;
  try {
    current = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), LOCATION_TIMEOUT_MS);
  } catch {
    current = null;
  }
  if (current) return toLatLng(current);

  const stale = await Location.getLastKnownPositionAsync(LAST_KNOWN_FALLBACK).catch(() => null);
  if (stale) return toLatLng(stale);
  throw new Error("Konum alınamadı. Açık alanda tekrar deneyin ya da listeden bir saha seçin.");
}

/** Konumu harita uygulamasında açar (iOS: Apple Haritalar, Android: geo:). */
export async function openMap(location: ChatLocationMeta | null | undefined): Promise<void> {
  if (!location) return;
  const label = location.venue_name ?? location.label ?? "Konum";
  let url: string | null = null;
  if (location.lat != null && location.lng != null) {
    url =
      Platform.OS === "ios"
        ? `maps:0,0?q=${encodeURIComponent(label)}@${location.lat},${location.lng}`
        : `geo:${location.lat},${location.lng}?q=${location.lat},${location.lng}(${encodeURIComponent(label)})`;
  }
  const fallback = mapLinkFor(location);
  try {
    if (url && (await Linking.canOpenURL(url))) {
      await Linking.openURL(url);
      return;
    }
  } catch {
    // yerel harita yoksa web bağlantısına düş
  }
  if (fallback) await Linking.openURL(fallback);
}

/* ---------- fotoğraf / video seçimi (expo-image-picker) ---------- */

/** Sunucu sınırı (middleware/chatFileUpload.js). */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export interface PickedFile {
  uri: string;
  name: string;
  type: string;
  width: number | null;
  height: number | null;
  size: number | null;
  isImage: boolean;
}

function toPicked(asset: ImagePicker.ImagePickerAsset, index: number): PickedFile {
  const isImage = asset.type !== "video";
  const fromUri = asset.uri.split("/").pop()?.split("?")[0] ?? "";
  const ext = (asset.fileName ?? fromUri).split(".").pop()?.toLowerCase() || (isImage ? "jpg" : "mp4");
  const mime = asset.mimeType ?? (isImage ? (ext === "png" ? "image/png" : ext === "heic" ? "image/heic" : "image/jpeg") : ext === "mov" ? "video/quicktime" : "video/mp4");
  return {
    uri: asset.uri,
    name: asset.fileName || `${isImage ? "fotograf" : "video"}-${Date.now()}-${index + 1}.${ext}`,
    type: mime,
    width: asset.width || null,
    height: asset.height || null,
    size: asset.fileSize ?? null,
    isImage,
  };
}

/** Galeriden fotoğraf (en çok 10) ya da tek video seçer. İzin yoksa hata fırlatır; vazgeçilirse boş dizi. */
export async function pickFromLibrary(kind: "images" | "videos"): Promise<PickedFile[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error("Galeri izni verilmedi. Ayarlardan izin verip tekrar deneyin.");
  const result = await ImagePicker.launchImageLibraryAsync(
    kind === "images"
      ? { mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 10, quality: 0.8, orderedSelection: true }
      : { mediaTypes: ["videos"], allowsMultipleSelection: false, videoMaxDuration: 180 },
  );
  if (result.canceled) return [];
  return result.assets.map(toPicked);
}

/** Kamerayla fotoğraf çeker. */
export async function takePhoto(): Promise<PickedFile[]> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error("Kamera izni verilmedi. Ayarlardan izin verip tekrar deneyin.");
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
  if (result.canceled) return [];
  return result.assets.map(toPicked);
}
