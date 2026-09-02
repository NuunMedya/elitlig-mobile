/**
 * TeamRow — TAKIM SATIRININ TEK ANATOMİSİ.
 *
 * SORUN NEYDİ: takım satırı uygulamada üç ayrı yerde üç ayrı çizilmişti —
 * Takımlar sekmesinde sıra solda ve puan birimliydi, lig tablosunda amblem
 * sağdaydı, takım detayının mini tablosunda sıra hiç yoktu. Aynı varlığın
 * her listede farklı okunması, kullanıcıya her ekranda yeni bir okuma sırası
 * öğretiyordu; "sekmeler bir düzene sahip değil" şikâyetinin kaynağı büyük
 * ölçüde buydu.
 *
 * KURAL — SIRA DEĞİŞMEZ, YOĞUNLUK DEĞİŞİR:
 *
 *     [bölge rayı] · [sıra] · [amblem] · [ad + bağlam] · [sayı]
 *
 * İki yoğunluk vardır ve ikisi de bu sırayı taşır:
 *   · `list`  (66px) — ad ALTINDA form çipleri ve meta satırı. Takımı
 *                      TANIMAK için: Takımlar sekmesi, favoriler, mini liste.
 *   · `table` (40px) — O·G·B·M·AV·P sütunları. KARŞILAŞTIRMAK için: tam puan
 *                      durumu. Sütun genişlikleri `TeamRowHead` ile birebir
 *                      aynıdır; ikisi tek dosyada olduğu için kayamaz.
 *
 * BÖLGE RAYI SATIRI BOYAMAZ: şampiyonluk/play-off/düşme bilgisi satırın SOL
 * kenarında 3px'lik dikey bir raydır. Satır zeminini boyamak yirmi takımlık
 * bir tabloyu alacalı ve okunmaz yapıyordu; ayrıca renk tek başına anlam
 * taşımaz — sıra numarası zaten orada ve listenin altında renk açıklaması var.
 *
 * BİRİM SATIRDA DEĞİL BAŞLIKTA: "PUAN" her satırda tekrarlanınca sağ sütun
 * gri bir gürültü şeridine dönüyordu. Birim bir kez `TeamRowHead` içinde
 * söylenir; ekran okuyucu için satırın kendi etiketi taşır.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";
import { FormChips } from "./FormChips";
import { TeamLogo } from "./TeamLogo";
import { Touchable } from "./Pressable";

export type TeamRowDensity = "list" | "table";

/** Satır yükseklikleri — ekranlar `getItemLayout` için bunları kullanır. */
export const TEAM_ROW_HEIGHT = 66;
export const TEAM_ROW_HEIGHT_TABLE = 40;

/* Sütun genişlikleri — satır ve başlık AYNI sabitleri kullanır. */
const COL_RANK = 22;
/* Sayı sütunları DAR: 20px + 6px aralık altı sütunda ad sütununa 390px'te
   ~140px bırakıyor ve "ESAT MUTLU S…" diye kırpıyordu. 18 + 4 (maket 17 + 7)
   ada ~30px geri verir; iki haneli sayılar 18px'e tabular rakamla sığar. */
const COL_NUM = 18;
const COL_DIFF = 24;
const COL_POINTS = 24;
/** Liste yoğunluğunda sağdaki puan bloğu. */
const POINTS_BOX = 34;

export interface TeamRowProps {
  teamId: number;
  name: string;
  /** Sıra numarası; verilmezse sıra kutusu çizilmez (ör. alfabetik liste). */
  rank?: number;
  logo?: string | null;
  points?: number;
  played?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  goalDiff?: number;
  /** "GGBMG" — son beş maç. Yalnız `list` yoğunluğunda çizilir. */
  form?: string;
  favorite?: boolean;
  /** Bölge rayının rengi (`zoneColor`); yoksa ray çizilmez. */
  zone?: string | null;
  /**
   * "Bu satır BU sayfanın konusu" — takım detayındaki mini tabloda kendi
   * takımını işaretler. Zemin sönük mor olur; kalın yazı ya da renkli metin
   * KULLANILMAZ, çünkü satırın kendi hiyerarşisi (sıra, ad, puan) zaten
   * kurulu ve ikinci bir vurgu onu bozar.
   */
  highlighted?: boolean;
  density?: TeamRowDensity;
  onPress: (teamId: number) => void;
  style?: StyleProp<ViewStyle>;
}

