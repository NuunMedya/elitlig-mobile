/**
 * ANA SAYFA İSKELETİ — Kulübüm ve Kariyerim yüklenirken gerçek düzenin
 * SİLUETİ: kahraman bloğu, iki iş kartı, maç kartı, 3×2 kısayol ızgarası.
 * Genel "üç satırlı kart" iskeleti yükleme bitince düzeni zıplatıyordu;
 * burada bloklar yerlerini tutacakları parçalarla aynı ölçüdedir.
 */

import React from "react";
import { StyleSheet, View } from "react-native";

import { Skeleton, SkeletonCard } from "@/components/ui";
import { layout, space } from "@/theme";

export const HomeSkeleton = React.memo(function HomeSkeleton() {
  return (
    <View style={styles.root} accessibilityLabel="Yükleniyor" accessibilityRole="progressbar">
      <Skeleton height={168} radius="xxl" />
      <View style={styles.row}>
        <Skeleton width={168} height={132} radius="xl" />
        <Skeleton width={168} height={132} radius="xl" />
      </View>
      <SkeletonCard lines={3} />
      <View style={styles.grid}>
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <Skeleton key={index} height={96} radius="xl" style={styles.cell} />
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { paddingHorizontal: layout.screenPadding, paddingTop: space.md, gap: space.lg },
  row: { flexDirection: "row", gap: space.sm, overflow: "hidden" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  cell: { width: "31%", flexGrow: 1 },
});
