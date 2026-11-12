/**
 * HESAP ARAÇLARI — sunucuya bir şey göndermeyen hızlı hesaplar
 * (web: /yonetim/araclar/hesap-araclari).
 *
 * Bölümler: hesap makinesi (geçmişli), KDV (dahil/hariç), masraf / aidat
 * bölüştürme (yukarı yuvarlamalı), yüzde hesapları (yüzdesi, oranı, değişim),
 * iskonto / zam (art arda iki oran), taksit (anüite) ve tarih (fark, iş günü,
 * gün ekleme). Sonuçlar yazarken anında güncellenir; son girilen değerler ve
 * seçili bölüm cihazda hatırlanır (web'de tarayıcıda).
 *
 * Hesaplar components/admin/tools/calcUtils.ts'te — web calcUtils.js ile aynı.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { AdminScreen, DateField, SegmentField } from "@/components/admin";
import { isoDate } from "@/components/admin/tools/agendaUtils";
import {
  addDaysIso,
  dateDiff,
  discountChain,
  evaluate,
  installment,
  num,
  percentChange,
  percentOf,
  ratioPercent,
  splitCost,
  vat,
} from "@/components/admin/tools/calcUtils";
import { Chip, ChipGroup, Input, Touchable, useToast } from "@/components/ui";
import { formatMoney, formatNumber } from "@/lib/admin/format";
import { colors, hairline, layout, radius, space, textScale, type } from "@/theme";

type Section = "calc" | "vat" | "split" | "percent" | "discount" | "installment" | "date";
const SECTIONS: { key: Section; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "calc", label: "Hesap makinesi", icon: "calculator-outline" },
  { key: "vat", label: "KDV", icon: "receipt-outline" },
  { key: "split", label: "Bölüştür", icon: "people-outline" },
  { key: "percent", label: "Yüzde", icon: "pie-chart-outline" },
  { key: "discount", label: "İskonto / zam", icon: "pricetags-outline" },
  { key: "installment", label: "Taksit", icon: "card-outline" },
  { key: "date", label: "Tarih", icon: "calendar-outline" },
];

const STORE_KEY = "tools:calc:values";
const SECTION_KEY = "tools:calc:section";
const HISTORY_KEY = "tools:calc:history";

const today = isoDate(new Date());
const DEFAULTS: Record<string, string> = {
  vatAmount: "1000", vatRate: "20", vatMode: "exclude",
  pA: "15", pB: "2400", rPart: "350", rWhole: "1400", cFrom: "1200", cTo: "1500",
  dPrice: "5000", d1: "10", d2: "", dMode: "discount",
  sTotal: "4200", sPeople: "14", sRound: "5",
  iPrincipal: "60000", iMonths: "6", iRate: "0",
  dtFrom: today, dtTo: addDaysIso(today, 30), dtBase: today, dtAdd: "21",
};

/** Tüm girdiler tek nesnede; her değişiklik cihaza yazılır. */
function useStoredValues() {
  const [values, setValues] = useState<Record<string, string>>(DEFAULTS);
  const loaded = useRef(false);
  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY)
      .then((raw) => {
        if (raw) setValues((v) => ({ ...v, ...JSON.parse(raw) }));
      })
      .catch(() => undefined)
      .finally(() => {
        loaded.current = true;
      });
  }, []);
  useEffect(() => {
    if (loaded.current) void AsyncStorage.setItem(STORE_KEY, JSON.stringify(values)).catch(() => undefined);
  }, [values]);
  const set = useCallback((key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value })), []);
  return [values, set] as const;
}

