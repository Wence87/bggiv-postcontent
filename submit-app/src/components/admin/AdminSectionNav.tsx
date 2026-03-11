"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = {
  key: "submissions" | "booking-tools" | "collaborators";
  label: string;
  href: string;
};

function buildItems(pathname: string): Item[] {
  const match = /^\/admin\/([^/]+)/.exec(pathname);
  if (!match) return [];
  const slug = match[1];
  const base = `/admin/${slug}`;
  return [
    { key: "submissions", label: "Submissions", href: base },
    { key: "booking-tools", label: "Booking Tools", href: `${base}/booking-tools` },
    { key: "collaborators", label: "Collaborators", href: `${base}/collaborators` },
  ];
}

function isActive(pathname: string, item: Item): boolean {
  if (item.key === "submissions") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AdminSectionNav() {
  const pathname = usePathname() || "";
  const items = buildItems(pathname);
  if (!items.length) return null;

  return (
    <nav className="border-b border-slate-200 bg-white/85">
      <div className="mx-auto flex w-full max-w-[1400px] items-center gap-2 px-6 py-2">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={`rounded-md px-3 py-1.5 text-sm ${
              isActive(pathname, item)
                ? "bg-slate-900 text-white"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

