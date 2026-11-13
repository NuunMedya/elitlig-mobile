/**
 * YENİ GÖREV — kendine not / hatırlatma ya da ekipten birine görev ata.
 *
 * Atama yetkisi (todos.assign) olan kullanıcı yönetim ekibinden bir ya da
 * birden çok kişi seçer; her kişiye ayrı kart açılır ve atanan kişiye push
 * gider (elitlig-server services/todoNotifications.js). Yetkisi olmayan
 * kullanıcı yalnız kendine kart ekler. Kişisel not başkasına atanamaz.
 *
 * Bitiş zamanı hızlı seçimlerle verilir (bugün akşam, yarın, 3 gün, 1 hafta);
 * sunucu her görev için bitişe 1 saat kala ve süre geçince hatırlatma gönderir.
 *
 * GÖRÜNÜM (yönetim form dili): üstte üç TÜR KARTI (IconTile + ad + tek satır
 * açıklama, seçili olan marka çerçeveli); alanlar versal başlıklı cam grup
 * kartlarında (İçerik · Zamanlama · Kime); başlık `Input floating`; öncelik
 * çipleri renk noktalı; birincil eylem altta sabit `Button lg`.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Ionicons from "@expo/vector-icons/Ionicons";

import { Button, Chip, IconTile, Input, ListRow, ScreenHeader, SkeletonListRow, Touchable, useToast, type IconTileTone } from "@/components/ui";
import {
  createTodo,
  getTodoAssignees,
  getTodoCatalog,
  todoKeys,
  type TodoCreateInput,
  type TodoPriority,
} from "@/lib/api/todos";
import { ROLE_LABELS } from "@/lib/api/admin";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

type Kind = TodoCreateInput["kind"];
type DueChoice = "none" | "today" | "tomorrow" | "3d" | "1w";

const KINDS: { key: Kind; label: string; hint: string; icon: keyof typeof Ionicons.glyphMap; tone: IconTileTone }[] = [
  { key: "task", label: "Görev", hint: "Yapılacak iş", icon: "checkbox", tone: "violet" },
  { key: "reminder", label: "Hatırlatma", hint: "Zamanı gelince", icon: "notifications", tone: "gold" },
  { key: "note", label: "Kişisel not", hint: "Yalnız sende", icon: "document-text", tone: "cyan" },
];

const PRIORITIES: { key: TodoPriority; label: string }[] = [
  { key: "low", label: "Düşük" },
  { key: "normal", label: "Normal" },
  { key: "high", label: "Yüksek" },
];

const DUE_CHOICES: { key: DueChoice; label: string }[] = [
  { key: "none", label: "Yok" },
  { key: "today", label: "Bugün 18:00" },
  { key: "tomorrow", label: "Yarın 12:00" },
  { key: "3d", label: "3 gün" },
  { key: "1w", label: "1 hafta" },
];

/** Seçimi ISO tarihe çevirir (cihaz saatiyle). */
function dueToIso(choice: DueChoice): string | null {
  const now = new Date();
  const at = (days: number, hours: number) => {
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    date.setHours(hours, 0, 0, 0);
    return date;
  };
  switch (choice) {
    case "today": {
      const date = at(0, 18);
      // Saat 18'i geçtiyse 2 saat sonrası.
      return (date > now ? date : new Date(now.getTime() + 2 * 60 * 60 * 1000)).toISOString();
    }
    case "tomorrow":
      return at(1, 12).toISOString();
    case "3d":
      return at(3, 18).toISOString();
    case "1w":
      return at(7, 18).toISOString();
    default:
      return null;
  }
}

