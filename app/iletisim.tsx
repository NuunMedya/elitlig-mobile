/**
 * İLETİŞİM — kanallar, şehir yöneticisi (bayilik) kartı ve iletişim formu.
 *
 * NE DEĞİŞTİ: eski ekran beş adet elle çizilmiş kartı alt alta diziyor, her
 * satırın soluna SABİT HEX renkli (#3B72E8, #22A45D…) bir ikon kutusu koyuyordu
 * — koyu/açık temada aynı renk, tasarım sistemi dışında bir dil. Artık kanallar
 * `ListRow` grubudur, renk `Tone` sözlüğünden gelir ve satırın tamamı tek
 * dokunuşla eylemi başlatır (arama, WhatsApp, e-posta, sosyal hesap).
 *
 * VERİ — ŞEHİR İLETİŞİM SİSTEMİ: sunucuda `GET /api/city-contacts/city/:cityId`
 * ucu her şehrin aktif "iletişim alanlarını" (bayilik/bölge sorumlusu) döndürür:
 * etiket, telefon, WhatsApp, e-posta, adres ve sosyal hesaplar. Web istemcisi
 * (CityContactPage) yıllardır bunu kullanıyor; mobilde hiç okunmuyordu, bu
 * yüzden numaralar dosyaya gömülüydü ve şehir değişince yanlış numara
 * gösteriliyordu. Artık kapsamdaki şehrin gerçek kaydı okunur.
 *
 * NEDEN UÇ DOĞRUDAN ÇAĞRILIYOR: `lib/api/*` başka bir ajanın dosyası ve orada
 * şehir iletişimi için bir sarmalayıcı yok. Uç tek ve okunur olduğundan
 * `lib/http` üstünden tiplenerek çağrılır (aynı kalıp `(tabs)/oyunlar.tsx`
 * içinde de var); bütünleştirme ajanı isterse `lib/api/cityContacts.ts` açıp
 * buradaki tipleri oraya taşıyabilir.
 *
 * SUNUCU YOKSA EKRAN ÇALIŞIR: uç hata verirse ya da şehir seçili değilse
 * varsayılan merkez numaraları (`FALLBACK`) gösterilir — iletişim ekranı
 * "bağlantı yok" diye boş kalamaz. Hata yalnız bant olarak duyurulur.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery } from "@tanstack/react-query";
import React, { useCallback, useMemo, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  BottomSheet,
  Button,
  Card,
  ErrorState,
  Input,
  KeyValueRow,
  ListRow,
  ScreenHeader,
  SectionHeader,
  SkeletonCard,
  useHeaderScroll,
  useRefresh,
  useToast,
  type LeadingIcon,
} from "@/components/ui";
import { ApiError, get, post } from "@/lib/http";
import { openLink } from "@/lib/links";
import { instagramUrl } from "@/lib/socials";
import { youtubeChannelUrl } from "@/lib/youtube";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, layout, space, textScale, type } from "@/theme";

/* ========================= SUNUCU SÖZLEŞMESİ / TİPLER ===================== */

/** routes/cityContacts.js → SECTION_PUBLIC_FIELDS ile birebir. */
interface CityContactSection {
  id: number;
  public_id: string | null;
  city_id: number | null;
  label: string | null;
  sort_order: number | null;
  facebook_url: string | null;
  instagram_url: string | null;
  youtube_url: string | null;
  tiktok_url: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  map_embed_url: string | null;
}

interface CityContactsResponse {
  city_id: number;
  city_name: string | null;
  sections: CityContactSection[];
}

/** Kanal satırı — tek dokunuşta bir eylemi başlatır. */
interface Channel {
  key: string;
  /** Satırda görünen değer: numara, adres, hesap adı. */
  value: string;
  /** Değerin ne olduğu: "Telefon", "WhatsApp"… */
  label: string;
  leading: LeadingIcon;
  url: string;
}

