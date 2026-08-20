/**
 * MESAJ — tek bir başvurunun yazışması (üye yüzü).
 *
 * NEDEN AYRI ROTA: bildirime dokunan üye doğrudan buraya iner
 * (lib/notifications.ts → PANEL_MESSAGE hedefi `/mesaj/[id]`). Yazışma listenin
 * içinde açılan bir katman olsaydı derin bağlantının gideceği bir adres olmazdı.
 *
 * NEDEN AYNI SORGU ANAHTARI: sunucuda "tek konu" ucu yok; `GET /api/panel/me/
 * messages` bütün konuları mesajlarıyla döndürüyor. Bu ekran kutuyla AYNI
 * önbelleği (queryKeys.panelMessages) okur — listeden girişte ikinci istek
 * atılmaz, yanıt geldiğinde iki ekran birden tazelenir.
 *
 * BALON YÖNÜ: `direction === "to_admin"` üyenin yazdığıdır → SAĞDA ve marka
 * rengindedir. Yönetimin yazdığı solda, sönük yüzeyde ve gönderen adıyla durur.
 *
 * NEDEN İYİMSER EKLEME: yoklama 8 saniyede bir çalışıyor; yanıtın sunucudan
 * dönmesini beklemek mesajı 1-2 saniye "yokmuş" gibi gösterir ve kullanıcı
 * ikinci kez gönderir. Mesaj önce önbelleğe yazılır (geçici negatif id ile),
 * istek arkada gider; hata olursa geri alınır ve metin kutuya iade edilir.
 *
 * KAPALI KONU: yanıt kutusu gizlenmez, YERİNE kilit açıklaması konur. Kutunun
 * sessizce yok olması "uygulama bozuldu" hissi verir; kapanma bir karardır ve
 * söylenmelidir. Yeni bir konu açmanın yolu da orada gösterilir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  ScreenHeader,
  SkeletonListRow,
  Touchable,
  errorMessage,
  useToast,
  withAlpha,
  type Tone,
} from "@/components/ui";
import { useAppActive } from "@/hooks/useLiveFavoriteCount";
import {
  getMyMessages,
  replyPanelThread,
  type PanelMessagesResponse,
  type PanelThread,
  type PanelThreadMessage,
} from "@/lib/api/panel";
import { formatDayHeading } from "@/lib/format";
import { patch } from "@/lib/http";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/providers/AuthProvider";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

/* ═══════════════════════════ SABİTLER / YARDIMCILAR ═══════════════════════ */

/** Yazışma açıkken yoklama aralığı — kutudan (10 sn) daha sık. */
const POLL_MS = 8_000;

/** Durum → ton. Kutu ve yönetim yüzüyle birebir aynı sözlük. */
const STATUS_TONE: Record<string, Tone> = {
  open: "warn",
  in_review: "info",
  answered: "win",
  closed: "neutral",
};

/** Durum bandındaki açıklama — rozet ne anlama geliyor, tek cümleyle. */
const STATUS_HINT: Record<string, string> = {
  open: "Başvurun yönetime iletildi, sıraya alındı.",
  in_review: "Yönetim başvurunu inceliyor.",
  answered: "Yönetim yanıtladı. Ek bilgi yazabilirsin.",
  closed: "Bu konu kapatıldı; yeni mesaj eklenemez.",
};

/** Yazışma listesindeki satır: ya gün ayracı ya da bir balon. */
type ChatEntry =
  | { kind: "date"; key: string; label: string }
  | { kind: "message"; key: string; message: PanelThreadMessage };

const entryKey = (item: ChatEntry) => item.key;

/** Saat — balonun altındaki damga. */
function clockLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

/** Gün ayracı için gün anahtarı (yerel saat diliminde). */
function dayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/**
 * Mesaj dizisini gün ayraçlarıyla dokur. Ayraç yalnız gün DEĞİŞTİĞİNDE düşer;
 * aynı gün içindeki on mesaj tek başlık altında toplanır.
 */
function buildEntries(messages: PanelThreadMessage[]): ChatEntry[] {
  const entries: ChatEntry[] = [];
  let lastDay = "";

  for (const message of messages) {
    const key = dayKey(message.created_at);
    if (key && key !== lastDay) {
      lastDay = key;
      entries.push({ kind: "date", key: `gun-${key}`, label: formatDayHeading(message.created_at) });
    }
    entries.push({ kind: "message", key: `msg-${message.id}`, message });
  }

  return entries;
}

/* ══════════════════════════════════ EKRAN ═════════════════════════════════ */