export default function NewTodoScreen() {
  const router = useRouter();
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [kind, setKind] = useState<Kind>("task");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<TodoPriority>("normal");
  const [due, setDue] = useState<DueChoice>("none");
  const [search, setSearch] = useState("");
  const [assignees, setAssignees] = useState<number[]>([]);

  const catalog = useQuery({ queryKey: todoKeys.catalog(), queryFn: getTodoCatalog, staleTime: 5 * 60_000 });
  const canAssign = Boolean(catalog.data?.canAssign) && kind !== "note";

  const people = useQuery({
    queryKey: todoKeys.assignees(search.trim()),
    queryFn: () => getTodoAssignees(search.trim() || undefined),
    enabled: canAssign,
    staleTime: 60_000,
  });

  const toggleAssignee = useCallback(
    (id: number) => setAssignees((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id])),
    []
  );

  const create = useMutation({
    mutationFn: () =>
      createTodo({
        kind,
        title: title.trim(),
        body: body.trim() || undefined,
        priority,
        due_at: dueToIso(due),
        // Kimse seçilmediyse sunucu kartı oluşturan kişiye açar.
        assignee_ids: canAssign && assignees.length ? assignees : undefined,
      }),
    onSuccess: (items) => {
      void queryClient.invalidateQueries({ queryKey: todoKeys.all });
      const others = items.filter((item) => !item.permissions.isOwner).length;
      toast.show({
        message: others ? `Görev ${others} kişiye atandı; bildirim gönderildi.` : "Görev eklendi.",
        tone: "success",
      });
      router.back();
    },
    onError: (error) =>
      toast.show({ message: error instanceof Error && error.message ? error.message : "Görev eklenemedi.", tone: "danger" }),
  });

  const selfId = auth.user?.id;
  const selectedNames = useMemo(() => {
    const map = new Map((people.data ?? []).map((person) => [person.id, person.name]));
    return assignees.map((id) => map.get(id) ?? `#${id}`);
  }, [assignees, people.data]);

  const canSubmit = title.trim().length > 0 && !create.isPending;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <ScreenHeader title="Yeni görev" back />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* ARENA FORM KALIBI: alanlar etiketli gruplar hâlinde akar, birincil
            eylem altta SABİT durur — uzun ekip listesinde "Kaydet" kaydırma
            sonunda kaybolmasın. */}
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.kinds}>
            {KINDS.map((item) => {
              const on = kind === item.key;
              return (
                <Touchable
                  key={item.key}
                  feedback="card"
                  haptic="selection"
                  onPress={() => setKind(item.key)}
                  style={[styles.kind, on ? styles.kindOn : null]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${item.label}: ${item.hint}`}
                >
                  <IconTile icon={item.icon} tone={on ? item.tone : "neutral"} size={36} glow={on} />
                  <Text style={[styles.kindLabel, on ? styles.kindLabelOn : null]} numberOfLines={1} {...textScale.dense}>
                    {item.label}
                  </Text>
                  <Text style={styles.kindHint} numberOfLines={1} {...textScale.dense}>
                    {item.hint}
                  </Text>
                </Touchable>
              );
            })}
          </View>

          <Group title="İçerik">
            <Input floating label="Başlık" value={title} onChangeText={setTitle} placeholder="Ne yapılacak?" maxLength={200} autoFocus />
            <Input
              label="Açıklama"
              value={body}
              onChangeText={setBody}
              placeholder="Ayrıntılar (isteğe bağlı)"
              multiline
            />
          </Group>

          <Group title="Öncelik ve zamanlama">
            <Text style={styles.fieldLabel} {...textScale.dense}>Öncelik</Text>
            <View style={styles.chips}>
              {PRIORITIES.map((item) => (
                <Chip
                  key={item.key}
                  label={item.label}
                  icon={item.key === "high" ? "flag" : item.key === "low" ? "arrow-down" : "remove"}
                  selected={priority === item.key}
                  tone={item.key === "high" ? "warn" : undefined}
                  onPress={() => setPriority(item.key)}
                />
              ))}
            </View>
            <Text style={[styles.fieldLabel, styles.fieldGap]} {...textScale.dense}>Bitiş</Text>
            <View style={styles.chips}>
              {DUE_CHOICES.map((item) => (
                <Chip key={item.key} label={item.label} icon={item.key === "none" ? undefined : "time-outline"} selected={due === item.key} onPress={() => setDue(item.key)} />
              ))}
            </View>
            {due !== "none" ? (
              <View style={styles.note}>
                <Ionicons name="notifications-outline" size={14} color={colors.brandAccent} />
                <Text style={styles.hint} {...textScale.dense}>
                  Bitişe 1 saat kala ve süre geçince bildirim gelir.
                </Text>
              </View>
            ) : null}
          </Group>

          {canAssign ? (
            <Group title="Kime atansın?" meta={assignees.length ? `${assignees.length} kişi` : "Seçilmezse sana"}>
              {selectedNames.length ? (
                <Text style={styles.hint} numberOfLines={2} {...textScale.dense}>
                  {selectedNames.join(", ")}
                </Text>
              ) : null}
              <Input variant="search" value={search} onChangeText={setSearch} placeholder="Ekipte ara" leadingIcon="search" size="sm" />
              {people.isLoading ? (
                <SkeletonListRow count={4} avatar={false} />
              ) : (
                <View>
                  {(people.data ?? []).slice(0, 60).map((person, index, list) => (
                    <ListRow
                      key={person.id}
                      title={person.id === selfId ? `${person.name} (sen)` : person.name}
                      subtitle={[ROLE_LABELS[person.role] ?? person.role, person.city].filter(Boolean).join(" · ")}
                      position={list.length === 1 ? "single" : index === 0 ? "first" : index === list.length - 1 ? "last" : "middle"}
                      toggle={{ value: assignees.includes(person.id), onValueChange: () => toggleAssignee(person.id) }}
                    />
                  ))}
                </View>
              )}
            </Group>
          ) : kind === "note" ? (
            <Text style={styles.hint} {...textScale.dense}>
              Kişisel not yalnız senin listende durur.
            </Text>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label={assignees.length > 1 ? `${assignees.length} kişiye ata` : "Kaydet"}
            onPress={() => create.mutate()}
            disabled={!canSubmit}
            loading={create.isPending}
            fullWidth
            size="lg"
            icon="checkmark"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Versal başlıklı cam grup kartı. */
function Group({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <View style={styles.fieldHead}>
        <Text style={styles.groupTitle} {...textScale.dense}>
          {upperTR(title)}
        </Text>
        {meta ? (
          <Text style={styles.fieldMeta} {...textScale.dense}>
            {meta}
          </Text>
        ) : null}
      </View>
      <View style={styles.groupCard}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  kinds: { flexDirection: "row", gap: space.sm },
  kind: {
    flex: 1,
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.border,
  },
  kindOn: { borderColor: colors.brand, backgroundColor: colors.brandDim },
  kindLabel: { ...type.h4, color: colors.textPrimary, marginTop: space.xs },
  kindLabelOn: { color: colors.brandAccent },
  kindHint: { ...type.caption, color: colors.textTertiary },
  group: { gap: space.sm },
  groupTitle: { ...type.overline, color: colors.textTertiary, paddingHorizontal: space.xs },
  groupCard: {
    gap: space.md,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  fieldGap: { marginTop: space.xs },
  note: { flexDirection: "row", alignItems: "center", gap: space.xs },
  flex: { flex: 1 },
  content: { padding: layout.screenPadding, gap: layout.sectionGap, paddingBottom: space.xxl },
  field: { gap: space.sm },
  fieldHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm },
  fieldLabel: { ...type.labelSm, color: colors.textSecondary },
  fieldMeta: { ...type.caption, color: colors.textTertiary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  hint: { ...type.caption, color: colors.textSecondary },
  footer: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    paddingBottom: space.md,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
    backgroundColor: colors.bg,
  },
});
