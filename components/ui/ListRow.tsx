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
 *  - `position` grup içi konumdur: köşe yuvarlaması, kenarlık ve ayraç ondan
 *    gelir. Grup bir KART gibi durur (yüzey + hairline kenarlık; tema.html
 *    ".group") ama satırlar sarılmaz, kabuğu her satır kendi konumuna göre
 *    taşır. Grubun SON satırından sonra ayraç çizilmez (§3.4).
 *  - `leading={{ icon, tone }}` ikonu 32px'lik renkli bir kutuda çizer
 *    (tema.html ".lrow .lic"): zemin rolün sönük rengi, ikon rolün rengi.
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
      /*
       * İKON KUTUDA DURUR (tema.html §6 ".lrow .lic"): 32px'lik yuvarlak
       * köşeli bir kutu, zemini rolün SÖNÜK rengi, ikonu rolün kendisi.
       * Çıplak ikon, 15px'lik başlığın yanında satırdan satıra farklı
       * ağırlıkta okunuyordu (dolu kupa iri, ince bir çizgi ikonu cılız);
       * kutu her satıra aynı görsel kütleyi verir ve rolün rengini (mor:
       * kulüp işi, camgöbeği: veri, kırmızı: canlı) ikondan çok daha
       * geniş bir alanda söyler.
       *
       * Nötr ton, rozetteki gibi `surface3` değil `surface2` alır: kartın
       * üstünde üç kademe koyu bir kutu, ikonun etrafında gri bir leke gibi
       * kalıyordu; bir kademe fark yeter.
       */
      const tone = leading.tone && leading.tone !== "neutral" ? toneColors(leading.tone) : null;
      const box = tone ? tone.dim : colors.surface2;
      const tint = tone ? tone.fg : colors.textSecondary;
      return (
        <View style={[styles.leading, { backgroundColor: disabled ? colors.surface2 : box }]}>
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
    position === "middle" ? styles.middle : null,
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

/** Sol ikon kutusunun kenarı — mockup ".lrow .lic" 32px. */
const LEADING_BOX = 32;

/**
 * Grup kartının kabuğu — tema.html ".group": yüzey + hairline kenarlık.
 * `elevate(1)`in yüzey ve kenarlık kısmıdır; GÖLGESİ BİLEREK YOK.
 *
 * NEDEN HER SATIR KENDİ KABUĞUNU TAŞIR: satırlar bir kaba SARILMAZ (60 ekran
 * `position` ile grup kurar), dolayısıyla kenarlık satır satır çizilir ve
 * grup içi konuma göre KESİLİR — ilk satırın altında, son satırın üstünde,
 * ortadakilerin iki yanı dışında kenarlık yoktur; yoksa satırlar arasında
 * ayraçtan başka bir çizgi daha belirir.
 *
 * NEDEN GÖLGE YOK: gölge de satır satır verildiğinde sonraki satırın gölgesi
 * (18px bulanıklık, 4px ofset → üst kenardan 14px yukarı taşar) bir önceki
 * satırın ALT şeridinin üstüne çiziliyordu — her ayracın üstünde 12px'lik
 * koyulaşan bir bant, ayraç da olması gerekenden koyu. Çizim sırası
 * değiştirilemez (liste hücreleri sırayla boyanır), yani bir grubun tek
 * parça gölgesi ancak satırları saran bir kaptan gelebilir; o kap yokken
 * gölgesiz düz bir kabuk, dikişli bir gölgeden iyidir. Tek başına duran
 * satır (`single`) gölgesini korur: onun komşusu yok.
 */
const GROUP_SHELL = {
  backgroundColor: colors.surface1,
  borderWidth: hairline,
  borderColor: colors.border,
} as const;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
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
    ...GROUP_SHELL,
    borderBottomWidth: 0,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  middle: {
    ...GROUP_SHELL,
    borderTopWidth: 0,
    borderBottomWidth: 0,
  },
  last: {
    ...GROUP_SHELL,
    borderTopWidth: 0,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  highlighted: {
    backgroundColor: colors.brandDim,
    borderLeftWidth: 3,
    borderLeftColor: colors.brand,
  },
  leading: {
    width: LEADING_BOX,
    height: LEADING_BOX,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  /**
   * Çağıranın verdiği HAZIR düğüm için yuva: ikon kutusuyla AYNI genişlikte
   * başlar ki amblemli ve ikonlu satırlarda başlık sütunu aynı hizadan
   * başlasın; SABİT değildir. Sabit bir yuvada yuvadan geniş bir düğüm (sıra
   * numarası + `crestLg` amblem gibi bileşik sol içerikler) iki yana taşıyor,
   * solda satırın iç boşluğunu aşıp kenardan dışarı çıkıyor, sağda başlığın
   * üstüne biniyordu. `minWidth`/`minHeight` ile kutuya kadar olan düğümlerin
   * hizası aynı kalır, daha genişleri kendi yerini alır.
   */
  leadingNode: {
    minWidth: LEADING_BOX,
    minHeight: LEADING_BOX,
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
  /** Amblem/ikon sütununu atlayan ayraç: 14 + 32 + 10 = 56. */
  dividerInsetAvatar: {
    left: layout.rowPaddingH + LEADING_BOX + space.m,
  },
});
