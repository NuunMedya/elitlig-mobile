/**
 * HESABIM (YÖNETİM) — yönetim kullanıcısının kendi hesabı
 * (web pages/management/account/AdminAccount.js, /yonetim/hesabim).
 *
 * ÜÇ SEKME:
 *   PROFİL     ad soyad, kullanıcı adı, e-posta, telefon (PATCH /api/users/me).
 *              İl yönetim hesaplarında yetki kapsamıdır: salt okunur (CITY_LOCKED).
 *   GÜVENLİK   mevcut şifre doğrulamalı değişim, şifre gücü ve kurallar;
 *              değişince diğer cihazlardaki oturumlar kapanır, bu cihazın
 *              jetonu yenilenir (AuthProvider.changePassword). Oturum bilgisi
 *              ve çıkış.
 *   YETKİLERİM kendisine tanımlı yetkiler, modül modül (GET /api/users/me/account).
 *
 * Her yönetim kullanıcısına açıktır (yetki gerekmez).
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { LinearGradient } from "expo-linear-gradient";

import { AdminScreen, InfoLine, Panel, confirmAction } from "@/components/admin";
import { Aurora, Avatar, Badge, Button, ErrorState, Input, SkeletonCard, Tabs, Touchable, useToast } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { ROLE_LABELS } from "@/lib/api/admin";
import {
  ACCOUNT_STATUS_LABELS,
  PASSWORD_SCORE_LABELS,
  getAccountSummary,
  passwordScore,
  systemKeys,
  updateMyProfile,
  type AccountSummary,
} from "@/lib/api/admin/system";
import { ApiError } from "@/lib/http";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type, upperTR } from "@/theme";

type Tab = "profil" | "guvenlik" | "yetkiler";
const PROFILE_FIELDS = ["fullName", "username", "email", "phone"] as const;
type ProfileKey = (typeof PROFILE_FIELDS)[number];

const NATIONWIDE = new Set(["admin", "disiplin_kurulu"]);

export default function AdminAccountScreen() {
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>("profil");
  const query = useQuery({ queryKey: systemKeys.account, queryFn: getAccountSummary });

  // Özet alınamazsa oturumdaki bilgiler gösterilir (web ile aynı).
  const account: AccountSummary["user"] = (query.data?.user ?? (auth.user as unknown as AccountSummary["user"])) || ({} as AccountSummary["user"]);
  const isAdmin = account.role === "admin";
  const permissionCount = isAdmin ? null : account.permissions?.length ?? auth.user?.permissions?.length ?? null;

  return (
    <AdminScreen
      title="Hesabım"
      onRefresh={query.refetch}
      refreshing={query.isRefetching}
      bottom={
        <Tabs
          items={[
            { key: "profil" as Tab, label: "Profil" },
            { key: "guvenlik" as Tab, label: "Güvenlik" },
            { key: "yetkiler" as Tab, label: "Yetkilerim" },
          ]}
          value={tab}
          onChange={setTab}
          distribute="equal"
        />
      }
    >
      {/* KİMLİK SAHNESİ — yönetim ana ekranıyla aynı gece laciverti + Aurora, altın halka. */}
      <View style={styles.stage}>
        <LinearGradient colors={colors.gradientAdminStage} start={{ x: 1, y: 0.5 }} end={{ x: 0, y: 0.5 }} style={StyleSheet.absoluteFill} />
        <Aurora variant="stage" height={200} />
        <View style={styles.hero}>
          <LinearGradient colors={colors.gradientAdminAccent} style={styles.ring}>
            <Avatar name={account.fullName || account.username} size={58} />
          </LinearGradient>
          <View style={styles.flex}>
            <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
              {account.fullName || account.username || "Yönetici"}
            </Text>
            <Text style={styles.handle} numberOfLines={1} {...textScale.dense}>
              @{account.username || "—"}
              {account.title ? ` · ${account.title}` : ""}
            </Text>
            <View style={styles.badges}>
              <View style={styles.rolePill}>
                <Ionicons name="shield-checkmark" size={11} color={colors.adminAccent} />
                <Text style={styles.roleText} numberOfLines={1} {...textScale.badge}>
                  {upperTR(ROLE_LABELS[account.role] ?? account.role ?? "Yönetici")}
                </Text>
              </View>
              <Badge
                label={ACCOUNT_STATUS_LABELS[account.status ?? "active"] ?? "Aktif"}
                tone={["active", "approved"].includes(account.status ?? "active") ? "win" : "warn"}
                size="xs"
                dot
              />
            </View>
          </View>
        </View>
        <View style={styles.tiles}>
          <StageTile icon="location-outline" label="İl" value={account.city || "—"} />
          <StageTile icon="calendar-outline" label="Açılış" value={query.data?.account?.createdAt ? new Date(query.data.account.createdAt).toLocaleDateString("tr-TR", { month: "short", year: "numeric" }) : "—"} />
          <StageTile icon="key-outline" label="Yetki" value={isAdmin ? "Tam" : permissionCount != null ? String(permissionCount) : "—"} />
        </View>
      </View>

      {query.error ? <ErrorState error={query.error} onRetry={query.refetch} variant="banner" /> : null}

      {tab === "profil" ? (
        <ProfileTab account={account} cityLocked={query.data?.account?.cityLocked ?? true} />
      ) : tab === "guvenlik" ? (
        <SecurityTab />
      ) : query.isLoading ? (
        <SkeletonCard />
      ) : (
        <PermissionsTab account={account} groups={query.data?.permissionGroups} />
      )}
    </AdminScreen>
  );
}

