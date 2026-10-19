/**
 * OYUNCU PROFİLİMİ DÜZENLE — PATCH /api/panel/me/player (onaylı talep).
 *
 * Web panelindeki ProfileEditor'ın mobil karşılığı: fotoğraf, ad, mevki,
 * doğum tarihi, uyruk, iletişim ve il. Yalnız DEĞİŞEN alanlar gönderilir;
 * sunucu bunları değişiklik talebi olarak yönetime iletir ve profil onaydan
 * sonra güncellenir. Bekleyen talep varken form kilitlidir ve talep geri
 * çekilebilir (PendingChangeNotice).
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AuthCard, AuthNotice, AuthShell } from "@/components/account/AuthShell";
import { CityPickerSheet } from "@/components/account/CityPickerSheet";
import { ImagePickField } from "@/components/account/ImagePickField";
import { PendingChangeNotice } from "@/components/account/PendingChangeNotice";
import { Button, Chip, EmptyState, Input, SkeletonCard, useToast } from "@/components/ui";
import { getPanelMe } from "@/lib/api/panel";
import {
  POSITION_LABELS,
  requestPlayerUpdate,
  toDisplayDate,
  toIsoDate,
  type PlayerProfilePatch,
} from "@/lib/api/profile";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { colors, space, textScale, type } from "@/theme";

interface Form {
  player_img: string | null;
  player_name: string;
  player_position: string;
  birth_date: string; // GG.AA.YYYY
  nationality: string;
  phone: string;
  email: string;
  city: string | null;
  city_id: number | null;
}

type Errors = Partial<Record<keyof Form, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+()\s-]{7,20}$/;

function validate(form: Form): Errors {
  const errors: Errors = {};
  if (!form.player_name.trim()) errors.player_name = "Ad soyad zorunludur.";
  else if (form.player_name.trim().length > 120) errors.player_name = "En fazla 120 karakter.";
  if (form.birth_date.trim() && !toIsoDate(form.birth_date)) errors.birth_date = "GG.AA.YYYY biçiminde gir.";
  if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) errors.email = "Geçerli bir e-posta gir.";
  if (form.phone.trim() && !PHONE_RE.test(form.phone.trim())) errors.phone = "Geçerli bir telefon gir.";
  return errors;
}

function serverFieldErrors(error: unknown): Errors {
  if (!(error instanceof ApiError) || !error.detail || typeof error.detail !== "object") return {};
  const raw = (error.detail as { fieldErrors?: Record<string, unknown> }).fieldErrors ?? {};
  const out: Errors = {};
  for (const [key, value] of Object.entries(raw)) if (typeof value === "string") out[key as keyof Form] = value;
  return out;
}

const blank = (value: string) => (value.trim() ? value.trim() : null);

export default function EditPlayerProfileScreen() {
  const router = useRouter();
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ["panel", "me"],
    queryFn: getPanelMe,
    enabled: Boolean(auth.user),
    staleTime: 60_000,
  });
  const player = meQuery.data?.player ?? null;
  const pending = meQuery.data?.pendingChanges.find((change) => change.type === "player_update") ?? null;

  const initial = useMemo<Form | null>(
    () =>
      player
        ? {
            player_img: player.player_img,
            player_name: player.player_name ?? "",
            player_position: player.player_position ?? "",
            birth_date: toDisplayDate(player.birth_date),
            nationality: player.nationality ?? "",
            phone: player.phone ?? "",
            email: player.email ?? "",
            city: player.city,
            city_id: player.city_id,
          }
        : null,
    [player],
  );

  const [form, setForm] = useState<Form | null>(null);
  const [touched, setTouched] = useState(false);
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);

  useEffect(() => {
    if (initial && !form) setForm(initial);
  }, [form, initial]);

  const errors = useMemo(() => (form ? validate(form) : {}), [form]);

  /** Yalnız değişen alanlar — sunucu boş talebi reddeder. */
  const payload = useMemo<PlayerProfilePatch>(() => {
    if (!form || !initial) return {};
    const out: PlayerProfilePatch = {};
    if (form.player_img !== initial.player_img) out.player_img = form.player_img;
    if (form.player_name.trim() !== initial.player_name.trim()) out.player_name = form.player_name.trim();
    if (form.player_position !== initial.player_position) out.player_position = blank(form.player_position);
    if (form.birth_date.trim() !== initial.birth_date) out.birth_date = form.birth_date.trim() ? toIsoDate(form.birth_date) : null;
    if (form.nationality.trim() !== initial.nationality.trim()) out.nationality = blank(form.nationality);
    if (form.phone.trim() !== initial.phone.trim()) out.phone = blank(form.phone);
    if (form.email.trim() !== initial.email.trim()) out.email = blank(form.email);
    if (form.city_id !== initial.city_id) {
      out.city_id = form.city_id;
      out.city = form.city;
    }
    return out;
  }, [form, initial]);

  const changed = Object.keys(payload).length > 0;
  const locked = Boolean(pending) || busy;

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setServerErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
    setError(null);
  };
  const errorFor = (key: keyof Form) => serverErrors[key] ?? (touched ? errors[key] : undefined);

  const submit = async () => {
    setTouched(true);
    if (!changed || Object.keys(errors).length || locked) return;
    setBusy(true);
    setError(null);
    try {
      const result = await requestPlayerUpdate(payload);
      toast.show({ message: result.message || "Talebin yönetime gönderildi.", tone: "success" });
      await queryClient.invalidateQueries({ queryKey: ["panel", "me"] });
      if (router.canGoBack()) router.back();
    } catch (caught) {
      const fields = serverFieldErrors(caught);
      setServerErrors(fields);
      if (!Object.keys(fields).length) {
        setError(caught instanceof ApiError ? caught.userMessage : "Talep gönderilemedi.");
      }
    } finally {
      setBusy(false);
    }
  };

  const shell = (children: ReactNode) => (
    <AuthShell
      title="Profilimi düzenle"
      variant="form"
      overline="Oyuncu profilim"
      heading="Profilimi düzenle"
      lede="Değişiklikler lig yönetiminin onayından sonra profilinde ve tüm ekranlarda görünür."
      icon="person-circle-outline"
      back
    >
      {children}
    </AuthShell>
  );

  if (meQuery.isLoading || (player && !form)) return shell(<SkeletonCard lines={6} />);
  if (!player || !form) {
    return shell(
      <EmptyState
        icon="person-add-outline"
        title="Bağlı oyuncu profilin yok"
        body="Önce veritabanındaki kaydını sahiplen ya da yeni oyuncu profili oluştur."
        action={{ label: "Oyuncu profili bağla", onPress: () => router.replace("/oyuncum/bagla") }}
      />,
    );
  }

  return shell(
    <>
      {pending ? (
        <PendingChangeNotice changeId={pending.id} createdAt={pending.created_at} subject="Profil değişikliğin" />
      ) : null}

      <AuthCard title="Profil fotoğrafı">
        <ImagePickField
          kind="player"
          name={form.player_name}
          value={form.player_img}
          onChange={(url) => set("player_img", url)}
          disabled={locked}
        />
      </AuthCard>

      <AuthCard title="Kimlik">
        <Input
          label="Ad soyad"
          value={form.player_name}
          onChangeText={(value) => set("player_name", value)}
          error={errorFor("player_name")}
          maxLength={120}
          autoCapitalize="words"
          editable={!locked}
        />
        <Text style={styles.label} {...textScale.dense}>
          Mevki
        </Text>
        <View style={styles.chips}>
          {POSITION_LABELS.map((label) => (
            <Chip
              key={label}
              label={label}
              size="sm"
              selected={form.player_position === label}
              disabled={locked}
              onPress={() => set("player_position", form.player_position === label ? "" : label)}
            />
          ))}
        </View>
        <Input
          label="Doğum tarihi"
          value={form.birth_date}
          onChangeText={(value) => set("birth_date", value)}
          error={errorFor("birth_date")}
          placeholder="GG.AA.YYYY"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          editable={!locked}
        />
        <Input
          label="Uyruk"
          value={form.nationality}
          onChangeText={(value) => set("nationality", value)}
          error={errorFor("nationality")}
          placeholder="Örn. Türkiye"
          maxLength={60}
          editable={!locked}
        />
      </AuthCard>

      <AuthCard title="İletişim">
        <Text style={styles.hint} {...textScale.long}>
          İletişim bilgilerin herkese açık sayfalarda gösterilmez; yalnız lig yönetimi görür.
        </Text>
        <Input
          label="Telefon"
          value={form.phone}
          onChangeText={(value) => set("phone", value)}
          error={errorFor("phone")}
          placeholder="05xx xxx xx xx"
          keyboardType="phone-pad"
          editable={!locked}
        />
        <Input
          label="E-posta"
          value={form.email}
          onChangeText={(value) => set("email", value)}
          error={errorFor("email")}
          placeholder="ad@ornek.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!locked}
        />
      </AuthCard>

      <AuthCard title="Konum">
        <Text style={styles.hint} {...textScale.long}>
          İl bilgisi futbolcu veritabanı ve transfer kapsamını belirler.
        </Text>
        <Button
          label={form.city ? `İl: ${form.city}` : "İl seç"}
          variant="secondary"
          icon="location-outline"
          onPress={() => setCityOpen(true)}
          disabled={locked}
        />
      </AuthCard>

      {error ? <AuthNotice message={error} /> : null}

      <Button
        label={changed ? "Onaya gönder" : "Değişiklik yok"}
        onPress={submit}
        loading={busy}
        disabled={!changed || Boolean(pending)}
        size="lg"
        fullWidth
      />

      <CityPickerSheet
        visible={cityOpen}
        onClose={() => setCityOpen(false)}
        selectedId={form.city_id}
        onPick={(city) => {
          setCityOpen(false);
          setForm((current) => (current ? { ...current, city_id: city.id, city: city.label } : current));
        }}
      />
    </>,
  );
}

const styles = StyleSheet.create({
  label: { ...type.label, color: colors.textSecondary, marginTop: space.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  hint: { ...type.caption, color: colors.textTertiary },
});
