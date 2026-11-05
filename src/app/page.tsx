import { redirect } from "next/navigation";

// There's no standings page; the home page opens Power Rankings.
export default function Home() {
  redirect("/power-rankings");
}