export default function CalculatorsScreen() {
  const [section, setSection] = useState<Section>("calc");
  const [values, set] = useStoredValues();

  useEffect(() => {
    AsyncStorage.getItem(SECTION_KEY)
      .then((v) => {
        if (v && SECTIONS.some((s) => s.key === v)) setSection(v as Section);
      })
      .catch(() => undefined);
  }, []);
  const choose = (key: Section) => {
    setSection(key);
    void AsyncStorage.setItem(SECTION_KEY, key).catch(() => undefined);
  };

  const bind = (key: string) => ({ value: values[key] ?? "", onChangeText: (text: string) => set(key, text.replace(/[^\d.,-]/g, "")) });

  return (
    <AdminScreen
      app="hesap-araclari"
      title="Hesap araçları"
      subtitle="Anında, kayıt gerektirmeden"
    >
      <ChipGroup contentPadding={0}>
        {SECTIONS.map((s) => (
          <Chip key={s.key} label={s.label} icon={s.icon} size="sm" selected={section === s.key} onPress={() => choose(s.key)} />
        ))}
      </ChipGroup>
      {section === "calc" ? <Calculator /> : null}

      {section === "vat" ? (
        <VatCard values={values} set={set} bind={bind} />
      ) : null}

      {section === "split" ? (
        (() => {
          const split = splitCost(values.sTotal, values.sPeople, values.sRound);
          return (
            <CalcCard title="Masraf / aidat bölüştürme" subtitle="Saha, hakem, forma… kişi başı düşen pay">
              <NumberInput label="Toplam masraf" suffix="₺" {...bind("sTotal")} />
              <View style={styles.row}>
                <NumberInput label="Kişi sayısı" {...bind("sPeople")} flex />
                <NumberInput label="Yukarı yuvarla" suffix="₺" {...bind("sRound")} flex />
              </View>
              <Results>
                <Result label="Kişi başı" value={formatMoney(split.perPerson)} strong />
                <Result label="Toplanacak" value={formatMoney(split.collected)} />
                <Result label={split.surplus >= 0 ? "Kasada kalan" : "Eksik"} value={formatMoney(Math.abs(split.surplus))} />
              </Results>
              {split.exact != null && split.exact !== split.perPerson ? (
                <Text style={styles.note} {...textScale.long}>
                  Tam pay {formatMoney(split.exact)}; yuvarlama ile {formatMoney(split.perPerson)}.
                </Text>
              ) : null}
            </CalcCard>
          );
        })()
      ) : null}

      {section === "percent" ? (
        <CalcCard title="Yüzde hesapları">
          <Sentence result={formatNumber(percentOf(values.pA, values.pB))}>
            <InlineInput {...bind("pB")} label="Sayı" />
            <Text style={styles.sentence}> sayısının %</Text>
            <InlineInput {...bind("pA")} label="Yüzde" />
            <Text style={styles.sentence}> kadarı</Text>
          </Sentence>
          <Sentence result={`%${formatNumber(ratioPercent(values.rPart, values.rWhole))}`}>
            <InlineInput {...bind("rPart")} label="Parça" />
            <Text style={styles.sentence}> sayısı </Text>
            <InlineInput {...bind("rWhole")} label="Bütün" />
            <Text style={styles.sentence}> sayısının yüzde kaçı?</Text>
          </Sentence>
          {(() => {
            const change = percentChange(values.cFrom, values.cTo);
            return (
              <Sentence result={`${change >= 0 ? "+" : ""}%${formatNumber(change)}`} tone={change >= 0 ? "win" : "danger"}>
                <InlineInput {...bind("cFrom")} label="Eski değer" />
                <Text style={styles.sentence}> → </Text>
                <InlineInput {...bind("cTo")} label="Yeni değer" />
                <Text style={styles.sentence}> değişim</Text>
              </Sentence>
            );
          })()}
        </CalcCard>
      ) : null}

      {section === "discount" ? (
        (() => {
          const disc = discountChain(values.dPrice, [values.d1, values.d2].filter((x) => String(x ?? "").trim() !== ""), values.dMode === "markup" ? "markup" : "discount");
          return (
            <CalcCard title="İskonto ve zam" subtitle="Art arda iki orana kadar">
              <SegmentField
                value={values.dMode === "markup" ? "markup" : "discount"}
                onChange={(v) => set("dMode", v)}
                options={[
                  { key: "discount", label: "İskonto" },
                  { key: "markup", label: "Zam" },
                ]}
              />
              <NumberInput label="Fiyat" suffix="₺" {...bind("dPrice")} />
              <View style={styles.row}>
                <NumberInput label="1. oran" suffix="%" {...bind("d1")} flex />
                <NumberInput label="2. oran" suffix="%" placeholder="—" {...bind("d2")} flex />
              </View>
              <Results>
                <Result label={values.dMode === "markup" ? "Zamlı fiyat" : "İndirimli fiyat"} value={formatMoney(disc.final)} strong />
                <Result label="Fark" value={formatMoney(Math.abs(disc.difference))} />
                <Result label="Toplam oran" value={`%${formatNumber(Math.abs(disc.effectiveRate))}`} />
              </Results>
            </CalcCard>
          );
        })()
      ) : null}

      {section === "installment" ? (
        (() => {
          const inst = installment(values.iPrincipal, values.iMonths, values.iRate);
          return (
            <CalcCard title="Taksit hesaplama" subtitle="Eşit taksit; faiz 0 ise faizsiz bölünür">
              <NumberInput label="Tutar" suffix="₺" {...bind("iPrincipal")} />
              <View style={styles.row}>
                <NumberInput label="Taksit" suffix="ay" {...bind("iMonths")} flex />
                <NumberInput label="Aylık faiz" suffix="%" {...bind("iRate")} flex />
              </View>
              <Results>
                <Result label="Aylık taksit" value={formatMoney(inst.monthly)} strong />
                <Result label="Toplam ödeme" value={formatMoney(inst.total)} />
                <Result label="Faiz yükü" value={formatMoney(inst.interest)} />
              </Results>
            </CalcCard>
          );
        })()
      ) : null}

      {section === "date" ? (
        (() => {
          const diff = dateDiff(values.dtFrom, values.dtTo);
          const added = addDaysIso(values.dtBase, values.dtAdd);
          return (
            <>
              <CalcCard title="İki tarih arası" subtitle="Sezon, vade, ceza süresi…">
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <DateField label="Başlangıç" value={values.dtFrom} onChange={(v) => v && set("dtFrom", v)} />
                  </View>
                  <View style={styles.flex}>
                    <DateField label="Bitiş" value={values.dtTo} onChange={(v) => v && set("dtTo", v)} />
                  </View>
                </View>
                {diff ? (
                  <Results>
                    <Result label="Gün" value={formatNumber(diff.days)} strong />
                    <Result label="Hafta" value={formatNumber(diff.weeks)} />
                    <Result label="İş günü" value={formatNumber(diff.workdays)} />
                  </Results>
                ) : null}
              </CalcCard>
              <CalcCard title="Tarihe gün ekle">
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <DateField label="Tarih" value={values.dtBase} onChange={(v) => v && set("dtBase", v)} />
                  </View>
                  <NumberInput label="Gün (eksi de olur)" {...bind("dtAdd")} flex />
                </View>
                <Results>
                  <Result
                    label="Sonuç"
                    value={added ? new Date(`${added}T12:00:00`).toLocaleDateString("tr-TR", { weekday: "short", day: "numeric", month: "long", year: "numeric" }) : "—"}
                    strong
                  />
                </Results>
              </CalcCard>
            </>
          );
        })()
      ) : null}
    </AdminScreen>
  );
}

