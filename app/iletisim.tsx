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
 * DÜZEN (yeniden tasarım): en üstte üç HIZLI EYLEM kutusu (Ara · WhatsApp ·
 * E-posta) — iletişim ekranını açanın %90'ı bunlardan birini arıyor; tek
 * dokunuşla başlar. Altında sosyal hesaplar satır grubu, bölge sorumluları
 * (iç içe kart yok: telefon/e-posta kartın kendi satırlarıdır) ve form.
 *
 * DERİN BAĞLANTI: `/iletisim?konu=<metin>` formun "Konu" alanını doldurur ve
 * formu açık başlatır (Kulübüm → "Takım kurmak için başvur").
 *
 * SUNUCU YOKSA EKRAN ÇALIŞIR: uç hata verirse ya da şehir seçili değilse
 * varsayılan merkez numaraları (`FALLBACK`) gösterilir — iletişim ekranı
 * "bağlantı yok" diye boş kalamaz. Hata yalnız bant olarak duyurulur.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Badge,
  BottomSheet,
  Button,
  EmptyState,
  ErrorState,
  IconTile,
  Input,
  Reveal,
  ScreenHeader,
  SectionHeader,
  SkeletonCard,
  Touchable,
  useHeaderScroll,
  useRefresh,
  useToast,
  type IconTileTone,
  type LeadingIcon,
} from "@/components/ui";
import { StageCard } from "@/components/league/kit";
import { ApiError, get, post } from "@/lib/http";
import { openLink } from "@/lib/links";
import { instagramUrl } from "@/lib/socials";
import { youtubeChannelUrl } from "@/lib/youtube";
import { useAuth } from "@/providers/AuthProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, elevate, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

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
  /** Gece kiti ikon kutusunun tonu (kanalın kimlik rengi). */
  tile: IconTileTone;
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

/** Konu kısayolları — formu bu konuyla açar. */
const TOPICS: { label: string; hint: string; icon: keyof typeof Ionicons.glyphMap; tone: IconTileTone }[] = [
  { label: "Maç talebi", hint: "Rakip, saha, tarih", icon: "football", tone: "pink" },
  { label: "Lige katılım", hint: "Takım kaydı ve kadro", icon: "trophy", tone: "gold" },
  { label: "Saha ve hakem", hint: "Tesis, görevli, saat", icon: "flag", tone: "cyan" },
  { label: "Geri bildirim", hint: "Öneri ve şikâyet", icon: "chatbubble-ellipses", tone: "violet" },
];

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

/**
 * "https://instagram.com/elitlig.ankara/" → "@elitlig.ankara".
 * Sorgu dizesi atılır, baştaki "@" ikilenmez ("tiktok.com/@elitlig" →
 * "@elitlig"); "profile.php?id=…" gibi okunamayan adreslerde yedek etiket.
 */
