import { redirect } from "next/navigation";
import { Halftone } from "@/components/layout/Halftone";
import { LoginForm } from "@/components/auth/LoginForm";
import { getSession } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getSession();
  if (user) redirect("/dashboard");

  return (
    <main className="page">
      <Halftone />
      <p className="wordmark">UCDI</p>
      <hr />
      <h1>Sign in</h1>
      <div className="mt-6 max-w-sm">
        <LoginForm />
      </div>
    </main>
  );
}
