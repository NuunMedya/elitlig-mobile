/**
 * UI KİTAPLIĞI TEK GİRİŞİ (barrel).
 *
 * NE İŞE YARAR: ekran dosyalarının 8-10 ayrı satırda tek tek bileşen yolu
 * yazmasını engeller. Tek satır yeter:
 *
 *   import { ScreenHeader, MatchRow, SkeletonMatchRow, useToast } from "@/components/ui";
 *
 * NEDEN AYRI BİR DOSYA: bileşenler kendi dosyalarında durur (her biri kendi
 * StyleSheet'ini taşır, ayrı ayrı memo'lanır); barrel yalnızca yeniden dışa
 * aktarır, hiçbir mantık içermez. Böylece bir bileşeni taşımak/yeniden
 * adlandırmak yalnız bu dosyayı değiştirir, 60 ekranı değil.
 *
 * TASARIM TOKENLARI BURADAN GELMEZ. Renk/boşluk/tipografi için ayrı giriş
 * kullanılır — çünkü `type` (tipografi ölçeği) ile TypeScript'in `type`
 * anahtar sözcüğü ve `Divider` bileşeni ile `dividers` token'ı aynı sepette
 * karışır:
 *
 *   import { colors, space, type, radius } from "@/theme";
 *
 * AD ÇAKIŞMALARI (bilinçli kararlar — ayrıntı için README.md):
 *   - EmptyState / ErrorState: ESKİ `components/States.tsx` içinde de var.
 *     Barrel YENİ olanları (`components/ui/*`) dışa aktarır. Eski dosya
 *     dokunulmadan duruyor; onu içe aktaran ekranlar geçene kadar çalışsın
 *     diye. Bir ekran İKİSİNİ BİRDEN içe aktarmamalı.
 *   - ScreenHeader: ESKİ `components/ScreenHeader.tsx` içinde de var (ayrıca
 *     `DetailHeader`). Barrel YENİ, daralan başlığı (`components/ui`) verir.
 *   - `Loading` (States.tsx) burada YOK: karşılığı belirsiz dönen çember değil,
 *     içeriğin şeklini taklit eden iskelettir → `SkeletonMatchRow` vb.
 *   - Şartnamedeki `Switch`, RN'in yerleşik `Switch`'iyle karışmasın diye
 *     `Toggle` adıyla dışa aktarılır.
 *   - Basılabilir sarmalayıcı `Pressable` DEĞİL `Touchable` adındadır (RN'in
 *     `Pressable`'ı ile aynı dosyada yan yana kullanılıyor).
 */

/* — Temeller: basma, yüzey, düzen — */
export { Touchable, fireHaptic } from "./Pressable";
export type { TouchableProps, PressFeedback, HapticKind } from "./Pressable";

export { Surface } from "./Surface";
export type { SurfaceProps } from "./Surface";

export { Card } from "./Card";
export type { CardProps } from "./Card";

/* — Yoğun düzenin yeni yapı taşları (yenilenen tasarım) — */
export { MetricTile, MetricGrid } from "./MetricTile";
export type { MetricTileProps, MetricGridProps, MetricTone } from "./MetricTile";

export { ActionTile, ActionRow } from "./ActionTile";
export type { ActionTileProps, ActionRowProps } from "./ActionTile";

export { SpotlightCard } from "./SpotlightCard";
export type { SpotlightCardProps, SpotlightTeam } from "./SpotlightCard";

export { Divider } from "./Divider";
export type { DividerProps } from "./Divider";

export { SectionHeader } from "./SectionHeader";
export type { SectionHeaderProps } from "./SectionHeader";

/* — Liste satırları — */
export { ListRow } from "./ListRow";
export type { ListRowProps, LeadingIcon } from "./ListRow";

export { KeyValueRow } from "./KeyValueRow";
export type { KeyValueRowProps } from "./KeyValueRow";

/* — Seçim ve gezinme denetimleri — */
export { Chip, ChipGroup } from "./Chip";
export type { ChipProps, ChipGroupProps } from "./Chip";

export { SegmentedControl } from "./SegmentedControl";
export type { SegmentedControlProps, SegmentedItem } from "./SegmentedControl";

