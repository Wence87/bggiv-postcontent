import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type PublicStatus = "available" | "taken" | "locked";

type StatusTileProps = {
  status: PublicStatus;
  title: ReactNode;
  subtitle?: ReactNode;
  rightBadge?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
};

export function StatusTile({
  status,
  title,
  subtitle,
  rightBadge,
  selected = false,
  onClick,
  disabled = false,
  className,
}: StatusTileProps) {
  const clickable = Boolean(onClick) && !disabled;

  return (
    <button
      type="button"
      onClick={() => onClick?.()}
      disabled={disabled}
      className={cn(
        "w-full rounded-lg border border-white/60 px-3 py-2 text-left shadow-sm transition",
        status === "available" && "bg-green-50 text-slate-800",
        status === "taken" && "bg-red-50 text-slate-700",
        status === "locked" && "bg-slate-200 text-slate-700",
        clickable ? "cursor-pointer hover:brightness-[0.98]" : "cursor-default",
        disabled && "opacity-70 pointer-events-none",
        selected && "ring-2 ring-blue-500 ring-offset-1",
        className
      )}
    >
      <div className={cn("flex items-center gap-2", rightBadge ? "justify-between" : "justify-center")}>
        <div className="text-sm font-medium">{title}</div>
        {rightBadge ? <div>{rightBadge}</div> : null}
      </div>
      {subtitle ? <p className="mt-1 text-xs text-slate-600 text-center">{subtitle}</p> : null}
    </button>
  );
}
