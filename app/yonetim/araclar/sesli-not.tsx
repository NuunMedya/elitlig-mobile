/**
 * Araçlar → SESLİ HIZLI NOT.
 *
 * WhatsApp'tan gelen maç talebini araba sürerken bile tek sesli komutla
 * kaydetmek için: "Hey Siri, maç talebi" → söylenen metin uygulama AÇILMADAN
 * Not Defteri'nin "Maç talepleri" defterine düşer, Siri "Kaydedildi" der.
 *
 * Bu ekran kişisel hızlı not anahtarını üretir ve kestirmenin kurulumunu adım
 * adım gösterir. Anahtar yalnız not ekleyebilir; düz hâli yalnız üretildiği an
 * görünür (sunucu özetini saklar). Sunucu: lib/api/admin/quickCapture.ts.
 */
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AdminScreen, confirmAction } from "@/components/admin";
import { Button, Card, Touchable, useToast } from "@/components/ui";
import {
  QUICK_CAPTURE_URL,
  createQuickCaptureKey,
  getQuickCaptureStatus,
  revokeQuickCaptureKey,
  testQuickCapture,
} from "@/lib/api/admin/quickCapture";
import { errorText } from "@/lib/admin/errors";
import { colors, radius, space, textScale, type } from "@/theme";

const STATUS_KEY = ["quick-capture", "status"] as const;

const dateText = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
};

