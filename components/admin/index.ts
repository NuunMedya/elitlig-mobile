/**
 * YÖNETİM KİTİ — yerel yönetim ekranlarının ortak parçaları.
 *
 *   import { AdminScreen, AdminList, RecordCard, FormSheet, useAdminMutation } from "@/components/admin";
 *
 * Web yönetim panelinin (elitlig-client) her sayfası mobilde bu parçalarla
 * YEREL ekran olarak kurulur; WebView kullanılmaz.
 */
export { AdminScreen, type AdminScreenProps } from "./AdminScreen";
export { AdminList, type AdminListProps, type FilterOption } from "./AdminList";
export { RecordCard, Panel, InfoLine, StatRow, type RecordCardProps, type BadgeSpec } from "./RecordCard";
export { FormSheet, FormFields, validateFields, type FieldDef, type FieldKind, type FormValues, type FormSheetProps } from "./FormSheet";
export { OptionSheet, type Option, type OptionSheetProps } from "./OptionSheet";
export { DateSheet, type DateSheetProps } from "./DateSheet";
export {
  FieldBox,
  FieldLabel,
  FieldHint,
  SelectField,
  MultiSelectField,
  DateField,
  ToggleField,
  SegmentField,
  ChipsField,
  ColorField,
  TextField,
} from "./fields";
export { ActionSheet, confirmAction, useAdminMutation, type SheetAction } from "./actions";
