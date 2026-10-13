/**
 * Hesabım — kimlik, üyelik bilgileri ve hesap eylemleri.
 *
 * NE: eski `app/(tabs)/profile.tsx` ekranının taşınmış ve yenilenmiş hâli.
 * Profil sekmesindeki kimlik kartına dokununca buraya inilir; burada
 * `/api/panel/me` özetiyle üyenin kendi verileri (oyuncu kartı, sezon
 * istatistikleri, bekleyen talepler) ve hesap eylemleri (şifre, çıkış) yer alır.
 *
 * NEDEN SEKMEDEN ÇIKTI: eski ekran hem hesap sayfası hem de teklif/sözleşme/
 * ceza kapılarının listesiydi; o kapılar artık Profil sekmesindeki KARİYERİM
 * grubunda. Burada YALNIZ "ben kimim ve hesabımı nasıl yönetirim" kalır, o
 * yüzden yığında (stack) tek seferlik ziyaret edilen bir detay ekranıdır.
 *
 * NEDEN 403 EKRANI BOŞALTMAZ: panel rolü olmayan hesaplarda sunucu
 * `PANEL_FORBIDDEN` döndürür. Bu bir hata değil, o hesabın panel verisi
 * olmamasıdır; kimlik bilgileri oturumdan (AuthProvider) geldiği için ekran
 * yine dolu görünür, yalnız panel blokları çizilmez.
 *
 * ŞİFRE UYGULAMA İÇİNDE: "Güvenlik ve gizlilik" grubunun ilk satırı
 * /sifre-degistir ekranını açar (PATCH /api/users/me/password).
 *
 * DÜZEN (Arena "detay" kalıbı): sahne başlık + kimlik (avatar, ad, roller) ve
 * oyuncuysa sezonun dört sayısı sahnenin dibinde → kâğıtta önce BEKLEYEN
 * talepler (yapılacak iş), sonra bilgiler, güvenlik, oyuncu profili, sezon
 * ayrıntısı ve en altta oturum (çıkış + hesabı sil — mağaza kapısı).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo } from "react";
import {
  Alert,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
  type SectionListRenderItemInfo,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Avatar,
  Badge,
  EmptyState,
  ErrorState,
  KeyValueRow,
  ListRow,
  ScreenHeader,
  SectionHeader,
  SkeletonCard,
  SkeletonListRow,
  Surface,
  TeamLogo,
  Touchable,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
  useToast,
  type Tone,
} from "@/components/ui";
import { ApiError } from "@/lib/http";
import { getPanelMe, type PanelPendingChange } from "@/lib/api/panel";
import { formatDateShort, mediaUrl } from "@/lib/format";
import { openLink } from "@/lib/links";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, ratingLabel, space, textScale, type, upperTR } from "@/theme";

/* ============================ SABİTLER / TİPLER ============================ */

/** Üyelik, şifre sıfırlama ve talep akışlarının yaşadığı web panel. */
const SITE_URL = "https://elitlig.com";
/** App Store 5.1.1(i): gizlilik politikası uygulama içinden erişilebilir olmalı. */
const PRIVACY_URL = "https://elitlig.com/gizlilik-politikasi";

/** Takım başkanı sayılan profil tipleri (sunucudaki `profile_type` değerleri). */
const PRESIDENT_PROFILES = new Set(["takim_baskani", "double"]);

/**
 * Rol kodları → Türkçe etiket. Sunucu rol adlarını slug olarak gönderir;
 * tanınmayan bir rol gelirse ham değeri gösteririz (yeni rol eklenince ekran
 * boş kalmasın).
 */
const ROLE_LABELS: Record<string, string> = {
  admin: "Yönetici",
  editor: "Editör",
  il_yoneticisi: "İl Yöneticisi",
  lig_yoneticisi: "Lig Yöneticisi",
  mac_yoneticisi: "Maç Yöneticisi",
  disiplin_kurulu: "Disiplin Kurulu",
  sosyal_medya_yoneticisi: "Sosyal Medya Yöneticisi",
  uye: "Üye",
  user: "Üye",
};

