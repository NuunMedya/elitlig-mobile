/**
 * HABER DÜZENLEYİCİ — yeni haber (id="yeni") ya da mevcut haberi düzenleme
 * (web NewsManager.js düzenleyici paneli).
 *
 * ALANLAR: başlık, özet (boşsa içerikten üretilir), gövde (metin / HTML kipi,
 * gövdeye görsel ekleme), kapak görseli (galeriden yükle ya da bağlantı),
 * kategori, yayın kapsamı (Türkiye geneli ya da il → lig → sezon; il kısıtlı
 * yetkili kendi iline kilitli), sabitle, yayınla / taslak, sil.
 *
 * YETKİ: yeni kayıt news.create, düzenleme news.update, yayına almak
 * news.publish (yoksa yalnız taslak kaydedilir), silmek news.delete.
 */

import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";

import { AdminScreen, ChipsField, confirmAction, ToggleField, useAdminMutation } from "@/components/admin";
import { SysGroup } from "@/components/admin/system/SysKit";
import { BodyEditor, type BodyMode } from "@/components/admin/news/BodyEditor";
import { CoverField, newsCategoryTile, useNewsScope } from "@/components/admin/news/NewsParts";
import { ScopeSelects } from "@/components/admin/penalties/ScopeSelects";
import { Button, ErrorState, Input, SegmentedControl, SkeletonCard } from "@/components/ui";
import { hasAnyPermission } from "@/lib/admin/access";
import { formatDateTime } from "@/lib/admin/format";
import {
  createNews,
  deleteNews,
  getAdminNews,
  htmlToText,
  isSimpleHtml,
  NEWS_CATEGORY_LABELS,
  NEWS_STATUS_LABELS,
  plainText,
  textToHtml,
  updateNews,
  type AdminNews,
  type NewsCategory,
  type NewsInput,
  type NewsStatus,
} from "@/lib/api/admin/news";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

interface Draft {
  title: string;
  summary: string;
  body: string;
  mode: BodyMode;
  modeLocked: boolean;
  cover: string;
  category: NewsCategory;
  scopeMode: "national" | "city";
  cityId: number | null;
  leagueId: number | null;
  seasonId: number | null;
  pinned: boolean;
}

const EMPTY: Draft = {
  title: "",
  summary: "",
  body: "",
  mode: "text",
  modeLocked: false,
  cover: "",
  category: "genel",
  scopeMode: "national",
  cityId: null,
  leagueId: null,
  seasonId: null,
  pinned: false,
};

function fromNews(item: AdminNews): Draft {
  const simple = isSimpleHtml(item.content || "");
  return {
    title: item.title || "",
    summary: item.summary || "",
    body: simple ? htmlToText(item.content || "") : item.content || "",
    mode: simple ? "text" : "html",
    modeLocked: !simple,
    cover: item.cover_image_url || "",
    category: item.category || "genel",
    scopeMode: item.city_id ? "city" : "national",
    cityId: item.city_id,
    leagueId: item.league_id,
    seasonId: item.season_id,
    pinned: Boolean(item.pinned),
  };
}