/** Sahnedeki cam bilgi karosu. */
function StageTile({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}`}>
      <Ionicons name={icon} size={13} color={colors.onDarkMuted} />
      <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit {...textScale.badge}>
        {value}
      </Text>
      <Text style={styles.tileLabel} numberOfLines={1} {...textScale.badge}>
        {upperTR(label)}
      </Text>
    </View>
  );
}

/* ═══════════════════════════ PROFİL ═══════════════════════════ */

function ProfileTab({ account, cityLocked }: { account: AccountSummary["user"]; cityLocked: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const initial = useMemo(
    () => Object.fromEntries(PROFILE_FIELDS.map((k) => [k, (account[k] as string | null) ?? ""])) as Record<ProfileKey, string>,
    [account.fullName, account.username, account.email, account.phone] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => setForm(initial), [initial]);

  const changed = PROFILE_FIELDS.filter((k) => form[k].trim() !== initial[k]);
  const usernameMissing = !form.username.trim();
  const nationwide = NATIONWIDE.has(account.role);

  const set = (key: ProfileKey) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((e) => ({ ...e, [key]: "" }));
    setFailure(null);
  };

  const submit = async () => {
    if (!changed.length || usernameMissing) return;
    setBusy(true);
    setFailure(null);
    setFieldErrors({});
    try {
      await updateMyProfile(Object.fromEntries(changed.map((k) => [k, form[k].trim() || null])));
      await queryClient.invalidateQueries({ queryKey: systemKeys.account });
      toast.show({ message: "Profil bilgilerin güncellendi.", tone: "success" });
    } catch (error) {
      const detail = error instanceof ApiError ? (error.detail as { fieldErrors?: Record<string, string | string[]> } | undefined) : undefined;
      if (detail?.fieldErrors) {
        setFieldErrors(Object.fromEntries(Object.entries(detail.fieldErrors).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : String(v)])));
      }
      setFailure(errorText(error, "Bilgiler kaydedilemedi."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Panel title="Kişisel bilgiler">
        <View style={styles.fields}>
          <Input floating label="Ad soyad" value={form.fullName} onChangeText={set("fullName")} placeholder="Adın ve soyadın" autoComplete="name" error={fieldErrors.fullName || undefined} />
          <Input
            floating
            label="Kullanıcı adı *"
            value={form.username}
            onChangeText={set("username")}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            error={usernameMissing ? "Kullanıcı adı gerekli." : fieldErrors.username || undefined}
          />
          <Input
            floating
            label="E-posta"
            value={form.email}
            onChangeText={set("email")}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="ornek@elitlig.com"
            error={fieldErrors.email || undefined}
          />
          <Input
            floating
            label="Telefon"
            value={form.phone}
            onChangeText={set("phone")}
            keyboardType="phone-pad"
            autoComplete="tel"
            placeholder="05xx xxx xx xx"
            error={fieldErrors.phone || undefined}
          />
          <Input
            floating
            label="İl"
            value={account.city || ""}
            editable={false}
            trailing={<Ionicons name="lock-closed-outline" size={16} color={colors.textTertiary} />}
            hint={
              cityLocked
                ? "Yönetim hesaplarında il, yetki kapsamını belirler. Değişiklik için bir admin ile iletişime geç."
                : "İl bilgisi yalnız yetkili yönetici tarafından değiştirilebilir."
            }
          />
        </View>
        {failure ? (
          <Text style={styles.failure} {...textScale.long}>
            {failure}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Button
            label="Vazgeç"
            variant="ghost"
            disabled={!changed.length || busy}
            onPress={() => {
              setForm(initial);
              setFieldErrors({});
              setFailure(null);
            }}
          />
          <Button label="Değişiklikleri kaydet" onPress={() => void submit()} loading={busy} disabled={!changed.length || usernameMissing} style={styles.flex} haptic="success" />
        </View>
      </Panel>

      <Panel title="Hesap özeti">
        <InfoLine label="Rol" value={ROLE_LABELS[account.role] ?? account.role ?? "—"} />
        <InfoLine label="İl" value={account.city || "—"} />
        <InfoLine label="Yetki kapsamı" value={nationwide ? "Tüm iller" : "Yalnız kendi ili"} />
        <InfoLine label="Hesap no" value={`#${account.id ?? "—"}`} />
        <InfoLine label="E-posta" value={account.email || "Eklenmemiş"} />
        <InfoLine label="Telefon" value={account.phone || "Eklenmemiş"} />
        <Text style={styles.hint} {...textScale.long}>
          E-posta ve telefon bilgilerin güncel olursa şifreni unuttuğunda yönetim seni daha hızlı doğrular.
        </Text>
      </Panel>
    </>
  );
}

