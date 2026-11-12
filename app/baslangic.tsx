/**
 * BAŞLANGIÇ — ilk açılış sihirbazının şehirden sonraki adımları.
 *
 * AKIŞ (ilk açılış): /hosgeldin (slaytlar) → /sehir (1 · şehir) → burası:
 *   2 · LİG       seçili ilin ligleri (`useScope().selectLeague`; sezonu
 *                 sağlayıcı seçer)
 *   3 · TAKIM     `TeamPickerGrid` ile çoklu seçim; "Devam et" seçilenleri
 *                 `useFavorite().follow` ile takibe ekler (Takip sekmesinde
 *                 görünür). Bildirim türleri alt sayfası burada AÇILMAZ — bir
 *                 sonraki adım zaten bildirimi soruyor.
 *   4 · BİLDİRİM  cihaz izni: var olan kayıt yolu (`runPushRegistration`,
 *                 hooks/usePushStatus.ts → lib/notifications.ts registerForPush)
 *                 — yeni izin kodu yok. Girişliyse sunucudaki genel tercih
 *                 anahtarlarından maç ve haber grupları (lib/api/notifications.ts,
 *                 Bildirim tercihleri ekranıyla aynı PATCH); misafirde sunucu
 *                 ayarı yazılamaz, yalnız izin + "giriş yapınca seçebilirsin".
 * Son adımda `INTRO_SEEN_KEY` yazılır ve `/(tabs)/skorlar` açılır.
 *
 * HER ADIM ATLANABİLİR: "Atla" adımı değiştirmeden ilerler; son adımda
 * "Atla" da akışı bitirir. Uygulama yarıda kapanırsa bayrak yazılmadığı için
 * akış bir sonraki açılışta şehirden yeniden başlar.
 *
 * NEDEN TEK EKRAN: üç adım aynı alt düğme çubuğunu, ilerleme göstergesini ve
 * yerel seçim durumunu (takımlar) paylaşır; ayrı rotalar seçimi rota
 * parametresiyle taşımak zorunda kalırdı. Geri oku önceki adıma, ilk adımda
 * şehir seçimine döner.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { TeamPickerGrid } from "@/components/follow/TeamPickerGrid";
import { LinearGradient } from "expo-linear-gradient";
import { MenuGroup } from "@/components/account/MenuBlocks";
import {
  Aurora,
  Button,
  EmptyState,
  IconTile,
  Reveal,
  ScreenHeader,
  SkeletonListRow,
  Touchable,
  useHeaderScroll,
  useToast,
  type IconTileTone,
} from "@/components/ui";
import { runPushRegistration, usePushStatus } from "@/hooks/usePushStatus";
import {
  getNotificationPreferences,
  preferenceSections,
  updateNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/api/notifications";
import { queryKeys } from "@/lib/queryKeys";
import { INTRO_SEEN_KEY } from "@/lib/storage";
import { useAuth } from "@/providers/AuthProvider";
import { useFavorite, type FavoriteTeam } from "@/providers/FavoriteProvider";
import { useScope } from "@/providers/ScopeProvider";
import { colors, elevate, glowStyle, hairline, layout, radius, space, textScale, type } from "@/theme";

type Step = "lig" | "takim" | "bildirim";
const STEPS: Step[] = ["lig", "takim", "bildirim"];
/** Şehir adımı /sehir'de; toplam dört adım. */
const TOTAL = 4;

const TITLES: Record<Step, { title: string; subtitle: string }> = {
  lig: { title: "Ligini seç", subtitle: "Puan, fikstür ve skorlar bu ligden gelir" },
  takim: { title: "Takımını seç", subtitle: "Maçları, formu ve haberleri Takip'te toplanır" },
  bildirim: { title: "Bildirimler", subtitle: "Gol, sonuç ve maç başlangıcını kaçırma" },
};