/* ═══════════════════════════ KDV ═══════════════════════════ */

function VatCard({
  values,
  set,
  bind,
}: {
  values: Record<string, string>;
  set: (key: string, value: string) => void;
  bind: (key: string) => { value: string; onChangeText: (t: string) => void };
}) {
  const mode = values.vatMode === "include" ? "include" : "exclude";
  const v = vat(values.vatAmount, values.vatRate, mode);
  const preset = ["1", "10", "20"].includes(String(values.vatRate));
  return (
    <CalcCard title="KDV hesaplama" subtitle="Tutarın KDV'sini ekleyin ya da içinden ayırın">
      <SegmentField
        value={mode}
        onChange={(m) => set("vatMode", m)}
        options={[
          { key: "exclude", label: "Hariç → dahil" },
          { key: "include", label: "Dahil → hariç" },
        ]}
      />
      <NumberInput label="Tutar" suffix="₺" {...bind("vatAmount")} />
      <View style={styles.rateRow}>
        {["1", "10", "20"].map((rate) => (
          <Chip key={rate} label={`%${rate}`} selected={String(values.vatRate) === rate} onPress={() => set("vatRate", rate)} />
        ))}
        <View style={styles.flex}>
          <NumberInput label="" placeholder="Diğer oran" suffix="%" value={preset ? "" : values.vatRate} onChangeText={(t) => set("vatRate", t.replace(/[^\d.,]/g, ""))} />
        </View>
      </View>
      <Results>
        <Result label="Matrah (KDV hariç)" value={formatMoney(v.net)} />
        <Result label={`KDV (%${formatNumber(num(values.vatRate))})`} value={formatMoney(v.vat)} />
        <Result label="Toplam (KDV dahil)" value={formatMoney(v.gross)} strong />
      </Results>
    </CalcCard>
  );
}

/* ═══════════════════════════ HESAP MAKİNESİ ═══════════════════════════ */

const KEYS = ["C", "(", ")", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "%", "0", ",", "="];