/* ═══════════════════════════ GÜVENLİK ═══════════════════════════ */

function PasswordInput({ label, value, onChangeText, autoComplete, error }: { label: string; value: string; onChangeText: (v: string) => void; autoComplete: "current-password" | "new-password"; error?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      floating
      label={label}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete={autoComplete}
      error={error}
      trailing={
        <Touchable onPress={() => setVisible((v) => !v)} accessibilityRole="button" accessibilityLabel={visible ? "Şifreyi gizle" : "Şifreyi göster"}>
          <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={18} color={colors.textTertiary} />
        </Touchable>
      }
    />
  );
}

function SecurityTab() {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState({ current: "", next: "", repeat: "" });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const rules = [
    { ok: form.next.length >= 8, text: "En az 8 karakter" },
    { ok: /[A-Za-zğüşıöçĞÜŞİÖÇ]/.test(form.next) && /[0-9]/.test(form.next), text: "En az bir harf ve bir rakam" },
    { ok: Boolean(form.next) && form.next !== form.current, text: "Mevcut şifreden farklı" },
    { ok: Boolean(form.repeat) && form.next === form.repeat, text: "Tekrarı eşleşiyor" },
  ];
  const ready = Boolean(form.current) && rules.every((r) => r.ok);
  const score = passwordScore(form.next);
  const scoreColor = score >= 3 ? colors.win : score === 2 ? colors.warn : colors.danger;
  const set = (key: keyof typeof form) => (v: string) => {
    setForm((f) => ({ ...f, [key]: v }));
    setFailure(null);
  };

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setFailure(null);
    try {
      const message = await auth.changePassword(form.current, form.next);
      setForm({ current: "", next: "", repeat: "" });
      toast.show({ message: message || "Şifren güncellendi.", tone: "success" });
    } catch (error) {
      setFailure(errorText(error, "Şifre değiştirilemedi."));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    const ok = await confirmAction({ title: "Çıkış yapılsın mı?", message: "Bu cihazdaki oturumun kapanır.", confirmLabel: "Çıkış yap", destructive: true });
    if (ok) await auth.signOut();
  };

  return (
    <>
      <Panel title="Şifre değiştir">
        <Text style={styles.hint} {...textScale.long}>
          Güvenliğin için şifreni düzenli aralıklarla yenile ve başka hesaplarda kullanma.
        </Text>
        <View style={styles.fields}>
          <PasswordInput label="Mevcut şifre" value={form.current} onChangeText={set("current")} autoComplete="current-password" />
          <PasswordInput label="Yeni şifre" value={form.next} onChangeText={set("next")} autoComplete="new-password" />
          <View style={styles.strength} accessible accessibilityLabel={`Şifre gücü: ${form.next ? PASSWORD_SCORE_LABELS[score] : "yok"}`}>
            <View style={styles.strengthBar}>
              {[1, 2, 3, 4].map((step) => (
                <View key={step} style={[styles.strengthStep, { backgroundColor: score >= step ? scoreColor : colors.surface3 }]} />
              ))}
            </View>
            <Text style={styles.hint} {...textScale.dense}>
              {form.next ? `Şifre gücü: ${PASSWORD_SCORE_LABELS[score]}` : "Şifre gücü"}
            </Text>
          </View>
          <PasswordInput
            label="Yeni şifre (tekrar)"
            value={form.repeat}
            onChangeText={set("repeat")}
            autoComplete="new-password"
            error={form.repeat && form.repeat !== form.next ? "Tekrar eşleşmiyor." : undefined}
          />
        </View>
        <View style={styles.rules}>
          {rules.map((r) => (
            <View key={r.text} style={styles.rule}>
              <Ionicons name={r.ok ? "checkmark-circle" : "ellipse-outline"} size={16} color={r.ok ? colors.win : colors.textTertiary} />
              <Text style={[styles.ruleText, r.ok ? styles.ruleOk : null]} {...textScale.dense}>
                {r.text}
              </Text>
            </View>
          ))}
        </View>
        {failure ? (
          <Text style={styles.failure} {...textScale.long}>
            {failure}
          </Text>
        ) : null}
        <Button label="Şifreyi güncelle" onPress={() => void submit()} loading={busy} disabled={!ready} fullWidth haptic="success" />
      </Panel>

      <Panel title="Oturum">
        <InfoLine label="Hesap" value={`@${auth.user?.username ?? "—"}`} />
        <InfoLine label="Rol" value={ROLE_LABELS[auth.user?.role ?? ""] ?? auth.user?.role ?? "—"} />
        <Text style={styles.hint} {...textScale.long}>
          Şifreni değiştirdiğinde diğer tüm cihazlardaki oturumların kapanır; bu cihazda oturumun açık kalır.
        </Text>
        <View style={styles.actions}>
          <Button label="Şifremi unuttum" variant="ghost" icon="help-circle-outline" onPress={() => router.push("/sifremi-unuttum" as never)} />
          <Button label="Çıkış yap" variant="danger" icon="log-out-outline" onPress={() => void signOut()} style={styles.flex} />
        </View>
      </Panel>
    </>
  );
}

