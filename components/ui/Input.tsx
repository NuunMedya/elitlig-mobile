/**
 * Input — metin alanı ve arama kutusu (§4.30).
 *
 * ARENA ALANI: beyaz kâğıt + 1px kenarlık (`border`). Gri dolgulu alan, gri
 * kâğıdın üstünde "pasif" okunuyordu; beyaz alan "buraya yazılır" der ve
 * kart içinde de aynı dili konuşur. ODAKTA kenarlık marka rengine döner —
 * alanın nereye gittiğini yalnız kenarlık gösterir. Hata varsa kenarlık
 * kırmızıya döner ve ALTINDA metin belirir — yalnız renk kullanmak
 * erişilebilir değildir.
 *
 * `variant="search"` hap biçimli, arama ikonlu ve temizle düğmeli varyanttır;
 * temizleme yalnız `value` doluyken görünür ve dokunma alanı 44px'e
 * `hitSlop` ile tamamlanır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { colors, radius, space, textScale, touchSlop, type } from "@/theme";
import { Touchable } from "./Pressable";

export interface InputProps extends Omit<TextInputProps, "style"> {
  label?: string;
  error?: string;
  hint?: string;
  leadingIcon?: keyof typeof Ionicons.glyphMap;
  trailing?: React.ReactNode;
  /** 36 / 44 yükseklik — varsayılan "md". */
  size?: "sm" | "md";
  /** Arama kutusu varyantı: hap biçimli, temizle düğmeli. */
  variant?: "default" | "search";
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * RN sürümleri arasında odak olayının tipi değişiyor (NativeSyntheticEvent →
 * FocusEvent). Tipi prop'un kendisinden türetmek bu farkı görünmez kılar.
 */
type FocusHandler = NonNullable<TextInputProps["onFocus"]>;
type BlurHandler = NonNullable<TextInputProps["onBlur"]>;

export const Input = React.memo(
  React.forwardRef<TextInput, InputProps>(function Input(
    {
      label,
      error,
      hint,
      leadingIcon,
      trailing,
      size = "md",
      variant = "default",
      containerStyle,
      onFocus,
      onBlur,
      onChangeText,
      multiline,
      ...rest
    },
    ref,
  ) {
    const [focused, setFocused] = useState(false);
    const height = size === "sm" ? 36 : 44;
    const icon = leadingIcon ?? (variant === "search" ? "search" : undefined);
    const hasValue = typeof rest.value === "string" && rest.value.length > 0;

    const handleFocus = useCallback<FocusHandler>(
      (event) => {
        setFocused(true);
        onFocus?.(event);
      },
      [onFocus],
    );

    const handleBlur = useCallback<BlurHandler>(
      (event) => {
        setFocused(false);
        onBlur?.(event);
      },
      [onBlur],
    );

    const handleClear = useCallback(() => {
      onChangeText?.("");
    }, [onChangeText]);

    return (
      <View style={[styles.container, containerStyle]}>
        {label ? (
          <Text style={styles.label} numberOfLines={1} {...textScale.dense}>
            {label}
          </Text>
        ) : null}

        <View
          style={[
            styles.field,
            variant === "search" ? styles.fieldSearch : null,
            multiline ? styles.fieldMultiline : { height },
            focused ? styles.fieldFocused : null,
            error ? styles.fieldError : null,
            rest.editable === false ? styles.fieldDisabled : null,
          ]}
        >
          {icon ? (
            <Ionicons
              name={icon}
              size={16}
              color={error ? colors.danger : focused ? colors.brandAccent : colors.textTertiary}
            />
          ) : null}

          <TextInput
            {...rest}
            ref={ref}
            onChangeText={onChangeText}
            multiline={multiline}
            onFocus={handleFocus}
            onBlur={handleBlur}
            style={[styles.input, multiline ? styles.inputMultiline : null]}
            placeholderTextColor={colors.textTertiary}
            selectionColor={colors.brandAccent}
            cursorColor={colors.brandAccent}
            accessibilityLabel={rest.accessibilityLabel ?? label}
            allowFontScaling
            maxFontSizeMultiplier={1.3}
          />

          {variant === "search" && hasValue ? (
            <Touchable
              feedback="icon"
              haptic="none"
              onPress={handleClear}
              hitSlop={touchSlop(18)}
              accessibilityRole="button"
              accessibilityLabel="Aramayı temizle"
            >
              <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
            </Touchable>
          ) : null}

          {trailing}
        </View>

        {error ? (
          <Text style={styles.error} {...textScale.dense}>
            {error}
          </Text>
        ) : hint ? (
          <Text style={styles.hint} {...textScale.dense}>
            {hint}
          </Text>
        ) : null}
      </View>
    );
  }),
);

const styles = StyleSheet.create({
  container: {
    gap: space.s,
  },
  label: {
    ...type.h4,
    color: colors.textSecondary,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md + space.xxs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  fieldSearch: {
    borderRadius: radius.pill,
  },
  fieldMultiline: {
    minHeight: 88,
    alignItems: "flex-start",
    paddingVertical: space.md,
  },
  fieldFocused: {
    borderColor: colors.brand,
  },
  fieldError: {
    borderColor: colors.danger,
  },
  fieldDisabled: {
    backgroundColor: colors.surface2,
    opacity: 0.7,
  },
  input: {
    flex: 1,
    ...type.bodyLg,
    /* 15px (iOS'ta odakta yakınlaşmayı önleyen eşik) ama tek satırlık alanda
       makale satır aralığı değil, sıkı satır yüksekliği. */
    lineHeight: 20,
    color: colors.textPrimary,
    padding: 0,
    // Web'de tarayıcının odak halkası alanın kendi kenarlığıyla çakışıyordu.
    ...({ outlineStyle: "none" } as object),
  },
  inputMultiline: {
    textAlignVertical: "top",
  },
  hint: {
    ...type.caption,
    color: colors.textTertiary,
  },
  error: {
    ...type.caption,
    color: colors.danger,
  },
});
