/**
 * ListRow — uygulamanın en çok tekrar eden yapı taşı (§4.3).
 *
 * Menü, ayarlar, bildirimler, davetler, teklifler, kadro… hepsi tek bir satır
 * bileşenidir. NEDEN TEK BİLEŞEN: her ekranın kendi `Row`'unu yazması satır
 * yüksekliğini (52/64), ayraç girintisini ve basma tepkisini ekrandan ekrana
 * kaydırır; SofaScore/Maçkolik yoğunluğunun sırrı ise bu ölçülerin ASLA
 * değişmemesidir.
 *
 * DAVRANIŞ ÖZETİ:
 *  - Yükseklik 52 (tek satır) / 64 (subtitle var).
 *  - Basılı hâlde zemin `pressed` rengine ANINDA geçer, 120 ms'de döner;
 *    opaklık/ölçek YOK (§5.2) — satırda ucuz durur.
 *  - `position` grup içi konumdur: köşe yuvarlaması ve ayraç ondan gelir.
 *    Grubun SON satırından sonra ayraç çizilmez (§3.4).
 *  - `toggle` verildiğinde satırın tamamı basılabilir olur ve anahtarı çevirir.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useMemo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, elevate, hairline, layout, radius, space, textScale, type } from "@/theme";
import { GradientFill } from "./GradientFill";
import { Toggle } from "./Toggle";
import { toneColors, type Tone } from "./Badge";
import { Touchable } from "./Pressable";

/** Sol taraftaki ikon tanımı — hazır bir düğüm yerine kısayol. */
export interface LeadingIcon {
  icon: keyof typeof Ionicons.glyphMap;
  tone?: Tone;
}

