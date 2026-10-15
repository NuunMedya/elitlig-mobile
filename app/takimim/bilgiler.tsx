/**
 * TAKIM BİLGİLERİ — takım başkanının kulüp kimliği, formaları ve takım sayfası.
 *
 * Üç segment, üç ayrı uç (web panelindeki TeamInfoEditor / KitEditor /
 * TeamDetails karşılığı):
 *   KİMLİK    PATCH /api/panel/me/team          ONAYLI talep: ad, logo, kuruluş,
 *                                               renk adı, il. Bekleyen talep
 *                                               varken kilitli; geri çekilebilir.
 *   FORMALAR  PATCH /api/team-management/settings  DOĞRUDAN: iç saha / deplasman
 *                                               ana, ikincil ve şerit renkleri.
 *   SAYFA     PATCH /api/panel/me/team/details  DOĞRUDAN: slogan, tarihçe,
 *                                               başarılar, sosyal hesaplar,
 *                                               gol müziği.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AuthCard, AuthNotice, AuthShell } from "@/components/account/AuthShell";
import { CityPickerSheet } from "@/components/account/CityPickerSheet";
import { ImagePickField } from "@/components/account/ImagePickField";
import { PendingChangeNotice } from "@/components/account/PendingChangeNotice";
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  SegmentedControl,
  SkeletonCard,
  Touchable,
  useToast,
  type SegmentedItem,
} from "@/components/ui";
import { getPanelMe } from "@/lib/api/panel";
import {
  SOCIAL_KEYS,
  getTeamDetails,
  requestTeamUpdate,
  toDisplayDate,
  toIsoDate,
  updateTeamDetails,
  type SocialKey,
  type TeamAchievement,
  type TeamProfilePatch,
} from "@/lib/api/profile";
import { getTeamRoster, updateTeamSettings } from "@/lib/api/team";
import { ApiError } from "@/lib/http";
import { KIT_DEFAULTS, KIT_SWATCHES, isHex, type Kit, type KitKey } from "@/lib/kitColors";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

type Segment = "kimlik" | "formalar" | "sayfa";
const SEGMENTS: SegmentedItem<Segment>[] = [
  { key: "kimlik", label: "Kimlik" },
  { key: "formalar", label: "Formalar" },
  { key: "sayfa", label: "Takım sayfası" },
];

const errorText = (error: unknown, fallback: string) => (error instanceof ApiError ? error.userMessage : fallback);

export default function TeamInfoScreen() {
  const params = useLocalSearchParams<{ bolum?: string }>();
  const initialSegment = (["kimlik", "formalar", "sayfa"] as const).find((key) => key === params.bolum) ?? "kimlik";
  const [segment, setSegment] = useState<Segment>(initialSegment);
  const auth = useAuth();
  const router = useRouter();

  const meQuery = useQuery({
    queryKey: ["panel", "me"],
    queryFn: getPanelMe,
    enabled: Boolean(auth.user),
    staleTime: 60_000,
  });
  const team = meQuery.data?.team ?? null;

  let body: ReactNode;
  if (meQuery.isLoading) body = <SkeletonCard lines={6} />;
  else if (meQuery.isError) body = <ErrorState variant="inline" error={meQuery.error} onRetry={meQuery.refetch} />;
  else if (!team) {
    body = (
      <EmptyState
        icon="shield-outline"
        title="Yönettiğin bir takım yok"
        body="Takım bilgilerini yalnız takım başkanı düzenleyebilir."
        action={{ label: "Takım yönetimi talep et", onPress: () => router.replace("/oyuncum/bagla") }}
      />
    );
  } else {
    body = (
      <>
        <SegmentedControl items={SEGMENTS} value={segment} onChange={setSegment} />
        {segment === "kimlik" ? <IdentitySection /> : segment === "formalar" ? <KitSection /> : <PageSection />}
      </>
    );
  }

  return (
    <AuthShell
      title="Takım bilgileri"
      overline={team?.team_name ?? "Takımım"}
      heading="Takım bilgileri"
      lede="Kimlik değişiklikleri yönetim onayından geçer; formalar ve takım sayfası hemen yayınlanır."
      icon="shield-half-outline"
      back
    >
      {body}
    </AuthShell>
  );
}

/* ═══════════════════════════════ KİMLİK (onaylı) ═══════════════════════════════ */

