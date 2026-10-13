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
import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { TeamPickerGrid } from "@/components/follow/TeamPickerGrid";
import {
  Button,
  EmptyState,
  ListRow,
  ScreenHeader,
  SkeletonListRow,
  Surface,
  useHeaderScroll,
  useToast,
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
import { colors, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

type Step = "lig" | "takim" | "bildirim";
const STEPS: Step[] = ["lig", "takim", "bildirim"];
/** Şehir adımı /sehir'de; toplam dört adım. */
const TOTAL = 4;

const TITLES: Record<Step, { title: string; subtitle: string }> = {
  lig: { title: "Ligini seç", subtitle: "Puan, fikstür ve skorlar bu ligden gelir" },
  takim: { title: "Takımını seç", subtitle: "Maçları, formu ve haberleri Takip'te toplanır" },
  bildirim: { title: "Bildirimler", subtitle: "Gol, sonuç ve maç başlangıcını kaçırma" },
};

/** Genel tercihlerden ilk açılışta sorulan gruplar — ayrıntısı Bildirim tercihleri'nde. */
const ONBOARDING_GROUPS = ["mac", "haber"];

type Position = "single" | "first" | "middle" | "last";
const rowPosition = (index: number, total: number): Position =>
  total <= 1 ? "single" : index === 0 ? "first" : index === total - 1 ? "last" : "middle";

/* ═════════════════════════ İLERLEME ═════════════════════════ */

const Progress = React.memo(function Progress({ current }: { current: number }) {
  return (
    <View style={styles.progress} accessibilityLabel={`Adım ${current} / ${TOTAL}`}>
      {Array.from({ length: TOTAL }, (_, index) => (
        <View key={index} style={[styles.progressBar, index < current ? styles.progressOn : null]} />
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
    <View>
      {scope.leagues.map((league, index) => {
        const selected = league.id === scope.leagueId;
        return (
          <ListRow
            key={league.id}
            leading={{ icon: selected ? "trophy" : "trophy-outline", tone: selected ? "brand" : "neutral" }}
            title={league.label}
            subtitle={selected && scope.seasonLabel ? scope.seasonLabel : undefined}
            highlighted={selected}
            chevron={false}
            trailing={selected ? <Ionicons name="checkmark-circle" size={20} color={colors.brandAccent} /> : undefined}
            position={rowPosition(index, scope.leagues.length)}
            onPress={() => scope.selectLeague(league.id)}
            testID={`intro-league-${league.id}`}
          />
        );
      })}
    </View>
  );
}

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
      <Surface level={1} radius="xl" style={styles.permission}>
        <View style={styles.permissionIcon}>
          <Ionicons name={granted ? "notifications" : "notifications-outline"} size={22} color={colors.brandAccent} />
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
      </Surface>

      {signedIn ? (
        query.isLoading ? (
          <SkeletonListRow count={3} avatar={false} />
        ) : sections.length ? (
          sections.map((section) => (
            <View key={section.group.key} style={styles.group}>
              <Text style={styles.groupLabel} {...textScale.badge}>
                {upperTR(section.group.label)}
              </Text>
              <View>
                {section.items.map((item, index) => (
                  <ListRow
                    key={item.key}
                    title={item.label}
                    subtitle={item.description}
                    position={rowPosition(index, section.items.length)}
                    toggle={{
                      value: item.value,
                      onValueChange: (value) => mutation.mutate({ [item.key]: value }),
                    }}
                  />
                ))}
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.note} {...textScale.long}>
            Bildirim türleri şu an yüklenemedi; Profil → Ayarlar'dan sonra seçebilirsin.
          </Text>
        )
      ) : (
        <View style={styles.guestNote}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
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
    setStep(STEPS[index + 1]);
    scrollY.setValue(0);
  }, [finish, index, scrollY, step]);

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
    if (index === 0) router.replace("/sehir");
    else setStep(STEPS[index - 1]);
  }, [index, router]);

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
        {...scrollProps}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === "lig" ? (
          <>
            {scope.cityLabel ? (
              <Text style={styles.lead} {...textScale.long}>
                {scope.cityLabel} ligleri
              </Text>
            ) : null}
            <LeagueStep />
          </>
        ) : step === "takim" ? (
          <>
            <Text style={styles.lead} {...textScale.long}>
              {[scope.leagueLabel, scope.seasonLabel].filter(Boolean).join(" · ")} — birden çok takım seçebilirsin.
            </Text>
            <TeamPickerGrid isSelected={isPicked} onPress={togglePick} testID="intro-team-grid" />
          </>
        ) : (
          <NotificationStep />
        )}
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
  },
  progressOn: {
    backgroundColor: colors.brand,
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
    padding: space.lg,
    borderRadius: radius.xl,
  },
  permissionIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandDim,
    marginBottom: space.xs,
  },
  permissionTitle: {
    ...type.h2,
    color: colors.textPrimary,
    textAlign: "center",
  },
  permissionBody: {
    ...type.bodySm,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: space.sm,
  },
  group: {
    gap: space.sm,
  },
  groupLabel: {
    ...type.overline,
    color: colors.textTertiary,
    paddingHorizontal: space.xxs,
  },
  guestNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
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
