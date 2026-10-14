/**
 * YÖNETİM BAŞVURULARI BÖLMESİ — Gelen kutusu ▸ Mesajlar ▸ "Başvurular".
 *
 * NE: `GET /api/panel/me/messages` tek çağrıda konuları (thread), sözlükleri
 * (kategori/durum) ve okunmamış sayısını döndürür. Bu bölme KUTU'dur; tek bir
 * konunun yazışması `app/mesaj/[id].tsx` rotasında açılır.
 *
 * NEREDE: Mesajlar sekmesi ▸ Yönetim kutusu (`/(tabs)/mesajlar?kutu=yonetim`). Eski
 * /mesajlarim rotası buraya yönlendirir; `PANEL_MESSAGE` bildirimlerinin
 * liste hedefi (lib/notifications.ts) ve mesaj ekranının "kutuya dön" /
 * "yeni başvuru" bağlantıları (`?yeni=1`) böylece çalışmaya devam eder.
 * Sohbetler (app/sohbet) ile aynı sekmede ikinci kutudur: sohbet anlık
 * yazışma, başvuru ise durumlu (açık · incelemede · yanıtlandı · kapandı)
 * resmî taleptir — iki kaynak birleştirilmez, yan yana durur.
 *
 * NEDEN SÜZGEÇ ROTADA: durum çipi `?durum=` parametresinde taşınır; bildirimden
 * gelen bağlantı doğru çipe düşer, geri dönüşte seçim korunur.
 *
 * NEDEN KATEGORİ SÖZLÜKTEN: sunucu kategori anahtarlarını ve Türkçe
 * etiketlerini yanıtla gönderiyor; liste KODA GÖMÜLMEZ, bölme yalnız çizer.
 *
 * NEDEN YOKLAMA (10 sn): mesaj ve bildirimler için soket yoktur (sunucu
 * sözleşmesi) — uyandırma push ile, tazeleme yoklama ile yapılır.
 *
 * ÖNCELİK NOTU: alt sayfadaki öncelik seçimi gövdenin ilk satırına yazılır
 * (sendPanelMessage bugün yalnız konu/gövde/kategori taşıyor). Uç `priority`
 * alanını kabul eder hâle geldiğinde `withPriority` silinip alan doğrudan
 * gönderilmelidir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Badge,
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  FAB,
  Input,
  SkeletonListRow,
  Touchable,
  errorMessage,
  useFabAutoHide,
  useRefresh,
  useToast,
  type Tone,
} from "@/components/ui";
import { useAppActive } from "@/hooks/useLiveFavoriteCount";
import { MESSAGE_PRIORITY_LABELS } from "@/lib/api/admin";
import { getMyMessages, sendPanelMessage, type PanelThread } from "@/lib/api/panel";
import { formatDateShort } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

/* ═══════════════════════════ SABİTLER / YARDIMCILAR ═══════════════════════ */

/** Ekran açıkken sessiz yoklama aralığı (sunucu sözleşmesi: soket yok). */
const POLL_MS = 10_000;

/** Bilinen durumların gösterim sırası; sunucu yenisini eklerse sona düşer. */
const STATUS_ORDER = ["open", "in_review", "answered", "closed"];

/** Bilinen önceliklerin gösterim sırası (düşükten acile). */
const PRIORITY_ORDER = ["low", "normal", "high", "urgent"];

/** Öncelik seçilmediğinde gönderilen değer — gövdeye hiç yazılmaz. */
const DEFAULT_PRIORITY = "normal";

/**
 * Durum → ton. app/yonetim/mesajlar.tsx ile BİREBİR aynıdır: aynı başvurunun
 * iki yüzü aynı rengi taşımalı. "Açık" bekleyen iştir → uyarı tonu.
 */
const STATUS_TONE: Record<string, Tone> = {
  open: "warn",
  in_review: "info",
  answered: "win",
  closed: "neutral",
};

/** Öncelik → ton. Acil kırmızı, yüksek turuncu, normal/düşük sessiz. */
const PRIORITY_TONE: Record<string, Tone> = {
  low: "neutral",
  normal: "neutral",
  high: "warn",
  urgent: "danger",
};

