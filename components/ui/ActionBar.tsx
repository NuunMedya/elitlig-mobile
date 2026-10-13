/**
 * ActionBar — ekranın altına sabitlenen ortak eylem çubuğu.
 *
 * NEDEN: form ve karar ekranları (teklif, kadro, maç al, yoklama…) altta sabit
 * birincil düğme taşır (Arena "Form" kalıbı). Her ekran kendi `styles.bar`
 * kopyasını yazıyordu: güvenli alan payı, gölge, kenarlık ve boşluklar ekran
 * ekran farklılaşıyordu. Tek bileşen hepsini aynı yapar.
 *
 * DÜZEN: `children` yatay sıralanır (ör. ikincil + birincil düğme), aralarında
 * `space.md`. `leading` verilirse solda özet metni/sayaç durur, düğmeler
 * sağa yaslanır.
 *
 *   <ActionBar>
 *     <Button label="Vazgeç" variant="secondary" … />
 *     <Button label="Kaydet" … style={{ flex: 1 }} />
 *   </ActionBar>
 *
 * `floating` (varsayılan true): ekranın altına mutlak konumlanır; kaydırılan
 * içerik `ACTION_BAR_SPACE + insets.bottom` kadar alt pay bırakmalıdır.
 * `floating={false}`: akışın içinde (ör. KeyboardAvoidingView'in son çocuğu).
 */

import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, elevate, hairline, layout, space } from "@/theme";

/** Çubuğun güvenli alan hariç yüksekliği — içerik alt payı için. */
export const ACTION_BAR_SPACE = 76;

export interface ActionBarProps {
  children: React.ReactNode;
  /** Solda düğmelerden önce duran içerik (özet, sayaç). */
  leading?: React.ReactNode;
  /** Mutlak konum (varsayılan true). */
  floating?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ActionBar({ children, leading, floating = true, style, testID }: ActionBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.bar, floating ? styles.floating : null, { paddingBottom: space.md + insets.bottom }, style]}
      testID={testID}
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={[styles.actions, leading ? null : styles.actionsFill]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    ...elevate(2),
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    backgroundColor: colors.surface1,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
  },
  floating: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  leading: {
    flex: 1,
    minWidth: 0,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  actionsFill: {
    flex: 1,
  },
});
