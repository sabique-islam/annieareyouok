import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getSession();
  redirect(user ? "/dashboard" : "/login");
}
