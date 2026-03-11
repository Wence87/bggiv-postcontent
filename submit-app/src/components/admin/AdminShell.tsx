"use client";

import { type ReactNode } from "react";

import { BrandHeader } from "@/components/BrandHeader";
import { AdminSectionNav } from "@/components/admin/AdminSectionNav";

type AdminShellProps = {
  title: string;
  subtitle: string;
  themeClassName?: string;
  headerBorderClassName?: string;
  headerRight?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
};

export function AdminShell({
  title,
  subtitle,
  themeClassName = "bg-slate-100",
  headerBorderClassName = "border-slate-200",
  headerRight,
  children,
  contentClassName = "space-y-3",
}: AdminShellProps) {
  return (
    <main className={`min-h-screen ${themeClassName}`}>
      <header className={`border-b bg-white ${headerBorderClassName}`}>
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-6 py-4">
          <BrandHeader title={title} subtitle={subtitle} />
          <div className="flex items-center gap-2">{headerRight}</div>
        </div>
      </header>
      <AdminSectionNav />
      <div className={`mx-auto w-full max-w-[1400px] px-6 py-4 ${contentClassName}`}>{children}</div>
    </main>
  );
}