/** Bildirim adımındaki izin kartının üç "an"ı. */
const MOMENTS: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: "football", label: "Gol" },
  { icon: "play", label: "Maç başladı" },
  { icon: "flag", label: "Son düdük" },
];

const GROUP_MAC = { icon: "football" as const, tone: "pink" as IconTileTone };
const GROUP_HABER = { icon: "newspaper" as const, tone: "gold" as IconTileTone };

/** Genel tercihlerden ilk açılışta sorulan gruplar — ayrıntısı Bildirim tercihleri'nde. */
const ONBOARDING_GROUPS = ["mac", "haber"];

/* ═════════════════════════ İLERLEME ═════════════════════════ */

const Progress = React.memo(function Progress({ current }: { current: number }) {
  return (
    <View style={styles.progress} accessibilityLabel={`Adım ${current} / ${TOTAL}`}>
      {Array.from({ length: TOTAL }, (_, index) => (
        <View key={index} style={styles.progressBar}>
          {index < current ? (
            /* Yeni tamamlanan çubuk belirerek dolar; öncekiler yerinde durur. */
            <Reveal
              enabled={index === current - 1}
              replayKey={current}
              distance={-12}
              axis="x"
              style={styles.progressOn}
            >
              <LinearGradient
                colors={colors.gradientSignature}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </Reveal>
          ) : null}
        </View>
      ))}
    </View>
  );
});

/* ═════════════════════════ ADIM 2 · LİG ═════════════════════════ */

