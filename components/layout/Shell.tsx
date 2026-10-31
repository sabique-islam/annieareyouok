import Link from "next/link";
import { Halftone } from "./Halftone";
import { Nav } from "./Nav";

export function Shell({
  user,
  children,
}: {
  user: { full_name: string; role_name: string };
  children: React.ReactNode;
}) {
  const role = user.role_name.charAt(0).toUpperCase() + user.role_name.slice(1);
  return (
    <div className="page">
      <Halftone />
      <header className="mast">
        <Link href="/dashboard" className="wordmark">UCDI</Link>
        <Nav role={user.role_name} />
        <div className="session">
          {user.full_name}
          <span> · {role}</span>
          <form action="/api/auth/logout" method="post">
            <button type="submit">Sign out</button>
          </form>
        </div>
      </header>
      <hr />
      <main>{children}</main>
    </div>
  );
}
