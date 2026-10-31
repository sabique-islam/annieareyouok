import { redirect } from "next/navigation";
import { Shell } from "@/components/layout/Shell";
import { getSession } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export default async function BureauLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login");
  return <Shell user={user}>{children}</Shell>;
}
