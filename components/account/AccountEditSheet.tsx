/**
 * ÜYELİK BİLGİLERİNİ DÜZENLE — Hesabım ▸ "Bilgilerimi düzenle" alt sayfası.
 * (web: PlayerTeamPanel ▸ Hesabım penceresi — AccountModal; PATCH /api/users/me)
 *
 * NEDEN VAR: mobilde hesap bilgileri salt okunurdu ve altında "değiştirmek
 * için lig yönetimiyle iletişime geç" yazıyordu; oysa sunucu üyeye beş alanı
 * kendisinin düzenlemesine izin verir (services/accountProfileService.js
 * EDITABLE_FIELDS): ad soyad, kullanıcı adı, e-posta, telefon, il. Onay
 * gerekmez; kayıt anında işlenir.
 *
 * KURALLAR (sunucununkilerle aynı, istek atılmadan söylenir):
 *   · kullanıcı adı zorunlu, ≤ 100; başka hesapta varsa 409 USERNAME_ALREADY_EXISTS
 *   · e-posta biçimi; başka hesapta varsa 409 EMAIL_ALREADY_EXISTS
 *   · il zorunlu (boş gönderilmez); yönetim hesabında il kilitli (403 CITY_LOCKED)
 *   · yalnız DEĞİŞEN alanlar gönderilir (boş gövde 400'dür)
 * Sunucunun alan hataları (`fieldErrors`) ilgili alanın altına yazılır.
 *
 * İL SEÇİMİ aynı sayfanın içinde ikinci adımdır (iç içe Modal açılmaz —
 * iOS'ta bir Modal'ın üstüne kardeş Modal sunulamaz).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useCities } from "@/components/account/CityPickerSheet";
import { BottomSheet, Button, Input, SkeletonListRow, Touchable, useToast } from "@/components/ui";
import { ApiError, patch } from "@/lib/http";
import type { AuthUser } from "@/lib/types";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

type Field = "fullName" | "username" | "email" | "phone" | "city";
type Form = Record<Field, string>;

const fold = (value: string) => value.toLocaleLowerCase("tr-TR").trim();

const fromUser = (user: AuthUser): Form => ({
  fullName: user.fullName ?? "",
  username: user.username ?? "",
  email: user.email ?? "",
  phone: user.phone ?? "",
  city: user.city ?? "",
});

function validate(form: Form): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  const username = form.username.trim();
  if (!username) errors.username = "Kullanıcı adı zorunlu.";
  else if (username.length > 100) errors.username = "En fazla 100 karakter olabilir.";
  else if (/\s/.test(username)) errors.username = "Kullanıcı adında boşluk olamaz.";
  const email = form.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Geçerli bir e-posta adresi gir.";
  if (form.fullName.trim().length > 255) errors.fullName = "En fazla 255 karakter olabilir.";
  if (form.phone.trim().length > 50) errors.phone = "En fazla 50 karakter olabilir.";
  return errors;
}

const SERVER_FIELD: Record<string, Field> = {
  USERNAME_ALREADY_EXISTS: "username",
  EMAIL_ALREADY_EXISTS: "email",
  CITY_LOCKED: "city",
};

export function AccountEditSheet({
  visible,
  user,
  onClose,
  onSaved,
}: {
  visible: boolean;
  user: AuthUser;
  onClose: () => void;
  /** Kayıt başarılı: çağıran oturumu tazeler (AuthProvider.refreshUser). */
  onSaved: () => void | Promise<void>;
}) {
  const toast = useToast();
  const cities = useCities();
  const [form, setForm] = useState<Form>(() => fromUser(user));
  const [touched, setTouched] = useState(false);
  const [serverErrors, setServerErrors] = useState<Partial<Record<Field, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [step, setStep] = useState<"form" | "city">("form");
  const [cityTerm, setCityTerm] = useState("");

  /* Sayfa her açılışta oturumdaki güncel değerlerle başlar. */
  useEffect(() => {
    if (!visible) return;
    setForm(fromUser(user));
    setTouched(false);
    setServerErrors({});
    setBanner(null);
    setStep("form");
    setCityTerm("");
    // Yalnız açılışta: yazarken oturum tazelenirse girilenler silinmesin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const initial = useMemo(() => fromUser(user), [user]);
  const errors = useMemo(() => validate(form), [form]);

  /** Yalnız değişen alanlar. Boş bırakılan isteğe bağlı alan `null` gider. */
  const payload = useMemo(() => {
    const out: Partial<Record<Field, string | null>> = {};
    (Object.keys(form) as Field[]).forEach((key) => {
      const next = form[key].trim();
      if (next === initial[key].trim()) return;
      if (key === "city" && !next) return; // il boşaltılamaz
      out[key] = next || (key === "username" ? next : null);
    });
    return out;
  }, [form, initial]);
  const dirty = Object.keys(payload).length > 0;

  const save = useMutation({
    mutationFn: () => patch<{ user?: AuthUser }>("/api/users/me", payload),
    onSuccess: async () => {
      await onSaved();
      toast.show({ message: "Üyelik bilgilerin güncellendi.", tone: "success" });
      onClose();
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) {
        setBanner("Bilgiler kaydedilemedi. Tekrar dene.");
        return;
      }
      const detail = (error.detail ?? {}) as { fieldErrors?: Record<string, string> };
      const next: Partial<Record<Field, string>> = {};
      for (const [key, message] of Object.entries(detail.fieldErrors ?? {})) {
        if (key in form) next[key as Field] = String(message);
      }
      const mapped = error.code ? SERVER_FIELD[error.code] : undefined;
      if (mapped && !next[mapped]) next[mapped] = error.message;
      setServerErrors(next);
      setBanner(Object.keys(next).length ? null : error.userMessage);
    },
  });

  const set = (key: Field, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setServerErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
    setBanner(null);
  };
  const errorFor = (key: Field) => serverErrors[key] ?? (touched ? errors[key] : undefined);

  const submit = () => {
    setTouched(true);
    if (Object.keys(errors).length || !dirty || save.isPending) return;
    save.mutate();
  };

  const cityList = useMemo(() => {
    const needle = fold(cityTerm);
    const all = cities.data ?? [];
    return needle ? all.filter((city) => fold(city.label).includes(needle)) : all;
  }, [cities.data, cityTerm]);

  if (step === "city") {
    return (
      <BottomSheet visible={visible} onClose={() => setStep("form")} title="İl seç" snap="full">
        <Input
          value={cityTerm}
          onChangeText={setCityTerm}
          placeholder="İl ara"
          variant="search"
          leadingIcon="search"
          autoCorrect={false}
          accessibilityLabel="İl ara"
        />
        <View style={styles.cityList}>
          {cities.isLoading ? (
            <SkeletonListRow count={6} />
          ) : cities.isError ? (
            <View style={styles.cityError}>
              <Text style={styles.note} {...textScale.long}>
                İl listesi alınamadı.
              </Text>
              <Button label="Tekrar dene" size="sm" variant="secondary" onPress={() => void cities.refetch()} />
            </View>
          ) : cityList.length === 0 ? (
            <Text style={styles.note} {...textScale.long}>
              Bu adla bir il bulunamadı.
            </Text>
          ) : (
            cityList.map((city) => {
              const selected = fold(city.label) === fold(form.city);
              return (
                <Touchable
                  key={city.id}
                  onPress={() => {
                    set("city", city.label);
                    setStep("form");
                    setCityTerm("");
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={city.label}
                  style={styles.cityRow}
                >
                  <Text style={[styles.cityName, selected && styles.cityNameSelected]} numberOfLines={1} {...textScale.dense}>
                    {city.label}
                  </Text>
                  {selected ? <Ionicons name="checkmark" size={16} color={colors.brandAccent} /> : null}
                </Touchable>
              );
            })
          )}
        </View>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Üyelik bilgilerim"
      snap="full"
      footer={
        <Button
          label={dirty ? "Kaydet" : "Değişiklik yok"}
          icon="checkmark"
          onPress={submit}
          loading={save.isPending}
          disabled={!dirty || save.isPending}
          size="lg"
          fullWidth
        />
      }
    >
      <View style={styles.form}>
        <Input
          label="Ad soyad"
          value={form.fullName}
          onChangeText={(value) => set("fullName", value)}
          error={errorFor("fullName")}
          autoCapitalize="words"
          textContentType="name"
          maxLength={255}
        />
        <Input
          label="Kullanıcı adı"
          value={form.username}
          onChangeText={(value) => set("username", value)}
          error={errorFor("username")}
          hint="Girişte kullandığın ad. Değiştirirsen bir sonraki girişte yenisini yaz."
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          maxLength={100}
        />
        <Input
          label="E-posta"
          value={form.email}
          onChangeText={(value) => set("email", value)}
          error={errorFor("email")}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
          maxLength={254}
        />
        <Input
          label="Telefon"
          value={form.phone}
          onChangeText={(value) => set("phone", value)}
          error={errorFor("phone")}
          placeholder="05xx xxx xx xx"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          maxLength={50}
        />

        <View style={styles.field}>
          <Text style={styles.fieldLabel} {...textScale.dense}>
            İl
          </Text>
          <Touchable
            onPress={() => setStep("city")}
            accessibilityRole="button"
            accessibilityLabel={`İl: ${form.city || "seçilmedi"}. Değiştir`}
            style={[styles.picker, errorFor("city") ? styles.pickerError : null]}
          >
            <Ionicons name="location-outline" size={16} color={colors.textTertiary} />
            <Text style={[styles.pickerText, !form.city && styles.pickerPlaceholder]} numberOfLines={1} {...textScale.dense}>
              {form.city || "İl seç"}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
          </Touchable>
          {errorFor("city") ? (
            <Text style={styles.fieldError} {...textScale.long}>
              {errorFor("city")}
            </Text>
          ) : (
            <Text style={styles.note} {...textScale.long}>
              Oyuncu / takım profili oluştururken ve futbolcu veritabanında bu il kullanılır.
            </Text>
          )}
        </View>

        {banner ? (
          <View style={styles.banner} accessibilityRole="alert">
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={styles.bannerText} {...textScale.long}>
              {banner}
            </Text>
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.md, paddingBottom: space.md },
  field: { gap: space.xs },
  fieldLabel: { ...type.label, color: colors.textSecondary },
  picker: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 46,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  pickerError: { borderColor: colors.danger },
  pickerText: { ...type.body, color: colors.textPrimary, flex: 1 },
  pickerPlaceholder: { color: colors.textTertiary },
  fieldError: { ...type.caption, color: colors.danger },
  note: { ...type.caption, color: colors.textTertiary },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerDim,
  },
  bannerText: { ...type.bodySm, color: colors.danger, flex: 1 },
  cityList: { marginTop: space.sm },
  cityError: { gap: space.sm, alignItems: "flex-start", paddingVertical: space.md },
  cityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    paddingVertical: space.sm,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  cityName: { ...type.body, color: colors.textPrimary, flex: 1 },
  cityNameSelected: { ...type.h4, color: colors.brandAccent },
});