export interface ListRowProps {
  /** Sol: ikon tanımı, hazır düğüm (amblem/avatar) veya boş. */
  leading?: React.ReactNode | LeadingIcon;
  title: string;
  /** İkinci satır — verilirse satır 64px olur. */
  subtitle?: string;
  /** Sağda küçük gri metin (saat, sayı, birim). */
  value?: string;
  /** Sağda rozet. */
  badge?: React.ReactNode;
  /** Sağda chevron — onPress varsa varsayılan true. */
  chevron?: boolean;
  /** Sağda anahtar (ayarlar) — chevron'u ezer. */
  toggle?: { value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean };
  onPress?: () => void;
  onLongPress?: () => void;
  /** Basılınca haptik — varsayılan "selection". */
  haptic?: "none" | "selection" | "light" | "medium";
  /** Grup içi konum — ayraç ve köşe yuvarlaması için. */
  position?: "single" | "first" | "middle" | "last";
  /** Okunmamış / vurgulu hâl: sol 3px mor ray + surface2 zemin. */
  highlighted?: boolean;
  /** Yıkıcı eylem — başlık danger rengine döner. */
  destructive?: boolean;
  disabled?: boolean;
  /** Sağda özel içerik (chevron/rozet yerine). */
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** `leading` bir ikon tanımı mı, yoksa hazır düğüm mü? */
function isLeadingIcon(value: React.ReactNode | LeadingIcon): value is LeadingIcon {
  return (
    typeof value === "object" &&
    value !== null &&
    !React.isValidElement(value) &&
    "icon" in (value as LeadingIcon)
  );
}

export const ListRow = React.memo(function ListRow({
  leading,
  title,
  subtitle,
  value,
  badge,
  chevron,
  toggle,
  onPress,
  onLongPress,
  haptic = "selection",
  position = "single",
  highlighted,
  destructive,
  disabled,
  trailing,
  style,
  testID,
}: ListRowProps) {
  const showChevron = chevron ?? (Boolean(onPress) && !toggle && !trailing);
  const interactive = Boolean(onPress || onLongPress || toggle) && !disabled;
  const showDivider = position === "first" || position === "middle";

  const handlePress = useCallback(() => {
    if (disabled) return;
    if (toggle && !toggle.disabled) toggle.onValueChange(!toggle.value);
    onPress?.();
  }, [disabled, onPress, toggle]);

  const leadingNode = useMemo(() => {
    if (leading == null) return null;
    if (isLeadingIcon(leading)) {
      const tint = leading.tone && leading.tone !== "neutral"
        ? toneColors(leading.tone).fg
        : colors.textSecondary;
      return (
        <View style={styles.leading}>
          <Ionicons name={leading.icon} size={18} color={disabled ? colors.textDisabled : tint} />
        </View>
      );
    }
    return <View style={styles.leadingNode}>{leading}</View>;
  }, [disabled, leading]);

  const gradientCorners =
    position === "single"
      ? styles.cornersAll
      : position === "first"
        ? styles.cornersTop
        : position === "last"
          ? styles.cornersBottom
          : null;

  const content = (
    <>
      {/*
        Işıklı yüzey. Köşe yarıçapı SATIRIN GRUP İÇİNDEKİ KONUMUNDAN gelir:
        kapsayıcıya `overflow: "hidden"` vermek yüzen rozetleri kırpardı, bu
        yüzden gradyan kendi köşelerini taşır.
      */}
      <GradientFill style={gradientCorners ?? undefined} />
      {leadingNode}

      <View style={styles.texts}>
        <Text
          style={[
            styles.title,
            destructive ? styles.titleDestructive : null,
            disabled ? styles.titleDisabled : null,
          ]}
          numberOfLines={1}
          {...textScale.dense}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1} {...textScale.dense}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {value ? (
        <Text style={styles.value} numberOfLines={1} {...textScale.dense}>
          {value}
        </Text>
      ) : null}
      {badge}
      {trailing}
      {toggle ? (
        <Toggle
          value={toggle.value}
          onValueChange={toggle.onValueChange}
          disabled={toggle.disabled ?? disabled}
          accessibilityLabel={title}
        />
      ) : null}
      {showChevron ? (
        <Ionicons name="chevron-forward" size={14} color={colors.textDisabled} />
      ) : null}

      {showDivider ? (
        <View
          pointerEvents="none"
          style={[styles.divider, leading != null ? styles.dividerInsetAvatar : null]}
        />
      ) : null}
    </>
  );

  const containerStyle: StyleProp<ViewStyle> = [
    styles.row,
    subtitle ? styles.rowTwoLine : null,
    position === "single" ? styles.single : null,
    position === "first" ? styles.first : null,
    position === "last" ? styles.last : null,
    highlighted ? styles.highlighted : null,
    style,
  ];

  if (!interactive) {
    return (
      <View style={containerStyle} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <Touchable
      feedback="row"
      haptic={haptic}
      onPress={onPress || toggle ? handlePress : undefined}
      onLongPress={onLongPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole={toggle ? "switch" : "button"}
      accessibilityLabel={[title, subtitle, value].filter(Boolean).join(". ")}
      accessibilityState={{ disabled: Boolean(disabled), checked: toggle?.value }}
      style={containerStyle}
    >
      {content}
    </Touchable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: layout.listRowHeight,
    paddingHorizontal: layout.rowPaddingH,
    backgroundColor: colors.surface1,
  },
  rowTwoLine: {
    minHeight: layout.listRowHeightTwoLine,
  },
  single: {
    borderRadius: radius.lg,
    ...elevate(1),
  },
  cornersAll: {
    borderRadius: radius.lg,
  },
  cornersTop: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  cornersBottom: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  first: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  last: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  highlighted: {
    backgroundColor: colors.brandDim,
    borderLeftWidth: 3,
    borderLeftColor: colors.brand,
  },
  leading: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  /**
   * Çağıranın verdiği HAZIR düğüm için yuva: ikon yuvasının aksine SABİT
   * değil, en az 24px. Sabit 24px'te 24'ten geniş bir düğüm (sıra numarası +
   * `crestLg` amblem gibi bileşik sol içerikler) yuvadan iki yana taşıyor,
   * solda satırın iç boşluğunu aşıp kenardan dışarı çıkıyor, sağda başlığın
   * üstüne biniyordu. `minWidth`/`minHeight` ile 24'e kadar olan düğümlerin
   * hizası aynı kalır, daha genişleri kendi yerini alır.
   */
  leadingNode: {
    minWidth: 20,
    minHeight: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  texts: {
    flex: 1,
    gap: 1,
  },
  title: {
    ...type.h4,
    color: colors.textPrimary,
  },
  titleDestructive: {
    color: colors.danger,
  },
  titleDisabled: {
    color: colors.textDisabled,
  },
  subtitle: {
    ...type.bodySm,
    color: colors.textTertiary,
  },
  value: {
    ...type.bodySm,
    color: colors.textSecondary,
    maxWidth: 130,
    textAlign: "right",
  },
  divider: {
    position: "absolute",
    left: layout.rowPaddingH,
    right: 0,
    bottom: 0,
    height: hairline,
    backgroundColor: colors.separator,
  },
  /** Amblem/ikon sütununu atlayan ayraç: 12 + 20 + 8 = 40. */
  dividerInsetAvatar: {
    left: layout.rowPaddingH + 20 + space.sm,
  },
});
