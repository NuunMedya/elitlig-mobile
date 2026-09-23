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

import { colors, radius, space, type } from "@/theme";

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
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg, paddingTop: space.giant, paddingBottom: space.xl, gap: space.md },
  title: { ...type.h2, color: colors.danger },
  hint: { ...type.bodySm, color: colors.textSecondary, lineHeight: 19 },
  code: {
    ...type.caption,
    fontFamily: "Menlo",
    lineHeight: 17,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    padding: space.md,
  },
  row: { flexDirection: "row", gap: space.md, marginTop: space.sm },
  button: { flex: 1, paddingVertical: space.md, borderRadius: radius.lg, backgroundColor: colors.brand, alignItems: "center" },
  secondary: { backgroundColor: colors.surfaceRaised },
  buttonText: { ...type.body, color: colors.textPrimary },
  primaryText: { color: colors.textOnBrand },
});