function Calculator() {
  const toast = useToast();
  const [expr, setExpr] = useState("");
  const [history, setHistory] = useState<{ expr: string; result: number }[]>([]);
  const preview = evaluate(expr);

  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY)
      .then((raw) => raw && setHistory(JSON.parse(raw)))
      .catch(() => undefined);
  }, []);

  const press = (key: string) => {
    if (key === "C") {
      setExpr("");
      return;
    }
    if (key === "=") {
      if (preview == null) return;
      const next = [{ expr, result: preview }, ...history].slice(0, 8);
      setHistory(next);
      void AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => undefined);
      setExpr(String(preview).replace(".", ","));
      return;
    }
    setExpr((value) => value + key);
  };

  return (
    <CalcCard title="Hesap makinesi" subtitle="+ − × ÷, yüzde ve parantez">
      <View style={styles.screen}>
        <LinearGradient colors={colors.gradientAdminStage} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.screenTop}>
          <TextInput
            value={expr}
            onChangeText={(t) => setExpr(t.replace(/[^0-9+\-*/().,%×÷−\s]/g, ""))}
            placeholder="0"
            placeholderTextColor={colors.textTertiary}
            style={styles.expr}
            keyboardType="numbers-and-punctuation"
            onSubmitEditing={() => press("=")}
            accessibilityLabel="İfade"
          />
          <Touchable
            feedback="icon"
            onPress={() => setExpr((v) => v.slice(0, -1))}
            accessibilityLabel="Son karakteri sil"
            disabled={!expr}
          >
            <Ionicons name="backspace-outline" size={22} color={colors.onDarkMuted} />
          </Touchable>
        </View>
        <Touchable
          feedback="none"
          onLongPress={async () => {
            if (preview == null) return;
            await Clipboard.setStringAsync(String(preview).replace(".", ","));
            toast.show({ message: "Sonuç panoya kopyalandı.", tone: "success" });
          }}
          accessibilityLabel="Sonuç — kopyalamak için basılı tut"
        >
          <Text style={styles.preview} accessibilityLiveRegion="polite" {...textScale.badge}>
            {expr && preview != null ? `= ${formatNumber(preview)}` : " "}
          </Text>
        </Touchable>
      </View>
      <View style={styles.keys}>
        {KEYS.map((key) => {
          const op = /[÷×−+]/.test(key);
          return (
            <Touchable
              key={key}
              feedback="button"
              haptic="selection"
              onPress={() => press(key)}
              style={[styles.key, op ? styles.keyOp : null, key === "=" ? styles.keyEq : null, key === "C" ? styles.keyClear : null]}
              accessibilityRole="button"
              accessibilityLabel={key === "C" ? "Temizle" : key === "=" ? "Hesapla" : key}
            >
              {key === "=" ? <LinearGradient colors={colors.gradientSignature} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.keyFill]} /> : null}
              <Text style={[styles.keyText, key === "=" ? styles.keyEqText : null, op ? styles.keyOpText : null]} {...textScale.badge}>
                {key}
              </Text>
            </Touchable>
          );
        })}
      </View>
      {history.length ? (
        <View style={styles.history}>
          <View style={styles.historyHead}>
            <Text style={styles.label} {...textScale.dense}>
              Geçmiş
            </Text>
            <Touchable
              feedback="none"
              onPress={() => {
                setHistory([]);
                void AsyncStorage.removeItem(HISTORY_KEY).catch(() => undefined);
              }}
              accessibilityLabel="Geçmişi temizle"
            >
              <Text style={styles.link} {...textScale.dense}>
                Temizle
              </Text>
            </Touchable>
          </View>
          {history.map((item, index) => (
            <Touchable key={index} feedback="row" onPress={() => setExpr(String(item.result).replace(".", ","))} style={styles.historyRow} accessibilityLabel={`${item.expr} eşittir ${item.result}`}>
              <Text style={styles.historyExpr} numberOfLines={1} {...textScale.dense}>
                {item.expr}
              </Text>
              <Text style={styles.historyResult} {...textScale.dense}>
                {formatNumber(item.result)}
              </Text>
            </Touchable>
          ))}
        </View>
      ) : null}
    </CalcCard>
  );
}

/* ═══════════════════════════ PARÇALAR ═══════════════════════════ */

function CalcCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle} {...textScale.dense}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.cardSub} {...textScale.dense}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function NumberInput({
  label,
  suffix,
  value,
  onChangeText,
  placeholder,
  flex,
}: {
  label: string;
  suffix?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  flex?: boolean;
}) {
  return (
    <View style={flex ? styles.flex : null}>
      <Input
        label={label || undefined}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType="decimal-pad"
        selectTextOnFocus
        trailing={
          suffix ? (
            <Text style={styles.suffix} {...textScale.dense}>
              {suffix}
            </Text>
          ) : undefined
        }
      />
    </View>
  );
}

function InlineInput({ value, onChangeText, label }: { value: string; onChangeText: (t: string) => void; label: string }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      keyboardType="decimal-pad"
      selectTextOnFocus
      style={styles.inline}
      accessibilityLabel={label}
      placeholderTextColor={colors.textTertiary}
    />
  );
}

function Sentence({ children, result, tone }: { children: ReactNode; result: string; tone?: "win" | "danger" }) {
  return (
    <View style={styles.sentenceBox}>
      <View style={styles.sentenceRow}>{children}</View>
      <Text style={[styles.sentenceResult, tone === "win" ? styles.win : tone === "danger" ? styles.danger : null]} {...textScale.badge}>
        {result}
      </Text>
    </View>
  );
}

function Results({ children }: { children: ReactNode }) {
  return <View style={styles.results}>{children}</View>;
}

function Result({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={[styles.result, strong ? styles.resultStrong : null]}>
      <Text style={styles.resultLabel} {...textScale.dense}>
        {label}
      </Text>
      <Text style={[styles.resultValue, strong ? styles.resultValueStrong : null]} selectable {...textScale.badge}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface1,
  },
  cardHead: { gap: 2 },
  cardTitle: { ...type.h2, color: colors.textPrimary },
  cardSub: { ...type.caption, color: colors.textTertiary },
  row: { flexDirection: "row", gap: space.sm, alignItems: "flex-end" },
  rateRow: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  flex: { flex: 1 },
  suffix: { ...type.label, color: colors.textTertiary },
  note: { ...type.caption, color: colors.textTertiary },
  label: { ...type.label, color: colors.textSecondary },
  link: { ...type.label, color: colors.brandAccent },

  results: { borderRadius: radius.md, backgroundColor: colors.surface2, overflow: "hidden" },
  result: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.m,
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  resultStrong: { backgroundColor: colors.brandDim },
  resultLabel: { flex: 1, ...type.bodySm, color: colors.textSecondary },
  resultValue: { ...type.scoreXs, color: colors.textPrimary },
  resultValueStrong: { ...type.scoreSm, color: colors.brandAccent },

  sentenceBox: { gap: space.xs, paddingVertical: space.sm, borderBottomWidth: hairline, borderBottomColor: colors.separator },
  sentenceRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", rowGap: space.xs },
  sentence: { ...type.body, color: colors.textSecondary },
  inline: {
    minWidth: 72,
    ...type.tableNumStrong,
    color: colors.textPrimary,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    borderWidth: hairline,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface2,
    textAlign: "center",
  },
  sentenceResult: { ...type.scoreSm, color: colors.brandAccent, textAlign: "right" },
  win: { color: colors.win },
  danger: { color: colors.danger },

  screen: { padding: space.lg, minHeight: 112, justifyContent: "flex-end", borderRadius: radius.xl, overflow: "hidden", backgroundColor: colors.adminBar, gap: space.xs },
  screenTop: { flexDirection: "row", alignItems: "center", gap: space.sm },
  expr: { flex: 1, ...type.scoreHero, color: colors.onDark, textAlign: "right" },
  preview: { ...type.scoreSm, color: colors.tileTones.cyan[0], textAlign: "right" },
  keys: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: space.sm },
  key: {
    width: "23%",
    height: 58,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  keyFill: { borderRadius: radius.lg },
  keyOp: { backgroundColor: colors.brandDim },
  keyEq: { backgroundColor: colors.brand, borderColor: colors.brand },
  keyClear: { backgroundColor: colors.dangerDim },
  keyText: { ...type.scoreSm, color: colors.textPrimary },
  keyOpText: { color: colors.brandAccent },
  keyEqText: { color: colors.onDark },
  history: { gap: space.xxs },
  historyHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: space.xs },
  historyRow: { flexDirection: "row", gap: space.md, paddingVertical: space.s, borderTopWidth: hairline, borderTopColor: colors.separator },
  historyExpr: { flex: 1, ...type.bodySm, color: colors.textSecondary },
  historyResult: { ...type.tableNumStrong, color: colors.textPrimary },
});