function handleOf(url: string, fallback: string): string {
  const path = url.split(/[?#]/)[0].replace(/\/+$/, "");
  const last = path.split("/").pop() ?? "";
  if (!last || last.includes(".php") || /^\d+$/.test(last)) return fallback;
  return `@${last.replace(/^@+/, "")}`;
}

const trimmed = (value?: string | null): string => String(value ?? "").trim();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ================================= EKRAN ================================== */

export default function ContactScreen() {
  const scope = useScope();
  const auth = useAuth();
  const toast = useToast();
  const { scrollY, scrollProps } = useHeaderScroll();

  /* `?konu=` — başka ekrandan gelen konu ön dolgusu (ör. Kulübüm'deki
     "Takım kurmak için başvur" adımı). Verilmişse form açık başlar. */
  const params = useLocalSearchParams<{ konu?: string }>();
  const initialSubject = trimmed(Array.isArray(params.konu) ? params.konu[0] : params.konu).slice(0, 120);

  const [formOpen, setFormOpen] = useState(Boolean(initialSubject));
  const [name, setName] = useState(auth.user?.fullName || auth.user?.username || "");
  const [email, setEmail] = useState(auth.user?.email ?? "");
  const [phone, setPhone] = useState(auth.user?.phone ?? "");
  const [subject, setSubject] = useState(initialSubject);
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
        tile: "cyan",
        value: formatPhone(phoneRaw),
        label: "Ara",
        leading: { icon: "call", tone: "info" },
        url: `tel:${digitsOf(phoneRaw)}`,
      });
    }

    const waRaw = trimmed(primary?.whatsapp) || FALLBACK.whatsapp;
    if (waRaw) {
      list.push({
        key: "whatsapp",
        tile: "mint",
        value: formatPhone(waRaw),
        label: "WhatsApp",
        leading: { icon: "logo-whatsapp", tone: "win" },
        url: `https://wa.me/${whatsappNumber(waRaw)}`,
      });
    }

    const mail = trimmed(primary?.email) || FALLBACK.email;
    if (mail) {
      list.push({
        key: "email",
        tile: "violet",
        value: mail,
        label: "E-posta",
        leading: { icon: "mail", tone: "brand" },
        url: `mailto:${mail}`,
      });
    }

    // Sosyal hesaplar: önce şehir kaydı, yoksa şehir adına göre sözlükler.
    const instagram = trimmed(primary?.instagram_url) || instagramUrl(scope.cityLabel) || "";
    if (instagram) {
      list.push({
        key: "instagram",
        tile: "pink",
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
        tile: "red",
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
        tile: "cyan",
        value: handleOf(facebook, "ElitLig Facebook sayfası"),
        label: "Facebook",
        leading: { icon: "logo-facebook", tone: "info" },
        url: facebook,
      });
    }

    const tiktok = trimmed(primary?.tiktok_url);
    if (tiktok) {
      list.push({
        key: "tiktok",
        tile: "neutral",
        value: handleOf(tiktok, "TikTok"),
        label: "TikTok",
        leading: { icon: "logo-tiktok", tone: "neutral" },
        url: tiktok,
      });
    }

    return list;
  }, [primary, scope.cityLabel]);

  const DIRECT_KEYS = ["phone", "whatsapp", "email"];
  const direct = channels.filter((channel) => DIRECT_KEYS.includes(channel.key));
  const social = channels.filter((channel) => !DIRECT_KEYS.includes(channel.key));

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

  const openTopic = useCallback((topic: string) => {
    setSubject(topic);
    setFormOpen(true);
  }, []);

  const cityName = query.data?.city_name ?? scope.cityLabel;

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
        {query.isError ? (
          <ErrorState
            error={query.error}
            onRetry={query.refetch}
            variant="banner"
            style={styles.banner}
          />
        ) : null}

        {/* 1) SAHNE — kimin cevap verdiği + üç hızlı kanal tek blokta. */}
        <Reveal>
          <StageCard style={styles.hero}>
            <View style={styles.heroTop}>
              <Text style={styles.heroOver} {...textScale.badge}>
                {upperTR(cityName ? `${cityName} destek hattı` : "Destek hattı")}
              </Text>
              <View style={styles.heroPill}>
                <View style={styles.heroDot} />
                <Text style={styles.heroPillText} {...textScale.badge}>
                  Aynı gün dönüş
                </Text>
              </View>
            </View>
            <Text style={styles.heroTitle} {...textScale.dense}>
              Size nasıl ulaşalım?
            </Text>
            <Text style={styles.heroBody} {...textScale.long}>
              Maç talebi, lige katılım, saha ve hakem soruları ya da geri bildirim — en hızlı kanaldan yazın.
            </Text>
            <View style={styles.quick}>
              {direct.map((channel, index) => (
                <Reveal key={channel.key} index={index + 1} style={styles.quickCell}>
                  <QuickTile channel={channel} />
                </Reveal>
              ))}
            </View>
          </StageCard>
        </Reveal>

        {/* 2) KONU KISAYOLLARI — formu konusu doldurulmuş açar. */}
        <SectionHeader
          title="Ne hakkında?"
          subtitle="Konuyu seç, form hazır gelsin"
          icon="chatbubbles-outline"
          iconTone="violet"
          inset="flush"
          style={styles.sectionHeader}
        />
        <View style={styles.topics}>
          {TOPICS.map((topic, index) => (
            <Reveal key={topic.label} index={index} limit={6} style={styles.topicCell}>
              <Touchable
                feedback="card"
                haptic="selection"
                onPress={() => openTopic(topic.label)}
                accessibilityRole="button"
                accessibilityLabel={`${topic.label} konusunda yaz`}
                style={styles.topic}
              >
                <IconTile icon={topic.icon} tone={topic.tone} size={32} glow={false} />
                <View style={styles.topicText}>
                  <Text style={styles.topicTitle} numberOfLines={1} {...textScale.dense}>
                    {topic.label}
                  </Text>
                  <Text style={styles.topicSub} numberOfLines={1} {...textScale.dense}>
                    {topic.hint}
                  </Text>
                </View>
              </Touchable>
            </Reveal>
          ))}
        </View>

        {/* 3) BÖLGE SORUMLULARI */}
        <SectionHeader
          title="Bölge sorumluları"
          meta={sections.length ? String(sections.length) : undefined}
          icon="people-outline"
          iconTone="cyan"
          inset="flush"
          style={styles.sectionHeader}
        />
        {query.isLoading ? (
          <SkeletonCard lines={3} />
        ) : sections.length ? (
          <View style={styles.stack}>
            {sections.map((section, index) => (
              <Reveal key={section.id} index={index} limit={4}>
                <ManagerCard section={section} cityName={cityName} />
              </Reveal>
            ))}
          </View>
        ) : (
          <EmptyState
            icon="person-circle-outline"
            title="Bölge sorumlusu tanımlı değil"
            body={`${scope.cityLabel || "Bu şehir"} için yukarıdaki merkez kanallarından bize ulaşabilirsiniz.`}
            variant="inline"
            compact
          />
        )}

        {/* 4) SOSYAL HESAPLAR — 2'li ızgara karolar. */}
        {social.length ? (
          <>
            <SectionHeader
              title="Sosyal medya"
              meta={String(social.length)}
              icon="globe-outline"
              iconTone="pink"
              inset="flush"
              style={styles.sectionHeader}
            />
            <View style={styles.socialGrid}>
              {social.map((channel, index) => (
                <Reveal key={channel.key} index={index} limit={6} style={styles.socialCell}>
                  <SocialTile channel={channel} />
                </Reveal>
              ))}
            </View>
          </>
        ) : null}

        {/* 5) FORM ÇAĞRISI */}
        <View style={styles.formCta}>
          <IconTile icon="create" tone="signature" size={44} />
          <View style={styles.formCtaText}>
            <Text style={styles.formCtaTitle} {...textScale.dense}>
              Bize yazın
            </Text>
            <Text style={styles.formCtaBody} {...textScale.long}>
              Telefonla ulaşamadığınız saatlerde formu bırakın; talebiniz kayda geçer ve bölge yönetimine düşer.
            </Text>
          </View>
        </View>
        <Button
          label="Formu doldur"
          icon="create-outline"
          variant="primary"
          size="lg"
          fullWidth
          haptic="medium"
          onPress={openForm}
          style={styles.formButton}
        />
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