export default function ThreadDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const auth = useAuth();
  const router = useRouter();
  const toast = useToast();
  const appActive = useAppActive();
  const queryClient = useQueryClient();
  const listRef = useRef<FlatList<ChatEntry>>(null);

  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const threadId = Number(rawId);

  const [reply, setReply] = useState("");

  /* ───────────────────────────── VERİ ───────────────────────────── */

  const query = useQuery({
    queryKey: queryKeys.panelMessages(),
    queryFn: getMyMessages,
    enabled: Boolean(auth.user),
    staleTime: 4_000,
    refetchInterval: appActive ? POLL_MS : false,
    retry: false,
  });

  const thread: PanelThread | null = useMemo(
    () => query.data?.threads.find((item) => item.id === threadId) ?? null,
    [query.data, threadId],
  );

  const entries = useMemo(() => buildEntries(thread?.messages ?? []), [thread?.messages]);

  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.panelMessages() });
  }, [queryClient]);

  /* ─────────────────────── AÇILIŞTA OKUNDU İŞARETLE ─────────────────────── */

  /**
   * Önbellekteki okunmamış sayısını sıfırlar: Profil rozeti ve kutu satırı
   * ekranı açar açmaz sakinleşir (aynı sorguyu okuyorlar).
   */
  const clearUnreadLocally = useCallback(() => {
    queryClient.setQueryData<PanelMessagesResponse>(queryKeys.panelMessages(), (previous) => {
      if (!previous) return previous;
      const target = previous.threads.find((item) => item.id === threadId);
      if (!target || target.unread === 0) return previous;
      return {
        ...previous,
        unread: Math.max(0, previous.unread - target.unread),
        threads: previous.threads.map((item) =>
          item.id === threadId
            ? {
                ...item,
                unread: 0,
                messages: item.messages.map((message) => ({ ...message, read: true })),
              }
            : item,
        ),
      };
    });
  }, [queryClient, threadId]);

  /** Sunucuya okundu bildirilen MESAJ kimlikleri — aynı istek iki kez gitmesin. */
  const markedIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!Number.isInteger(threadId) || !thread || thread.unread === 0) return;

    /**
     * SUNUCU UCU KONU DEĞİL TEK MESAJ KİMLİĞİ BEKLER: routes/panel.js
     * `PATCH /api/panel/me/messages/:messageId/read` → markRead() gelen id'yi
     * findByPk ile arar ve `recipient_user_id !== user.id` ise 403 döner.
     * Konu kimliği (thread.id) KÖK mesajın kimliğidir; üyenin açtığı başvuruda
     * kökün recipient_user_id'si NULL'dur, yani konu kimliğiyle yapılan çağrı
     * her seferinde 403 alır ve rozet ilk yoklamada geri yanar. Bu yüzden
     * gerçekten okunmamış olan yönetim yanıtlarının (direction === "to_member")
     * KENDİ kimlikleri gönderilir — sunucunun `unread` saydığı küme de tam
     * budur (services/panelMessageService.js, buildThread).
     */
    const unreadIds = thread.messages
      .filter((message) => message.direction === "to_member" && !message.read)
      .map((message) => message.id)
      .filter((id) => id > 0 && !markedIdsRef.current.has(id));

    if (unreadIds.length === 0) return;

    // İstekten ÖNCE işaretle: 8 sn'lik yoklama aynı mesaj için istek yağdırmasın.
    unreadIds.forEach((id) => markedIdsRef.current.add(id));
    clearUnreadLocally();

    for (const id of unreadIds) {
      void patch(`/api/panel/me/messages/${id}/read`).catch((error: unknown) => {
        // Arka plan işi; kullanıcıya toast gösterilmez ama sessizce de yutulmaz —
        // yanlış kimlikle giden okundu isteği yoksa bir daha fark edilmez.
        if (__DEV__) console.warn("[mesaj] okundu işaretlenemedi", id, error);
      });
    }
  }, [clearUnreadLocally, thread, threadId]);

  /* ────────────────────────── YANIT (İYİMSER) ────────────────────────── */

  const replyMutation = useMutation({
    mutationFn: (text: string) => replyPanelThread(threadId, text),

    onMutate: async (text: string) => {
      // Uçuştaki yoklama yanıtı iyimser balonu ezmesin.
      await queryClient.cancelQueries({ queryKey: queryKeys.panelMessages() });
      const previous = queryClient.getQueryData<PanelMessagesResponse>(queryKeys.panelMessages());

      if (previous) {
        const now = new Date().toISOString();
        // Geçici id NEGATİF: sunucudan gelen gerçek id'yle çakışmaz ve
        // "gönderiliyor" durumu balonda bu işaretten okunur.
        const optimistic: PanelThreadMessage = {
          id: -Date.now(),
          thread_id: threadId,
          direction: "to_admin",
          sender: auth.user?.fullName ?? auth.user?.username ?? "Sen",
          body: text,
          read: true,
          created_at: now,
        };

        queryClient.setQueryData<PanelMessagesResponse>(queryKeys.panelMessages(), {
          ...previous,
          threads: previous.threads.map((item) =>
            item.id === threadId
              ? {
                  ...item,
                  messages: [...item.messages, optimistic],
                  last_message_at: now,
                  last_message_preview: text,
                }
              : item,
          ),
        });
      }

      return { previous };
    },

    onError: (error, text, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.panelMessages(), context.previous);
      }
      // Yazılan metin kaybolmasın: kutu boşsa geri konur.
      setReply((current) => (current.trim().length > 0 ? current : text));
      toast.show({ message: errorMessage(error), tone: "danger" });
    },

    onSettled: refetch,
  });

  const { mutate: postReply, isPending } = replyMutation;
  const canSend = reply.trim().length >= 2 && !isPending;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    postReply(reply.trim());
    setReply("");
  }, [canSend, postReply, reply]);

  /** Yeni mesaj düştükçe (ve açılışta) yazışmanın sonuna kay. */
  const entryCount = entries.length;
  useEffect(() => {
    if (entryCount === 0) return;
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);
    return () => clearTimeout(timer);
  }, [entryCount]);

  const goToInbox = useCallback(() => router.replace("/mesajlarim"), [router]);
  const startNewThread = useCallback(
    () => router.replace({ pathname: "/mesajlarim", params: { yeni: "1" } }),
    [router],
  );

  const renderItem = useCallback(({ item }: { item: ChatEntry }) => {
    if (item.kind === "date") return <DaySeparator label={item.label} />;
    return <Bubble message={item.message} />;
  }, []);

  /* ───────────────────────────── GÖRÜNÜM ───────────────────────────── */

  if (!auth.user) {
    return <Redirect href="/giris" />;
  }

  const status = thread?.status ?? "";
  const tone = STATUS_TONE[status] ?? "neutral";
  const closed = status === "closed";

  // Konu yüklenene kadar başlık boş kalmasın; iskelet altta çizilir.
  const header = (
    <ScreenHeader
      title={thread?.subject ?? "Mesaj"}
      subtitle={
        thread
          ? [thread.category_label, `${thread.messages.length} mesaj`].filter(Boolean).join(" · ")
          : "ElitLig yönetimi"
      }
      back
    />
  );

  if (!thread) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        {header}
        {query.isLoading ? (
          <View style={styles.skeleton}>
            <SkeletonListRow count={5} avatar={false} />
          </View>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={refetch} />
        ) : (
          <EmptyState
            icon="chatbubble-ellipses-outline"
            title="Konu bulunamadı"
            body="Bu yazışma silinmiş ya da başka bir hesaba ait olabilir."
            action={{ label: "Mesajlarıma dön", onPress: goToInbox }}
          />
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {header}

        {/* Durum bandı: rozet + ne anlama geldiği. */}
        <View style={styles.statusBar}>
          <Badge label={thread.status_label} tone={tone} size="xs" />
          <Text style={styles.statusHint} numberOfLines={2} {...textScale.dense}>
            {STATUS_HINT[status] ?? "Yönetim başvurunu takip ediyor."}
          </Text>
        </View>

        {query.isError ? (
          <ErrorState
            error={query.error}
            onRetry={refetch}
            variant="banner"
            style={styles.banner}
          />
        ) : null}

        <FlatList
          ref={listRef}
          data={entries}
          keyExtractor={entryKey}
          renderItem={renderItem}
          contentContainerStyle={styles.thread}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          initialNumToRender={20}
          windowSize={10}
        />

        {closed ? (
          <View style={styles.lock}>
            <View style={styles.lockRow}>
              <Ionicons name="lock-closed" size={16} color={colors.textTertiary} />
              <Text style={styles.lockText} {...textScale.long}>
                Bu konu kapatıldı. Yeni mesaj eklenemiyor; aynı konuda ek bilgin varsa yeni bir
                başvuru açman gerekiyor.
              </Text>
            </View>
            <Button
              label="Yeni başvuru aç"
              variant="secondary"
              size="sm"
              icon="create-outline"
              onPress={startNewThread}
              fullWidth
            />
          </View>
        ) : (
          <View style={styles.composer}>
            <Input
              value={reply}
              onChangeText={setReply}
              placeholder="Yanıtını yaz…"
              multiline
              maxLength={2000}
              containerStyle={styles.composerInput}
              accessibilityLabel="Yanıt metni"
            />
            <Touchable
              feedback="button"
              haptic="medium"
              onPress={handleSend}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Yanıtı gönder"
              accessibilityState={{ disabled: !canSend }}
              style={[styles.send, canSend ? null : styles.sendDisabled]}
            >
              <Ionicons
                name="send"
                size={17}
                color={canSend ? colors.textOnBrand : colors.textDisabled}
              />
            </Touchable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ═══════════════════════════ YAZIŞMA PARÇALARI ════════════════════════════ */

/** Gün ayracı — "Bugün", "Dün" ya da "14 Ağustos Perşembe". */
const DaySeparator = memo(function DaySeparator({ label }: { label: string }) {
  return (
    <View style={styles.dayRow}>
      <View style={styles.dayLine} />
      <Text style={styles.dayLabel} {...textScale.badge}>
        {label}
      </Text>
      <View style={styles.dayLine} />
    </View>
  );
});

/**
 * Tek balon. Üyenin yazdığı sağda ve marka rengindedir; yönetimin yazdığı
 * solda, gönderen adıyla. Negatif id "gönderiliyor" demektir (iyimser ekleme).
 */
const Bubble = memo(function Bubble({ message }: { message: PanelThreadMessage }) {
  const mine = message.direction === "to_admin";
  const sending = message.id < 0;

  return (
    <View
      style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, sending ? styles.bubbleSending : null]}
    >
      {mine ? null : (
        <View style={styles.senderRow}>
          <Ionicons name="shield-checkmark" size={11} color={colors.brandAccent} />
          <Text style={styles.sender} numberOfLines={1} {...textScale.dense}>
            {message.sender || "ElitLig"} · Yönetim
          </Text>
        </View>
      )}

      <Text style={[styles.bubbleText, mine ? styles.bubbleTextMine : null]} {...textScale.long}>
        {message.body}
      </Text>

      <View style={styles.stampRow}>
        {sending ? (
          <Ionicons name="time-outline" size={10} color={withAlpha(colors.textOnBrand, 0.72)} />
        ) : null}
        <Text style={[styles.stamp, mine ? styles.stampMine : null]} {...textScale.badge}>
          {sending ? "Gönderiliyor…" : clockLabel(message.created_at)}
        </Text>
      </View>
    </View>
  );
});

/* ═════════════════════════════════ STİLLER ════════════════════════════════ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  skeleton: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
  },
  banner: {
    marginHorizontal: layout.screenPadding,
    marginBottom: space.sm,
  },

  /* Durum bandı */
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.sm,
  },
  statusHint: {
    ...type.caption,
    color: colors.textSecondary,
    flex: 1,
  },

  /* Yazışma */
  thread: {
    flexGrow: 1,
    justifyContent: "flex-end",
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space.md,
    gap: space.sm,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.xs,
  },
  dayLine: {
    flex: 1,
    height: hairline,
    backgroundColor: colors.separator,
  },
  dayLabel: {
    ...type.micro,
    color: colors.textTertiary,
  },

  bubble: {
    maxWidth: "86%",
    borderRadius: radius.lg,
    padding: space.md,
  },
  bubbleMine: {
    alignSelf: "flex-end",
    backgroundColor: colors.brand,
    borderBottomRightRadius: radius.xs,
  },
  bubbleTheirs: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface2,
    borderBottomLeftRadius: radius.xs,
  },
  bubbleSending: {
    opacity: 0.72,
  },
  senderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    marginBottom: space.xxs,
  },
  sender: {
    ...type.micro,
    color: colors.brandAccent,
    flex: 1,
  },
  bubbleText: {
    ...type.bodySm,
    color: colors.textPrimary,
  },
  bubbleTextMine: {
    color: colors.textOnBrand,
  },
  stampRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    alignSelf: "flex-end",
    marginTop: space.xs,
  },
  stamp: {
    ...type.micro,
    color: colors.textTertiary,
  },
  stampMine: {
    color: withAlpha(colors.textOnBrand, 0.72),
  },

  /* Yanıt kutusu */
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
    backgroundColor: colors.surface1,
  },
  composerInput: {
    flex: 1,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
  },
  sendDisabled: {
    backgroundColor: colors.surface3,
  },

  /* Kapalı konu */
  lock: {
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    paddingBottom: space.md,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
    backgroundColor: colors.surface1,
  },
  lockRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
  },
  lockText: {
    ...type.caption,
    color: colors.textSecondary,
    flex: 1,
  },
});
