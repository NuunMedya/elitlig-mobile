/**
 * FormulaBar — ızgaranın üstündeki ad kutusu + formül çubuğu.
 *
 * Telefonda hücre içi düzenleme parmak altında kalıyordu; bu yüzden TÜM
 * düzenleme bu çubukta yapılır (web'deki formül çubuğu gibi). Düzenlerken:
 *   · Formül yazılıyorsa işlev önerileri (TOPLA, EĞER, DÜŞEYARA …) çip
 *     olarak çıkar; dokununca "AD(" eklenir ve kullanım ipucu görünür.
 *   · Telefon klavyesinde zor bulunan işaretler için hızlı tuş şeridi
 *     (= ( ) ; : + − * / & $ " < >).
 *   · Izgarada bir hücreye dokunmak, formülde başvuru beklenen yerde o
 *     hücrenin adresini ekler (web'deki "tıklayarak başvuru ekleme").
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { forwardRef } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Touchable } from "@/components/ui";
import { functionMatches, wordAt } from "@/lib/admin/sheetEngine";
import { colors, fonts, hairline, radius, space, textScale, type } from "@/theme";

const QUICK_KEYS = ["=", "(", ")", ";", ":", "+", "-", "*", "/", "&", "$", '"', "<", ">", "%"];

export interface FormulaBarProps {
  label: string;
  text: string;
  editing: boolean;
  readOnly: boolean;
  caret: number;
  /** Programla konan imleç (başvuru / işlev eklendikten sonra); yoksa serbest. */
  selection?: { start: number; end: number } | null;
  hint?: string | null;
  onFocus: () => void;
  onChange: (text: string) => void;
  onSelection: (selection: { start: number; end: number }) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onNameBox: () => void;
  /** Öneri kabul edildiğinde: sözcüğün başı ve eklenecek ad. */
  onAcceptFunction: (start: number, name: string) => void;
  onInsert: (text: string) => void;
}

export const FormulaBar = forwardRef<TextInput, FormulaBarProps>(function FormulaBar(
  { label, text, editing, readOnly, caret, selection, hint, onFocus, onChange, onSelection, onSubmit, onCancel, onNameBox, onAcceptFunction, onInsert },
  ref
) {
  const word = editing ? wordAt(text, caret) : null;
  const suggestions = word ? functionMatches(word.word, 8) : [];
  const formula = text.startsWith("=");

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <Touchable onPress={onNameBox} style={styles.name} feedback="button" accessibilityLabel={`Ad kutusu: ${label}. Hücreye git`}>
          <Text style={styles.nameText} numberOfLines={1} {...textScale.badge}>
            {label}
          </Text>
        </Touchable>
        <Text style={styles.fx} {...textScale.badge}>
          fx
        </Text>
        <TextInput
          ref={ref}
          value={text}
          editable={!readOnly}
          onFocus={onFocus}
          onChangeText={onChange}
          selection={editing && selection ? selection : undefined}
          onSelectionChange={(e) => onSelection(e.nativeEvent.selection)}
          onSubmitEditing={onSubmit}
          placeholder={readOnly ? "Yalnız görüntüleme" : "Değer ya da =TOPLA(A1:A5)"}
          placeholderTextColor={colors.textTertiary}
          style={[styles.input, formula ? styles.formula : null]}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          returnKeyType="done"
          blurOnSubmit={false}
          accessibilityLabel="Formül çubuğu"
        />
        {editing ? (
          <>
            <Touchable onPress={onCancel} hitSlop={6} feedback="icon" accessibilityLabel="Vazgeç" style={styles.iconBtn}>
              <Ionicons name="close" size={20} color={colors.danger} />
            </Touchable>
            <Touchable onPress={onSubmit} hitSlop={6} feedback="icon" accessibilityLabel="Hücreye yaz" style={styles.iconBtn}>
              <Ionicons name="checkmark" size={22} color={colors.win} />
            </Touchable>
          </>
        ) : null}
      </View>

      {editing ? (
        <>
          {suggestions.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={styles.strip}>
              {suggestions.map((f) => (
                <Touchable key={f.en} onPress={() => onAcceptFunction(word!.start, f.insert)} style={styles.suggest} feedback="chip" accessibilityLabel={`${f.insert} işlevi`}>
                  <Text style={styles.suggestName} {...textScale.badge}>
                    {f.insert}
                  </Text>
                </Touchable>
              ))}
            </ScrollView>
          ) : null}
          {hint || suggestions[0] ? (
            <Text style={styles.hint} numberOfLines={2} {...textScale.dense}>
              {hint ?? suggestions[0]?.hint}
            </Text>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={styles.strip}>
            {QUICK_KEYS.map((k) => (
              <Touchable key={k} onPress={() => onInsert(k)} style={styles.key} feedback="chip" accessibilityLabel={`${k} ekle`}>
                <Text style={styles.keyText} {...textScale.badge}>
                  {k}
                </Text>
              </Touchable>
            ))}
          </ScrollView>
        </>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.surface1, borderBottomWidth: hairline, borderBottomColor: colors.glassLine, paddingVertical: space.s, gap: space.xs },
  bar: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.sm },
  name: {
    minWidth: 58,
    maxWidth: 96,
    height: 34,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.brandDim,
    borderWidth: hairline,
    borderColor: colors.brandBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  nameText: { ...type.numSmStrong, color: colors.brandAccent },
  fx: { ...type.labelXs, color: colors.brandAccent, paddingHorizontal: space.xxs, fontStyle: "italic" },
  input: {
    flex: 1,
    height: 36,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.glassLine,
    backgroundColor: colors.surface2,
    color: colors.textPrimary,
    ...type.body,
  },
  formula: { fontFamily: fonts.display },
  iconBtn: { padding: space.xs },
  strip: { gap: space.xs, paddingHorizontal: space.sm },
  suggest: { paddingVertical: space.xs, paddingHorizontal: space.sm, borderRadius: radius.pill, backgroundColor: colors.brandDim },
  suggestName: { ...type.labelXs, color: colors.brandAccent },
  hint: { ...type.caption, color: colors.textSecondary, paddingHorizontal: space.sm },
  key: {
    minWidth: 36,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.surface3,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  keyText: { ...type.tableNumStrong, color: colors.textPrimary },
});
