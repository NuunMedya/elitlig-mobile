/**
 * GERÇEK HAYAT KİLİDİ — bazı basamaklar yalnız oyunla değil, sahada (oyuncu
 * yolu) ya da tribünde (taraftar yolu) da hak edilir. İki yoldan biri yeter.
 * Oyuncu yolu yalnız profili bir oyuncuya bağlı üyeye açıktır; değilse
 * yalnız taraftar yolu gösterilir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";

import type { ReactNode } from "react";
import { useState } from "react";

import { BottomSheet, Button, Touchable } from "@/components/ui";
import type { City2Gate, City2GateCondition, City2GateItem, City2Next, City2RawCond, City2RawGate } from "@/lib/puzzle/city2";
import { colors, fonts, hairline, radius, space, textScale, type } from "@/theme";

import { Check, StarCost, fmt } from "./shared";


function CondLine({ c }: { c: City2GateCondition }) {
  return (
    <View style={styles.cond}>
      <View style={styles.condTop}>
        <Check ok={c.ok} size={13} />
        <Text style={[styles.condCount, c.ok ? styles.condOk : null]} {...textScale.badge}>
          {fmt(Math.min(c.have, c.min))}/{fmt(c.min)}
        </Text>
      </View>
      <Text style={styles.condText} numberOfLines={2} {...textScale.dense}>
        {c.label}
      </Text>
    </View>
  );
}

function Item({ item }: { item: City2GateItem }) {
  if ("any" in item) {
    return (
      <View style={styles.any}>
        <Text style={styles.anyTitle} {...textScale.dense}>
          biri yeter:
        </Text>
        {item.any.map((c) => (
          <CondLine key={c.metric} c={c} />
        ))}
      </View>
    );
  }
  return <CondLine c={item} />;
}

/** Tek yol kutusu (yan yana üç seçenekten biri). */
function Option({
  icon,
  title,
  tag,
  ok,
  tint,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint?: string;
  title: string;
  tag?: string | null;
  ok: boolean;
  children: ReactNode;
}) {
  return (
    <View style={[styles.option, ok ? styles.optionOk : null]}>
      <View style={styles.optionHead}>
        <Ionicons name={ok ? "checkmark-circle" : icon} size={16} color={ok ? colors.win : (tint ?? colors.brandAccent)} />
        {tag ? (
          <Text style={styles.optionTag} numberOfLines={1} {...textScale.badge}>
            {tag}
          </Text>
        ) : null}
      </View>
      <Text style={styles.optionTitle} numberOfLines={1} {...textScale.dense}>
        {title}
      </Text>
      {children}
    </View>
  );
}

/**
 * Sıradaki basamağın canlı kilidi (ladder.next.gate): üç yol yan yana —
 * sahada oyna (ücretsiz, önerilen) · taraftar (ücretsiz) · yıldızla aç
 * (herkese açık, daha pahalı). Yıldız yolu küçük bir onayla ödenir.
 */
export function GateLive({ next, gate, busy, onPay }: { next: City2Next; gate: City2Gate; busy?: boolean; onPay?: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const player = gate.paths.player;
  const fan = gate.paths.fan;
  const star = gate.paths.stars;
  const showStar = Boolean(star?.available && !gate.ok);
  const baseOk = next.dev.ok && next.stages.every((s) => s.ok);
  const cost = next.buy_cost || star?.cost || 0;
  const missing = star ? Math.max(0, cost - star.have) : 0;
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Ionicons name="shield-checkmark" size={16} color={gate.ok ? colors.win : colors.brandAccent} />
        <Text style={styles.headTitle} {...textScale.dense}>
          Gerçek hayat kilidi
        </Text>
        <Text style={styles.headMeta} numberOfLines={1} {...textScale.dense}>
          {gate.ok ? "açıldı" : `son ${gate.days} gün · bir yol yeter`}
        </Text>
      </View>
      <View style={styles.options}>
        {player.available ? (
          <Option icon="football" title="Sahada oyna" tag="ÖNERİLEN" ok={player.ok}>
            {player.conditions.map((c, i) => (
              <Item key={i} item={c} />
            ))}
          </Option>
        ) : null}
        <Option icon="megaphone" title="Taraftar" tag={player.available ? null : "ÜCRETSİZ"} ok={fan.ok}>
          {fan.conditions.map((c, i) => (
            <Item key={i} item={c} />
          ))}
        </Option>
        {showStar && star ? (
          <Option icon="star" title="Yıldızla aç" ok={false} tint={colors.yellowCard}>
            <StarCost value={cost} />
            <Text style={styles.condText} numberOfLines={2} {...textScale.dense}>
              {missing > 0 ? `${fmt(missing)} yıldız eksik` : "yıldızın yetiyor"}
            </Text>
          </Option>
        ) : null}
      </View>
      {!player.available ? (
        <Text style={styles.note} {...textScale.long}>
          Profilin bir oyuncuya bağlı değil; taraftar yolundan ya da yıldızla geçebilirsin.
        </Text>
      ) : null}
      {showStar && onPay ? (
        <Touchable
          onPress={() => setConfirm(true)}
          disabled={!next.can_buy || busy}
          feedback="button"
          style={[styles.payBtn, !next.can_buy ? styles.payBtnOff : null]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !next.can_buy || Boolean(busy) }}
          accessibilityLabel={`Kilidi ${cost} yıldızla aç`}
        >
          <Ionicons name="star" size={14} color={next.can_buy ? colors.yellowCard : colors.textTertiary} />
          <Text style={[styles.payText, !next.can_buy ? styles.payTextOff : null]} {...textScale.dense}>
            {next.can_buy
              ? `Yıldızla aç ve basamak atla · ${fmt(cost)}`
              : !baseOk
                ? "Yıldızla açmak için önce diğer koşullar"
                : `Yıldızla açmak için ${fmt(missing)} yıldız eksik`}
          </Text>
        </Touchable>
      ) : null}
      <BottomSheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title="Yıldızla açılsın mı?"
        footer={
          <View style={styles.confirmButtons}>
            <Button label="Vazgeç" variant="secondary" onPress={() => setConfirm(false)} style={styles.flex} />
            <Button
              label={`${fmt(cost)} yıldız öde`}
              icon="star"
              onPress={() => {
                setConfirm(false);
                onPay?.();
              }}
              style={styles.flex}
              haptic="success"
            />
          </View>
        }
      >
        <Text style={styles.confirmText} {...textScale.long}>
          {`${next.label}. basamağın (${next.title}) gerçek hayat kilidi ${fmt(cost)} yıldızla açılır ve hemen basamak atlarsın. ${player.available ? "Sahada oynayarak ya da taraftar yolundan" : "Taraftar yolundan"} bu kilidi ücretsiz de açabilirsin.`}
        </Text>
      </BottomSheet>
    </View>
  );
}