type AccountAction =
  | { kind: "route"; route: string }
  | { kind: "link"; url: string }
  | { kind: "signOut" };

/** Ekrandaki üç satır türü tek listede taşınır (SectionList tek veri yolu). */
type AccountRow =
  | { kind: "kv"; key: string; label: string; value: string; numeric?: boolean }
  | {
      kind: "action";
      key: string;
      icon: keyof typeof Ionicons.glyphMap;
      title: string;
      subtitle?: string;
      tone?: Tone;
      destructive?: boolean;
      action: AccountAction;
    }
  | { kind: "pending"; key: string; change: PanelPendingChange };

interface AccountSection {
  key: string;
  title?: string;
  meta?: string;
  /** Grubun altında küçük açıklama. */
  footnote?: string;
  data: AccountRow[];
}

/* ============================== SAF YARDIMCILAR ============================= */

/** Grup içi konum — ListRow/KeyValueRow köşe ve ayracını buradan alır. */
function rowPosition(index: number, total: number): "single" | "first" | "middle" | "last" {
  if (total <= 1) return "single";
  if (index === 0) return "first";
  if (index === total - 1) return "last";
  return "middle";
}

/** Boş/eksik alanlar tabloyu bozmasın diye tek tire ile gösterilir. */
function orDash(value?: string | number | null): string {
  const text = String(value ?? "").trim();
  return text.length ? text : "—";
}

function roleLabel(role?: string | null): string {
  const key = String(role ?? "").trim();
  if (!key) return "—";
  return ROLE_LABELS[key] ?? key;
}

/** Talep türü → başlık, açıklama ve ikon (sunucu serbest metin göndermiyor). */
function pendingLabel(changeType: string, targetType: string): {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
} {
  const t = changeType.toLowerCase();
  const tt = targetType.toLowerCase();
  if (t.includes("transfer")) {
    return { icon: "swap-horizontal", title: "Transfer talebi", description: "Takım değişikliği onay bekliyor" };
  }
  if (t.includes("contract") || tt.includes("contract")) {
    return { icon: "document-text", title: "Sözleşme talebi", description: "Sözleşme güncellemesi onay bekliyor" };
  }
  if (t.includes("squad") || tt.includes("squad")) {
    return { icon: "people", title: "Kadro değişikliği", description: "Kadro güncellemesi onay bekliyor" };
  }
  if (t.includes("photo")) {
    return { icon: "camera", title: "Fotoğraf talebi", description: "Profil fotoğrafı onay bekliyor" };
  }
  return { icon: "hourglass", title: "Bekleyen talep", description: "Onay bekleniyor" };
}

/** Talep türünün ilgili ekranı; yoksa satır yalnız bilgi verir. */
function pendingRoute(changeType: string): string | null {
  const t = changeType.toLowerCase();
  if (t.includes("transfer")) return "/tekliflerim";
  if (t.includes("contract")) return "/sozlesmelerim";
  if (t.includes("penalty") || t.includes("ceza")) return "/cezalarim";
  // `/maclarim` rotası kaldırıldı; içerik Oyuncu Paneli'nin Maçlarım segmentine taşındı.
  if (t.includes("squad") || t.includes("kadro")) return "/oyuncum?tab=maclarim";
  return null;
}

function statusTone(status: string): Tone {
  if (status === "approved") return "win";
  if (status === "rejected") return "danger";
  return "warn";
}

function statusLabel(status: string): string {
  if (status === "approved") return "ONAYLANDI";
  if (status === "rejected") return "REDDEDİLDİ";
  if (status === "pending") return "BEKLİYOR";
  return upperTR(status);
}

/* ================================= EKRAN ================================== */

