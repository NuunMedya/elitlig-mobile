/**
 * TEKLİF VER — her yerden aynı, belirgin birincil düğme.
 *
 * NEDEN: mobilde transfer teklifi yalnız oyuncu profilinin başlığındaki küçük
 * bir ikondan açılıyordu ve o ikon da tazelenmeyen oturum alanına bağlıydı
 * (bkz. useTeamAccess). Kullanıcı "oyuncuya teklif gönderemiyorum" dedi. Bu
 * bileşen oyuncu profili, futbolcu veritabanı ve borsada aynı kararı verir:
 *   · takım yönetmiyorsa → hiçbir şey çizmez (oyuncu rolündeki üye de ekranı
 *     kullanabilsin diye sessizdir);
 *   · kendi oyuncusuysa → çizmez (sunucu 422 TRANSFER_OFFER_OWN_PLAYER);
 *   · açık teklif varsa → "Aktif teklif" (belgeyi açar; ikinci teklif 409);
 *   · aksi hâlde → "Teklif ver" (/takimim/teklif-ver) ve oyuncu serbestse
 *     "Davet et" (sözleşmesiz kadro daveti, web PlayerDatabase.invite).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { Button, useToast } from "@/components/ui";
import { getOpenOfferIndex } from "@/lib/api/club/offers";
import { createInvite } from "@/lib/api/team";
import { ApiError } from "@/lib/http";
import { space } from "@/theme";
import { useTeamAccess } from "./useTeamAccess";

/** web PlayerDatabase.invite — sunucu kodlarının Türkçe karşılığı. */
const INVITE_ERRORS: Record<string, string> = {
  PLAYER_ALREADY_IN_TEAM: "Oyuncunun bir takımı var; transfer teklifi gönder.",
  PLAYER_HAS_NO_ACCOUNT: "Oyuncunun bağlı bir üye hesabı yok; transfer teklifi lig yönetimi onayıyla ilerler.",
  REQUEST_ALREADY_PENDING: "Bu oyuncuya bekleyen bir davetin zaten var.",
};

/** Açık teklif dizini — profil ve arama ekranı aynı önbelleği paylaşır. */
export function useOpenOffers(enabled: boolean) {
  return useQuery({
    queryKey: ["club", "open-offers"],
    queryFn: getOpenOfferIndex,
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}

export function offerHref(playerId: number, playerName: string, type?: "sale" | "loan") {
  return `/takimim/teklif-ver?playerId=${playerId}&playerName=${encodeURIComponent(playerName)}${type ? `&tur=${type}` : ""}`;
}

export interface OfferCtaProps {
  playerId: number;
  playerName: string;
  /** Oyuncunun şu anki takımı (null = serbest). */
  playerTeamId: number | null;
  /** Çağıran biliyorsa (veritabanı satırı) açık teklif; bilinmiyorsa sorgulanır. */
  activeOfferId?: string | null;
  /** Davet düğmesini göster (serbest oyuncu). Varsayılan: takımı yoksa. */
  allowInvite?: boolean;
  /** "bar": iki eşit düğme (profil); "compact": tek küçük düğme (liste satırı). */
  layout?: "bar" | "compact";
  onDark?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const OfferCta = React.memo(function OfferCta({
  playerId,
  playerName,
  playerTeamId,
  activeOfferId,
  allowInvite,
  layout = "bar",
  onDark,
  style,
}: OfferCtaProps) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const access = useTeamAccess();
  const [invited, setInvited] = useState(false);

  const own = access.teamId != null && Number(playerTeamId) === access.teamId;
  const known = activeOfferId !== undefined;
  const openOffers = useOpenOffers(access.canManage && !own && !known);
  const activeId = known ? activeOfferId : (openOffers.data?.[playerId] ?? null);

  const invite = useMutation({
    mutationFn: () => createInvite(playerId),
    onSuccess: () => {
      setInvited(true);
      toast.show({ message: `${playerName} için kadro daveti gönderildi.`, tone: "success" });
      void queryClient.invalidateQueries({ queryKey: ["takim", "join-requests"] });
    },
    onError: (error) => {
      const message =
        error instanceof ApiError ? (INVITE_ERRORS[error.code ?? ""] ?? error.userMessage) : "Davet gönderilemedi.";
      toast.show({ message, tone: "danger" });
    },
  });

  const confirmInvite = useCallback(() => {
    Alert.alert(
      "Kadro daveti",
      `${playerName} takımına davet edilecek. Kabul ederse kadrona sözleşmesiz eklenir. Şartlı geçiş için transfer teklifi kullan.`,
      [
        { text: "Vazgeç", style: "cancel" },
        { text: "Daveti gönder", onPress: () => invite.mutate() },
      ],
    );
  }, [invite, playerName]);

  if (!access.canManage || own) return null;

  const openOffer = () => (activeId ? router.push(`/teklif/${activeId}`) : router.push(offerHref(playerId, playerName) as Href));
  const showInvite = (allowInvite ?? playerTeamId == null) && !activeId;

  if (layout === "compact") {
    return (
      <Button
        label={activeId ? "Aktif teklif" : "Teklif ver"}
        icon={activeId ? "document-text-outline" : "swap-horizontal"}
        size="sm"
        variant={activeId ? "secondary" : "primary"}
        onPress={openOffer}
        onDark={onDark}
        style={style}
        accessibilityLabel={activeId ? `${playerName} için aktif teklifi aç` : `${playerName} için transfer teklifi ver`}
      />
    );
  }

  return (
    <View style={[styles.bar, style]}>
      <Button
        label={activeId ? "Aktif teklifi gör" : "Transfer teklifi ver"}
        icon={activeId ? "document-text-outline" : "swap-horizontal"}
        variant={activeId ? "secondary" : "primary"}
        onPress={openOffer}
        onDark={onDark}
        style={styles.flex}
        haptic="medium"
      />
      {showInvite ? (
        <Button
          label={invited ? "Davet gitti" : "Davet et"}
          icon={invited ? "checkmark" : "person-add-outline"}
          variant="secondary"
          onPress={confirmInvite}
          loading={invite.isPending}
          disabled={invited}
          onDark={onDark}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  bar: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  flex: { flex: 1 },
});