/** Averajı işaretiyle yazar: +21 / 0 / −5 (gerçek eksi işareti). */
function formatDiff(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}

function TeamRowBase({
  teamId,
  name,
  rank,
  logo,
  points,
  played,
  wins,
  draws,
  losses,
  goalDiff,
  form,
  favorite,
  zone,
  highlighted,
  density = "list",
  onPress,
  style,
}: TeamRowProps) {
  const handlePress = useCallback(() => onPress(teamId), [onPress, teamId]);

  const accessibilityLabel = [
    rank != null ? `${rank}.` : null,
    name,
    points != null ? `${points} puan` : null,
  ]
    .filter(Boolean)
    .join(" ");

  if (density === "table") {
    return (
      <Touchable
        style={[styles.tableRow, highlighted ? styles.highlighted : null, style]}
        onPress={handlePress}
        feedback="row"
        haptic="selection"
        accessibilityLabel={accessibilityLabel}
      >
        <View style={[styles.rail, zone ? { backgroundColor: zone } : null]} />
        <Text style={styles.tableRank} {...textScale.dense}>
          {rank ?? "—"}
        </Text>
        <TeamLogo name={name} logo={logo ?? null} size={layout.crestSm} />
        <Text
          style={[styles.tableName, favorite ? styles.nameFavorite : null]}
          numberOfLines={1}
          {...textScale.dense}
        >
          {name}
        </Text>
        <Text style={styles.tableNum} {...textScale.dense}>{played ?? "—"}</Text>
        <Text style={styles.tableNum} {...textScale.dense}>{wins ?? "—"}</Text>
        <Text style={styles.tableNum} {...textScale.dense}>{draws ?? "—"}</Text>
        <Text style={styles.tableNum} {...textScale.dense}>{losses ?? "—"}</Text>
        <Text
          style={[
            styles.tableNum,
            styles.tableDiff,
            goalDiff != null && goalDiff > 0 ? styles.diffPositive : null,
            goalDiff != null && goalDiff < 0 ? styles.diffNegative : null,
          ]}
          {...textScale.dense}
        >
          {goalDiff != null ? formatDiff(goalDiff) : "—"}
        </Text>
        <Text style={[styles.tableNum, styles.tablePoints]} {...textScale.dense}>
          {points ?? "—"}
        </Text>
      </Touchable>
    );
  }

  /* Meta satırı: form çipleri + oynanan maç + averaj. Puan burada TEKRAR
     EDİLMEZ — sağdaki sütun zaten onu söylüyor ve tekrar, satırı taşırıp
     takım adını kırpan şeydi. */
  const meta = [
    played != null ? `${played} maç` : null,
    goalDiff != null ? `AV ${formatDiff(goalDiff)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Touchable
      style={[styles.listRow, highlighted ? styles.highlighted : null, style]}
      onPress={handlePress}
      feedback="row"
      haptic="selection"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={[styles.rail, zone ? { backgroundColor: zone } : null]} />

      {/* Sıra kutusu: bölge rengi ÇERÇEVEDE, rakam nötr. Rakamı da
          renklendirmek zeminle birlikte iki sinyal üretir ve listeyi
          alacalı gösterir. */}
      {rank != null ? (
        <View style={[styles.rankBox, zone ? { borderColor: zone } : null]}>
          <Text style={styles.rankText} {...textScale.dense}>
            {rank}
          </Text>
        </View>
      ) : null}

      <TeamLogo name={name} logo={logo ?? null} size={layout.crestLg} />

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1} {...textScale.dense}>
            {name}
          </Text>
          {favorite ? <Ionicons name="star" size={11} color={colors.star} /> : null}
        </View>
        {form || meta ? (
          <View style={styles.metaRow}>
            {form ? <FormChips form={form} size="xs" /> : null}
            {meta ? (
              <Text style={styles.meta} numberOfLines={1} {...textScale.dense}>
                {meta}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {points != null ? (
        <View style={styles.pointsBox}>
          <Text style={styles.pointsValue} {...textScale.dense}>
            {points}
          </Text>
        </View>
      ) : null}
    </Touchable>
  );
}

export const TeamRow = React.memo(TeamRowBase);

/**
 * Sütun başlığı. Genişlikler satırla AYNI sabitlerden gelir; ikisi tek
 * dosyada olduğu için başlık altındaki rakamların üstüne oturması garanti.
 */
export const TeamRowHead = React.memo(function TeamRowHead({
  density = "list",
  pointsLabel = "Puan",
}: {
  density?: TeamRowDensity;
  /**
   * Puan sütununun başlığı. Güç Dengesi puanlaması kullanan liglerde sütun
   * "GP"dir; başlık sabit yazılsaydı o liglerde yanlış birim gösterilirdi.
   */
  pointsLabel?: string;
}) {
  if (density === "table") {
    return (
      <View style={styles.tableHead}>
        <View style={styles.rail} />
        <Text style={[styles.tableRank, styles.headLabel]} {...textScale.badge}>#</Text>
        <View style={{ width: layout.crestSm }} />
        <Text style={[styles.tableName, styles.headLabel]} {...textScale.badge}>
          {upperTR("Takım")}
        </Text>
        <Text style={[styles.tableNum, styles.headLabel]} {...textScale.badge}>O</Text>
        <Text style={[styles.tableNum, styles.headLabel]} {...textScale.badge}>G</Text>
        <Text style={[styles.tableNum, styles.headLabel]} {...textScale.badge}>B</Text>
        <Text style={[styles.tableNum, styles.headLabel]} {...textScale.badge}>M</Text>
        <Text style={[styles.tableNum, styles.tableDiff, styles.headLabel]} {...textScale.badge}>
          AV
        </Text>
        <Text style={[styles.tableNum, styles.tablePointsHead, styles.headLabel]} {...textScale.badge}>
          {upperTR(pointsLabel).slice(0, 2)}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.listHead}>
      <Text style={styles.headLabel} {...textScale.badge}>
        {upperTR("Takım")}
      </Text>
      <Text style={[styles.headLabel, styles.listHeadPoints]} {...textScale.badge}>
        {upperTR(pointsLabel)}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  /* — Ortak — */
  /** Bölge rayı: satırın sol kenarında, dikeyde satırdan bir tık kısa. */
  rail: {
    position: "absolute",
    left: 0,
    top: space.s,
    bottom: space.s,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: "transparent",
  },
  headLabel: {
    ...type.overline,
    color: colors.textTertiary,
  },
  highlighted: {
    backgroundColor: colors.brandDim,
  },

  /* — Liste yoğunluğu — */
  listRow: {
    height: TEAM_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    paddingHorizontal: space.md,
  },
  rankBox: {
    width: COL_RANK,
    height: COL_RANK,
    borderRadius: radius.xs,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  rankText: {
    ...type.tableNum,
    color: colors.textSecondary,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: space.xs,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  name: {
    ...type.h3,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
  },
  meta: {
    ...type.caption,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  pointsBox: {
    minWidth: POINTS_BOX,
    alignItems: "flex-end",
  },
  pointsValue: {
    ...type.metricSm,
    color: colors.textPrimary,
  },
  listHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingBottom: space.s,
  },
  listHeadPoints: {
    marginLeft: "auto",
    minWidth: POINTS_BOX,
    textAlign: "right",
  },

  /* — Tablo yoğunluğu — */
  tableRow: {
    height: TEAM_ROW_HEIGHT_TABLE,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingLeft: space.sm,
    paddingRight: space.md,
  },
  tableHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingLeft: space.sm,
    paddingRight: space.md,
    paddingVertical: space.s,
    backgroundColor: colors.surface1,
    borderBottomWidth: hairline,
    borderBottomColor: colors.separator,
  },
  tableRank: {
    width: COL_RANK,
    textAlign: "center",
    ...type.tableNum,
    color: colors.textTertiary,
  },
  tableName: {
    flex: 1,
    ...type.body,
    color: colors.textPrimary,
  },
  nameFavorite: {
    ...type.label,
    color: colors.textPrimary,
  },
  tableNum: {
    width: COL_NUM,
    textAlign: "center",
    ...type.tableNum,
    color: colors.textSecondary,
  },
  tableDiff: {
    width: COL_DIFF,
  },
  diffPositive: {
    color: colors.win,
  },
  diffNegative: {
    color: colors.loss,
  },
  tablePoints: {
    width: COL_POINTS,
    ...type.tableNumStrong,
    color: colors.textPrimary,
  },
  tablePointsHead: {
    width: COL_POINTS,
  },
});