export { Tabs } from "./Tabs";
export type { TabsProps, TabItem } from "./Tabs";

/* — Rozet ve ton sözlüğü (tek kaynak) — */
export { Badge, toneColors, withAlpha } from "./Badge";
export type { BadgeProps, Tone, ToneColors } from "./Badge";

/* — Form öğeleri — */
export { Button } from "./Button";
export type { ButtonProps } from "./Button";

export { Input } from "./Input";
export type { InputProps } from "./Input";

export { Toggle } from "./Toggle";
export type { ToggleProps } from "./Toggle";

export { Stepper } from "./Stepper";
export type { StepperProps } from "./Stepper";

/* — Futbola özgü bileşenler — */
export { LiveBadge, useReduceMotion } from "./LiveBadge";
export type { LiveBadgeProps } from "./LiveBadge";

export { RatingPill } from "./RatingPill";
export type { RatingPillProps } from "./RatingPill";

export { TeamLogo } from "./TeamLogo";
export type { TeamLogoProps } from "./TeamLogo";

export { Avatar } from "./Avatar";
export type { AvatarProps } from "./Avatar";

export {
  MatchRow,
  matchRowHeight,
  MATCH_ROW_HEIGHT,
  MATCH_ROW_HEIGHT_COMPACT,
  MATCH_ROW_META_HEIGHT,
} from "./MatchRow";
export type {
  MatchRowProps,
  MatchRowVariant,
  MatchRowMetaMode,
  MatchRowPosition,
} from "./MatchRow";

export { LeagueGroupHeader } from "./LeagueGroupHeader";
export type { LeagueGroupHeaderProps } from "./LeagueGroupHeader";

export { DateStrip, toIsoDate } from "./DateStrip";
export type { DateStripProps } from "./DateStrip";

export { StatBar } from "./StatBar";
export type { StatBarProps } from "./StatBar";

export { Sparkline } from "./Sparkline";
export type { SparklineProps } from "./Sparkline";

export { EventIcon } from "./EventIcon";
export type { EventIconProps, EventIconKind } from "./EventIcon";

export { PitchView } from "./PitchView";
export type { PitchViewProps, PitchPlayerView } from "./PitchView";

export { HeroCarousel, HERO_AUTOPLAY_MS } from "./HeroCarousel";
export type { HeroCarouselProps, HeroSlide } from "./HeroCarousel";

export { FormChips } from "./FormChips";
export type { FormChipsProps, FormResult } from "./FormChips";

export { ProgressRing } from "./ProgressRing";
export type { ProgressRingProps, ProgressRingTone } from "./ProgressRing";

/* — İmza öğeleri: tebeşir çizgisi sistemi — */
export { MinuteRing } from "./MinuteRing";
export type { MinuteRingProps } from "./MinuteRing";

export { ChalkArc } from "./ChalkArc";
export type { ChalkArcProps } from "./ChalkArc";

/* — Yükleme, boşluk, hata — */
export {
  Skeleton,
  SkeletonMatchRow,
  SkeletonListRow,
  SkeletonTable,
  SkeletonStandings,
  SkeletonCard,
  SkeletonHero,
  SkeletonListFooter,
} from "./Skeleton";
export type { SkeletonProps } from "./Skeleton";

export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";

export { ErrorState, errorMessage } from "./ErrorState";
export type { ErrorStateProps } from "./ErrorState";

export { Refresh, useRefresh, useMinimumVisible, refreshControlProps, refreshTheme } from "./Refresh";
export type { RefreshProps, UseRefreshOptions } from "./Refresh";

/* — Kaplamalar ve kabuk — */
export { ToastProvider, useToast } from "./Toast";
export type { ToastApi, ToastOptions, ToastTone } from "./Toast";

export { BottomSheet } from "./BottomSheet";
export type { BottomSheetProps } from "./BottomSheet";

export { ScreenHeader, useHeaderScroll } from "./ScreenHeader";
export type { ScreenHeaderProps, ScreenHeaderAction } from "./ScreenHeader";

export { FAB, useFabAutoHide } from "./FAB";
export type { FABProps } from "./FAB";

export { TabBarIcon } from "./TabBarIcon";
export type { TabBarIconProps } from "./TabBarIcon";
