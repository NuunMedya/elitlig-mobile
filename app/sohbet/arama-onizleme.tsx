import { useLocalSearchParams } from "expo-router";
import { CallView } from "@/components/CallScreen";

/** GEÇİCİ önizleme rotası (silinecek). */
export default function CallPreview() {
  const { d } = useLocalSearchParams<{ d?: string }>();
  const status = (d as "incoming" | "active") ?? "incoming";
  return (
    <CallView status={status} name="Okan Şahin" subtitle="Kaptan · Başkent Gençlik" avatar={null} statusText={status === "active" ? "02:47" : "Gelen sesli arama"} muted={status === "active"} speaker={false} onToggleMute={() => {}} onToggleSpeaker={() => {}} onAccept={() => {}} onReject={() => {}} onEnd={() => {}} />
  );
}