function LeagueStep() {
  const scope = useScope();
  const loading = scope.loading && !scope.leagues.length;

  if (loading) return <SkeletonListRow count={4} />;
  if (!scope.leagues.length) {
    return (
      <EmptyState
        icon="trophy-outline"
        title="Bu şehirde lig yok"
        body="Şehir seçimine dönüp başka bir şehir dene ya da bu adımı atla."
        variant="inline"
      />
    );
  }
  return (
    <View style={styles.leagueList}>
      {scope.leagues.map((league, index) => {
        const selected = league.id === scope.leagueId;
        return (
          <Reveal key={league.id} index={index} limit={8} distance={8}>
            <Touchable
              feedback="card"
              haptic="selection"
              onPress={() => scope.selectLeague(league.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={selected && scope.seasonLabel ? `${league.label}, ${scope.seasonLabel}` : league.label}
              testID={`intro-league-${league.id}`}
              style={[styles.leagueCard, selected ? styles.leagueCardOn : null]}
            >
              <IconTile
                icon="trophy"
                tone={selected ? "signature" : LEAGUE_TONES[index % LEAGUE_TONES.length]}
                size={40}
                glow={selected}
              />
              <View style={styles.leagueBody}>
                <Text style={styles.leagueName} numberOfLines={1} {...textScale.dense}>
                  {league.label}
                </Text>
                <Text style={[styles.leagueMeta, selected ? styles.leagueMetaOn : null]} numberOfLines={1} {...textScale.dense}>
                  {selected ? (scope.seasonLabel ?? "Seçili") : "Dokun, bu ligi seç"}
                </Text>
              </View>
              <View style={[styles.radio, selected ? styles.radioOn : null]}>
                {selected ? <Ionicons name="checkmark" size={14} color={colors.textOnBrand} /> : null}
              </View>
            </Touchable>
          </Reveal>
        );
      })}
    </View>
  );
}

/** Seçili olmayan lig karolarının sırayla aldığı tonlar. */
const LEAGUE_TONES: IconTileTone[] = ["violet", "cyan", "pink", "gold", "mint"];

/* ═════════════════════════ ADIM 4 · BİLDİRİM ═════════════════════════ */

function NotificationStep() {
  const auth = useAuth();
  const signedIn = Boolean(auth.user);
  const push = usePushStatus();
  const toast = useToast();
  const queryClient = useQueryClient();
  /** Kullanıcı bu ekranda izin istedi mi — istemeden durum mesajı gösterilmez. */
  const [asked, setAsked] = useState(false);

  const askPermission = useCallback(async () => {
    setAsked(true);
    await runPushRegistration(signedIn);
  }, [signedIn]);

  const query = useQuery({
    queryKey: queryKeys.notificationPreferences(),
    queryFn: getNotificationPreferences,
    enabled: signedIn,
  });

  const mutation = useMutation({
    mutationFn: (changes: Record<string, boolean>) => updateNotificationPreferences(changes),
    onMutate: async (changes) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notificationPreferences() });
      const previous = queryClient.getQueryData<NotificationPreferences>(queryKeys.notificationPreferences());
      if (previous) {
        queryClient.setQueryData<NotificationPreferences>(queryKeys.notificationPreferences(), {
          ...previous,
          preferences: { ...previous.preferences, ...changes },
        });
      }
      return { previous };
    },
    onError: (_error, _changes, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.notificationPreferences(), context.previous);
      toast.show({ message: "Tercih kaydedilemedi. Tekrar dene.", tone: "danger" });
    },
    onSuccess: (data) => queryClient.setQueryData(queryKeys.notificationPreferences(), data),
  });

  const sections = useMemo(() => {
    if (!query.data) return [];
    const all = preferenceSections(query.data);
    const picked = all.filter((section) => ONBOARDING_GROUPS.includes(section.group.key));
    return picked.length ? picked : all.slice(0, 1);
  }, [query.data]);

  const granted = push.state === "hazir";

  return (
    <View style={styles.stepBody}>
      <View style={styles.permission}>
        <LinearGradient
          colors={colors.gradientInk}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Aurora variant="stage" style={StyleSheet.absoluteFill} />
        <IconTile icon={granted ? "checkmark-circle" : "notifications"} tone={granted ? "mint" : "signature"} size={56} />
        <View style={styles.permissionMoments}>
          {MOMENTS.map((moment) => (
            <View key={moment.label} style={styles.moment}>
              <Ionicons name={moment.icon} size={12} color={colors.brandOnDark} />
              <Text style={styles.momentText} {...textScale.badge}>
                {moment.label}
              </Text>
            </View>
          ))}
        </View>
        <Text style={styles.permissionTitle} {...textScale.dense}>
          {granted ? "Bu telefon bildirim alıyor" : "Bildirimlere izin ver"}
        </Text>
        <Text style={styles.permissionBody} {...textScale.long}>
          {asked && !push.busy ? push.message : "Takımın gol atınca, maç başlayınca ve bitince haber verelim."}
        </Text>
        {granted ? null : (
          <Button
            label="İzin ver"
            icon="notifications-outline"
            onPress={askPermission}
            loading={asked && push.busy}
            fullWidth
            testID="intro-permission"
          />
        )}
      </View>

      {signedIn ? (
        query.isLoading ? (
          <SkeletonListRow count={3} avatar={false} />
        ) : sections.length ? (
          sections.map((section) => {
            const look = section.group.key === "haber" ? GROUP_HABER : GROUP_MAC;
            return (
              <MenuGroup
                key={section.group.key}
                title={section.group.label}
                icon={look.icon}
                tone={look.tone}
                items={section.items.map((item) => ({
                  key: item.key,
                  icon: look.icon,
                  tone: "neutral",
                  title: item.label,
                  subtitle: item.description,
                  toggle: {
                    value: item.value,
                    onValueChange: (value: boolean) => mutation.mutate({ [item.key]: value }),
                  },
                }))}
              />
            );
          })
        ) : (
          <Text style={styles.note} {...textScale.long}>
            Bildirim türleri şu an yüklenemedi; Profil → Ayarlar'dan sonra seçebilirsin.
          </Text>
        )
      ) : (
        <View style={styles.guestNote}>
          <IconTile icon="person" tone="violet" size={32} glow={false} />
          <Text style={styles.note} {...textScale.long}>
            Bildirim türleri hesabına bağlıdır. Giriş yapınca hangi anlarda bildirim alacağını seçebilirsin.
          </Text>
        </View>
      )}
    </View>
  );
}

