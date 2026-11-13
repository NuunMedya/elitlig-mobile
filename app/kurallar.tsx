/**
 * LİG KURALLARI — resmî metnin uygulama içi hâli (constants/rulesContent.ts).
 *
 * NE DEĞİŞTİ: eski ekran 11 bölümü tek tek karta sarıp `ScrollView` içine
 * diziyordu; kaydırırken hangi bölümde olduğun kayboluyor, aranan madde ancak
 * göz gezdirerek bulunuyordu. Yeni ekran metni bir BELGE gibi ele alır:
 *
 *   1. YAPIŞKAN BÖLÜM BAŞLIĞI — `SectionList` + `stickySectionHeadersEnabled`.
 *      Uzun bir bölümün ortasındayken bile hangi başlığın altında olduğun
 *      ekranın tepesinde durur.
 *   2. ARAMA — başlıkta ve madde metninde geçen kelimeyi süzer. Türkçe I/İ
 *      katlaması yapılır ("İHRAÇ" ile "ihrac" aynı sonucu verir). Arama açıkken
 *      eşleşen bölümler otomatik AÇILIR; akordeon durumu aramayı engellemez.
 *   3. MADDE NUMARASI ayrı bir sütundur (tabular rakam, sabit 38px): "3.10."
 *      ile "3.1." alt alta hizalanır, metin bloğu tek bir sol kenarda başlar.
 *      Sitedeki numara atlamaları (2.4, 3.9 yok) korunur — metin resmîdir.
 *   4. `textScale.long`: kurallar okunacak metindir, kullanıcının yazı tipi
 *      tercihi ×2'ye kadar serbesttir (tabloya sığma kaygısı yok).
 *
 * AKORDEON: bölümler `data: []` verilerek kapatılır — kapalı bölüm hiç satır
 * kurmaz, `SectionList` yalnız başlığı çizer. Bu, 11 bölüm × ~10 madde metnini
 * baştan mount etmekten ucuzdur ve açılış anında görünür.
 */

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  SectionList,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Chip,
  EmptyState,
  IconTile,
  Input,
  ListRow,
  Reveal,
  ScreenHeader,
  Touchable,
  useHeaderScroll,
} from "@/components/ui";
import { StageCard, StageStat } from "@/components/league/kit";
import { RULES_SECTIONS, RULES_UPDATED_AT } from "@/constants/rulesContent";
import { useRouter } from "expo-router";
import { useScope } from "@/providers/ScopeProvider";
import { animateNextLayout, colors, elevate, hairline, layout, radius, space, textScale, type, upperTR } from "@/theme";

/* ============================ SABİTLER / TİPLER ============================ */

/** Ekrana çizilen tek madde: numara sütunu + metin (ya da madde işareti). */
interface RuleEntry {
  key: string;
  /** "3.1." gibi numara; madde işaretli satırlarda null. */
  number: string | null;
  bullet: boolean;
  text: string;
}

interface RuleSectionData {
  title: string;
  /** Başlığın numarası ("3") ve numarasız adı — bölüm rozeti ile başlık ayrı çizilir. */
  number: string;
  name: string;
  /** Bölümün RULES_SECTIONS içindeki sırası — akordeon anahtarı. */
  index: number;
  /** Bölümdeki toplam madde (arama süzse bile başlıkta gerçek sayı görünür). */
  total: number;
  data: RuleEntry[];
}

/* ============================== SAF YARDIMCILAR =========================== */

/** "3. Takım Kadroları…" → { number: "3", name: "Takım Kadroları…" }. */
function splitTitle(title: string): { number: string; name: string } {
  const match = title.match(/^(\d+)\.\s*(.*)$/);
  return match ? { number: match[1], name: match[2] } : { number: "", name: title };
}

/**
 * Türkçe arama katlaması. `toLocaleLowerCase("tr-TR")` "I" harfini noktasız
 * "ı" yapar; kullanıcı klavyeden "i" yazdığında eşleşme kaçmasın diye I ailesi
 * tek harfe indirilir. Aynı katlama hem metne hem sorguya uygulanır.
 */
function fold(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    // "İ" küçülünce "i + birleşik nokta" (U+0307) olur; nokta ATILIR, harfe
    // dönüştürülmez — yoksa tek harf iki harfe çıkar ve eşleşme kaçar.
    .replace(/\u0307/g, "")
    .replace(/[ıî]/g, "i");
}

