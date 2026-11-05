/**
 * YÖNETİM — TEK KULÜP PANELİ (alt çubuğun 3. sekmesi; rota adı tarihsel
 * olarak `kulubum`). `/kulubum?rol=<takim|oyuncu|lig>`
 *
 * NEDEN TEK PANEL: eskiden bu sekme bir "kapı"ydı ve asıl panel ayrı bir
 * ekrandaydı (`/takimim` Kulüp Paneli, `/oyuncum` Özet sekmesi). İkisi aynı
 * kimliği, aynı "şimdi ilgilen" listesini, aynı sıradaki maçı iki kez
 * gösteriyordu; kullanıcı "panele git" düğmesine basıp aynı içeriğe
 * düşüyordu. Artık panel BURASIDIR:
 *   · `/takimim`               → buraya (`?rol=takim`) yönlenir.
 *   · `/oyuncum?tab=ozet`      → buraya (`?rol=oyuncu`) yönlenir; `/oyuncum`
 *                                yalnız ayrıntı ekranıdır (Maçlar · İstatistik
 *                                · Sözleşme).
 *
 * TASARIM ("az mürekkep, çok bilgi" — components/club/Panel.tsx):
 *   10px büyük harf bölüm etiketleri, 13px satır başlıkları, beyaz kart +
 *   kıl çizgisi. Grafit kahraman kartı, iri karolar, tekrar eden başlıklar yok.
 *
 * KULÜBÜM (başkan) → components/club/home/ClubHome; KARİYERİM (oyuncu) →
 * components/career/home/CareerHome. Her rolün en üstünde HAFTALIK GÖREVLER
 * vitrini (components/quests/QuestSpotlight).
 * LİG (yönetici):
 *   araçlar → modül listesi.
 *
 * MİSAFİR ve KULÜPSÜZ ÜYE: `JoinFlow` eylem akışı.
 */

import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { JoinFlow } from "@/components/club/JoinFlow";
import { PanelCard, PanelRow, PanelSection, ToolGrid, type PanelTool } from "@/components/club/Panel";
import { CHANGE_LABELS, useClubSignals, type AttentionItem } from "@/components/club/useClubSignals";
import {
  BottomSheet,
  ScreenHeader,
  SkeletonCard,
  Tabs,
  refreshControlProps,
  useHeaderScroll,
  useRefresh,
  type TabItem,
} from "@/components/ui";
import { CareerHome } from "@/components/career/home/CareerHome";
import { ClubHome } from "@/components/club/home/ClubHome";
import { QuestSpotlight } from "@/components/quests/QuestSpotlight";
import { useNotificationBell } from "@/hooks/useNotificationBell";
import { formatDateShort } from "@/lib/format";
import { useAuth } from "@/providers/AuthProvider";
import { colors, layout, radius, space, textScale, type } from "@/theme";

type RoleTab = "takim" | "oyuncu" | "lig";

const ROLE_LABELS: Record<RoleTab, string> = {
  takim: "Kulübüm",
  oyuncu: "Kariyerim",
  lig: "Lig",
};

export default function ClubHubScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();
  const bell = useNotificationBell();
  const params = useLocalSearchParams<{ rol?: string }>();
  const signals = useClubSignals();
  const scrollRef = useRef<ScrollView>(null);
  const [changesOpen, setChangesOpen] = useState(false);

  const user = signals.user;
  const go = useCallback((href: string) => router.push(href as Href), [router]);

  /* ------------------------------ ROLLER ------------------------------- */

  const roles = useMemo<RoleTab[]>(() => {
    const list: RoleTab[] = [];
    if (signals.isPresident) list.push("takim");
    if (signals.isPlayer) list.push("oyuncu");
    if (signals.isManagement) list.push("lig");
    return list;
  }, [signals.isManagement, signals.isPlayer, signals.isPresident]);

  const rawRole = Array.isArray(params.rol) ? params.rol[0] : params.rol;
  const role: RoleTab | null = roles.includes(rawRole as RoleTab) ? (rawRole as RoleTab) : (roles[0] ?? null);

  const tabItems = useMemo<TabItem<RoleTab>[]>(
    () =>
      roles.map((key) => ({
        key,
        label: ROLE_LABELS[key],
        badge:
          key === "takim" && signals.clubAttention.length
            ? "dot"
            : key === "oyuncu" && signals.playerAttention.length
              ? "dot"
              : undefined,
      })),
    [roles, signals.clubAttention.length, signals.playerAttention.length],
  );

  const changeRole = useCallback(
    (next: RoleTab) => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      scrollY.setValue(0);
      router.setParams({ rol: next });
    },
    [router, scrollY],
  );

  const refresh = useRefresh(
    useCallback(() => {
      signals.refetchAll();
    }, [signals]),
    { refreshing: signals.refreshing },
  );

  const openAttention = useCallback(
    (item: AttentionItem) => {
      if (item.action === "changes") setChangesOpen(true);
      else if (item.href) router.push(item.href);
    },
    [router],
  );

  /* ------------------------------- ÇİZİM ------------------------------- */

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Yönetim"
        scrollY={scrollY}
        actions={bell ? [bell] : undefined}
        tabs={roles.length > 1 && role ? <Tabs items={tabItems} value={role} onChange={changeRole} sticky /> : undefined}
      />

      <ScrollView
        ref={scrollRef}
        {...scrollProps}
        contentContainerStyle={styles.content}
        refreshControl={user ? <RefreshControl {...refreshControlProps(refresh.refreshing, refresh.onRefresh)} /> : undefined}
      >
        {/* HAFTALIK GÖREVLER — her rolün en üstünde; XP'nin ana kaynağı. */}
        {!auth.initializing ? (
          <View style={styles.quests}>
            <QuestSpotlight />
          </View>
        ) : null}

        {auth.initializing ? (
          <View style={styles.pad}>
            <SkeletonCard lines={3} />
          </View>
        ) : !user ? (
          <JoinFlow signedIn={false} go={go} />
        ) : role === "takim" ? (
          <ClubHome signals={signals} go={go} onAttention={openAttention} />
        ) : role === "oyuncu" ? (
          <CareerHome signals={signals} go={go} onAttention={openAttention} />
        ) : role === "lig" ? (
          <LeagueSection go={go} />
        ) : (
          <JoinFlow signedIn go={go} />
        )}

      </ScrollView>

      {/* Onay bekleyen değişiklik talepleri (eski Kulüp Paneli'nden taşındı). */}
      <BottomSheet visible={changesOpen} onClose={() => setChangesOpen(false)} title="Onay bekleyen değişiklikler" snap="content">
        <View style={styles.sheetBody}>
          {signals.pendingChanges.length === 0 ? (
            <Text style={styles.sheetNote} {...textScale.long}>
              Bekleyen talep yok.
            </Text>
          ) : (
            <PanelCard padded={false}>
              {signals.pendingChanges.map((change, index) => (
                <PanelRow
                  key={change.id}
                  icon="hourglass-outline"
                  tone="warn"
                  title={CHANGE_LABELS[change.type] ?? change.type}
                  hint={change.created_at ? `${formatDateShort(change.created_at)} tarihinde gönderildi` : undefined}
                  value="İnceleniyor"
                  last={index === signals.pendingChanges.length - 1}
                />
              ))}
            </PanelCard>
          )}
          <Text style={styles.sheetNote} {...textScale.long}>
            Talepler yönetici onayından sonra yayına alınır. Yanlış gönderdiğin bir profil ya da takım talebini düzenleme ekranından geri çekebilirsin.
          </Text>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