interface IdentityForm {
  team_name: string;
  logo: string | null;
  founded_at: string;
  colors: string;
  city: string | null;
  city_id: number | null;
}

function IdentitySection() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const meQuery = useQuery({ queryKey: ["panel", "me"], queryFn: getPanelMe, staleTime: 60_000 });
  const team = meQuery.data?.team ?? null;
  const pending = meQuery.data?.pendingChanges.find((change) => change.type === "team_update") ?? null;

  const initial = useMemo<IdentityForm | null>(
    () =>
      team
        ? {
            team_name: team.team_name ?? "",
            logo: team.logo,
            founded_at: toDisplayDate(team.founded_at),
            colors: team.colors ?? "",
            city: team.city,
            city_id: team.city_id,
          }
        : null,
    [team],
  );
  const [form, setForm] = useState<IdentityForm | null>(null);
  const [cityOpen, setCityOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initial && !form) setForm(initial);
  }, [form, initial]);

  const payload = useMemo<TeamProfilePatch>(() => {
    if (!form || !initial) return {};
    const out: TeamProfilePatch = {};
    if (form.team_name.trim() !== initial.team_name.trim()) out.team_name = form.team_name.trim();
    if (form.logo !== initial.logo) out.logo = form.logo;
    if (form.founded_at.trim() !== initial.founded_at) out.founded_at = form.founded_at.trim() ? toIsoDate(form.founded_at) : null;
    if (form.colors.trim() !== initial.colors.trim()) out.colors = form.colors.trim() || null;
    if (form.city_id !== initial.city_id) {
      out.city_id = form.city_id;
      out.city = form.city;
    }
    return out;
  }, [form, initial]);

  if (!form) return <SkeletonCard lines={4} />;

  const nameError = !form.team_name.trim() ? "Takım adı zorunludur." : undefined;
  const dateError = form.founded_at.trim() && !toIsoDate(form.founded_at) ? "GG.AA.YYYY biçiminde gir." : undefined;
  const changed = Object.keys(payload).length > 0;
  const locked = Boolean(pending) || busy;
  const set = <K extends keyof IdentityForm>(key: K, value: IdentityForm[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setError(null);
  };

  const submit = async () => {
    if (!changed || nameError || dateError || locked) return;
    setBusy(true);
    try {
      const result = await requestTeamUpdate(payload);
      toast.show({ message: result.message || "Talebin yönetime gönderildi.", tone: "success" });
      await queryClient.invalidateQueries({ queryKey: ["panel", "me"] });
      setForm(null);
    } catch (caught) {
      setError(errorText(caught, "Talep gönderilemedi."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {pending ? <PendingChangeNotice changeId={pending.id} createdAt={pending.created_at} subject="Takım değişikliğin" /> : null}
      <AuthCard title="Kulüp logosu">
        <ImagePickField kind="team" name={form.team_name} value={form.logo} onChange={(url) => set("logo", url)} disabled={locked} />
      </AuthCard>
      <AuthCard title="Kulüp kimliği">
        <Input
          label="Takım adı"
          value={form.team_name}
          onChangeText={(value) => set("team_name", value)}
          error={nameError}
          maxLength={120}
          editable={!locked}
        />
        <Input
          label="Kuruluş tarihi"
          value={form.founded_at}
          onChangeText={(value) => set("founded_at", value)}
          error={dateError}
          placeholder="GG.AA.YYYY"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          editable={!locked}
        />
        <Input
          label="Kulüp renkleri"
          value={form.colors}
          onChangeText={(value) => set("colors", value)}
          placeholder="Örn. Kırmızı - Beyaz"
          maxLength={80}
          hint="Forma renk kodları Formalar sekmesinde."
          editable={!locked}
        />
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
        disabled={!changed || Boolean(pending) || Boolean(nameError || dateError)}
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
    </>
  );
}

/* ═══════════════════════════════ FORMALAR (doğrudan) ═══════════════════════════════ */

const KIT_PARTS: { key: KitKey; label: string }[] = [
  { key: "primary", label: "Ana renk (gövde)" },
  { key: "secondary", label: "İkincil (kol, yaka)" },
  { key: "accent", label: "Şerit / numara" },
];

function KitSection() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const rosterQuery = useQuery({ queryKey: ["takim", "roster"], queryFn: getTeamRoster, staleTime: 60_000 });
  const [home, setHome] = useState<Kit | null>(null);
  const [away, setAway] = useState<Kit | null>(null);

  useEffect(() => {
    const settings = rosterQuery.data?.settings;
    if (!settings || home) return;
    setHome({ ...(settings.home_kit ?? {}) });
    setAway({ ...(settings.away_kit ?? {}) });
  }, [home, rosterQuery.data]);

  const save = useMutation({
    mutationFn: () => updateTeamSettings({ home_kit: clean(home), away_kit: clean(away) }),
    onSuccess: (data) => {
      toast.show({ message: data.message || "Formalar kaydedildi.", tone: "success" });
      void queryClient.invalidateQueries({ queryKey: ["takim", "roster"] });
    },
    onError: (error) => toast.show({ message: errorText(error, "Formalar kaydedilemedi."), tone: "danger" }),
  });

  if (rosterQuery.isLoading || !home || !away) {
    return rosterQuery.isError ? (
      <ErrorState variant="inline" error={rosterQuery.error} onRetry={rosterQuery.refetch} />
    ) : (
      <SkeletonCard lines={4} />
    );
  }

  return (
    <>
      <KitEditor title="İç saha forması" kit={home} onChange={setHome} />
      <KitEditor title="Deplasman forması" kit={away} onChange={setAway} />
      <Button label="Formaları kaydet" onPress={() => save.mutate()} loading={save.isPending} size="lg" fullWidth />
    </>
  );
}

/** Boş renkler gönderilmez; hiç renk yoksa forma temizlenir (null). */
function clean(kit: Kit | null): Kit | null {
  if (!kit) return null;
  const out: Kit = {};
  for (const part of KIT_PARTS) if (isHex(kit[part.key])) out[part.key] = kit[part.key];
  return Object.keys(out).length ? out : null;
}

function KitEditor({ title, kit, onChange }: { title: string; kit: Kit; onChange: (kit: Kit) => void }) {
  const [part, setPart] = useState<KitKey>("primary");
  const color = (key: KitKey) => (isHex(kit[key]) ? (kit[key] as string) : KIT_DEFAULTS[key]);
  return (
    <AuthCard title={title}>
      <View style={styles.kitRow}>
        <View style={styles.jersey} accessibilityLabel={`${title} önizlemesi`}>
          <Ionicons name="shirt" size={72} color={color("primary")} />
          <View style={[styles.jerseyCollar, { backgroundColor: color("secondary") }]} />
          <Text style={[styles.jerseyNumber, { color: color("accent") }]}>10</Text>
        </View>
        <View style={styles.kitParts}>
          {KIT_PARTS.map((item) => (
            <Touchable
              key={item.key}
              feedback="row"
              haptic="selection"
              onPress={() => setPart(item.key)}
              style={[styles.partRow, part === item.key && styles.partRowActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: part === item.key }}
            >
              <View style={[styles.partDot, { backgroundColor: color(item.key) }]} />
              <Text style={styles.partLabel} numberOfLines={1} {...textScale.dense}>
                {item.label}
              </Text>
            </Touchable>
          ))}
        </View>
      </View>
      <View style={styles.swatches}>
        {KIT_SWATCHES.map((swatch) => (
          <Touchable
            key={swatch}
            feedback="icon"
            haptic="selection"
            onPress={() => onChange({ ...kit, [part]: swatch })}
            style={[styles.swatch, { backgroundColor: swatch }, kit[part] === swatch && styles.swatchActive]}
            accessibilityRole="button"
            accessibilityLabel={`Renk ${swatch}`}
          >
            {null}
          </Touchable>
        ))}
      </View>
      <Input
        label="Renk kodu"
        size="sm"
        value={kit[part] ?? ""}
        onChangeText={(value) => onChange({ ...kit, [part]: value.trim() })}
        placeholder={KIT_DEFAULTS[part]}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={7}
        error={kit[part] && !isHex(kit[part]) ? "#RRGGBB biçiminde gir." : undefined}
      />
    </AuthCard>
  );
}

/* ═══════════════════════════════ TAKIM SAYFASI (doğrudan) ═══════════════════════════════ */

const SOCIAL_LABELS: Record<SocialKey, string> = {
  instagram: "Instagram",
  x: "X (Twitter)",
  facebook: "Facebook",
  youtube: "YouTube",
  tiktok: "TikTok",
  website: "Web sitesi",
  whatsapp: "WhatsApp",
};

interface PageForm {
  motto: string;
  history: string;
  goal_music_title: string;
  goal_music_url: string;
  social: Record<SocialKey, string>;
  achievements: TeamAchievement[];
}

function PageSection() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const detailsQuery = useQuery({ queryKey: ["panel", "team-details"], queryFn: getTeamDetails, staleTime: 60_000 });
  const [form, setForm] = useState<PageForm | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const details = detailsQuery.data?.details;
    if (!details || form) return;
    setForm({
      motto: details.motto ?? "",
      history: details.history ?? "",
      goal_music_title: details.goal_music_title ?? "",
      goal_music_url: details.goal_music_url ?? "",
      social: Object.fromEntries(SOCIAL_KEYS.map((key) => [key, details.social?.[key] ?? ""])) as Record<SocialKey, string>,
      achievements: details.achievements ?? [],
    });
  }, [detailsQuery.data, form]);

  const save = useMutation({
    mutationFn: () => updateTeamDetails(form as PageForm),
    onSuccess: (data) => {
      setFieldErrors({});
      toast.show({ message: data.message || "Takım sayfası kaydedildi.", tone: "success" });
      queryClient.setQueryData(["panel", "team-details"], data);
    },
    onError: (error) => {
      const raw = error instanceof ApiError && error.detail && typeof error.detail === "object"
        ? ((error.detail as { fieldErrors?: Record<string, string> }).fieldErrors ?? {})
        : {};
      setFieldErrors(raw);
      toast.show({ message: errorText(error, "Takım sayfası kaydedilemedi."), tone: "danger" });
    },
  });

  if (detailsQuery.isError) return <ErrorState variant="inline" error={detailsQuery.error} onRetry={detailsQuery.refetch} />;
  if (!form) return <SkeletonCard lines={5} />;

  const set = <K extends keyof PageForm>(key: K, value: PageForm[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));
  const setSocial = (key: SocialKey, value: string) =>
    setForm((current) => (current ? { ...current, social: { ...current.social, [key]: value } } : current));
  const setAchievement = (index: number, patchValue: Partial<TeamAchievement>) =>
    setForm((current) =>
      current
        ? { ...current, achievements: current.achievements.map((item, i) => (i === index ? { ...item, ...patchValue } : item)) }
        : current,
    );

  return (
    <>
      <AuthCard title="Kulüp">
        <Input label="Slogan" value={form.motto} onChangeText={(value) => set("motto", value)} maxLength={160} placeholder="Örn. Sahada kalp, tribünde aile" />
        <Input
          label="Tarihçe"
          value={form.history}
          onChangeText={(value) => set("history", value)}
          maxLength={8000}
          multiline
          numberOfLines={6}
          placeholder="Takımın nasıl kurulduğunu, unutulmaz maçlarını anlat."
        />
      </AuthCard>

      <AuthCard title="Başarılar">
        {form.achievements.map((item, index) => (
          <View key={index} style={styles.achievement}>
            <Input
              label="Başarı"
              size="sm"
              value={item.title}
              onChangeText={(value) => setAchievement(index, { title: value })}
              maxLength={160}
              placeholder="Örn. FREELİG şampiyonluğu"
            />
            <View style={styles.achievementRow}>
              <Input
                label="Sezon"
                size="sm"
                value={item.season ?? ""}
                onChangeText={(value) => setAchievement(index, { season: value })}
                maxLength={60}
                containerStyle={styles.flex}
              />
              <Input
                label="Derece"
                size="sm"
                value={item.rank ?? ""}
                onChangeText={(value) => setAchievement(index, { rank: value })}
                maxLength={40}
                containerStyle={styles.flex}
              />
            </View>
            <Button
              label="Kaldır"
              variant="ghost"
              size="sm"
              icon="trash-outline"
              onPress={() => set("achievements", form.achievements.filter((_, i) => i !== index))}
            />
          </View>
        ))}
        <Button
          label="Başarı ekle"
          variant="secondary"
          size="sm"
          icon="add"
          onPress={() => set("achievements", [...form.achievements, { title: "", season: "", rank: "" }])}
        />
      </AuthCard>

      <AuthCard title="Sosyal hesaplar">
        {SOCIAL_KEYS.map((key) => (
          <Input
            key={key}
            label={SOCIAL_LABELS[key]}
            size="sm"
            value={form.social[key]}
            onChangeText={(value) => setSocial(key, value)}
            placeholder={key === "whatsapp" ? "05xx xxx xx xx" : "https://"}
            keyboardType={key === "whatsapp" ? "phone-pad" : "url"}
            autoCapitalize="none"
            autoCorrect={false}
            error={fieldErrors[`social.${key}`]}
          />
        ))}
      </AuthCard>

      <AuthCard title="Gol müziği">
        <Input label="Şarkı adı" size="sm" value={form.goal_music_title} onChangeText={(value) => set("goal_music_title", value)} maxLength={120} />
        <Input
          label="Bağlantı"
          size="sm"
          value={form.goal_music_url}
          onChangeText={(value) => set("goal_music_url", value)}
          placeholder="https://"
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          error={fieldErrors.goal_music_url}
        />
      </AuthCard>

      <Button label="Takım sayfasını kaydet" onPress={() => save.mutate()} loading={save.isPending} size="lg" fullWidth />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  kitRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  jersey: { width: 88, height: 88, alignItems: "center", justifyContent: "center" },
  jerseyCollar: { position: "absolute", top: 12, width: 18, height: 6, borderRadius: radius.pill },
  jerseyNumber: { position: "absolute", ...type.h3 },
  kitParts: { flex: 1, gap: space.xs },
  partRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    minHeight: 36,
    paddingHorizontal: space.s,
    borderRadius: radius.md,
  },
  partRowActive: { backgroundColor: colors.surface2 },
  partDot: { width: 18, height: 18, borderRadius: radius.pill, borderWidth: hairline, borderColor: colors.border },
  partLabel: { ...type.label, color: colors.textPrimary, flex: 1 },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  swatch: { width: 32, height: 32, borderRadius: radius.pill, borderWidth: hairline, borderColor: colors.border },
  swatchActive: { borderWidth: 3, borderColor: colors.accent },
  achievement: {
    gap: space.s,
    paddingBottom: space.s,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  achievementRow: { flexDirection: "row", gap: space.s },
});