/**
 * Hızlı eylem kutusu — sahnenin üstünde cam karo: degrade ikon kutusu, eylem
 * adı ve değer (numara/adres). Üç kutu yan yana eşit genişliktedir; değer
 * sığmazsa kırpılır, eylem adı kalır.
 */
const QuickTile = React.memo(function QuickTile({ channel }: { channel: Channel }) {
  const handlePress = useCallback(() => {
    void openLink(channel.url);
  }, [channel.url]);
  return (
    <Touchable
      feedback="card"
      haptic="light"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${channel.label}: ${channel.value}`}
      style={styles.quickTile}
    >
      <IconTile icon={channel.leading.icon} tone={channel.tile} size={40} />
      <Text style={styles.quickLabel} numberOfLines={1} {...textScale.dense}>
        {channel.label}
      </Text>
      <Text style={styles.quickValue} numberOfLines={1} {...textScale.dense}>
        {channel.value}
      </Text>
    </Touchable>
  );
});

/** Sosyal hesap karosu: basınca ilgili uygulamayı/tarayıcıyı açar. */
const SocialTile = React.memo(function SocialTile({ channel }: { channel: Channel }) {
  const handlePress = useCallback(() => {
    void openLink(channel.url);
  }, [channel.url]);

  return (
    <Touchable
      feedback="card"
      haptic="light"
      onPress={handlePress}
      accessibilityRole="link"
      accessibilityLabel={`${channel.label}: ${channel.value}`}
      style={styles.social}
    >
      <IconTile icon={channel.leading.icon} tone={channel.tile} size={34} glow={false} />
      <View style={styles.socialText}>
        <Text style={styles.socialValue} numberOfLines={1} {...textScale.dense}>
          {channel.value}
        </Text>
        <Text style={styles.socialLabel} numberOfLines={1} {...textScale.dense}>
          {channel.label}
        </Text>
      </View>
      <Ionicons name="open-outline" size={14} color={colors.textTertiary} />
    </Touchable>
  );
});

/** "Ahmet Yılmaz" / "MERKEZ" → "AY" / "ME" — sorumlu kartının monogramı. */
function monogram(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return upperTR(`${words[0][0]}${words[1][0]}`);
  return upperTR(value.trim().slice(0, 2)) || "EL";
}

/**
 * Şehir yöneticisi (bayilik) kartı: monogram + etiket + şehir başlığı,
 * kanal satırları (ikonlu, sağda değer) ve dipte iki eylem düğmesi.
 * Telefonu olmayan kayıt için düğme çizilmez — çalışmayan düğme kullanıcıyı
 * yanıltır.
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
  const label = trimmed(section.label) || "Bölge sorumlusu";

  const call = useCallback(() => {
    void openLink(`tel:${digitsOf(phone)}`);
  }, [phone]);

  const chat = useCallback(() => {
    void openLink(`https://wa.me/${whatsappNumber(whatsapp)}`);
  }, [whatsapp]);

  const mail = useCallback(() => {
    void openLink(`mailto:${email}`);
  }, [email]);

  const rows: { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; value: string; onPress?: () => void }[] = [];
  if (phone) rows.push({ key: "tel", icon: "call-outline", label: "Telefon", value: formatPhone(phone), onPress: call });
  if (email) rows.push({ key: "mail", icon: "mail-outline", label: "E-posta", value: email, onPress: mail });

  return (
    <View style={styles.manager}>
      <View style={styles.managerHead}>
        <View style={styles.monogram}>
          <Text style={styles.monogramText} {...textScale.badge}>
            {monogram(label)}
          </Text>
        </View>
        <View style={styles.managerTitleBox}>
          <Text style={styles.managerTitle} numberOfLines={1} {...textScale.dense}>
            {label}
          </Text>
          <View style={styles.managerMetaRow}>
            <Ionicons name="location" size={11} color={colors.textTertiary} />
            <Text style={styles.managerMeta} numberOfLines={1} {...textScale.dense}>
              {trimmed(cityName) || "Bölge"}
            </Text>
          </View>
        </View>
        <Badge label="Yetkili" tone="brand" size="xs" icon="shield-checkmark" />
      </View>

      {rows.map((row) => (
        <Touchable
          key={row.key}
          feedback="row"
          haptic="light"
          onPress={row.onPress}
          accessibilityRole="button"
          accessibilityLabel={`${row.label}: ${row.value}`}
          style={styles.kv}
        >
          <Ionicons name={row.icon} size={16} color={colors.textTertiary} />
          <Text style={styles.kvLabel} {...textScale.dense}>
            {row.label}
          </Text>
          <Text style={styles.kvValue} numberOfLines={1} {...textScale.dense}>
            {row.value}
          </Text>
        </Touchable>
      ))}

      {address ? (
        <View style={styles.addressRow}>
          <Ionicons name="navigate-outline" size={16} color={colors.textTertiary} />
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

      {phone || whatsapp ? (
        <View style={styles.managerActions}>
          {phone ? (
            <Button label="Ara" icon="call" variant="secondary" size="sm" onPress={call} style={styles.managerButton} />
          ) : null}
          {whatsapp ? (
            <Button
              label="WhatsApp"
              icon="logo-whatsapp"
              variant="secondary"
              size="sm"
              onPress={chat}
              style={styles.managerButton}
            />
          ) : null}
        </View>
      ) : null}
    </View>
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
    paddingTop: space.sm,
    paddingBottom: space.giant,
  },
  banner: {
    marginBottom: space.sm,
  },
  sectionHeader: {
    marginTop: space.xl,
    marginBottom: space.sm,
  },
  stack: {
    gap: space.sm,
  },

  /* — Sahne — */
  hero: {
    padding: space.lg,
    gap: space.sm,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  heroOver: {
    ...type.overline,
    color: colors.brandOnDark,
    flexShrink: 1,
  },
  heroPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.win,
  },
  heroPillText: {
    ...type.micro,
    color: colors.onDark,
  },
  heroTitle: {
    ...type.display,
    color: colors.onDark,
  },
  heroBody: {
    ...type.bodySm,
    color: colors.onDarkMuted,
  },
  quick: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.sm,
  },
  quickCell: {
    flex: 1,
  },
  quickTile: {
    alignItems: "center",
    gap: space.xs,
    paddingVertical: space.md,
    paddingHorizontal: space.s,
    borderRadius: radius.lg,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  quickLabel: {
    ...type.h4,
    color: colors.onDark,
    marginTop: space.xxs,
  },
  quickValue: {
    ...type.caption,
    color: colors.onDarkMuted,
  },

  /* — Konu kısayolları — */
  topics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
  },
  topicCell: {
    width: "48.5%",
    flexGrow: 1,
  },
  topic: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.m,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  topicText: {
    flex: 1,
    minWidth: 0,
  },
  topicTitle: {
    ...type.h4,
    color: colors.textPrimary,
  },
  topicSub: {
    ...type.caption,
    color: colors.textTertiary,
  },

  /* — Sorumlu kartı — */
  manager: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.md,
    overflow: "hidden",
    ...elevate(1),
  },
  managerHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingBottom: space.sm,
  },
  monogram: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandDim,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
  },
  monogramText: {
    ...type.label,
    color: colors.brandAccent,
  },
  managerTitleBox: {
    flex: 1,
    minWidth: 0,
    gap: space.xxs,
  },
  managerTitle: {
    ...type.h3,
    color: colors.textPrimary,
  },
  managerMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  managerMeta: {
    ...type.caption,
    color: colors.textTertiary,
  },
  kv: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 44,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  kvLabel: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  kvValue: {
    ...type.h4,
    color: colors.textPrimary,
    flex: 1,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  managerActions: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.sm,
  },
  managerButton: {
    flex: 1,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
    paddingTop: space.m,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  address: {
    ...type.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },
  cardBody: {
    ...type.bodySm,
    color: colors.textSecondary,
  },

  /* — Sosyal ızgara — */
  socialGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
  },
  socialCell: {
    width: "48.5%",
    flexGrow: 1,
  },
  social: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.m,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  socialText: {
    flex: 1,
    minWidth: 0,
  },
  socialValue: {
    ...type.h4,
    color: colors.textPrimary,
  },
  socialLabel: {
    ...type.caption,
    color: colors.textTertiary,
  },

  /* — Form çağrısı — */
  formCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: space.xxl,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.brandDim,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
  },
  formCtaText: {
    flex: 1,
    gap: space.xxs,
  },
  formCtaTitle: {
    ...type.h3,
    color: colors.textPrimary,
  },
  formCtaBody: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  formButton: {
    marginTop: space.md,
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