export default function QuickCaptureScreen() {
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: STATUS_KEY, queryFn: getQuickCaptureStatus });
  /** Düz anahtar yalnız bu oturumda, üretildiği an bilinir. */
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "revoke" | "test" | null>(null);

  const copy = async (value: string, what: string) => {
    await Clipboard.setStringAsync(value);
    toast.show({ message: `${what} panoya kopyalandı.`, tone: "success" });
  };

  const create = async () => {
    if (status.data?.active) {
      const ok = await confirmAction({
        title: "Yeni anahtar üretilsin mi?",
        message: "Eski anahtar hemen geçersiz olur; kestirmedeki anahtarı yenisiyle değiştirmen gerekir.",
        confirmLabel: "Yeni anahtar üret",
      });
      if (!ok) return;
    }
    setBusy("create");
    try {
      const result = await createQuickCaptureKey();
      setKey(result.key);
      queryClient.setQueryData(STATUS_KEY, result);
    } catch (error) {
      toast.show({ message: errorText(error), tone: "danger" });
    } finally {
      setBusy(null);
    }
  };

  const revoke = async () => {
    const ok = await confirmAction({
      title: "Anahtar iptal edilsin mi?",
      message: "Kestirme bir daha not kaydedemez. İstediğin zaman yeni anahtar üretebilirsin.",
      confirmLabel: "İptal et",
      destructive: true,
    });
    if (!ok) return;
    setBusy("revoke");
    try {
      queryClient.setQueryData(STATUS_KEY, await revokeQuickCaptureKey());
      setKey(null);
    } catch (error) {
      toast.show({ message: errorText(error), tone: "danger" });
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    if (!key) return;
    setBusy("test");
    try {
      const message = await testQuickCapture(key, "Deneme: sesli hızlı not çalışıyor");
      toast.show({ message, tone: "success" });
      void queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    } catch (error) {
      toast.show({ message: errorText(error), tone: "danger" });
    } finally {
      setBusy(null);
    }
  };

  const data = status.data;
  const lastUsed = dateText(data?.last_used_at);

  return (
    <AdminScreen title="Sesli hızlı not" subtitle="Siri ile maç talebi kaydet" onRefresh={() => void status.refetch()} refreshing={status.isRefetching}>
      <Card icon="mic-outline" title="Nasıl çalışır?">
        <Text style={styles.body} {...textScale.long}>
          “Hey Siri, maç talebi” de, talebi söyle. Not uygulama açılmadan Not Defteri’nin{" "}
          <Text style={styles.strong}>Maç talepleri</Text> defterine düşer, Siri “Kaydedildi” der. Telefon kilitliyken ve
          CarPlay’de de çalışır.
        </Text>
        <Touchable feedback="row" onPress={() => router.push("/yonetim/araclar/not-defteri")} style={styles.link} accessibilityRole="link">
          <Text style={styles.linkText} {...textScale.dense}>Not Defteri’ni aç</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.brand} />
        </Touchable>
      </Card>

      <Card icon="key-outline" title="1 · Hızlı not anahtarı">
        {status.isLoading ? (
          <Text style={styles.muted}>Yükleniyor…</Text>
        ) : key ? (
          <>
            <Text style={styles.body} {...textScale.long}>
              Anahtarın hazır. Bunu yalnız şimdi görebilirsin: kopyala ve 2. adımda kestirmeye yapıştır.
            </Text>
            <Touchable feedback="card" onPress={() => void copy(`Bearer ${key}`, "Anahtar")} style={styles.codeBox} accessibilityLabel="Anahtarı kopyala">
              <Text style={styles.code} selectable {...textScale.dense}>Bearer {key}</Text>
              <Ionicons name="copy-outline" size={18} color={colors.brand} />
            </Touchable>
            <Button label="Dene: deneme notu gönder" icon="paper-plane-outline" variant="secondary" onPress={() => void test()} loading={busy === "test"} fullWidth />
          </>
        ) : data?.active ? (
          <Text style={styles.body} {...textScale.long}>
            Anahtarın etkin ({data.hint}).{lastUsed ? ` Son not: ${lastUsed}, toplam ${data.use_count ?? 0}.` : " Henüz not gelmedi."} Anahtarı
            kaybettiysen ya da yeni bir telefona kuracaksan yeni anahtar üret.
          </Text>
        ) : (
          <Text style={styles.body} {...textScale.long}>
            Henüz anahtarın yok. Anahtar yalnız senin Not Defteri’ne not ekleyebilir; başka hiçbir şeye erişemez.
          </Text>
        )}
        <View style={styles.row}>
          <Button
            label={data?.active || key ? "Yeni anahtar üret" : "Anahtar oluştur"}
            icon="key-outline"
            onPress={() => void create()}
            loading={busy === "create"}
            variant={data?.active || key ? "secondary" : "primary"}
            style={styles.grow}
          />
          {data?.active ? <Button label="İptal et" variant="danger" onPress={() => void revoke()} loading={busy === "revoke"} /> : null}
        </View>
      </Card>

      <Card icon="git-branch-outline" title="2 · Kestirmeyi kur (bir kez)">
        <Step n={1} text="Kestirmeler uygulamasını aç, sağ üstte + ile yeni kestirme oluştur." />
        <Step n={2} text="“Metni Dikte Et” eylemini ekle. Dil: Türkçe. Dinlemeyi durdur: Duraklamadan sonra." />
        <Step n={3} text="“URL’nin İçeriğini Al” eylemini ekle ve URL olarak şunu yapıştır:" />
        <Touchable feedback="card" onPress={() => void copy(QUICK_CAPTURE_URL, "Adres")} style={styles.codeBox} accessibilityLabel="Adresi kopyala">
          <Text style={styles.code} selectable {...textScale.dense}>{QUICK_CAPTURE_URL}</Text>
          <Ionicons name="copy-outline" size={18} color={colors.brand} />
        </Touchable>
        <Step n={4} text="Aynı eylemde ok işaretine dokun: Yöntem POST. Başlıklar → Yeni başlık: ad Authorization, değer 1. adımda kopyaladığın “Bearer elq_…”." />
        <Step n={5} text="İstek Gövdesi: JSON. Yeni alan → Metin: anahtar text, değer olarak “Dikte Edilen Metin” değişkenini seç." />
        <Step n={6} text="“Sonucu Göster” eylemini ekle (girdi: URL’nin İçeriği). Siri bunu sesli okur." />
        <Step n={7} text="Kestirmenin adını “Maç talebi” yap. Artık “Hey Siri, maç talebi” demen yeterli." />
      </Card>

      <Card icon="chatbubble-ellipses-outline" title="İpucu">
        <Text style={styles.body} {...textScale.long}>
          Takım adını, günü, saati, sahayı ve arayanın adını tek seferde söyle: “Kartallar FK cumartesi akşam sekizde
          Batıkent sahasında maç istiyor, kaptan Mehmet.” İlk cümle notun başlığı olur.
        </Text>
      </Card>
    </AdminScreen>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNo}>
        <Text style={styles.stepNoText}>{n}</Text>
      </View>
      <Text style={[styles.body, styles.grow]} {...textScale.long}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { ...type.body, color: colors.textPrimary },
  strong: { fontFamily: type.label.fontFamily },
  muted: { ...type.body, color: colors.textSecondary },
  link: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: space.md, alignSelf: "flex-start" },
  linkText: { ...type.label, color: colors.brand },
  codeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginVertical: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.brandDim,
  },
  code: { ...type.bodySm, flex: 1, color: colors.textPrimary, fontFamily: "Courier" },
  row: { flexDirection: "row", gap: space.sm, marginTop: space.md },
  grow: { flex: 1 },
  step: { flexDirection: "row", gap: space.md, alignItems: "flex-start", marginTop: space.md },
  stepNo: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.brandDim, alignItems: "center", justifyContent: "center" },
  stepNoText: { ...type.labelSm, color: colors.brand },
});