/* ═══════════════════════════ YETKİLERİM ═══════════════════════════ */

function PermissionsTab({ account, groups }: { account: AccountSummary["user"]; groups?: AccountSummary["permissionGroups"] }) {
  const [q, setQ] = useState("");
  const isAdmin = account.role === "admin";
  const text = q.trim().toLocaleLowerCase("tr-TR");

  const visible = useMemo(() => {
    // Sunucu eski sürümdeyse etiketler gelmez; ham anahtarlar modüle göre gruplanır.
    const source =
      groups ??
      Object.values(
        (account.permissions ?? []).reduce<Record<string, { key: string; label: string; total: number; permissions: { key: string; label: string }[] }>>((acc, key) => {
          const module = key.split(".")[0];
          acc[module] = acc[module] ?? { key: module, label: module, total: 0, permissions: [] };
          acc[module].permissions.push({ key, label: key });
          return acc;
        }, {})
      );
    if (!text) return source;
    return source
      .map((g) =>
        g.label.toLocaleLowerCase("tr-TR").includes(text)
          ? g
          : { ...g, permissions: g.permissions.filter((p) => `${p.label} ${p.key}`.toLocaleLowerCase("tr-TR").includes(text)) }
      )
      .filter((g) => g.permissions.length);
  }, [groups, account.permissions, text]);

  return (
    <>
      <Text style={styles.hint} {...textScale.long}>
        {isAdmin
          ? "Admin rolü paneldeki tüm işlemlere erişebilir; aşağıda tam liste yer alır."
          : "Yetkiler kişiye özel verilir ve “Kullanıcı yetkilendirme” ekranından düzenlenir. Eksik bir yetkin varsa admin ile iletişime geç."}
      </Text>
      <Input variant="search" leadingIcon="search" value={q} onChangeText={setQ} placeholder="Yetki ara" autoCapitalize="none" autoCorrect={false} />
      {!visible.length ? (
        <Text style={styles.hint} {...textScale.dense}>
          {text ? "Aramaya uyan yetki yok." : "Bu hesaba tanımlı yetki bulunmuyor."}
        </Text>
      ) : (
        visible.map((g) => (
          <Panel key={g.key} title={`${g.label} · ${g.permissions.length}${g.total ? ` / ${g.total}` : ""}`}>
            {g.permissions.map((p) => (
              <View key={p.key} style={styles.perm}>
                <Ionicons name="checkmark" size={16} color={colors.win} />
                <Text style={styles.permText} {...textScale.dense}>
                  {p.label}
                </Text>
              </View>
            ))}
          </Panel>
        ))
      )}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stage: {
    borderRadius: radius.xxl,
    overflow: "hidden",
    backgroundColor: colors.adminBar,
    padding: space.lg,
    gap: space.lg,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  hero: { flexDirection: "row", gap: space.md, alignItems: "center" },
  ring: { padding: 2, borderRadius: radius.pill },
  name: { ...type.h1, color: colors.onDark },
  handle: { ...type.caption, color: colors.onDarkMuted },
  badges: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs, marginTop: space.s },
  rolePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.adminAccent,
  },
  roleText: { ...type.micro, color: colors.adminAccent },
  tiles: { flexDirection: "row", gap: space.sm },
  tile: {
    flex: 1,
    gap: space.xxs,
    padding: space.sm + space.xxs,
    borderRadius: radius.lg,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  tileValue: { ...type.metricSm, color: colors.onDark },
  tileLabel: { ...type.nano, color: colors.onDarkMuted },
  fields: { gap: space.md },
  actions: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
  hint: { ...type.caption, color: colors.textTertiary },
  failure: { ...type.bodySm, color: colors.danger },
  strength: { gap: space.xs },
  strengthBar: { flexDirection: "row", gap: space.xs },
  strengthStep: { flex: 1, height: 4, borderRadius: radius.pill },
  rules: { gap: space.xs, paddingVertical: space.xs },
  rule: { flexDirection: "row", alignItems: "center", gap: space.sm },
  ruleText: { ...type.bodySm, color: colors.textSecondary },
  ruleOk: { color: colors.textPrimary },
  perm: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xxs, borderTopWidth: hairline, borderTopColor: colors.separator },
  permText: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
});
