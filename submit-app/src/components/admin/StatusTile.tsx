import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type AvailabilityStatus = "available" | "taken" | "locked";

type StatusTileProps = {
  status: AvailabilityStatus;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  rightBadge?: ReactNode;
  className?: string;
};

export function StatusTile({
  status,
  selected = false,
  disabled = false,
  onClick,
  title,
  subtitle,
  rightBadge,
  className,
}: StatusTileProps) {
  const isInteractive = status === "available" && !disabled && Boolean(onClick);

  return (
    <button
      type="button"
      disabled={!isInteractive}
      onClick={() => {
        if (isInteractive && onClick) {
          onClick();
        }
      }}
      className={cn(
        "w-full rounded-lg border border-white/60 px-3 py-2 text-left shadow-sm transition",
        status === "available" && "bg-green-50 text-slate-800",
        status === "taken" && "bg-red-50 text-slate-700 opacity-90",
        status === "locked" && "bg-slate-200 text-slate-700 opacity-80",
        isInteractive ? "cursor-pointer hover:brightness-[0.98]" : "cursor-not-allowed",
        selected && "ring-2 ring-blue-500 ring-offset-1",
        className
      )}
      aria-disabled={!isInteractive}
    >
      <div className={cn("flex items-center gap-2", rightBadge ? "justify-between" : "justify-center")}>
        <div className="text-sm font-medium">{title}</div>
        {rightBadge ? <div>{rightBadge}</div> : null}
      </div>
      {subtitle ? <p className="mt-1 text-xs text-slate-600 text-center">{subtitle}</p> : null}
    </button>
  );
}