/**
 * Merkez iletişim bilgileri — şehir kaydı gelmediğinde kullanılır.
 * (Site altbilgisindeki numaralarla aynıdır.)
 */
const FALLBACK = {
  phone: "05071690888",
  whatsapp: "905071690888",
  email: "destek@elitlig.com",
} as const;

/* ============================== SAF YARDIMCILAR =========================== */

const digitsOf = (value: string) => value.replace(/\D/g, "");

/** "05071690888" → "0507 169 08 88"; tanınmayan biçim olduğu gibi kalır. */
function formatPhone(raw?: string | null): string {
  const value = String(raw ?? "").trim();
  const digits = digitsOf(value);
  const local = digits.length === 12 && digits.startsWith("90") ? `0${digits.slice(2)}` : digits;
  if (local.length !== 11 || !local.startsWith("0")) return value;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7, 9)} ${local.slice(9)}`;
}

/** WhatsApp bağlantısı ülke kodu ister: "05071690888" → "905071690888". */
function whatsappNumber(raw?: string | null): string {
  const digits = digitsOf(String(raw ?? ""));
  if (!digits) return "";
  if (digits.startsWith("90")) return digits;
  if (digits.startsWith("0")) return `9${digits}`;
  if (digits.length === 10) return `90${digits}`;
  return digits;
}

/** "https://instagram.com/elitlig.ankara/" → "@elitlig.ankara" */
function handleOf(url: string, fallback: string): string {
  const match = url.replace(/\/+$/, "").split("/").pop();
  return match ? `@${match}` : fallback;
}

const trimmed = (value?: string | null): string => String(value ?? "").trim();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ================================= EKRAN ================================== */

export default function ContactScreen() {
  const scope = useScope();
  const auth = useAuth();
  const toast = useToast();
  const { scrollY, scrollProps } = useHeaderScroll();

  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState(auth.user?.fullName || auth.user?.username || "");
  const [email, setEmail] = useState(auth.user?.email ?? "");
  const [phone, setPhone] = useState(auth.user?.phone ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const cityId = scope.cityId ?? null;

  const query = useQuery({
    queryKey: ["city-contacts", cityId],
    queryFn: () => get<CityContactsResponse>(`/api/city-contacts/city/${cityId}`),
    enabled: cityId != null,
    staleTime: 10 * 60_000,
    retry: false,
  });

  const refresh = useRefresh(query.refetch, { refreshing: query.isRefetching });

  const sections = useMemo(() => query.data?.sections ?? [], [query.data]);
  /** Kanallar birincil (sıralamada ilk) alandan okunur. */
  const primary = sections[0];

  const channels = useMemo<Channel[]>(() => {
    const list: Channel[] = [];

    const phoneRaw = trimmed(primary?.phone) || FALLBACK.phone;
    if (phoneRaw) {
      list.push({
        key: "phone",
        value: formatPhone(phoneRaw),
        label: "Telefonla ara",
        leading: { icon: "call", tone: "info" },
        url: `tel:${digitsOf(phoneRaw)}`,
      });
    }

    const waRaw = trimmed(primary?.whatsapp) || FALLBACK.whatsapp;
    if (waRaw) {
      list.push({
        key: "whatsapp",
        value: formatPhone(waRaw),
        label: "WhatsApp'tan yaz",
        leading: { icon: "logo-whatsapp", tone: "win" },
        url: `https://wa.me/${whatsappNumber(waRaw)}`,
      });
    }

    const mail = trimmed(primary?.email) || FALLBACK.email;
    if (mail) {
      list.push({
        key: "email",
        value: mail,
        label: "E-posta gönder",
        leading: { icon: "mail", tone: "brand" },
        url: `mailto:${mail}`,
      });
    }

    // Sosyal hesaplar: önce şehir kaydı, yoksa şehir adına göre sözlükler.
    const instagram = trimmed(primary?.instagram_url) || instagramUrl(scope.cityLabel) || "";
    if (instagram) {
      list.push({
        key: "instagram",
        value: handleOf(instagram, "Instagram"),
        label: "Instagram",
        leading: { icon: "logo-instagram", tone: "brand" },
        url: instagram,
      });
    }

    const youtube = trimmed(primary?.youtube_url) || youtubeChannelUrl(scope.cityLabel) || "";
    if (youtube) {
      list.push({
        key: "youtube",
        value: `${scope.cityLabel || "Elitlig"} kanalı`,
        label: "YouTube — maç yayınları",
        // Kırmızı ton: kanal canlı yayın kimliğidir, "live" tonu tam karşılığı.
        leading: { icon: "logo-youtube", tone: "live" },
        url: youtube,
      });
    }

    const facebook = trimmed(primary?.facebook_url);
    if (facebook) {
      list.push({
        key: "facebook",
        value: handleOf(facebook, "Facebook"),
        label: "Facebook",
        leading: { icon: "logo-facebook", tone: "info" },
        url: facebook,
      });
    }

    const tiktok = trimmed(primary?.tiktok_url);
    if (tiktok) {
      list.push({
        key: "tiktok",
        value: handleOf(tiktok, "TikTok"),
        label: "TikTok",
        leading: { icon: "logo-tiktok", tone: "neutral" },
        url: tiktok,
      });
    }

    return list;
  }, [primary, scope.cityLabel]);

  /* ------------------------------- Form ---------------------------------- */

  const emailValid = !trimmed(email) || EMAIL_PATTERN.test(trimmed(email));
  const canSubmit =
    trimmed(name).length > 1 &&
    trimmed(message).length >= 10 &&
    Boolean(trimmed(email) || trimmed(phone)) &&
    emailValid;

  const mutation = useMutation({
    mutationFn: () =>
      post<{ message?: string }>("/api/city-contacts/requests", {
        name: trimmed(name),
        email: trimmed(email) || undefined,
        phone: trimmed(phone) || undefined,
        subject: trimmed(subject) || undefined,
        message: trimmed(message),
        city_id: cityId ?? undefined,
        city_name: query.data?.city_name ?? scope.cityLabel ?? undefined,
        section_id: primary?.id,
        section_label: primary?.label ?? undefined,
      }),
    onSuccess: () => {
      setFormOpen(false);
      setSubject("");
      setMessage("");
      toast.show({
        message: "Mesajınız iletildi. En kısa sürede dönüş yapacağız.",
        tone: "success",
        haptic: "success",
      });
    },
    onError: (error: unknown) => {
      toast.show({
        message:
          error instanceof ApiError ? error.userMessage : "Mesaj gönderilemedi. Tekrar deneyin.",
        tone: "danger",
      });
    },
  });

  const openForm = useCallback(() => setFormOpen(true), []);
  const closeForm = useCallback(() => setFormOpen(false), []);
  const submit = useCallback(() => {
    if (!canSubmit || mutation.isPending) return;
    mutation.mutate();
  }, [canSubmit, mutation]);

  /* ------------------------------- Çizim --------------------------------- */

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="İletişim"
        subtitle={scope.cityLabel ? `${scope.cityLabel} · her an yanınızdayız` : "Her an yanınızdayız"}
        back
        scrollY={scrollY}
      />

      <Animated.ScrollView
        {...scrollProps}
        contentContainerStyle={styles.content}
        refreshControl={refresh.control}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro} {...textScale.long}>
          Maç talebi, lige katılım, saha ve hakem soruları ya da geri bildirim —
          size en uygun kanaldan yazın, aynı gün dönüş yapıyoruz.
        </Text>

        {query.isError ? (
          <ErrorState
            error={query.error}
            onRetry={query.refetch}
            variant="banner"
            style={styles.banner}
          />
        ) : null}

        <SectionHeader title="Kanallar" style={styles.sectionHeader} />
        {channels.map((channel, index) => (
          <ChannelRow
            key={channel.key}
            channel={channel}
            position={
              channels.length === 1
                ? "single"
                : index === 0
                  ? "first"
                  : index === channels.length - 1
                    ? "last"
                    : "middle"
            }
          />
        ))}

        <SectionHeader title="Bölge sorumluları" style={styles.sectionHeader} />
        {query.isLoading ? (
          <SkeletonCard lines={3} />
        ) : sections.length ? (
          sections.map((section) => (
            <ManagerCard
              key={section.id}
              section={section}
              cityName={query.data?.city_name ?? scope.cityLabel}
            />
          ))
        ) : (
          <Card>
            <Text style={styles.cardBody} {...textScale.long}>
              {scope.cityLabel ? `${scope.cityLabel} için` : "Bu şehir için"} ayrı bir bölge
              sorumlusu tanımlı değil. Yukarıdaki merkez numaralarından bize
              ulaşabilirsiniz.
            </Text>
          </Card>
        )}

        <SectionHeader title="İletişim formu" style={styles.sectionHeader} />
        <Card
          title="Bize yazın"
          subtitle="Form doğrudan bölge yönetimine düşer"
          footer={
            <Button
              label="Formu doldur"
              icon="create-outline"
              variant="primary"
              fullWidth
              haptic="medium"
              onPress={openForm}
            />
          }
        >
          <Text style={styles.cardBody} {...textScale.long}>
            Telefonla ulaşamadığınız saatlerde formu bırakın: adınız, ulaşım
            bilginiz ve mesajınız yeterli. Talebiniz kayda geçer ve yönetim
            panelinden takip edilir.
          </Text>
        </Card>
      </Animated.ScrollView>

      {/* Form alt sayfası — klavye açıkken yarım ekran yeterli alanı bırakır. */}
      <BottomSheet
        visible={formOpen}
        onClose={closeForm}
        title="Bize yazın"
        snap="half"
        footer={
          <View style={styles.sheetFooter}>
            <Button label="Vazgeç" variant="ghost" onPress={closeForm} style={styles.sheetButton} />
            <Button
              label="Gönder"
              icon="send"
              variant="primary"
              onPress={submit}
              disabled={!canSubmit || mutation.isPending}
              loading={mutation.isPending}
              style={styles.sheetButton}
            />
          </View>
        }
      >
        <View style={styles.form}>
          <Input
            label="Ad Soyad"
            value={name}
            onChangeText={setName}
            placeholder="Adınız ve soyadınız"
            autoCapitalize="words"
          />
          <Input
            label="E-posta"
            value={email}
            onChangeText={setEmail}
            placeholder="ornek@eposta.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            error={emailValid ? undefined : "Geçerli bir e-posta girin."}
          />
          <Input
            label="Telefon"
            value={phone}
            onChangeText={setPhone}
            placeholder="05xx xxx xx xx"
            keyboardType="phone-pad"
            hint="E-posta ya da telefondan en az biri gerekli."
          />
          <Input
            label="Konu"
            value={subject}
            onChangeText={setSubject}
            placeholder="Maç talebi, lige katılım…"
          />
          <Input
            label="Mesaj"
            value={message}
            onChangeText={setMessage}
            placeholder="Nasıl yardımcı olabiliriz?"
            multiline
            hint="En az 10 karakter"
          />
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