const condText = (c: { metric: string; min: number }, metrics: Record<string, { label: string }>) => `${fmt(c.min)} ${metrics[c.metric]?.label ?? c.metric}`;
const rawLine = (conds: City2RawCond[] | undefined, metrics: Record<string, { label: string }>) =>
  (conds ?? []).map((c) => ("any" in c ? `(${c.any.map((x) => condText(x, metrics)).join(" ya da ")})` : condText(c, metrics))).join(" + ");

/** Uzak basamağın kilidi (ham tanım): kısa iki satır. */
export function GateSummary({ gate, metrics }: { gate: City2RawGate; metrics: Record<string, { label: string }> }) {
  return (
    <View style={styles.summary}>
      <View style={styles.summaryRow}>
        <Ionicons name="shield-checkmark-outline" size={13} color={colors.textTertiary} />
        <Text style={styles.summaryHead} {...textScale.dense}>
          Gerçek hayat kilidi · son {gate.days} gün
        </Text>
      </View>
      {gate.player?.length ? (
        <Text style={styles.summaryText} {...textScale.long}>
          <Text style={styles.summaryKey}>Sahada: </Text>
          {rawLine(gate.player, metrics)}
        </Text>
      ) : null}
      {gate.fan?.length ? (
        <Text style={styles.summaryText} {...textScale.long}>
          <Text style={styles.summaryKey}>Taraftar: </Text>
          {rawLine(gate.fan, metrics)}
        </Text>
      ) : null}
      {gate.stars ? (
        <Text style={styles.summaryText} {...textScale.long}>
          <Text style={styles.summaryKey}>Yıldızla: </Text>
          {fmt(gate.stars)} yıldız
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  head: { flexDirection: "row", alignItems: "center", gap: space.xs },
  headTitle: { ...type.label, color: colors.textPrimary },
  headMeta: { ...type.caption, color: colors.textTertiary, flex: 1 },
  options: { flexDirection: "row", gap: space.xs },
  option: { flex: 1, gap: space.xxs, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.surface2 },
  optionOk: { backgroundColor: colors.winDim },
  optionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.xxs },
  optionTag: { ...type.nano, color: colors.win, flexShrink: 1 },
  optionTitle: { ...type.labelSm, color: colors.textPrimary },
  cond: { gap: 1 },
  condTop: { flexDirection: "row", alignItems: "center", gap: 3 },
  condCount: { ...type.numSmStrong, color: colors.textPrimary },
  condText: { ...type.caption, color: colors.textSecondary },
  condOk: { color: colors.win },
  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    minHeight: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: hairline,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface1,
  },
  payBtnOff: { backgroundColor: colors.surface2, borderColor: colors.border },
  payText: { ...type.labelSm, color: colors.textPrimary },
  payTextOff: { color: colors.textTertiary },
  confirmText: { ...type.body, color: colors.textSecondary, paddingBottom: space.sm },
  confirmButtons: { flexDirection: "row", gap: space.sm },
  flex: { flex: 1 },
  any: { gap: space.xxs, paddingLeft: space.xs },
  anyTitle: { ...type.caption, color: colors.textTertiary },
  note: { ...type.caption, color: colors.textSecondary },
  summary: { gap: 2 },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  summaryHead: { ...type.caption, color: colors.textSecondary },
  summaryText: { ...type.caption, color: colors.textTertiary },
  summaryKey: { fontFamily: fonts.semibold, color: colors.textSecondary },
});
