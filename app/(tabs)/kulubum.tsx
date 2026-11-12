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

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { JoinFlow } from "@/components/club/JoinFlow";
import { QuickGrid, type QuickItem } from "@/components/account/MenuBlocks";
import { PanelCard, PanelRow } from "@/components/club/Panel";
import { CHANGE_LABELS, useClubSignals, type AttentionItem } from "@/components/club/useClubSignals";
import {
  BottomSheet,
  IconTile,
  Reveal,
  ScreenHeader,
  SectionHeader,
  SkeletonCard,
  Tabs,
  Touchable,
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
import { useAdminMode } from "@/providers/AdminModeProvider";
import { useAuth } from "@/providers/AuthProvider";
import { colors, elevate, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

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

/**
 * LİG (yönetici, ÜYE GÖRÜNÜMÜNDE): yönetim araçları burada yaşamaz — yönetim
 * modunun kendi ana ekranı, alt menüsü ve uygulamaları vardır. Bu bölüm o moda
 * geri dönen kapıdır (altın sahne kartı); altta en sık açılan üç kısayol
 * renkli karolar hâlinde durur.
 */
const LEAGUE_MODULES = ["Muhasebe", "Yapılacaklar", "Projeler", "Lig yönetimi", "Yayın stüdyosu"];

function LeagueSection({ go }: { go: (href: string) => void }) {
  const mode = useAdminMode();
  const shortcuts = useMemo<QuickItem[]>(
    () => [
      { key: "gorevler", icon: "checkbox", label: "Yapılacaklar", hint: "Görevlerin", tone: "violet", onPress: () => go("/yonetim/gorevler") },
      { key: "talepler", icon: "file-tray-full", label: "Talepler", hint: "Onay kuyruğu", tone: "gold", onPress: () => go("/yonetim/talepler") },
      { key: "maclar", icon: "football", label: "Maçlar", hint: "Fikstür", tone: "pink", onPress: () => go("/yonetim/maclar") },
    ],
    [go],
  );
  return (
    <View style={styles.league}>
      <Reveal>
        <View style={styles.adminGate}>
          <LinearGradient
            colors={colors.gradientAdminStage}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.adminGateHead}>
            <IconTile icon="shield-checkmark" tone="gold" size={44} />
            <View style={styles.flex}>
              <Text style={styles.adminGateOverline} {...textScale.badge}>
                {upperTR("Üye gözündesin")}
              </Text>
              <Text style={styles.adminGateTitle} {...textScale.dense}>
                Yönetim modu
              </Text>
            </View>
          </View>
          <Text style={styles.adminGateBody} {...textScale.long}>
            Lig araçlarının hepsi yönetim modunda; buradan tek dokunuşla dönersin.
          </Text>
          <View style={styles.moduleRow}>
            {LEAGUE_MODULES.map((label) => (
              <View key={label} style={styles.modulePill}>
                <Text style={styles.moduleText} {...textScale.badge}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
          <Touchable
            feedback="button"
            haptic="selection"
            onPress={mode.enterAdmin}
            style={styles.adminGateButton}
            accessibilityRole="button"
            testID="kulubum-enter-admin"
          >
            <Text style={styles.adminGateButtonText} {...textScale.dense}>
              Yönetim moduna geç
            </Text>
            <Ionicons name="arrow-forward" size={16} color={colors.adminAccentInk} />
          </Touchable>
        </View>
      </Reveal>
      <SectionHeader title="Kısayollar" icon="flash" iconTone="gold" inset="flush" style={styles.leagueHeader} />
      <QuickGrid items={shortcuts} />
    </View>
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

  league: { paddingHorizontal: layout.screenPadding, marginTop: space.md },
  leagueHeader: { marginTop: space.lg },
  adminGate: {
    padding: space.lg,
    gap: space.md,
    borderRadius: radius.xxl,
    overflow: "hidden",
    backgroundColor: colors.adminBar,
    borderWidth: hairline,
    borderColor: colors.adminBarBorder,
    ...elevate(2),
  },
  adminGateHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  adminGateOverline: { ...type.overline, color: colors.adminAccent },
  adminGateTitle: { ...type.display, color: colors.onDark, marginTop: 2 },
  adminGateBody: { ...type.bodySm, color: colors.onDarkMuted },
  moduleRow: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  modulePill: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  moduleText: { ...type.micro, color: colors.onDark },
  adminGateButton: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.adminAccent,
  },
  adminGateButtonText: { ...type.label, color: colors.adminAccentInk },

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
