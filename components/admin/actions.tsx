/**
 * Onay ve eylem yardımcıları.
 *
 *   confirmAction({ title, message, confirmLabel, destructive }) → Promise<boolean>
 *   (Metin isteyen onaylar — ret gerekçesi gibi — FormSheet ile yapılır.)
 *   <ActionSheet visible actions={[{ label, icon, onPress, danger }]} />
 *   useAdminMutation(fn, { success, invalidate }) → useMutation + toast + önbellek tazeleme
 *
 * EYLEM SAYFASI GÖRÜNÜMÜ (yönetim tasarım dili): her eylem 56 px satır —
 * solda yuvarlak ikon pulu (yıkıcı eylem kırmızı zeminli), ad + ipucu, sağda
 * chevron. Satırlar tek cam kartta ince ayraçla; yıkıcı eylemler kartın
 * dibinde ayrı bir kartta durur ki yanlışlıkla dokunulmasın.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import React from "react";
import { Alert, Platform, StyleSheet, Text, View } from "react-native";

import { BottomSheet, Touchable, useToast } from "@/components/ui";
import { errorText } from "@/lib/admin/errors";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

export function confirmAction({
  title,
  message,
  confirmLabel = "Onayla",
  cancelLabel = "Vazgeç",
  destructive,
}: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  // react-native-web'de Alert.alert hiçbir şey göstermez: tarayıcı onayı.
  if (Platform.OS === "web") {
    const ask = (globalThis as { confirm?: (text: string) => boolean }).confirm;
    return Promise.resolve(ask ? ask(message ? `${title}\n\n${message}` : title) : true);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: "cancel", onPress: () => resolve(false) },
      { text: confirmLabel, style: destructive ? "destructive" : "default", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

export interface SheetAction {
  key?: string;
  label: string;
  hint?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
  hidden?: boolean;
}

export function ActionSheet({
  visible,
  onClose,
  title,
  actions,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  actions: SheetAction[];
  children?: React.ReactNode;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      {children}
      {[actions.filter((a) => !a.hidden && !a.danger), actions.filter((a) => !a.hidden && a.danger)]
        .filter((group) => group.length)
        .map((group, groupIndex) => (
          <View key={groupIndex} style={[styles.card, groupIndex ? styles.cardGap : null]}>
            {group.map((action, index) => (
              <Touchable
                key={action.key ?? action.label}
                feedback="row"
                disabled={action.disabled}
                onPress={() => {
                  onClose();
                  setTimeout(action.onPress, 250);
                }}
                style={[styles.row, index === 0 ? null : styles.rowBorder, action.disabled ? styles.disabled : null]}
                accessibilityRole="button"
              >
                <View style={[styles.lead, action.danger ? styles.leadDanger : null]}>
                  <Ionicons name={action.icon ?? "ellipse-outline"} size={18} color={action.danger ? colors.danger : colors.brandAccent} />
                </View>
                <View style={styles.texts}>
                  <Text style={[styles.label, action.danger ? styles.danger : null]} {...textScale.dense}>
                    {action.label}
                  </Text>
                  {action.hint ? (
                    <Text style={styles.hint} {...textScale.dense}>
                      {action.hint}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} />
              </Touchable>
            ))}
          </View>
        ))}
    </BottomSheet>
  );
}

/**
 * Yönetim mutasyonu: başarıda toast + ilgili sorguları tazeler, hatada
 * sunucunun cümlesini toast olarak gösterir.
 */
export function useAdminMutation<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  options: {
    success?: string | ((result: TResult, vars: TVars) => string | null);
    invalidate?: QueryKey[];
    onSuccess?: (result: TResult, vars: TVars) => void;
    silentError?: boolean;
  } = {}
) {
  const toast = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result, vars) => {
      for (const key of options.invalidate ?? []) void queryClient.invalidateQueries({ queryKey: key });
      const message = typeof options.success === "function" ? options.success(result, vars) : options.success;
      if (message) toast.show({ message, tone: "success" });
      options.onSuccess?.(result, vars);
    },
    onError: (error) => {
      if (!options.silentError) toast.show({ message: errorText(error), tone: "danger" });
    },
  });
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  cardGap: { marginTop: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 56, paddingVertical: space.sm, paddingHorizontal: space.md },
  rowBorder: { borderTopWidth: hairline, borderTopColor: colors.separator },
  lead: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandDim },
  leadDanger: { backgroundColor: colors.dangerDim },
  texts: { flex: 1, gap: 2 },
  label: { ...type.h4, color: colors.textPrimary },
  danger: { color: colors.danger },
  hint: { ...type.caption, color: colors.textTertiary },
  disabled: { opacity: 0.4 },
});
