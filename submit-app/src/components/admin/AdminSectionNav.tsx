"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buildAdminSectionHref, type AdminSection } from "@/lib/adminRoutes";

type Item = {
  key: AdminSection;
  label: string;
  href: string;
};

function buildItems(pathname: string): Item[] {
  const submissionsHref = buildAdminSectionHref(pathname, "submissions");
  const bookingToolsHref = buildAdminSectionHref(pathname, "booking-tools");
  const collaboratorsHref = buildAdminSectionHref(pathname, "collaborators");
  if (!submissionsHref || !bookingToolsHref || !collaboratorsHref) return [];

  return [
    { key: "submissions", label: "Submissions", href: submissionsHref },
    { key: "booking-tools", label: "Booking Tools", href: bookingToolsHref },
    { key: "collaborators", label: "Collaborators", href: collaboratorsHref },
  ];
}

function isActive(pathname: string, item: Item): boolean {
  if (item.key === "submissions") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AdminSectionNav() {
  const pathname = usePathname() || "";
  const items = buildItems(pathname);
  if (!items.length) {
    return (
      <nav className="border-b border-slate-200 bg-white/85">
        <div className="mx-auto flex w-full max-w-[1400px] items-center px-6 py-2 text-xs text-slate-500">
          Admin navigation unavailable on this route.
        </div>
      </nav>
    );
  }

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