/** Konu satırının sol ikonu — kategori metninden türetilir. */
const CATEGORY_ICONS: ReadonlyArray<readonly [string, keyof typeof Ionicons.glyphMap]> = [
  ["transfer", "swap-horizontal"],
  ["sozlesme", "document-text"],
  ["disiplin", "shield"],
  ["ceza", "shield"],
  ["fikstur", "calendar"],
  ["mac", "football"],
  ["kadro", "people"],
  ["lisans", "id-card"],
  ["odeme", "card"],
  ["uyelik", "card"],
  ["teknik", "construct"],
  ["hata", "construct"],
  ["oneri", "bulb"],
  ["sikayet", "bulb"],
];

const keyExtractor = (item: PanelThread) => String(item.id);

/** Türkçe karşılaştırma için sadeleştirme (İ/I ve şapkalı harf tuzağı).
 *  Sunucu kategori etiketini null gönderebilir (ör. "Talebiniz onaylandı"
 *  otomatik mesajı); null'da boş metin döner. Bu satır App Store'daki
 *  çökmenin kökeniydi: null.toLocaleLowerCase → ölümcül JS hatası → RN'in
 *  native fatal yolu → EXC_BAD_ACCESS. */
function normalize(value: string | null | undefined): string {
  return String(value ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

function categoryIcon(label: string | null | undefined): keyof typeof Ionicons.glyphMap {
  const text = normalize(label);
  const hit = CATEGORY_ICONS.find(([needle]) => text.includes(needle));
  return hit ? hit[1] : "chatbubbles";
}

/**
 * Akıllı tarih: bugünse saat, dünse "Dün", bir hafta içindeyse gün adı,
 * öncesinde kısa tarih. Liste satırında yer dar; tam tarih yazışmanın içinde
 * ayraç olarak zaten görünüyor.
 */
function smartDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "Dün";
  if (days < 7) return date.toLocaleDateString("tr-TR", { weekday: "short" });
  return formatDateShort(iso);
}

/** Sözlüğü bilinen sıraya göre dizer; tanımadıklarını sona ekler. */
function orderedKeys(dict: Record<string, string>, preferred: string[]): string[] {
  const keys = Object.keys(dict);
  return [
    ...preferred.filter((key) => keys.includes(key)),
    ...keys.filter((key) => !preferred.includes(key)),
  ];
}

/**
 * Öncelik gövdenin ilk satırına yazılır (bkz. dosya başı notu). "Normal"
 * seçiliyken hiçbir şey eklenmez — her mesaja gereksiz bir satır düşmesin.
 */
function withPriority(body: string, priority: string, labels: Record<string, string>): string {
  if (priority === DEFAULT_PRIORITY) return body;
  return `Öncelik: ${labels[priority] ?? priority}\n\n${body}`;
}

/**
 * iOS'ta klavye alt sayfanın üstüne biner: BottomSheet ekranın altına
 * yapışıktır ve kendi KeyboardAvoidingView'ü yoktur. İçeriğin sonuna klavye
 * kadar boşluk eklenince panel yukarı doğru büyür ve alanlar görünür kalır.
 * Android'de pencere zaten yeniden boyutlanır (adjustResize) — dinleyici hiç
 * kurulmaz, yoksa boşluk iki kez sayılır.
 */
function useKeyboardSpace(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const show = Keyboard.addListener("keyboardWillChangeFrame", (event) =>
      setHeight(event.endCoordinates.height),
    );
    const hide = Keyboard.addListener("keyboardWillHide", () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}

/* ══════════════════════════════════ BÖLME ═════════════════════════════════ */

export interface PanelThreadsPaneProps {
  /** Rotadaki durum süzgeci (`?durum=`); bilinmeyen değer "Tümü" sayılır. */
  status: string | undefined;
  onStatusChange: (next: string | null) => void;
  /** `?yeni=1` — yeni başvuru alt sayfası doğrudan açılsın. */
  composeRequested?: boolean;
  /** Bölme isteği karşıladı; ekran parametreyi temizler. */
  onComposeHandled?: () => void;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle?: number;
}

export function PanelThreadsPane({
  status,
  onStatusChange,
  composeRequested,
  onComposeHandled,
  onScroll: onHeaderScroll,
  scrollEventThrottle,
}: PanelThreadsPaneProps) {
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const appActive = useAppActive();
  const queryClient = useQueryClient();
  const fab = useFabAutoHide();
  const keyboardSpace = useKeyboardSpace();

  const [composeOpen, setComposeOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [priority, setPriority] = useState<string>(DEFAULT_PRIORITY);

  /* ───────────────────────────── VERİ ───────────────────────────── */

  const query = useQuery({
    // Profil rozetiyle (hooks/useUnreadCount) AYNI anahtar: tek önbellek.
    queryKey: queryKeys.panelMessages(),
    queryFn: getMyMessages,
    enabled: Boolean(auth.user),
    staleTime: 5_000,
    refetchInterval: appActive ? POLL_MS : false,
    retry: false,
  });

  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.panelMessages() });
  }, [queryClient]);

  const refresh = useRefresh(refetch, { refreshing: query.isRefetching });

  const threads = useMemo(() => query.data?.threads ?? [], [query.data]);
  const categories = useMemo(() => query.data?.categories ?? {}, [query.data]);
  const statuses = useMemo(() => query.data?.statuses ?? {}, [query.data]);

  /**
   * Öncelik sözlüğü sunucudan gelirse o kullanılır; gelmezse yönetim yüzüyle
   * aynı Türkçe etiketler (panelMessageService.PRIORITIES) yedeğe düşer.
   */
  const priorityLabels = useMemo(() => {
    const data = query.data as { priorities?: Record<string, string> } | undefined;
    return data?.priorities ?? MESSAGE_PRIORITY_LABELS;
  }, [query.data]);

  const categoryKeys = useMemo(() => orderedKeys(categories, []), [categories]);
  const priorityKeys = useMemo(
    () => orderedKeys(priorityLabels, PRIORITY_ORDER),
    [priorityLabels],
  );

  /* ─────────────────────────── SÜZGEÇ (ROTADA) ─────────────────────────── */

  const statusKeys = useMemo(() => orderedKeys(statuses, STATUS_ORDER), [statuses]);
  const routeStatus = status ?? "";
  const activeStatus = statusKeys.includes(routeStatus) ? routeStatus : null;

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const thread of threads) {
      result[thread.status] = (result[thread.status] ?? 0) + 1;
    }
    return result;
  }, [threads]);

  const visibleThreads = useMemo(
    () => (activeStatus ? threads.filter((thread) => thread.status === activeStatus) : threads),
    [activeStatus, threads],
  );

  const selectStatus = onStatusChange;

  /* ────────────────────────── YENİ BAŞVURU ────────────────────────── */

  const openCompose = useCallback(() => setComposeOpen(true), []);

  const closeCompose = useCallback(() => {
    setComposeOpen(false);
    Keyboard.dismiss();
  }, []);

  /**
   * Kapalı bir konudan gelen "yeni başvuru" bağlantısı (`?yeni=1`) alt sayfayı
   * doğrudan açar. Parametre hemen temizlenir; kullanıcı paneli kapatıp
   * listeye dönünce panel yeniden açılmamalı.
   */
  useEffect(() => {
    if (!composeRequested) return;
    setComposeOpen(true);
    onComposeHandled?.();
  }, [composeRequested, onComposeHandled]);

  /** Sözlük gelince ilk kategori seçili gelsin — boş seçimle gönderilemez. */
  useEffect(() => {
    if (category === null && categoryKeys.length > 0) setCategory(categoryKeys[0]);
  }, [category, categoryKeys]);

  const sendMutation = useMutation({
    mutationFn: () =>
      sendPanelMessage(
        subject.trim(),
        withPriority(body.trim(), priority, priorityLabels),
        category ?? "genel",
      ),
    onSuccess: () => {
      setComposeOpen(false);
      setSubject("");
      setBody("");
      setPriority(DEFAULT_PRIORITY);
      refetch();
      toast.show({
        message: "Başvurun iletildi. Yönetim yanıtlayınca burada görünecek.",
        tone: "success",
      });
    },
    onError: (error) => toast.show({ message: errorMessage(error), tone: "danger" }),
  });

  const canSend =
    subject.trim().length >= 3 && body.trim().length >= 5 && Boolean(category) && !sendMutation.isPending;

  const { mutate: send } = sendMutation;
  const handleSend = useCallback(() => {
    if (canSend) send();
  }, [canSend, send]);

  /* ───────────────────────────── ÇİZİM ───────────────────────────── */

  const openThread = useCallback(
    (threadId: number) => router.push(`/mesaj/${threadId}`),
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: PanelThread }) => <ThreadRow thread={item} onPress={openThread} />,
    [openThread],
  );

  /** Daralan başlık ve FAB gizlenmesi aynı kaydırmayı dinler. */
  const { onScroll: onFabScroll } = fab;
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      onHeaderScroll?.(event);
      onFabScroll(event);
    },
    [onFabScroll, onHeaderScroll],
  );

  const hasFilter = activeStatus !== null;

  return (
    <View style={styles.pane}>
      {statusKeys.length > 0 && threads.length > 0 ? (
        <ChipGroup style={styles.filters}>
          <Chip
            label="Tümü"
            count={threads.length}
            selected={activeStatus === null}
            onPress={() => selectStatus(null)}
          />
          {statusKeys.map((key) => (
            <Chip
              key={key}
              label={statuses[key]}
              count={counts[key] ?? 0}
              tone={STATUS_TONE[key] ?? "neutral"}
              selected={activeStatus === key}
              onPress={() => selectStatus(activeStatus === key ? null : key)}
            />
          ))}
        </ChipGroup>
      ) : null}

      {query.isLoading ? (
        <View style={styles.skeleton}>
          <SkeletonListRow count={6} avatar />
        </View>
      ) : query.isError && threads.length === 0 ? (
        <ErrorState error={query.error} onRetry={refetch} />
      ) : (
        <FlatList
          data={visibleThreads}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          onScroll={handleScroll}
          scrollEventThrottle={scrollEventThrottle}
          contentContainerStyle={styles.list}
          refreshControl={refresh.control}
          initialNumToRender={10}
          windowSize={8}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            // Ekranda veri VARKEN hata bant olur; liste silinmez (§5.6).
            query.isError ? (
              <ErrorState
                error={query.error}
                onRetry={refetch}
                variant="banner"
                style={styles.banner}
              />
            ) : null
          }
          ListEmptyComponent={
            hasFilter ? (
              <EmptyState
                icon="funnel-outline"
                title="Bu durumda konu yok"
                body="Seçtiğin durumda bekleyen bir başvurun bulunmuyor."
                action={{ label: "Süzgeci temizle", onPress: () => selectStatus(null) }}
              />
            ) : (
              <EmptyState
                icon="chatbubbles-outline"
                title="Henüz başvurun yok"
                body="Transfer, fikstür, disiplin ya da teknik bir konuda yönetime yazabilirsin. Yanıtlar bu ekrana düşer."
                action={{ label: "Yeni başvuru", onPress: openCompose }}
              />
            )
          }
        />
      )}

      <FAB
        icon="create-outline"
        label="Yeni başvuru"
        extended
        visible={fab.visible && !composeOpen}
        offsetBottom={insets.bottom + space.lg}
        onPress={openCompose}
        accessibilityLabel="Yeni başvuru oluştur"
      />

      {/* ───────────────────────── Yeni başvuru alt sayfası ──────────────── */}
      <BottomSheet
        visible={composeOpen}
        onClose={closeCompose}
        title="Yeni başvuru"
        snap="content"
      >
        <View style={styles.sheet}>
          <Text style={styles.sheetIntro} {...textScale.long}>
            Başvurun ElitLig yönetimine iletilir. Konuyu doğru kategoriye koyarsan daha hızlı
            yanıtlanır.
          </Text>

          <View style={styles.field}>
            <Text style={styles.fieldLabel} {...textScale.dense}>
              Kategori
            </Text>
            <ChipGroup contentPadding={0} style={styles.sheetChips}>
              {categoryKeys.map((key) => (
                <Chip
                  key={key}
                  label={categories[key]}
                  selected={category === key}
                  onPress={() => setCategory(key)}
                />
              ))}
            </ChipGroup>
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel} {...textScale.dense}>
              Öncelik
            </Text>
            <ChipGroup contentPadding={0} scrollable={false} style={styles.sheetChips}>
              {priorityKeys.map((key) => (
                <Chip
                  key={key}
                  label={priorityLabels[key]}
                  size="sm"
                  tone={PRIORITY_TONE[key] ?? "neutral"}
                  selected={priority === key}
                  onPress={() => setPriority(key)}
                />
              ))}
            </ChipGroup>
          </View>

          <Input
            label="Konu"
            value={subject}
            onChangeText={setSubject}
            placeholder="Örn. Lisans belgem güncellenmedi"
            maxLength={120}
            returnKeyType="next"
          />

          <Input
            label="Mesajın"
            value={body}
            onChangeText={setBody}
            placeholder="Durumu kısaca anlat; tarih ve maç bilgisi eklersen işimizi kolaylaştırır."
            multiline
            containerStyle={styles.bodyField}
            hint={`${body.trim().length}/2000`}
            maxLength={2000}
          />

          <View style={styles.sheetActions}>
            <Button label="Vazgeç" variant="secondary" onPress={closeCompose} style={styles.action} />
            <Button
              label="Gönder"
              icon="send"
              onPress={handleSend}
              disabled={!canSend}
              loading={sendMutation.isPending}
              haptic="success"
              style={styles.action}
            />
          </View>

          {/* iOS'ta klavye kadar boşluk: panel yukarı büyür, alanlar görünür kalır. */}
          <View style={{ height: keyboardSpace }} />
        </View>
      </BottomSheet>
    </View>
  );
}