export default function NewsEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = !id || id === "yeni";
  const publicId = isNew ? "" : String(id);
  const auth = useAuth();
  const router = useRouter();
  const scope = useNewsScope(auth.user);

  const canPublish = hasAnyPermission(auth.user, ["news.publish"]);
  const canDelete = hasAnyPermission(auth.user, ["news.delete"]);

  const query = useQuery({ queryKey: ["admin", "news", "detail", publicId], queryFn: () => getAdminNews(publicId), enabled: !isNew });
  const item = query.data;

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  useEffect(() => {
    if (item) setDraft(fromNews(item));
  }, [item]);

  // İl kısıtlı yetkili: kapsam her zaman kendi ili.
  useEffect(() => {
    if (!scope.nationwide && scope.ownCityId && (isNew || draft.cityId == null)) set({ scopeMode: "city", cityId: scope.ownCityId });
  }, [scope.nationwide, scope.ownCityId]); // eslint-disable-line react-hooks/exhaustive-deps

  const locked = item ? !scope.canEditItem(item) : false;

  const html = useMemo(() => (draft.mode === "html" ? draft.body : textToHtml(draft.body)), [draft.body, draft.mode]);

  const save = useAdminMutation(
    (status: NewsStatus | undefined) => {
      const city = scope.nationwide ? (draft.scopeMode === "city" ? draft.cityId : null) : scope.ownCityId ?? draft.cityId;
      const body = {
        title: draft.title.trim(),
        summary: draft.summary.trim(),
        content: html,
        cover_image_url: draft.cover.trim(),
        category: draft.category,
        city_id: city ?? null,
        league_id: city ? draft.leagueId : null,
        season_id: city && draft.leagueId ? draft.seasonId : null,
        // undefined: durum değişmez (yayına alma yetkisi olmayan, yayındaki haberi düzenliyor).
        ...(status ? { status } : {}),
        pinned: draft.pinned,
      } as NewsInput;
      return isNew ? createNews(body) : updateNews(publicId, body);
    },
    {
      silentError: true,
      success: (_r, status) => (isNew ? (status === "published" ? "Haber yayımlandı." : "Taslak kaydedildi.") : "Haber güncellendi."),
      invalidate: [["admin", "news"]],
      onSuccess: (result) => {
        if (isNew && result?.item?.id) router.replace(`/yonetim/haberler/${encodeURIComponent(result.item.id)}` as Href);
      },
    }
  );

  const submit = async (status: NewsStatus | undefined) => {
    setError(null);
    if (!draft.title.trim()) return setError("Haber başlığı zorunludur.");
    if (scope.nationwide && draft.scopeMode === "city" && !draft.cityId) return setError("Haberin yayınlanacağı ili seç.");
    if (!plainText(html) && !/<img/i.test(html)) return setError("Haber içeriği boş olamaz.");
    try {
      await save.mutateAsync(status);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = useAdminMutation(() => deleteNews(publicId), {
    success: "Haber silindi. Çöp kutusundan geri alınabilir.",
    invalidate: [["admin", "news"]],
    onSuccess: () => router.back(),
  });

  const askDelete = async () => {
    const ok = await confirmAction({ title: "Haber silinsin mi?", message: `“${draft.title || "Haber"}” silinecek.`, confirmLabel: "Sil", destructive: true });
    if (ok) remove.mutate(undefined);
  };

  const published = item?.status === "published";
  const primaryStatus: NewsStatus | undefined = canPublish ? "published" : published ? undefined : "draft";

  return (
    <AdminScreen
      title={isNew ? "Yeni haber" : "Haberi düzenle"}
      subtitle={item ? `${NEWS_STATUS_LABELS[item.status]} · ${formatDateTime(item.updated_at)}` : "Haber ya da köşe yazısı"}
      permission={isNew ? ["news.create"] : ["news.update"]}
      actions={[
        ...(!isNew && item ? [{ icon: "eye-outline" as const, onPress: () => router.push(`/haber/${encodeURIComponent(publicId)}` as Href), accessibilityLabel: "Önizle" }] : []),
        ...(!isNew && canDelete && !locked ? [{ icon: "trash-outline" as const, tone: "danger" as const, onPress: () => void askDelete(), accessibilityLabel: "Haberi sil" }] : []),
      ]}
    >
      {!isNew && query.isLoading ? (
        <>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={6} />
        </>
      ) : !isNew && (query.error || !item) ? (
        <ErrorState error={query.error ?? new Error("Haber bulunamadı.")} onRetry={query.refetch} variant="inline" />
      ) : locked ? (
        <ErrorState error={new Error("Türkiye geneli haberleri yalnız Türkiye geneli yetkililer düzenler.")} variant="inline" />
      ) : (
        <>
          {/* Canlı önizleme: kapak (yoksa kategori degradesi), durum hapı, başlık. */}
          <View style={styles.preview}>
            {draft.cover ? (
              <Image source={{ uri: draft.cover }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
            ) : (
              <LinearGradient colors={colors.tileTones[newsCategoryTile(draft.category).tone]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            )}
            <LinearGradient colors={["transparent", colors.overlay]} start={{ x: 0, y: 0.2 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
            {!draft.cover ? (
              <View style={styles.previewIcon}>
                <Ionicons name={newsCategoryTile(draft.category).icon} size={40} color={colors.onDark} />
              </View>
            ) : null}
            <View style={styles.previewTop}>
              <View style={[styles.previewPill, published ? styles.previewPillLive : null]}>
                <View style={[styles.previewDot, { backgroundColor: published ? colors.win : colors.onDarkMuted }]} />
                <Text style={styles.previewPillText} {...textScale.badge}>
                  {published ? "YAYINDA" : isNew ? "YENİ TASLAK" : "TASLAK"}
                </Text>
              </View>
              {draft.pinned ? (
                <View style={styles.previewPill}>
                  <Ionicons name="pin" size={11} color={colors.onDark} />
                  <Text style={styles.previewPillText} {...textScale.badge}>
                    SABİT
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.previewBottom}>
              <Text style={styles.previewKicker} {...textScale.badge}>
                {NEWS_CATEGORY_LABELS[draft.category].toLocaleUpperCase("tr-TR")}
              </Text>
              <Text style={styles.previewTitle} numberOfLines={3} {...textScale.dense}>
                {draft.title.trim() || "Başlık burada görünecek"}
              </Text>
            </View>
          </View>

          <SysGroup title="Başlık ve özet" icon="text" tone="violet">
            <Input label="Başlık *" value={draft.title} onChangeText={(title) => set({ title })} placeholder="Haber başlığı" maxLength={300} />
            <Input
              label="Özet"
              hint="Boş bırakılırsa içerikten üretilir."
              value={draft.summary}
              onChangeText={(summary) => set({ summary })}
              placeholder="Listelerde görünecek kısa açıklama"
              multiline
              numberOfLines={2}
              maxLength={500}
            />
          </SysGroup>

          <SysGroup title="Gövde" icon="document-text" tone="cyan">
            <BodyEditor
              mode={draft.mode}
              modeLocked={draft.modeLocked}
              value={draft.body}
              onChange={(body) => set({ body })}
              onModeChange={(mode) => set({ mode, body: mode === "html" ? textToHtml(draft.body) : htmlToText(draft.body) })}
            />
          </SysGroup>

          <SysGroup title="Kapak" icon="image" tone="pink">
            <CoverField value={draft.cover} onChange={(cover) => set({ cover })} />
          </SysGroup>

          <SysGroup title="Yayın" icon="megaphone" tone="gold">
            <ChipsField<NewsCategory>
              label="Kategori"
              value={draft.category}
              options={(Object.keys(NEWS_CATEGORY_LABELS) as NewsCategory[]).map((key) => ({ key, label: NEWS_CATEGORY_LABELS[key] }))}
              onChange={(value) => set({ category: (value as NewsCategory) ?? "genel" })}
            />
            <ToggleField label="Listenin başına sabitle" value={draft.pinned} onChange={(pinned) => set({ pinned })} />
          </SysGroup>

          <SysGroup title="Yayın kapsamı" icon="globe" tone="mint">
            {scope.nationwide ? (
              <SegmentedControl<"national" | "city">
                items={[
                  { key: "national", label: "Türkiye geneli" },
                  { key: "city", label: "Belirli bir il" },
                ]}
                value={draft.scopeMode}
                onChange={(scopeMode) => set(scopeMode === "national" ? { scopeMode, cityId: null, leagueId: null, seasonId: null } : { scopeMode })}
                size="sm"
              />
            ) : (
              <Text style={styles.note} {...textScale.dense}>
                Bu haber {scope.ownCityName || "ilinde"} yayınlanır; istersen lig ve sezona göre daralt.
              </Text>
            )}
            {draft.scopeMode === "national" && scope.nationwide ? (
              <Text style={styles.note} {...textScale.dense}>
                Tüm illerin haber sayfalarında yayınlanır.
              </Text>
            ) : (
              <ScopeSelects
                value={{ cityId: scope.nationwide ? draft.cityId : scope.ownCityId ?? draft.cityId, leagueId: draft.leagueId, seasonId: draft.seasonId }}
                onChange={(next) => set({ cityId: next.cityId, leagueId: next.leagueId, seasonId: next.seasonId })}
                lockCity={!scope.nationwide}
                allLabels={{ city: "İl seç", league: "Bu ildeki tüm ligler", season: "Bu ligdeki tüm sezonlar" }}
              />
            )}
          </SysGroup>

          {error ? (
            <Text style={styles.error} {...textScale.long}>
              {error}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <Button
              label={published ? "Taslağa al" : "Taslak kaydet"}
              variant="secondary"
              onPress={() => void submit("draft")}
              loading={save.isPending && save.variables === "draft"}
              disabled={save.isPending}
              style={styles.grow}
            />
            <Button
              label={canPublish ? (isNew || !published ? "Yayımla" : "Kaydet") : published ? "Kaydet" : "Kaydet (taslak)"}
              icon={canPublish ? "paper-plane-outline" : "save-outline"}
              onPress={() => void submit(primaryStatus)}
              loading={save.isPending && save.variables === primaryStatus}
              disabled={save.isPending}
              haptic="success"
              style={styles.grow}
            />
          </View>
          {!canPublish ? (
            <Text style={styles.note} {...textScale.dense}>
              Yayına alma yetkin (news.publish) yok; {published ? "haberin yayın durumu değişmez." : "haber taslak olarak kaydedilir."}
            </Text>
          ) : null}
        </>
      )}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  preview: { height: 196, borderRadius: radius.xl, overflow: "hidden", justifyContent: "space-between", padding: space.md, backgroundColor: colors.surface2 },
  previewIcon: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", opacity: 0.5 },
  previewTop: { flexDirection: "row", gap: space.xs },
  previewPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.inkPill, borderWidth: hairline, borderColor: colors.inkPillBorder },
  previewPillLive: { borderColor: colors.win },
  previewDot: { width: 6, height: 6, borderRadius: 3 },
  previewPillText: { ...type.micro, color: colors.onDark },
  previewBottom: { gap: 2 },
  previewKicker: { ...type.overline, color: colors.adminAccent },
  previewTitle: { ...type.h2, color: colors.onDark },
  note: { ...type.bodySm, color: colors.textSecondary },
  error: { ...type.bodySm, color: colors.danger },
  actions: { flexDirection: "row", gap: space.sm },
  grow: { flex: 1 },
});
