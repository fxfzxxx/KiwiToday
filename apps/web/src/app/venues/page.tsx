import { redirect } from "next/navigation";

export const metadata = { title: "奥克兰场馆活动 · KiwiToday", description: "从20个奥克兰场馆的官方来源发现近期活动与年度预告。" };
export default function VenuePage() {
  redirect("/");
}