/**
 * Ham madde metnini numara ve gövdeye ayırır.
 *   "3.1. Maçlar …"          → { number: "3.1.", text: "Maçlar …" }
 *   "• 1. Transfer dönemi …" → { bullet: true, text: "1. Transfer dönemi …" }
 * Numara yakalanamazsa metin olduğu gibi kalır (biçim bozulmaz).
 */
function parseRule(raw: string, sectionIndex: number, itemIndex: number): RuleEntry {
  const key = `${sectionIndex}-${itemIndex}`;
  const value = raw.trim();

  if (value.startsWith("•")) {
    return { key, number: null, bullet: true, text: value.replace(/^•\s*/, "") };
  }

  const match = value.match(/^((?:\d+\.)+)\s+([\s\S]*)$/);
  if (match) {
    return { key, number: match[1], bullet: false, text: match[2] };
  }
  return { key, number: null, bullet: false, text: value };
}

/* ================================= EKRAN ================================== */

export default function RulesScreen() {
  const scope = useScope();
  const router = useRouter();
  const { scrollY, scrollProps } = useHeaderScroll();

  const [search, setSearch] = useState("");
  /** Açık bölümlerin sıraları — ilk bölüm açık gelir. */
  const [open, setOpen] = useState<number[]>([0]);

  const searching = search.trim().length > 1;

  /** Bölümler tek seferde ayrıştırılır; arama yalnız süzer. */
  const parsed = useMemo(
    () =>
      RULES_SECTIONS.map((section, index) => ({
        title: section.title,
        ...splitTitle(section.title),
        index,
        entries: section.items.map((item, itemIndex) => parseRule(item, index, itemIndex)),
      })),
    [],
  );

  const sections = useMemo<RuleSectionData[]>(() => {
    const needle = fold(search.trim());

    return parsed
      .map((section) => {
        const total = section.entries.length;

        if (!searching) {
          return {
            title: section.title,
            number: section.number,
            name: section.name,
            index: section.index,
            total,
            // Kapalı bölüm hiç satır kurmaz.
            data: open.includes(section.index) ? section.entries : [],
          };
        }

        // Başlık eşleşiyorsa bölümün tamamı, yoksa yalnız eşleşen maddeler.
        const titleHit = fold(section.title).includes(needle);
        const hits = titleHit
          ? section.entries
          : section.entries.filter((entry) => fold(`${entry.number ?? ""} ${entry.text}`).includes(needle));

        return { title: section.title, number: section.number, name: section.name, index: section.index, total, data: hits };
      })
      .filter((section) => !searching || section.data.length > 0);
  }, [open, parsed, search, searching]);

  const matchCount = useMemo(
    () => (searching ? sections.reduce((sum, section) => sum + section.data.length, 0) : 0),
    [sections, searching],
  );

  const allOpen = open.length === RULES_SECTIONS.length;

  const toggleSection = (index: number) => {
    animateNextLayout();
    setOpen((current) =>
      current.includes(index) ? current.filter((item) => item !== index) : [...current, index],
    );
  };

  const toggleAll = () => {
    animateNextLayout();
    setOpen(allOpen ? [] : RULES_SECTIONS.map((_, index) => index));
  };

  const listRef = useRef<SectionList<RuleEntry, RuleSectionData>>(null);
  const totalItems = useMemo(() => parsed.reduce((sum, section) => sum + section.entries.length, 0), [parsed]);

  /**
   * BÖLÜME KAYDIRMA: `scrollToLocation` web'de sessizce hiçbir şey yapmıyordu
   * (ölçülmemiş hücre). Bunun yerine bölüm başlığının ekrandaki konumu
   * (`measureInWindow`) listenin konumundan çıkarılır, o anki kaydırma
   * payına eklenir ve liste oraya kaydırılır — iki platformda aynı yol.
   */
  const headerRefs = useRef(new Map<number, View>());
  const listBoxRef = useRef<View>(null);
  const scrollYRef = useRef(0);
  const scrollToSection = useCallback((index: number) => {
    const header = headerRefs.current.get(index);
    const box = listBoxRef.current;
    if (!header || !box) return;
    box.measureInWindow((_bx, boxY) => {
      header.measureInWindow((_hx, headerY) => {
        const y = Math.max(0, scrollYRef.current + headerY - boxY);
        listRef.current?.getScrollResponder()?.scrollTo({ y, animated: true });
      });
    });
  }, []);
  const { onScroll: headerOnScroll } = scrollProps;
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollYRef.current = event.nativeEvent.contentOffset.y;
      headerOnScroll(event);
    },
    [headerOnScroll],
  );

  /** İçindekiler: bölümü açar ve listede başına kaydırır. */
  const jumpTo = useCallback(
    (index: number) => {
      animateNextLayout();
      setSearch("");
      setOpen((current) => (current.includes(index) ? current : [...current, index]));
      // Açılan bölümün satırları bir sonraki karede kurulur; kaydırma ondan sonra.
      setTimeout(() => scrollToSection(index), 160);
    },
    [scrollToSection],
  );

  /**
   * Başlık bloğu ELEMENT olarak verilir (bileşen olarak DEĞİL): her tuş
   * vuruşunda yeni bir bileşen türü üretilseydi arama kutusu odağı kaybederdi.
   */
  const listHeader = (
    <View style={styles.headerBlock}>
      {/* KİTAPÇIK KAPAĞI — resmî metnin kimliği ve hacmi. */}
      <Reveal>
        <StageCard style={styles.cover}>
          <View style={styles.coverTop}>
            <IconTile icon="book" tone="signature" size={40} />
            <View style={styles.coverText}>
              <Text style={styles.coverOver} {...textScale.badge}>
                {upperTR("Resmî kural kitapçığı")}
              </Text>
              <Text style={styles.coverTitle} numberOfLines={1} {...textScale.dense}>
                {scope.leagueLabel || "Elitlig"} kuralları
              </Text>
            </View>
          </View>
          <View style={styles.coverStats}>
            <StageStat label="Bölüm" value={parsed.length} />
            <View style={styles.coverDivider} />
            <StageStat label="Madde" value={totalItems} accent />
            <View style={styles.coverDivider} />
            <View style={styles.coverDate}>
              <View style={styles.coverDateRow}>
                <Ionicons name="checkmark-circle" size={14} color={colors.win} />
                <Text style={styles.coverDateValue} {...textScale.dense}>
                  Güncel
                </Text>
              </View>
              <Text style={styles.coverDateLabel} numberOfLines={1} {...textScale.badge}>
                {RULES_UPDATED_AT}
              </Text>
            </View>
          </View>
        </StageCard>
      </Reveal>

      <Input
        variant="search"
        value={search}
        onChangeText={setSearch}
        placeholder="Kurallarda ara (madde, kelime)"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Kurallarda ara"
      />

      {searching ? (
        <View style={styles.matchBar}>
          <Ionicons name={matchCount > 0 ? "search" : "alert-circle-outline"} size={14} color={colors.brandAccent} />
          <Text style={styles.matchLine} {...textScale.dense}>
            {matchCount > 0
              ? `${matchCount} madde eşleşti · eşleşen bölümler açık`
              : "Eşleşen madde yok."}
          </Text>
        </View>
      ) : (
        <>
          {/* İÇİNDEKİLER — numaralı satırlar; dokununca bölüm açılır ve kayar. */}
          <View style={styles.tocHead}>
            <Text style={styles.tocTitle} {...textScale.badge}>
              {upperTR("İçindekiler")}
            </Text>
            <Chip
              label={allOpen ? "Tümünü kapat" : "Tümünü aç"}
              icon={allOpen ? "chevron-up" : "chevron-down"}
              size="sm"
              onPress={toggleAll}
            />
          </View>
          <View style={styles.toc}>
            {parsed.map((section, index) => (
              <Touchable
                key={section.index}
                feedback="row"
                haptic="selection"
                onPress={() => jumpTo(section.index)}
                accessibilityRole="button"
                accessibilityLabel={`${section.title}, ${section.entries.length} madde`}
                style={[styles.tocRow, index > 0 ? styles.tocDivider : null]}
              >
                <Text style={styles.tocNumber} {...textScale.dense}>
                  {section.number.padStart(2, "0")}
                </Text>
                <Text style={styles.tocName} numberOfLines={1} {...textScale.dense}>
                  {section.name}
                </Text>
                <Text style={styles.tocCount} {...textScale.dense}>
                  {section.entries.length}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={colors.textDisabled} />
              </Touchable>
            ))}
          </View>
        </>
      )}
    </View>
  );

  const listFooter = (
    <View style={styles.footer}>
      <Text style={styles.footerNote} {...textScale.long}>
        Bu metin elitlig.com/kurallar sayfasındaki resmî kural kitapçığının
        birebir kopyasıdır. Madde numaralarındaki atlamalar resmî metinde de
        vardır.
      </Text>
      <ListRow
        leading={{ icon: "chatbubble-ellipses-outline", tone: "brand" }}
        title="Kurallarla ilgili sorunuz mu var?"
        subtitle="İletişim kanallarından bize ulaşın"
        position="single"
        onPress={() => router.push("/iletisim")}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader
        title="Lig Kuralları"
        subtitle={`${scope.cityLabel} · ${scope.leagueLabel}`}
        back
        scrollY={scrollY}
      />

      <View ref={listBoxRef} style={styles.listBox} collapsable={false}>
      <SectionList
        {...scrollProps}
        onScroll={handleScroll}
        ref={listRef}
        sections={sections}
        keyExtractor={(item) => item.key}
        stickySectionHeadersEnabled
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={14}
        windowSize={10}
        contentContainerStyle={styles.content}
        ListHeaderComponent={listHeader}
        ListFooterComponent={sections.length ? listFooter : null}
        ListEmptyComponent={
          <EmptyState
            icon="search-outline"
            title="Sonuç yok"
            body="Aradığınız kelime kural metninde geçmiyor. Daha kısa bir kelime deneyin."
            variant="inline"
          />
        }
        renderSectionHeader={({ section }) => {
          /* Bölüm başlığı yapışkan bir KART BAŞLIĞIDIR: degrade numara
             pulu + resmî başlık + madde sayısı. Açık bölümde maddeler aynı
             kartın gövdesi gibi altına bağlanır (üst köşeler burada, alt
             köşeler son maddede yuvarlanır). Arama açıkken katlanmaz. */
          const isOpen = searching || open.includes(section.index);
          return (
            <View
              style={styles.sectionWrap}
              collapsable={false}
              ref={(node) => {
                if (node) headerRefs.current.set(section.index, node);
                else headerRefs.current.delete(section.index);
              }}
            >
              <Touchable
                feedback="row"
                haptic="selection"
                disabled={searching}
                onPress={() => toggleSection(section.index)}
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                accessibilityLabel={`${section.title}, ${section.total} madde`}
                style={[styles.sectionHead, isOpen && section.data.length ? styles.sectionHeadOpen : null]}
              >
                <View style={[styles.sectionNumber, isOpen ? styles.sectionNumberOn : null]}>
                  <Text style={[styles.sectionNumberText, isOpen ? styles.sectionNumberTextOn : null]} {...textScale.dense}>
                    {section.number || "•"}
                  </Text>
                </View>
                <Text style={styles.sectionTitle} numberOfLines={2} {...textScale.dense}>
                  {section.name}
                </Text>
                <Text style={styles.sectionCount} {...textScale.dense}>
                  {searching ? `${section.data.length}/${section.total}` : section.total}
                </Text>
                {searching ? null : (
                  <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.textTertiary} />
                )}
              </Touchable>
            </View>
          );
        }}
        renderItem={({ item, index, section }) => (
          <RuleRow entry={item} last={index === section.data.length - 1} needle={searching ? search.trim() : ""} />
        )}
        SectionSeparatorComponent={null}
      />
      </View>
    </SafeAreaView>
  );
}

