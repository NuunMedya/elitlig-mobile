/**
 * HATA YAKALAYICI — beyaz ekran yerine hatanın metni.
 *
 * NEDEN VAR: üretim build'inde yakalanmayan bir JS hatası ekranı bembeyaz
 * bırakır; kullanıcı da inceleyici de ne olduğunu göremez. Bu bileşen iki
 * şey yapar:
 *   1) React ağacındaki render hatalarını (ErrorBoundary) yakalar ve hatanın
 *      adını, mesajını ve yığınının ilk satırlarını ekrana yazar.
 *   2) Render dışı (effect, promise, native köprü) hatalar için RN'in global
 *      hata işleyicisine bağlanır; ölümcül hatayı yine bu ekranda gösterir.
 * "Tekrar dene" hata durumunu sıfırlar; "Kopyala" metni panoya alır ki
 * ekran görüntüsü yerine metin paylaşılabilsin.
 *
 * Bu ekran bir teşhis aracıdır; normal kullanımda hiç görünmemesi gerekir.
 */

import * as Clipboard from "expo-clipboard";
import React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

interface State {
  error: Error | null;
  fatal: boolean;
}

type GlobalHandler = (error: Error, isFatal?: boolean) => void;
interface ErrorUtilsLike {
  getGlobalHandler?: () => GlobalHandler | undefined;
  setGlobalHandler?: (handler: GlobalHandler) => void;
}

function describe(error: Error | null): string {
  if (!error) return "";
  const stack = (error.stack ?? "").split("\n").slice(0, 12).join("\n");
  return `${error.name}: ${error.message}\n\n${stack}`;
}

export class CrashCatcher extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null, fatal: false };
  private previousHandler: GlobalHandler | undefined;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, fatal: false };
  }

  componentDidMount() {
    const utils = (globalThis as unknown as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
    if (!utils?.setGlobalHandler) return;
    this.previousHandler = utils.getGlobalHandler?.();
    utils.setGlobalHandler((error, isFatal) => {
      // Üretimde ölümcül hata ekranı boşaltır; önce biz gösterelim.
      this.setState({ error: error instanceof Error ? error : new Error(String(error)), fatal: Boolean(isFatal) });
      if (!isFatal) this.previousHandler?.(error, isFatal);
    });
  }

  componentWillUnmount() {
    const utils = (globalThis as unknown as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
    if (this.previousHandler && utils?.setGlobalHandler) utils.setGlobalHandler(this.previousHandler);
  }

  private reset = () => this.setState({ error: null, fatal: false });

  private copy = async () => {
    try {
      await Clipboard.setStringAsync(describe(this.state.error));
      Alert.alert("Kopyalandı", "Hata metni panoya alındı.");
    } catch {
      Alert.alert("Kopyalanamadı", "Ekran görüntüsü alıp paylaşın.");
    }
  };

  render() {
    const { error, fatal } = this.state;
    if (!error) return this.props.children;
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Bir hata oluştu{fatal ? " (ölümcül)" : ""}</Text>
          <Text style={styles.hint}>
            Bu ekran teşhis içindir. Lütfen ekran görüntüsü alıp ya da "Kopyala" ile metni paylaşın.
          </Text>
          <Text style={styles.code} selectable>
            {describe(error)}
          </Text>
          <View style={styles.row}>
            <Pressable onPress={this.copy} style={[styles.button, styles.secondary]}>
              <Text style={styles.buttonText}>Kopyala</Text>
            </Pressable>
            <Pressable onPress={this.reset} style={styles.button}>
              <Text style={[styles.buttonText, styles.primaryText]}>Tekrar dene</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  content: { paddingHorizontal: 20, paddingTop: 80, paddingBottom: 40, gap: 12 },
  title: { fontSize: 20, fontWeight: "700", color: "#7F1D1D" },
  hint: { fontSize: 14, color: "#4B5563", lineHeight: 20 },
  code: {
    fontFamily: "Menlo",
    fontSize: 12,
    lineHeight: 17,
    color: "#111827",
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    padding: 12,
  },
  row: { flexDirection: "row", gap: 12, marginTop: 8 },
  button: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: "#6D28D9", alignItems: "center" },
  secondary: { backgroundColor: "#E5E7EB" },
  buttonText: { fontSize: 15, fontWeight: "600", color: "#111827" },
  primaryText: { color: "#FFFFFF" },
});
