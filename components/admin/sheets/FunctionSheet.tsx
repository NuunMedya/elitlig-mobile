/**
 * FunctionSheet — işlev listesi (web "İşlevler" penceresi).
 * Türkçe ve İngilizce adla aranır; dokununca formüle eklenir.
 */

import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BottomSheet, Input, Touchable } from "@/components/ui";
import { ERROR_HINTS, FUNCTION_LIST, type FunctionInfo } from "@/lib/admin/sheetEngine";
import { colors, hairline, space, textScale, type } from "@/theme";

export function FunctionSheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick?: (fn: FunctionInfo) => void }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr-TR");
    return FUNCTION_LIST.filter(
      (f) => !needle || f.tr.toLocaleLowerCase("tr-TR").includes(needle) || f.en.toLowerCase().includes(needle) || f.hint.toLocaleLowerCase("tr-TR").includes(needle)
    );
  }, [q]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="İşlevler" snap="full">
      <View style={styles.body}>
        <Input variant="search" leadingIcon="search" value={q} onChangeText={setQ} placeholder="İşlev ara (TOPLA, SUM, EĞER…)" autoCapitalize="none" autoCorrect={false} />
        <Text style={styles.note} {...textScale.dense}>
          Bağımsız değişkenler ";" ile ayrılır. Hücre (A1), aralık (A1:B9), tam sütun (A:A) ve başka sayfa (Sayfa2!B3) kullanılabilir.
        </Text>
        {list.map((f, i) => (
          <Touchable
            key={f.en}
            onPress={() => {
              onPick?.(f);
              onClose();
            }}
            style={[styles.row, i ? styles.border : null]}
            accessibilityLabel={`${f.tr} işlevi`}
          >
            <View style={styles.names}>
              <Text style={styles.tr} {...textScale.dense}>
                {f.tr}
              </Text>
              <Text style={styles.en} {...textScale.dense}>
                {f.en}
              </Text>
            </View>
            <Text style={styles.hint} {...textScale.dense}>
              {f.hint}
            </Text>
          </Touchable>
        ))}
        <Text style={styles.section} {...textScale.dense}>
          HATA DEĞERLERİ
        </Text>
        {Object.entries(ERROR_HINTS).map(([code, text]) => (
          <View key={code} style={styles.err}>
            <Text style={styles.errCode} {...textScale.dense}>
              {code}
            </Text>
            <Text style={styles.hint} {...textScale.dense}>
              {text}
            </Text>
          </View>
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm, paddingBottom: space.xl },
  note: { ...type.caption, color: colors.textTertiary },
  row: { paddingVertical: space.sm, gap: 2 },
  border: { borderTopWidth: hairline, borderTopColor: colors.separator },
  names: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  tr: { ...type.label, color: colors.brandAccent },
  en: { ...type.caption, color: colors.textTertiary },
  hint: { ...type.bodySm, color: colors.textSecondary, flex: 1 },
  section: { ...type.overline, color: colors.textTertiary, marginTop: space.md },
  err: { flexDirection: "row", gap: space.md, alignItems: "center" },
  errCode: { ...type.tableNumStrong, color: colors.danger, width: 72 },
});
