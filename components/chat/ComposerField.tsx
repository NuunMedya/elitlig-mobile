/**
 * ComposerField — sohbet yazma kutusu (üye sohbeti ve yönetim yazışması ortak).
 *
 * NEDEN ORTAK `Input` DEĞİL: `Input`ın çok satırlı hâli bir FORM alanıdır ve
 * en az 88px yüksekliktedir; sohbet kutusu tek satırdan (44px) başlamalı,
 * yazdıkça beş satıra kadar büyümeli ve sonra kendi içinde kaymalı.
 * Hap biçimli, kâğıt zeminli; odakta kenarlık marka rengine döner.
 */

import { memo, useState } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { colors, hairline, radius, space, textScale, type } from "@/theme";

export interface ComposerFieldProps
  extends Pick<TextInputProps, "value" | "onChangeText" | "placeholder" | "maxLength" | "accessibilityLabel" | "editable"> {}

export const ComposerField = memo(function ComposerField(props: ComposerFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, focused ? styles.fieldFocused : null]}>
      <TextInput
        {...props}
        multiline
        numberOfLines={1}
        placeholderTextColor={colors.textTertiary}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.text}
        {...textScale.dense}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  field: {
    flex: 1,
    minHeight: 44,
    maxHeight: 132,
    justifyContent: "center",
    paddingHorizontal: space.lg,
    paddingVertical: space.s,
    borderRadius: radius.xl,
    backgroundColor: colors.bg,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  fieldFocused: {
    borderColor: colors.brandBorder,
  },
  text: {
    ...type.body,
    color: colors.textPrimary,
    maxHeight: 112,
    padding: 0,
    // Web: tarayıcı odak halkası kutunun kendi kenarlığıyla çakışmasın (bkz. ui/Input).
    ...({ outlineStyle: "none" } as object),
  },
});