/* ============================== ALT BİLEŞENLER ============================ */

/**
 * Tek madde: solda numara/işaret sütunu, sağda gövde metni. Maddeler bölüm
 * kartının gövdesidir (aynı zemin, yan çerçeve); son madde kartı kapatır.
 * Arama açıkken eşleşen parça marka renginde vurgulanır.
 */
function RuleRow({ entry, last, needle }: { entry: RuleEntry; last: boolean; needle: string }) {
  return (
    <View style={styles.itemWrap}>
      <View style={[styles.item, last ? styles.itemLast : null]}>
        <View style={styles.numberColumn}>
          {entry.bullet ? (
            <View style={styles.bulletDot} />
          ) : entry.number ? (
            <Text style={styles.number} {...textScale.dense}>
              {entry.number}
            </Text>
          ) : null}
        </View>
        <Text style={styles.itemText} {...textScale.long}>
          {highlight(entry.text, needle)}
        </Text>
      </View>
    </View>
  );
}

/** Metni aramaya göre parçalar; eşleşen parçalar vurgu `Text`'i olur. */
function highlight(text: string, needle: string): React.ReactNode {
  if (!needle) return text;
  const folded = fold(text);
  const target = fold(needle);
  if (!target || folded.length !== text.length) return text;
  const parts: React.ReactNode[] = [];
  let from = 0;
  let at = folded.indexOf(target, from);
  while (at >= 0) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <Text key={at} style={styles.hit}>
        {text.slice(at, at + target.length)}
      </Text>,
    );
    from = at + target.length;
    at = folded.indexOf(target, from);
  }
  if (from < text.length) parts.push(text.slice(from));
  return parts;
}

