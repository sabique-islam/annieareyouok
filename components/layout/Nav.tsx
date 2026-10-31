"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/fleet", label: "Fleet" },
  { href: "/inspections/new", label: "Inspect", roles: ["admin", "inspector"] },
  { href: "/search", label: "Search" },
  { href: "/analytics", label: "Analytics" },
  { href: "/market", label: "Market" },
  { href: "/queries", label: "Queries" },
  { href: "/admin/users", label: "Users", roles: ["admin"] },
];

export function Nav({ role }: { role: string }) {
  const pathname = usePathname();
  const links = LINKS.filter((link) => !link.roles || link.roles.includes(role));
  return (
    <nav className="nav">
      {links.map((link) => {
        const active = pathname === link.href || (link.href !== "/dashboard" && pathname.startsWith(`${link.href}/`));
        return (
          <Link key={link.href} href={link.href} className={active ? "active" : undefined}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
