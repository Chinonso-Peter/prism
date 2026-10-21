"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/explorer", label: "Home" },
  { href: "/xdr",      label: "XDR" },
  { href: "/docs",     label: "API" },
] as const;

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <div className="flex gap-5 text-sm text-prism-muted">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={active ? "text-white font-medium" : "hover:text-white transition"}
          >
            {label}
          </Link>
        );
      })}
      <a
        href="https://github.com/prism-explorer/prism"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-white transition"
      >
        GitHub
      </a>
    </div>
  );
}