/* ================================ STİLLER ================================= */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  listBox: {
    flex: 1,
  },
  /**
   * Yatay boşluk YOK: yapışkan başlık ve madde satırları kendi
   * `screenPadding`'ini taşır (yapışkan başlığın zemini kenardan kenara).
   */
  content: {
    paddingBottom: space.giant,
    flexGrow: 1,
  },
  headerBlock: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.md,
    gap: space.md,
  },

  /* — Kapak — */
  cover: {
    padding: space.lg,
    gap: space.md,
  },
  coverTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  coverText: {
    flex: 1,
    minWidth: 0,
    gap: space.xxs,
  },
  coverOver: {
    ...type.overline,
    color: colors.brandOnDark,
  },
  coverTitle: {
    ...type.h1,
    color: colors.onDark,
  },
  coverStats: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.inkTile,
    borderWidth: hairline,
    borderColor: colors.inkTileBorder,
  },
  coverDivider: {
    width: hairline,
    alignSelf: "stretch",
    backgroundColor: colors.borderOnDark,
  },
  coverDate: {
    flex: 1,
    alignItems: "center",
    gap: space.xxs,
  },
  coverDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  coverDateValue: {
    ...type.h4,
    color: colors.onDark,
  },
  coverDateLabel: {
    ...type.micro,
    color: colors.onDarkMuted,
  },

  /* — Arama ve içindekiler — */
  matchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.brandDim,
  },
  matchLine: {
    ...type.labelSm,
    color: colors.brandAccent,
    flex: 1,
  },
  tocHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: space.xs,
  },
  tocTitle: {
    ...type.overline,
    color: colors.textTertiary,
  },
  toc: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
    overflow: "hidden",
    ...elevate(1),
  },
  tocRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 44,
    paddingHorizontal: space.md,
  },
  tocDivider: {
    borderTopWidth: hairline,
    borderTopColor: colors.separator,
  },
  tocNumber: {
    ...type.tableNumStrong,
    color: colors.brandAccent,
    width: 22,
  },
  tocName: {
    ...type.label,
    color: colors.textPrimary,
    flex: 1,
  },
  tocCount: {
    ...type.numSmStrong,
    color: colors.textTertiary,
  },

  /* — Bölüm başlığı (yapışkan) — */
  sectionWrap: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    backgroundColor: colors.bg,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.surface1,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  sectionHeadOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomColor: colors.separator,
  },
  sectionNumber: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface3,
  },
  sectionNumberOn: {
    backgroundColor: colors.brand,
  },
  sectionNumberText: {
    ...type.tableNumStrong,
    color: colors.textSecondary,
  },
  sectionNumberTextOn: {
    color: colors.textOnBrand,
  },
  sectionTitle: {
    ...type.h3,
    color: colors.textPrimary,
    flex: 1,
  },
  sectionCount: {
    ...type.numSmStrong,
    color: colors.textTertiary,
  },

  /* — Madde — */
  itemWrap: {
    paddingHorizontal: layout.screenPadding,
  },
  item: {
    flexDirection: "row",
    gap: space.m,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: colors.surface1,
    borderLeftWidth: hairline,
    borderRightWidth: hairline,
    borderColor: colors.border,
  },
  itemLast: {
    paddingBottom: space.md,
    borderBottomWidth: hairline,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  /** Sabit genişlik: "3.10." ile "3.1." aynı sol kenarda hizalanır. */
  numberColumn: {
    width: 38,
    paddingTop: 3,
    alignItems: "flex-start",
  },
  number: {
    ...type.tableNumStrong,
    color: colors.brandAccent,
  },
  bulletDot: {
    width: 5,
    height: 5,
    marginTop: 9,
    marginLeft: space.m,
    borderRadius: radius.pill,
    backgroundColor: colors.textTertiary,
  },
  itemText: {
    ...type.bodyLg,
    color: colors.textPrimary,
    flex: 1,
  },
  hit: {
    color: colors.brandAccent,
    backgroundColor: colors.brandDim,
  },

  /* — Alt bilgi — */
  footer: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.xl,
    gap: space.md,
  },
  footerNote: {
    ...type.bodySm,
    color: colors.textTertiary,
  },
});