/* ═══════════════════════════════ LİSTE SATIRI ═════════════════════════════ */

/**
 * Konu satırı. Okunmamışsa marka çerçevesi + sağda sayı rozeti alır; okunmuş
 * satır tamamen sessizdir — göz "işi olan" satırlarda durur.
 *
 * `thread` nesnesi sorgu önbelleğinden geldiği için referansı yalnız veri
 * değişince değişir; memo bu sayede gerçekten çalışır.
 */
const ThreadRow = memo(function ThreadRow({
  thread,
  onPress,
}: {
  thread: PanelThread;
  onPress: (threadId: number) => void;
}) {
  const handlePress = useCallback(() => onPress(thread.id), [onPress, thread.id]);
  const unread = thread.unread > 0;
  const tone = STATUS_TONE[thread.status] ?? "neutral";

  return (
    <Touchable
      feedback="card"
      haptic="selection"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${thread.subject}. ${
        unread ? `${thread.unread} okunmamış mesaj` : thread.status_label
      }`}
      style={styles.row}
    >
      {/* Okunmamış: sol kenarda mor ray (bildirim merkeziyle aynı dil). */}
      {unread ? <View style={styles.rail} /> : null}
      <View style={[styles.icon, unread ? styles.iconUnread : null]}>
        <Ionicons
          name={categoryIcon(thread.category_label)}
          size={18}
          color={unread ? colors.brandAccent : colors.textSecondary}
        />
      </View>

      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text
            style={[styles.subject, unread ? styles.subjectUnread : null]}
            numberOfLines={1}
            {...textScale.dense}
          >
            {thread.subject}
          </Text>
          <Text style={styles.time} {...textScale.dense}>
            {smartDate(thread.last_message_at)}
          </Text>
        </View>

        <Text style={styles.preview} numberOfLines={2} {...textScale.dense}>
          {thread.last_message_preview}
        </Text>

        <View style={styles.tagRow}>
          <Badge label={thread.status_label} tone={tone} size="xs" />
          {thread.category_label ? (
            <Badge label={thread.category_label} tone="neutral" size="xs" />
          ) : null}
          {thread.messages.length > 1 ? (
            <Text style={styles.count} {...textScale.badge}>
              {thread.messages.length} mesaj
            </Text>
          ) : null}
        </View>
      </View>

      {unread ? (
        <Badge label={thread.unread} tone="brand" variant="solid" size="sm" />
      ) : (
        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
      )}
    </Touchable>
  );
});

/* ═════════════════════════════════ STİLLER ════════════════════════════════ */

const styles = StyleSheet.create({
  pane: {
    flex: 1,
  },
  filters: {
    flexGrow: 0,
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },
  skeleton: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
  },
  list: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.giant + space.xxl,
    gap: space.sm,
    flexGrow: 1,
  },
  banner: {
    marginBottom: space.sm,
  },

  /* Konu satırı */
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
    overflow: "hidden",
  },
  rail: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: colors.brand,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  iconUnread: {
    backgroundColor: colors.brandDim,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  subject: {
    ...type.body,
    color: colors.textPrimary,
    flex: 1,
  },
  subjectUnread: {
    ...type.h3,
    color: colors.textPrimary,
  },
  time: {
    ...type.caption,
    color: colors.textTertiary,
  },
  preview: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.xs,
    marginTop: space.xs,
  },
  count: {
    ...type.micro,
    color: colors.textTertiary,
  },

  /* Yeni başvuru alt sayfası */
  sheet: {
    gap: space.md,
  },
  sheetIntro: {
    ...type.caption,
    color: colors.textSecondary,
  },
  field: {
    gap: space.s,
  },
  fieldLabel: {
    ...type.label,
    color: colors.textSecondary,
  },
  sheetChips: {
    flexGrow: 0,
  },
  bodyField: {
    minHeight: 120,
  },
  sheetActions: {
    flexDirection: "row",
    gap: space.sm,
    paddingTop: space.xs,
  },
  action: {
    flex: 1,
  },
});
