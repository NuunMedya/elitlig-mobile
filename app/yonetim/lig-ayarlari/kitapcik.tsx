/**
 * KURAL KİTAPÇIĞI DÜZENLEYİCİ — web RuleBooksManager + RuleBookWizard.
 *
 *   ?id=<public_id>     mevcut kitapçığı düzenler
 *   ?kopya=<public_id>  o kitapçıktan yeni kitapçık başlatır (metin, ayarlar,
 *                       puanlama ve kadro kuralları kopyalanır; taslak açılır)
 *   (parametresiz)      yeni serbest metin kitapçık
 *
 * Bölümler: genel (başlık, durum), içerik, puanlama sistemi, kadro kuralları
 * ve kitapçığı kullanan sezonlar. Puanlama / kadro bölümleri rule_books.manage
 * yetkisiyle görünür; yayına alma rule_books.publish ister (sunucu denetler).
 *
 * MOBİLDE SINIR: seçenekli (structured) kitapçığın madde seçenekleri 1600+
 * satırlık şema sihirbazıyla yazılıyor; bu ekranda o maddeler düzenlenmez,
 * kayıtta settings ve metin olduğu gibi korunur. Başlık, durum, puanlama ve
 * kadro kuralları tam düzenlenir; serbest metin kitapçığın içeriği de.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text } from "react-native";

import { AdminScreen, InfoLine, Panel, RecordCard, SegmentField, confirmAction } from "@/components/admin";
import { RosterRulesEditor } from "@/components/admin/league/RosterRulesEditor";
import { ScoringEditor } from "@/components/admin/league/ScoringEditor";
import { Button, ErrorState, Input, SkeletonCard, useToast } from "@/components/ui";
import { hasPermission } from "@/lib/admin/access";
import { errorText } from "@/lib/admin/errors";
import {
  RULE_BOOK_KIND_LABELS,
  copyManage,
  createRuleBook,
  emptyManage,
  getRuleBook,
  getRuleBookManage,
  getRuleBookSeasons,
  htmlToPlain,
  managePayload,
  manageFromApi,
  plainToHtml,
  scoringSummary,
  updateRuleBook,
  validatePoints,
  type ManageState,
  type RuleBookBody,
} from "@/lib/api/admin/leagues";
import { useAuth } from "@/providers/AuthProvider";
import { colors, textScale, type } from "@/theme";

const PERMS = ["rule_books.create", "rule_books.update"];

const sameScoring = (a?: { type?: string; win?: number; draw?: number; loss?: number } | null, b?: ManageState["scoring"]) =>
  (a?.type || "standart") === (b?.type || "standart") &&
  (a?.type !== "ozel" || (Number(a?.win) === Number(b?.win) && Number(a?.draw) === Number(b?.draw) && Number(a?.loss) === Number(b?.loss)));

export default function RuleBookEditorScreen() {
  const auth = useAuth();
  const user = auth.user;
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ id?: string; kopya?: string }>();
  const editId = params.id ? String(params.id) : null;
  const sourceId = editId ?? (params.kopya ? String(params.kopya) : null);
  const isNew = !editId;
  const canManage = hasPermission(user, "rule_books.manage");
  const canPublish = hasPermission(user, "rule_books.publish");

  const book = useQuery({ queryKey: ["admin", "rule-books", "item", sourceId], queryFn: () => getRuleBook(sourceId!), enabled: sourceId != null });
  const manage = useQuery({
    queryKey: ["admin", "rule-books", "manage", sourceId],
    queryFn: () => getRuleBookManage(sourceId!),
    enabled: sourceId != null && canManage,
  });
  const seasons = useQuery({
    queryKey: ["admin", "rule-books", "seasons", editId],
    queryFn: () => getRuleBookSeasons(editId!),
    enabled: editId != null,
  });

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("draft");
  const [content, setContent] = useState("");
  const [rules, setRules] = useState<ManageState>(emptyManage);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [ready, setReady] = useState(sourceId == null);

  // Kaynak kitapçık gelince form doldurulur (kopyada başlık "(kopya)", durum taslak).
  useEffect(() => {
    if (!sourceId || !book.data || ready) return;
    if (canManage && !manage.data && !manage.error) return;
    const item = book.data;
    setTitle(editId ? item.title : `${item.title} (kopya)`);
    setStatus(editId ? item.status : "draft");
    setContent(item.kind === "rich" ? htmlToPlain(item.content) : "");
    const state = manageFromApi(manage.data?.manage);
    setRules(editId ? state : copyManage(state));
    setReady(true);
  }, [sourceId, editId, book.data, manage.data, manage.error, canManage, ready]);

  const kind = book.data?.kind ?? "rich";
  const structured = kind === "structured";
  const activeSeasons = useMemo(() => (seasons.data ?? []).filter((s) => !s.archived), [seasons.data]);

  const edit = <T,>(setter: (v: T) => void) => (v: T) => {
    setDirty(true);
    setter(v);
  };

  const save = async () => {
    if (!title.trim()) return toast.show({ message: "Kitapçık başlığı zorunludur.", tone: "danger" });
    if (!structured && !content.trim()) return toast.show({ message: "Kural içeriği boş olamaz.", tone: "danger" });
    if (canManage && rules.scoring.type === "ozel") {
      const problem = validatePoints(rules.scoring);
      if (problem) return toast.show({ message: problem, tone: "danger" });
    }
    const changing = canManage ? activeSeasons.filter((s) => !sameScoring(s.scoring, rules.scoring)) : [];
    if (changing.length) {
      const ok = await confirmAction({
        title: "Puanlama değişecek",
        message: `${changing.length} sezonun puanlaması değişecek ve puan tabloları yeniden hesaplanacak. Devam edilsin mi?`,
        confirmLabel: "Kaydet",
      });
      if (!ok) return;
    }
    const body: Partial<RuleBookBody> = { title: title.trim(), status };
    if (isNew) {
      body.kind = kind;
      if (structured) {
        // Kopyada seçenekli kitapçığın ayarları ve metin anlık görüntüsü olduğu gibi taşınır.
        body.settings = book.data?.settings ?? null;
        body.content = book.data?.content ?? "";
      } else {
        body.content = plainToHtml(content);
      }
    } else if (!structured) {
      body.content = plainToHtml(content);
    }
    if (canManage) body.manage = managePayload(rules);
    setBusy(true);
    try {
      const result = isNew ? await createRuleBook(body as RuleBookBody) : await updateRuleBook(editId!, body);
      const sync = result?.sync;
      const synced = sync?.updated
        ? ` ${sync.updated} sezona uygulandı${sync.scoring ? `; ${sync.scoring} sezonun puan tablosu yeniden hesaplandı` : ""}.`
        : "";
      toast.show({ message: `${isNew ? "Kural kitapçığı kaydedildi." : "Kural kitapçığı güncellendi."}${synced}`, tone: "success" });
      void qc.invalidateQueries({ queryKey: ["admin", "rule-books"] });
      void qc.invalidateQueries({ queryKey: ["admin", "seasons"] });
      setDirty(false);
      router.back();
    } catch (error) {
      toast.show({ message: errorText(error), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const loading = sourceId != null && !ready && !book.error;

  return (
    <AdminScreen
      title={isNew ? (params.kopya ? "Kitapçığı kopyala" : "Yeni kitapçık") : "Kitapçığı düzenle"}
      subtitle={book.data && editId ? book.data.title : undefined}
      permission={PERMS}
      actions={[{ icon: "checkmark", onPress: () => void save(), accessibilityLabel: "Kaydet", tone: dirty ? "brand" : undefined }]}
    >
      {book.error ? (
        <ErrorState error={book.error} onRetry={book.refetch} variant="inline" />
      ) : loading ? (
        <SkeletonCard />
      ) : (
        <>
          <Panel title="GENEL">
            <Input label="Başlık *" value={title} onChangeText={edit(setTitle)} placeholder="ör. 2026 Güz Ligi Kuralları" />
            <SegmentField
              label="Durum"
              value={status}
              onChange={edit(setStatus)}
              options={[
                { key: "draft", label: "Taslak" },
                { key: "published", label: "Yayında" },
              ]}
            />
            {status === "published" && !canPublish ? (
              <Text style={styles.warn} {...textScale.long}>
                Yayına alma yetkin yok; kayıt sunucu tarafından reddedilir. Taslak olarak kaydet.
              </Text>
            ) : null}
            <InfoLine label="Biçim" value={RULE_BOOK_KIND_LABELS[kind] ?? kind} />
          </Panel>

          <Panel title="İÇERİK">
            {structured ? (
              <Text style={styles.note} {...textScale.long}>
                Seçenekli kitapçığın maddeleri ayarlardan üretilir ve madde sihirbazı bu ekranda açılmaz; maddeler ve metin olduğu gibi korunur.
                {book.data?.summary ? `\n\n${book.data.summary}` : ""}
              </Text>
            ) : (
              <Input
                label="Kurallar metni *"
                value={content}
                onChangeText={edit(setContent)}
                multiline
                numberOfLines={12}
                placeholder={"1. Maçlar 2x25 dakika oynanır.\n\n2. ..."}
                hint="Paragrafları boş satırla ayır."
              />
            )}
          </Panel>

          {canManage ? (
            <>
              <Panel title="PUANLAMA SİSTEMİ">
                <Text style={styles.note} {...textScale.dense}>
                  Şu an: {scoringSummary(rules.scoring)}
                </Text>
                <ScoringEditor value={rules.scoring} onChange={edit((s: ManageState["scoring"]) => setRules((r) => ({ ...r, scoring: s })))} />
              </Panel>
              <Panel title="KADRO KURALLARI">
                <RosterRulesEditor value={rules.roster} onChange={edit((roster: ManageState["roster"]) => setRules((r) => ({ ...r, roster })))} />
              </Panel>
            </>
          ) : null}

          {editId ? (
            <Panel title="KULLANAN SEZONLAR">
              {activeSeasons.length ? (
                activeSeasons.map((s) => (
                  <RecordCard
                    key={s.id}
                    title={s.name}
                    subtitle={s.league_name}
                    meta={[s.scoring ? scoringSummary(s.scoring) : null, s.roster ? s.roster.name || "Kadro kuralları" : null].filter(Boolean).join(" · ")}
                    icon="calendar-outline"
                  />
                ))
              ) : (
                <Text style={styles.note} {...textScale.long}>
                  Henüz bir sezonda kullanılmıyor. Sezonlar ekranından seçebilirsin.
                </Text>
              )}
            </Panel>
          ) : null}

          <Button label={isNew ? "Kitapçığı kaydet" : "Değişiklikleri kaydet"} icon="save-outline" onPress={() => void save()} loading={busy} fullWidth haptic="success" />
        </>
      )}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  note: { ...type.bodySm, color: colors.textSecondary },
  warn: { ...type.bodySm, color: colors.warn },
});