/* ═══════════════════════════════ LİG ═══════════════════════════════ */

const LEAGUE_TOOLS: PanelTool[] = [
  { key: "gorevler", icon: "checkbox", label: "Görevler", href: "/yonetim/gorevler" },
  { key: "araclar", icon: "construct", label: "Araçlar", href: "/yonetim/araclar", tone: "brand" },
  { key: "talepler", icon: "file-tray-full", label: "Talepler", href: "/yonetim/talepler", tone: "warn" },
  { key: "maclar", icon: "football", label: "Maçlar", href: "/yonetim/maclar", tone: "live" },
  { key: "sahalar", icon: "location", label: "Sahalar", href: "/yonetim/sahalar", tone: "info" },
  { key: "mesajlar", icon: "chatbubbles", label: "Mesajlar", href: "/mesajlar", tone: "neutral" },
  { key: "bildirimler", icon: "notifications", label: "Bildirimler", href: "/bildirimler", tone: "live" },
  { key: "kayitlar", icon: "call", label: "Kayıtlar", href: "/yonetim/kayitlar", tone: "neutral" },
  { key: "panel", icon: "grid", label: "Tümü", href: "/yonetim", tone: "neutral" },
];

function LeagueSection({ go }: { go: (href: string) => void }) {
  return (
    <>
      <PanelSection title="Araçlar" style={styles.firstSection}>
        <ToolGrid tools={LEAGUE_TOOLS} go={go} />
      </PanelSection>
    </>
  );
}

/* ═══════════════════════════════ PARÇALAR ═══════════════════════════════ */


const styles = StyleSheet.create({
  quests: { paddingHorizontal: layout.screenPadding, paddingTop: space.sm },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingTop: space.sm, paddingBottom: space.xxl },
  pad: { paddingHorizontal: layout.screenPadding },
  flex: { flex: 1, minWidth: 0 },
  loading: { gap: space.md, paddingTop: space.sm },
  top: { paddingHorizontal: layout.screenPadding, paddingTop: space.xs },
  firstSection: { marginTop: space.sm },

  matchHead: { flexDirection: "row", alignItems: "flex-start", gap: space.m },
  matchSide: { ...type.micro, color: colors.brandAccent },
  matchOpponent: { ...type.h3, color: colors.textPrimary, marginTop: 2 },
  matchMeta: { ...type.caption, color: colors.textTertiary, marginTop: 2 },
  countdown: {
    paddingHorizontal: space.s,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.brandDim,
  },
  countdownText: { ...type.micro, color: colors.brandAccent },

  progressRow: { flexDirection: "row", alignItems: "center", gap: space.m, marginTop: space.md, marginBottom: space.xs },
  progressText: { ...type.caption, color: colors.textSecondary },
  matchActions: { flexDirection: "row", gap: space.sm, marginTop: space.m },
  pickerWrap: { marginTop: space.md },

  dateBox: {
    width: 44,
    paddingVertical: 3,
    borderRadius: radius.xs,
    backgroundColor: colors.surface3,
    alignItems: "center",
  },
  dateText: { ...type.micro, color: colors.textSecondary, letterSpacing: 0 },

  sheetBody: { gap: space.sm, paddingBottom: space.sm, paddingHorizontal: space.xs },
  sheetNote: { ...type.caption, color: colors.textTertiary, paddingHorizontal: layout.rowPaddingH, paddingTop: space.sm },
});
