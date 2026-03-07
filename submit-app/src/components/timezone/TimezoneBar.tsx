"use client";

import { Label } from "@/components/ui/label";
import {
  REFERENCE_TIMEZONE,
  getTimeZoneOptions,
  getUtcOffsetLabel,
} from "@/lib/timezone";

type TimezoneBarProps = {
  userTz: string | null;
  onUserTzChange: (next: string | null) => void;
};

export function TimezoneBar({ userTz, onUserTzChange }: TimezoneBarProps) {
  const options = getTimeZoneOptions(new Date());

  return (
    <div className="space-y-3 rounded-md border bg-white p-3">
      <div className="grid gap-2 sm:grid-cols-[180px_1fr] sm:items-center">
        <Label htmlFor="user-timezone-select">Your timezone:</Label>
        <select
          id="user-timezone-select"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={userTz ?? ""}
          onChange={(event) => onUserTzChange(event.target.value || null)}
        >
          <option value="">Select your timezone</option>
          {options.map((option) => (
            <option key={option.tz} value={option.tz}>
              {`${option.country} — ${option.city} (${getUtcOffsetLabel(option.tz)})`}
            </option>
          ))}
        </select>
      </div>

      <p className="text-xs text-muted-foreground">
        Reference timezone is fixed to {REFERENCE_TIMEZONE}.
      </p>
    </div>
  );
}