export default function AccountScreen() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { scrollY, scrollProps } = useHeaderScroll();

  const user = auth.user;

  /** Anahtar `["panel","me"]` — Profil sekmesiyle AYNI önbellek. */
  const meQuery = useQuery({
    queryKey: ["panel", "me"],
    queryFn: getPanelMe,
    enabled: Boolean(user),
    staleTime: 60_000,
    retry: false,
  });

  const refresh = useRefresh(meQuery.refetch, { refreshing: meQuery.isRefetching });
  /**
   * `refresh.control` hazır bir düğüm verir ama tipi `ReactElement<unknown>`;
   * RN'in `refreshControl` prop'u `ReactElement<RefreshControlProps>` bekler.
   * Aynı davranış (en az 450 ms görünürlük + seçim titreşimi) kancanın
   * `refreshing`/`onRefresh` alanlarıyla ve ortak renk sözlüğüyle kurulur.
   */
  const refreshControl = (
    <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} />
  );

  const me = meQuery.data;
  const player = me?.player ?? null;
  const playerTeam = me?.playerTeam ?? me?.team ?? null;
  const teamName = playerTeam?.team_name ?? user?.teamName ?? null;

  /** Panel verisi olmayan hesapta 403 gelir; bu bir hata ekranı sebebi değil. */
  const forbidden = meQuery.error instanceof ApiError && meQuery.error.status === 403;
  const blockingError = meQuery.isError && !forbidden ? meQuery.error : null;

  const isPresident = Boolean(
    user && (user.managed_team_id || PRESIDENT_PROFILES.has(String(user.profile_type ?? "")))
  );
  const isPlayer = Boolean(user?.player_id);

  /* ------------------------------ EYLEMLER ------------------------------- */

  const openSignIn = useCallback(() => router.push("/giris"), [router]);

  const leaveScreen = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [router]);

  const confirmSignOut = useCallback(() => {
    Alert.alert("Çıkış yap", "Oturumu kapatmak istediğine emin misin?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Çıkış yap",
        style: "destructive",
        onPress: () => {
          void auth.signOut().then(() => {
            toast.show({ message: "Çıkış yapıldı.", tone: "neutral" });
            leaveScreen();
          });
        },
      },
    ]);
  }, [auth, leaveScreen, toast]);

  const onAction = useCallback(
    (action: AccountAction) => {
      switch (action.kind) {
        case "route":
          router.push(action.route as never);
          return;
        case "link":
          void openLink(action.url);
          return;
        case "signOut":
          confirmSignOut();
      }
    },
    [confirmSignOut, router]
  );

  const onPending = useCallback(
    (change: PanelPendingChange) => {
      const route = pendingRoute(change.type);
      if (route) {
        router.push(route as never);
        return;
      }
      const label = pendingLabel(change.type, change.target_type);
      Alert.alert(
        label.title,
        `${label.description}. Onaylandığında bildirim alacaksın.`,
        [{ text: "Tamam" }]
      );
    },
    [router]
  );

  const openPlayer = useCallback(() => {
    if (player) router.push(`/oyuncu/${player.id}`);
  }, [player, router]);

  /* ------------------------------ SATIRLAR ------------------------------- */

  const sections = useMemo<AccountSection[]>(() => {
    if (!user) return [];
    const result: AccountSection[] = [];

    /* 1 — Bekleyen talepler (yapılacak iş — en üstte): onay bekleyen her kayıt tek satır. */
    if (me?.pendingChanges.length) {
      result.push({
        key: "talepler",
        title: "Bekleyen taleplerim",
        meta: String(me.pendingChanges.length),
        data: me.pendingChanges.map((change) => ({
          kind: "pending" as const,
          key: `talep-${change.id}`,
          change,
        })),
      });
    }

    /* 2 — Hesap bilgileri: oturumdan gelir, panel 403 olsa da doludur. */
    result.push({
      key: "bilgiler",
      title: "Hesap bilgilerim",
      data: [
        { kind: "kv", key: "ad", label: "Ad Soyad", value: orDash(user.fullName) },
        { kind: "kv", key: "kullanici", label: "Kullanıcı adı", value: `@${user.username}` },
        { kind: "kv", key: "eposta", label: "E-posta", value: orDash(user.email ?? player?.email) },
        { kind: "kv", key: "telefon", label: "Telefon", value: orDash(user.phone ?? player?.phone) },
        { kind: "kv", key: "sehir", label: "Şehir", value: orDash(user.city ?? player?.city) },
        { kind: "kv", key: "takim", label: "Takım", value: orDash(teamName) },
        { kind: "kv", key: "rol", label: "Hesap türü", value: roleLabel(user.role) },
      ],
      footnote: "Bilgilerini değiştirmek için lig yönetimiyle iletişime geç.",
    });

    /* 3 — Güvenlik ve gizlilik: şifre ve engeller en üstte. */
    result.push({
      key: "guvenlik",
      title: "Güvenlik ve gizlilik",
      data: [
        {
          kind: "action",
          key: "sifre",
          icon: "key",
          title: "Şifre değiştir",
          subtitle: "Mevcut şifrenle doğrulanır",
          tone: "brand",
          action: { kind: "route", route: "/sifre-degistir" },
        },
        /* Engel listesi: mağazalar (App Store 1.2) engellemenin bulunabilir ve
           geri alınabilir olmasını ister; sohbet ayarlarının yanında burada da kapı var. */
        {
          kind: "action",
          key: "engellenenler",
          icon: "ban",
          title: "Engellediğim üyeler",
          subtitle: "Sohbette engellediklerin; engeli buradan kaldır",
          action: { kind: "route", route: "/engellenenler" },
        },
        {
          kind: "action",
          key: "gizlilik",
          icon: "shield-checkmark",
          title: "Gizlilik Politikası",
          subtitle: "Hangi verinin neden tutulduğu",
          action: { kind: "link", url: PRIVACY_URL },
        },
        {
          kind: "action",
          key: "kurallar",
          icon: "book",
          title: "Lig Kuralları",
          subtitle: "Sohbet ve saha kuralları",
          action: { kind: "route", route: "/kurallar" },
        },
      ],
    });

    /* 4 — Oyuncu profili ve takım: web panelinde süren talepler. */
    const profile: AccountRow[] = [];
    if (player) {
      profile.push({
        kind: "action",
        key: "foto",
        icon: "camera",
        title: "Profil fotoğrafı talebi",
        subtitle: "elitlig.com panelinde; yönetim onayından geçer",
        action: { kind: "link", url: SITE_URL },
      });
    } else {
      profile.push({
        kind: "action",
        key: "oyuncu-bagla",
        icon: "person-add",
        title: "Oyuncu profili bağla",
        subtitle: "Sahiplenme talebi elitlig.com panelinde",
        action: { kind: "link", url: SITE_URL },
      });
    }
    if (me?.team) {
      profile.push({
        kind: "action",
        key: "yonetilen-takim",
        icon: "shield",
        title: me.team.team_name,
        subtitle: "Yönettiğin takım",
        tone: "brand",
        action: { kind: "route", route: `/takim/${me.team.id}` },
      });
    }
    result.push({ key: "profil", title: "Oyuncu profili", data: profile });

    /* 5 — Sezon detayı: başlıca dört sayı sahnede, gerisi burada. */
    if (me?.stats) {
      result.push({
        key: "sezon",
        title: "Sezon detayı",
        meta: me.stats.season ?? undefined,
        data: [
          {
            kind: "kv",
            key: "ilk11",
            label: "İlk kadro başlangıcı",
            value: String(me.stats.starts ?? 0),
            numeric: true,
          },
          {
            kind: "kv",
            key: "sari",
            label: "Sarı kart",
            value: String(me.stats.yellow_cards ?? 0),
            numeric: true,
          },
          {
            kind: "kv",
            key: "kirmizi",
            label: "Kırmızı kart",
            value: String(me.stats.red_cards ?? 0),
            numeric: true,
          },
        ],
      });
    }

    /* 6 — Oturum ve hesap
       Hesap silme bilinçli olarak "Hesap ve güvenlik" grubunda değil en altta,
       çıkışın yanında durur: mağazaların istediği kapı burada aranır ve
       gündelik ayarların arasında kaybolmaz. Sonuçları ayrı ekran anlatır
       (app/hesap-sil.tsx); buradaki satır yalnız kapıdır. */
    result.push({
      key: "oturum",
      data: [
        {
          kind: "action",
          key: "cikis",
          icon: "log-out",
          title: "Çıkış yap",
          tone: "danger",
          destructive: true,
          action: { kind: "signOut" },
        },
        {
          kind: "action",
          key: "hesap-sil",
          icon: "trash",
          title: "Hesabı sil",
          subtitle: "Kalıcı olarak silinir, geri alınamaz",
          tone: "danger",
          destructive: true,
          action: { kind: "route", route: "/hesap-sil" },
        },
      ],
    });

    return result;
  }, [me, player, teamName, user]);

  /* ------------------------------- ÇİZİM --------------------------------- */

  const renderItem = useCallback(
    ({ item, index, section }: SectionListRenderItemInfo<AccountRow, AccountSection>) => {
      const position = rowPosition(index, section.data.length);
      if (item.kind === "kv") {
        return (
          <KeyValueRow
            label={item.label}
            value={item.value}
            numeric={item.numeric}
            position={position}
          />
        );
      }
      if (item.kind === "pending") {
        return <PendingRow row={item} position={position} onPress={onPending} />;
      }
      return <ActionRow row={item} position={position} onPress={onAction} />;
    },
    [onAction, onPending]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: AccountSection }) =>
      section.title ? (
        <SectionHeader title={section.title} meta={section.meta} style={styles.flushHeader} />
      ) : null,
    []
  );

  const renderSectionFooter = useCallback(
    ({ section }: { section: AccountSection }) => (
      <View style={styles.sectionGap}>
        {section.footnote ? (
          <Text style={styles.footnote} {...textScale.long}>
            {section.footnote}
          </Text>
        ) : null}
      </View>
    ),
    []
  );

  /** Sahne kimliği — başlığın `hero` yuvasında; kaydırınca kapanır. */
  const hero = user ? (
    <IdentityHero
      name={user.fullName ?? user.username}
      username={user.username}
      avatar={mediaUrl(player?.player_img)}
      meta={[player?.player_position, teamName].filter(Boolean).join(" · ")}
      teamName={teamName}
      teamLogo={mediaUrl(playerTeam?.logo)}
      isManagement={auth.isManagement}
      isPresident={isPresident}
      isPlayer={isPlayer}
      onPress={player ? openPlayer : undefined}
      stats={
        me?.stats
          ? {
              matches: me.stats.matches ?? 0,
              goals: me.stats.goals ?? 0,
              assists: me.stats.assists ?? 0,
              rating: me.stats.rating,
            }
          : null
      }
    />
  ) : undefined;

  const listHeader = useMemo(() => {
    if (!user) return null;
    return (
      <View style={styles.header}>
        {!player && me?.onboarding?.player ? (
          <Surface level={1} radius="lg" style={styles.onboard}>
            <Text style={styles.onboardTitle} {...textScale.dense}>
              {me.onboarding.player.title ?? "Oyuncu profilin henüz bağlı değil"}
            </Text>
            <Text style={styles.onboardBody} {...textScale.long}>
              {me.onboarding.player.description ??
                "Profil oluşturma ve sahiplenme talepleri şimdilik web panelinden yapılıyor."}
            </Text>
          </Surface>
        ) : null}

        {forbidden ? (
          <Text style={styles.note} {...textScale.long}>
            Bu hesabın oyuncu paneli yok; yalnız üyelik bilgilerin gösteriliyor.
          </Text>
        ) : null}

        {/* Panel verisi gelmediyse ekran boşaltılmaz: kimlik bilgileri
            oturumdan geliyor, hata yalnız bir şerit olarak duyurulur. */}
        {blockingError ? (
          <ErrorState error={blockingError} onRetry={meQuery.refetch} variant="banner" />
        ) : null}
      </View>
    );
  }, [blockingError, forbidden, me, meQuery.refetch, player, user]);

  /* Misafir: yönlendirme yerine açık bir çağrı — geri tuşu döngüsü olmaz. */
  if (!auth.initializing && !user) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScreenHeader title="Hesabım" back />
        <EmptyState
          icon="person-circle-outline"
          title="Giriş yapmalısın"
          body="Hesap bilgilerini görmek, sözleşme ve tekliflerini yönetmek için giriş yap."
          action={{ label: "Giriş yap", onPress: openSignIn }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader title="Hesabım" back scrollY={scrollY} variant="stage" hero={hero} />

      {auth.initializing || (meQuery.isLoading && !me) ? (
        <View style={styles.loading}>
          <SkeletonCard lines={2} />
          <SkeletonListRow count={6} />
        </View>
      ) : (
        <SectionList
          {...scrollProps}
          sections={sections}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          renderSectionFooter={renderSectionFooter}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.content}
          refreshControl={refreshControl}
          initialNumToRender={16}
        />
      )}
    </SafeAreaView>
  );
}

