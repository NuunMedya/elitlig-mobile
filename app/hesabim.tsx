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
 * NEDEN ŞİFRE DEĞİŞTİRME BURADA YOK: sunucuda mobil için şifre değiştirme ucu
 * yok (bkz. lib/api/auth.ts — yalnız login/verify/logout). Uydurma bir form
 * yerine kullanıcı elitlig.com'a yönlendirilir.
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
import { colors, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

/* ============================ SABİTLER / TİPLER ============================ */

/** Üyelik, şifre sıfırlama ve talep akışlarının yaşadığı web panel. */
const SITE_URL = "https://elitlig.com";

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
          router.push(action.route);
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
        router.push(route);
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

    /* 1 — Hesap bilgileri: oturumdan gelir, panel 403 olsa da doludur. */
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
    });

    /* 2 — Sezon detayı: başlıca dört sayı hero'da, gerisi burada. */
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

    /* 3 — Bekleyen talepler: onay bekleyen her kayıt tek satır. */
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

    /* 4 — Hesap ve güvenlik */
    const actions: AccountRow[] = [
      {
        kind: "action",
        key: "sifre",
        icon: "key",
        title: "Şifre değiştir",
        subtitle: "elitlig.com üzerinden yapılır",
        action: { kind: "link", url: SITE_URL },
      },
      {
        kind: "action",
        key: "bildirim",
        icon: "notifications-circle",
        title: "Bildirim tercihleri",
        subtitle: "Hangi bildirimleri alacağını seç",
        action: { kind: "route", route: "/bildirim-tercihleri" },
      },
    ];
    if (player) {
      actions.push({
        kind: "action",
        key: "foto",
        icon: "camera",
        title: "Profil fotoğrafı talebi",
        subtitle: "Yeni fotoğraf yönetim onayından geçer",
        action: { kind: "link", url: SITE_URL },
      });
    } else {
      actions.push({
        kind: "action",
        key: "oyuncu-bagla",
        icon: "person-add",
        title: "Oyuncu profili bağla",
        subtitle: "Sahiplenme talebi web panelinden açılır",
        action: { kind: "link", url: SITE_URL },
      });
    }
    if (me?.team) {
      actions.push({
        kind: "action",
        key: "yonetilen-takim",
        icon: "shield",
        title: me.team.team_name,
        subtitle: "Yönettiğin takım",
        tone: "brand",
        action: { kind: "route", route: `/takim/${me.team.id}` },
      });
    }
    result.push({ key: "guvenlik", title: "Hesap ve güvenlik", data: actions });

    /* 5 — Oturum */
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
      section.title ? <SectionHeader title={section.title} meta={section.meta} /> : null,
    []
  );

  const renderSectionFooter = useCallback(() => <View style={styles.sectionGap} />, []);

  const listHeader = useMemo(() => {
    if (!user) return null;
    return (
      <View style={styles.header}>
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
        />

        {me?.stats ? (
          <StatStrip
            matches={me.stats.matches ?? 0}
            goals={me.stats.goals ?? 0}
            assists={me.stats.assists ?? 0}
            rating={me.stats.rating}
          />
        ) : null}

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
  }, [
    auth.isManagement,
    blockingError,
    forbidden,
    isPlayer,
    isPresident,
    me,
    meQuery.refetch,
    openPlayer,
    player,
    playerTeam?.logo,
    teamName,
    user,
  ]);

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
      <ScreenHeader
        title="Hesabım"
        subtitle={user?.fullName ?? user?.username}
        back
        scrollY={scrollY}
      />

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
 * Kimlik hero'su — avatar, ad, kullanıcı adı, rol rozetleri ve takım amblemi.
 * Oyuncu profili bağlıysa kart basılabilir olur ve herkese açık oyuncu
 * sayfasına gider; değilse düz bir yüzeydir (basınca hiçbir şey olmaması,
 * basılabilir görünüp tepkisiz kalmasından iyidir).
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
}) {
  const roles = useMemo(() => {
    const list: { key: string; label: string; tone: Tone }[] = [];
    if (isManagement) list.push({ key: "yonetim", label: "YÖNETİM", tone: "brand" });
    if (isPresident) list.push({ key: "baskan", label: "BAŞKAN", tone: "info" });
    if (isPlayer) list.push({ key: "oyuncu", label: "OYUNCU", tone: "win" });
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
        </Text>
        {meta ? (
          <Text style={styles.heroMeta} numberOfLines={1} {...textScale.dense}>
            {meta}
          </Text>
        ) : null}
        {roles.length ? (
          <View style={styles.roleRow}>
            {roles.map((role) => (
              <Badge key={role.key} label={role.label} tone={role.tone} size="xs" />
            ))}
          </View>
        ) : null}
      </View>

      {teamName ? <TeamLogo name={teamName} logo={teamLogo} size={layout.crestLg} /> : null}
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} /> : null}
    </>
  );

  if (!onPress) return <View style={styles.hero}>{body}</View>;

  return (
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
  );
});

/** Sezonun dört başlık sayısı — tabular rakamlarla tek şerit. */
const StatStrip = React.memo(function StatStrip({
  matches,
  goals,
  assists,
  rating,
}: {
  matches: number;
  goals: number;
  assists: number;
  rating: number | null;
}) {
  return (
    <Surface level={1} radius="lg" style={styles.stats}>
      <StatCell label="MAÇ" value={String(matches)} />
      <View style={styles.statDivider} />
      <StatCell label="GOL" value={String(goals)} />
      <View style={styles.statDivider} />
      <StatCell label="ASİST" value={String(assists)} />
      <View style={styles.statDivider} />
      <StatCell label="REYTİNG" value={rating != null ? rating.toFixed(1) : "—"} highlight />
    </Surface>
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
      <Text
        style={[styles.statValue, highlight ? styles.statValueHighlight : null]}
        {...textScale.badge}
      >
        {value}
      </Text>
      <Text style={styles.statLabel} {...textScale.badge}>
        {label}
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
    paddingTop: space.sm,
    paddingBottom: space.sm,
  },
  sectionGap: {
    height: layout.sectionGap,
  },

  /* Kimlik hero'su */
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  heroBody: {
    flex: 1,
    gap: 2,
  },
  heroName: {
    ...type.h1,
    color: colors.textPrimary,
  },
  heroHandle: {
    ...type.caption,
    color: colors.textSecondary,
  },
  heroMeta: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  roleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
    marginTop: space.xs,
  },

  /* Sezon şeridi */
  stats: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.md,
  },
  statCell: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statDivider: {
    width: hairline,
    alignSelf: "stretch",
    backgroundColor: colors.separator,
  },
  statValue: {
    ...type.scoreMd,
    color: colors.textPrimary,
  },
  statValueHighlight: {
    color: colors.brandAccent,
  },
  statLabel: {
    ...type.micro,
    color: colors.textTertiary,
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