/* ============================== ALT BİLEŞENLER ============================ */

/** Tek kanal satırı: basınca ilgili uygulamayı açar (arama/WhatsApp/tarayıcı). */
const ChannelRow = React.memo(function ChannelRow({
  channel,
  position,
}: {
  channel: Channel;
  position: "single" | "first" | "middle" | "last";
}) {
  const handlePress = useCallback(() => {
    void openLink(channel.url);
  }, [channel.url]);

  return (
    <ListRow
      leading={channel.leading}
      title={channel.value}
      subtitle={channel.label}
      position={position}
      onPress={handlePress}
      haptic="light"
    />
  );
});

/**
 * Şehir yöneticisi (bayilik) kartı: etiket, adres ve doğrudan arama/WhatsApp
 * düğmeleri. Telefonu olmayan kayıt için düğme çizilmez — çalışmayan düğme
 * kullanıcıyı yanıltır.
 */
const ManagerCard = React.memo(function ManagerCard({
  section,
  cityName,
}: {
  section: CityContactSection;
  cityName?: string | null;
}) {
  const phone = trimmed(section.phone);
  const whatsapp = trimmed(section.whatsapp) || phone;
  const email = trimmed(section.email);
  const address = trimmed(section.address);

  const call = useCallback(() => {
    void openLink(`tel:${digitsOf(phone)}`);
  }, [phone]);

  const chat = useCallback(() => {
    void openLink(`https://wa.me/${whatsappNumber(whatsapp)}`);
  }, [whatsapp]);

  /**
   * Tek satırlık değerler KeyValueRow'a girer (satır `numberOfLines={1}`);
   * ADRES oraya konmaz — kırpılırdı, ayrı bir sarmalanan metin satırıdır.
   */
  const rows: { label: string; value: string; numeric?: boolean }[] = [];
  if (phone) rows.push({ label: "Telefon", value: formatPhone(phone), numeric: true });
  if (email) rows.push({ label: "E-posta", value: email });

  return (
    <Card
      title={trimmed(section.label) || "Bölge sorumlusu"}
      subtitle={trimmed(cityName) || undefined}
      style={styles.managerCard}
      footer={
        phone || whatsapp ? (
          <View style={styles.managerActions}>
            {phone ? (
              <Button
                label="Ara"
                icon="call"
                variant="secondary"
                onPress={call}
                style={styles.managerButton}
              />
            ) : null}
            {whatsapp ? (
              <Button
                label="WhatsApp"
                icon="logo-whatsapp"
                variant="secondary"
                onPress={chat}
                style={styles.managerButton}
              />
            ) : null}
          </View>
        ) : undefined
      }
    >
      {rows.length ? (
        rows.map((row, index) => (
          <KeyValueRow
            key={row.label}
            label={row.label}
            value={row.value}
            numeric={row.numeric}
            position={
              rows.length === 1
                ? "single"
                : index === 0
                  ? "first"
                  : index === rows.length - 1
                    ? "last"
                    : "middle"
            }
          />
        ))
      ) : null}

      {address ? (
        <View style={styles.addressRow}>
          <Ionicons name="location-outline" size={14} color={colors.textTertiary} />
          <Text style={styles.address} {...textScale.long}>
            {address}
          </Text>
        </View>
      ) : null}

      {!rows.length && !address ? (
        <Text style={styles.cardBody} {...textScale.long}>
          Bu bölge için iletişim bilgisi henüz girilmemiş.
        </Text>
      ) : null}
    </Card>
  );
});

/* ================================ STİLLER ================================= */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.giant,
  },
  intro: {
    ...type.bodySm,
    color: colors.textSecondary,
    lineHeight: 20,
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },
  banner: {
    marginBottom: space.sm,
  },
  /** SectionHeader kendi yatay boşluğunu taşır; ekran boşluğu geri alınır. */
  sectionHeader: {
    marginHorizontal: -layout.screenPadding,
    marginTop: space.md,
  },
  managerCard: {
    marginTop: space.sm,
  },
  managerActions: {
    flexDirection: "row",
    gap: space.sm,
  },
  managerButton: {
    flex: 1,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.s,
    paddingTop: space.sm,
  },
  address: {
    ...type.bodySm,
    color: colors.textSecondary,
    lineHeight: 19,
    flex: 1,
  },
  cardBody: {
    ...type.bodySm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  form: {
    gap: space.md,
  },
  sheetFooter: {
    flexDirection: "row",
    gap: space.sm,
  },
  sheetButton: {
    flex: 1,
  },
});
