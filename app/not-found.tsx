import Link from "next/link";
import { Halftone } from "@/components/layout/Halftone";

export default function NotFound() {
  return (
    <main className="page">
      <Halftone />
      <p className="wordmark">UCDI</p>
      <hr />
      <h1>Not found</h1>
      <p className="mt-4">
        <Link href="/dashboard">Dashboard</Link>
      </p>
    </main>
  );
}