/* ═════════════════════════ EKRAN ═════════════════════════ */

export default function BaslangicScreen() {
  const router = useRouter();
  const scope = useScope();
  const favorite = useFavorite();
  const { scrollY, scrollProps } = useHeaderScroll();
  const [step, setStep] = useState<Step>("lig");
  const [picked, setPicked] = useState<Map<number, FavoriteTeam>>(() => new Map());
  const [finishing, setFinishing] = useState(false);

  const index = STEPS.indexOf(step);
  const scrollRef = useRef<ScrollView>(null);
  /** Son geçişin yönü: ileri adım sağdan, geri adım soldan kayarak gelir. */
  const [direction, setDirection] = useState<1 | -1>(1);

  /* Adım değişince içerik TEPEDEN başlar. Eskiden yalnız başlığın `scrollY`
     değeri sıfırlanıyordu: uzun takım ızgarasında aşağı inmiş kullanıcı
     bildirim adımına ortadan giriyor, başlık açık görünürken liste kaymış
     kalıyordu. */
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    scrollY.setValue(0);
  }, [step, scrollY]);

  const togglePick = useCallback((team: FavoriteTeam) => {
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(team.id)) next.delete(team.id);
      else next.set(team.id, team);
      return next;
    });
  }, []);
  const isPicked = useCallback(
    (teamId: number) => picked.has(teamId) || favorite.isFollowing("team", teamId),
    [favorite, picked]
  );

  const finish = useCallback(async () => {
    setFinishing(true);
    await AsyncStorage.setItem(INTRO_SEEN_KEY, "1").catch(() => {
      // Bayrak yazılamazsa akış bir dahaki açılışta yine gelir; engel değil.
    });
    router.replace("/(tabs)/skorlar");
  }, [router]);

  const goNext = useCallback(() => {
    if (step === "bildirim") {
      void finish();
      return;
    }
    setDirection(1);
    setStep(STEPS[index + 1]);
  }, [finish, index, step]);

  /** Birincil düğme: takım adımında seçilenleri takibe ekler. */
  const primary = useCallback(() => {
    if (step === "takim" && picked.size) {
      picked.forEach((team) => {
        if (!favorite.isFollowing("team", team.id)) {
          void favorite.follow({ type: "team", id: team.id, name: team.name, logo: team.logo ?? null });
        }
      });
    }
    goNext();
  }, [favorite, goNext, picked, step]);

  const goBack = useCallback(() => {
    if (index === 0) {
      router.replace("/sehir");
      return;
    }
    setDirection(-1);
    setStep(STEPS[index - 1]);
  }, [index, router]);

  /* Android donanım geri tuşu sihirbazın "geri"sidir. Yığında dönülecek ekran
     olmadığı için (akış `replace` ile ilerler) varsayılan davranış uygulamayı
     kapatıyordu. */
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [goBack]);

  const primaryLabel =
    step === "takim"
      ? picked.size
        ? `${picked.size} takımı takip et`
        : "Devam et"
      : step === "bildirim"
        ? "Başla"
        : "Devam et";

  const titles = TITLES[step];

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <ScreenHeader
        title={titles.title}
        overline={`ADIM ${index + 2} / ${TOTAL}`}
        subtitle={titles.subtitle}
        back
        onBack={goBack}
        scrollY={scrollY}
        bottom={<Progress current={index + 2} />}
      />

      <ScrollView
        ref={scrollRef}
        {...scrollProps}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Adım içeriği yönüne göre yandan kayarak gelir (bir kez, 320ms). */}
        <Reveal replayKey={step} axis="x" distance={28 * direction} style={styles.step}>
        {step === "lig" ? (
          <>
            {scope.cityLabel ? (
              <View style={styles.cityPill}>
                <Ionicons name="location" size={12} color={colors.accentText} />
                <Text style={styles.cityPillText} {...textScale.badge}>
                  {scope.cityLabel} · {scope.leagues.length} lig
                </Text>
              </View>
            ) : null}
            <LeagueStep />
          </>
        ) : step === "takim" ? (
          <>
            <View style={styles.pickHead}>
              <Text style={[styles.lead, styles.flex]} {...textScale.long}>
                {[scope.leagueLabel, scope.seasonLabel].filter(Boolean).join(" · ")} — birden çok takım seçebilirsin.
              </Text>
              <View style={[styles.pickCount, picked.size ? styles.pickCountOn : null]}>
                <Ionicons name="star" size={11} color={picked.size ? colors.textOnBrand : colors.textTertiary} />
                <Text style={[styles.pickCountText, picked.size ? styles.pickCountTextOn : null]} {...textScale.badge}>
                  {picked.size}
                </Text>
              </View>
            </View>
            <TeamPickerGrid isSelected={isPicked} onPress={togglePick} testID="intro-team-grid" />
          </>
        ) : (
          <NotificationStep />
        )}
        </Reveal>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Atla"
          variant="ghost"
          size="lg"
          onPress={goNext}
          disabled={finishing}
          testID="intro-skip"
        />
        <Button
          label={primaryLabel}
          icon={step === "bildirim" ? "checkmark" : "arrow-forward"}
          iconPosition="right"
          size="lg"
          onPress={primary}
          loading={finishing}
          style={styles.primary}
          testID="intro-next"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  progress: {
    flexDirection: "row",
    gap: space.xs,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.sm,
  },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
    overflow: "hidden",
  },
  progressOn: {
    flex: 1,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  flex: { flex: 1, minWidth: 0 },
  leagueList: { gap: space.sm },
  leagueCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 64,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    ...elevate(1),
  },
  leagueCardOn: {
    backgroundColor: colors.brandDim,
    borderColor: colors.brand,
    borderWidth: 1.5,
    ...glowStyle(colors.glow, 1),
  },
  leagueBody: { flex: 1, minWidth: 0, gap: 1 },
  leagueName: { ...type.h3, color: colors.textPrimary },
  leagueMeta: { ...type.bodySm, color: colors.textTertiary },
  leagueMetaOn: { color: colors.brandAccent },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  radioOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  cityPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.accentDim,
    borderWidth: hairline,
    borderColor: colors.accentBorder,
  },
  cityPillText: { ...type.labelXs, color: colors.accentText },
  pickHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  pickCount: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
  },
  pickCountOn: { backgroundColor: colors.brand },
  pickCountText: { ...type.numSmStrong, color: colors.textTertiary },
  pickCountTextOn: { color: colors.textOnBrand },
  step: {
    gap: space.md,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    paddingBottom: space.xxl,
    gap: space.md,
  },
  lead: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  stepBody: {
    gap: space.lg,
  },
  permission: {
    alignItems: "center",
    gap: space.sm,
    padding: space.xl,
    borderRadius: radius.xxl,
    overflow: "hidden",
    backgroundColor: colors.inkBlock,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
    ...elevate(2),
  },
  permissionMoments: { flexDirection: "row", gap: space.xs, marginTop: space.sm },
  moment: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.inkPill,
    borderWidth: hairline,
    borderColor: colors.inkPillBorder,
  },
  momentText: { ...type.micro, color: colors.onDark },
  permissionTitle: {
    ...type.h1,
    color: colors.onDark,
    textAlign: "center",
  },
  permissionBody: {
    ...type.bodySm,
    color: colors.onDarkMuted,
    textAlign: "center",
    marginBottom: space.sm,
  },
  guestNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  note: {
    ...type.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  primary: {
    flex: 1,
  },
});