/* ============================== ALT BİLEŞENLER ============================= */

/**
 * Kimlik — sahnede (grafit) avatar, ad, kullanıcı adı, bağlam ve rol
 * pulları; oyuncuysa sezonun dört sayısı dipte. Oyuncu profili bağlıysa
 * kimlik satırı basılabilir ve herkese açık oyuncu sayfasına gider; değilse
 * düz kalır (basılabilir görünüp tepkisiz kalmasından iyidir).
 */
const IdentityHero = React.memo(function IdentityHero({
  name,
  username,
  avatar,
  meta,
  teamName,
  teamLogo,
  isManagement,
  isPresident,
  isPlayer,
  onPress,
  stats,
}: {
  name: string;
  username: string;
  avatar: string | null;
  meta: string;
  teamName: string | null;
  teamLogo: string | null;
  isManagement: boolean;
  isPresident: boolean;
  isPlayer: boolean;
  onPress?: () => void;
  stats: { matches: number; goals: number; assists: number; rating: number | null } | null;
}) {
  const roles = useMemo(() => {
    const list: { key: string; label: string }[] = [];
    if (isManagement) list.push({ key: "yonetim", label: "Yönetim" });
    if (isPresident) list.push({ key: "baskan", label: "Başkan" });
    if (isPlayer) list.push({ key: "oyuncu", label: "Oyuncu" });
    return list;
  }, [isManagement, isPlayer, isPresident]);

  const body = (
    <>
      <Avatar name={name} image={avatar} size={64} ring="brand" />

      <View style={styles.heroBody}>
        <Text style={styles.heroName} numberOfLines={1} {...textScale.dense}>
          {name}
        </Text>
        <Text style={styles.heroHandle} numberOfLines={1} {...textScale.dense}>
          @{username}
          {meta ? ` · ${meta}` : ""}
        </Text>
        {roles.length ? (
          <View style={styles.roleRow}>
            {roles.map((role) => (
              <View key={role.key} style={styles.rolePill}>
                <Text style={styles.roleText} {...textScale.badge}>
                  {upperTR(role.label)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {teamName ? <TeamLogo name={teamName} logo={teamLogo} size={layout.crestLg} onDark /> : null}
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.onDarkMuted} /> : null}
    </>
  );

  return (
    <View style={styles.heroWrap}>
      {onPress ? (
        <Touchable
          feedback="card"
          haptic="selection"
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${name}, oyuncu profilini aç`}
          style={styles.hero}
        >
          {body}
        </Touchable>
      ) : (
        <View style={styles.hero}>{body}</View>
      )}

      {stats ? (
        <View style={styles.stats}>
          <StatCell label="Maç" value={String(stats.matches)} />
          <View style={styles.statDivider} />
          <StatCell label="Gol" value={String(stats.goals)} />
          <View style={styles.statDivider} />
          <StatCell label="Asist" value={String(stats.assists)} />
          <View style={styles.statDivider} />
          <StatCell label="Reyting" value={ratingLabel(stats.rating)} highlight />
        </View>
      ) : null}
    </View>
  );
});

const StatCell = React.memo(function StatCell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, highlight ? styles.statValueHighlight : null]} {...textScale.badge}>
        {value}
      </Text>
      <Text style={styles.statLabel} {...textScale.badge}>
        {upperTR(label)}
      </Text>
    </View>
  );
});

/** Hesap eylemi satırı. */
const ActionRow = React.memo(function ActionRow({
  row,
  position,
  onPress,
}: {
  row: Extract<AccountRow, { kind: "action" }>;
  position: "single" | "first" | "middle" | "last";
  onPress: (action: AccountAction) => void;
}) {
  const handlePress = useCallback(() => onPress(row.action), [onPress, row.action]);
  const leading = useMemo(() => ({ icon: row.icon, tone: row.tone }), [row.icon, row.tone]);

  return (
    <ListRow
      leading={leading}
      title={row.title}
      subtitle={row.subtitle}
      destructive={row.destructive}
      position={position}
      onPress={handlePress}
    />
  );
});

/** Bekleyen talep satırı — durumu rozetle okunur. */
const PendingRow = React.memo(function PendingRow({
  row,
  position,
  onPress,
}: {
  row: Extract<AccountRow, { kind: "pending" }>;
  position: "single" | "first" | "middle" | "last";
  onPress: (change: PanelPendingChange) => void;
}) {
  const handlePress = useCallback(() => onPress(row.change), [onPress, row.change]);
  const label = useMemo(
    () => pendingLabel(row.change.type, row.change.target_type),
    [row.change.target_type, row.change.type]
  );
  const leading = useMemo(() => ({ icon: label.icon, tone: "warn" as Tone }), [label.icon]);

  return (
    <ListRow
      leading={leading}
      title={label.title}
      subtitle={`${label.description} · ${formatDateShort(row.change.created_at)}`}
      badge={
        <Badge
          label={statusLabel(row.change.status)}
          tone={statusTone(row.change.status)}
          size="xs"
        />
      }
      chevron={false}
      position={position}
      onPress={handlePress}
    />
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
  loading: {
    paddingHorizontal: layout.screenPadding,
    gap: space.md,
  },
  header: {
    gap: space.sm,
    paddingTop: space.xs,
  },
  sectionGap: {
    height: layout.sectionGap,
  },

  flushHeader: {
    paddingHorizontal: 0,
  },
  footnote: {
    ...type.caption,
    color: colors.textTertiary,
    paddingHorizontal: space.xs,
    paddingTop: space.sm,
  },

  /* Sahne kimliği */
  heroWrap: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.lg,
    gap: space.md,
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  heroBody: {
    flex: 1,
    gap: 2,
  },
  heroName: {
    ...type.display,
    color: colors.onDark,
  },
  heroHandle: {
    ...type.bodySm,
    color: colors.onDarkMuted,
  },
  roleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
    marginTop: space.s,
  },
  rolePill: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  roleText: {
    ...type.micro,
    color: colors.brandOnDark,
  },

  /* Sezon şeridi — sahnenin dibinde */
  stats: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.m,
    borderRadius: radius.md,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  statCell: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statDivider: {
    width: hairline,
    alignSelf: "stretch",
    backgroundColor: colors.borderOnDark,
  },
  statValue: {
    ...type.metricSm,
    color: colors.onDark,
  },
  statValueHighlight: {
    color: colors.brandOnDark,
  },
  statLabel: {
    ...type.overline,
    color: colors.onDarkMuted,
  },

  /* Oyuncu profili bağlı değil kutusu */
  onboard: {
    padding: space.md,
    gap: space.xs,
  },
  onboardTitle: {
    ...type.h3,
    color: colors.textPrimary,
  },
  onboardBody: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  note: {
    ...type.caption,
    color: colors.textTertiary,
    paddingHorizontal: space.xs,
  },
});
