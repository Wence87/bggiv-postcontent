"use client";

import { useEffect, useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";

import { Badge } from "@/components/ui/badge";
import { StatusTile, type PublicStatus } from "@/components/public/StatusTile";

export type AdsWeek = {
  weekKey: string;
  status: PublicStatus;
  bookedCount: number;
  remainingSlots: number;
  totalSlots: number;
};

type AdsResponse = {
  product: "ads";
  tz: string;
  currentWeekKey: string;
  weeks: AdsWeek[];
};

type AdsCalendarProps = {
  selectedWeekKey?: string | null;
  onSelectWeek?: (week: AdsWeek | null) => void;
  onlyAvailableSelection?: boolean;
};

function getIsoWeekKeyForDate(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0));
  const dayNumber = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNumber + 3);

  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);

  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / 604800000);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

function getDateFromWeekKey(weekKey: string): Date | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!match) return null;

  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const firstMonday = new Date(jan4);
  firstMonday.setUTCDate(jan4.getUTCDate() - jan4Day);
  firstMonday.setUTCDate(firstMonday.getUTCDate() + (week - 1) * 7);
  return firstMonday;
}

function statusLabel(status: PublicStatus): string {
  if (status === "available") return "Available";
  if (status === "taken") return "Taken";
  return "Locked";
}

export function AdsCalendar({
  selectedWeekKey: controlledSelectedWeekKey,
  onSelectWeek,
  onlyAvailableSelection = false,
}: AdsCalendarProps = {}) {
  const [loading, setLoading] = useState(true);
  const [weeks, setWeeks] = useState<AdsWeek[]>([]);
  const [selectedWeekKeyInternal, setSelectedWeekKeyInternal] = useState<string | null>(null);
  const selectedWeekKey = controlledSelectedWeekKey ?? selectedWeekKeyInternal;
  const setSelectedWeekKey = (value: string | null) => {
    if (controlledSelectedWeekKey === undefined) {
      setSelectedWeekKeyInternal(value);
    }
  };

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      try {
        const response = await fetch("/api/public/availability/ads", { signal: controller.signal });
        const data = (await response.json()) as AdsResponse;
        setWeeks(Array.isArray(data.weeks) ? data.weeks : []);
      } catch {
        setWeeks([]);
      } finally {
        setLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!weeks.length) {
      setSelectedWeekKey(null);
      return;
    }

    if (!selectedWeekKey || !weeks.some((week) => week.weekKey === selectedWeekKey)) {
      const firstAvailable = weeks.find((week) => week.status === "available");
      setSelectedWeekKey(firstAvailable?.weekKey ?? weeks[0].weekKey);
    }
  }, [selectedWeekKey, weeks]);

  const selectedWeek = useMemo(
    () => weeks.find((week) => week.weekKey === selectedWeekKey) ?? null,
    [weeks, selectedWeekKey]
  );

  useEffect(() => {
    onSelectWeek?.(selectedWeek);
  }, [onSelectWeek, selectedWeek]);

  const weekStatusMap = useMemo(() => {
    const map = new Map<string, PublicStatus>();
    for (const week of weeks) {
      map.set(week.weekKey, week.status);
    }
    return map;
  }, [weeks]);

  const selectedDate = useMemo(() => {
    if (!selectedWeekKey) return undefined;
    return getDateFromWeekKey(selectedWeekKey) ?? undefined;
  }, [selectedWeekKey]);

  if (loading) {
    return <div className="rounded-lg border bg-white p-4 text-sm text-muted-foreground">Loading ads availability...</div>;
  }

  if (!weeks.length) {
    return <div className="rounded-lg border bg-white p-4 text-sm text-muted-foreground">No ads data available.</div>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <div className="rounded-lg border bg-white px-5 py-3">
        <DayPicker
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            if (!date) return;
            const weekKey = getIsoWeekKeyForDate(date);
            const week = weeks.find((entry) => entry.weekKey === weekKey);
            if (!week) return;
            if (onlyAvailableSelection && week.status !== "available") return;
            if (weekStatusMap.has(weekKey)) {
              if (controlledSelectedWeekKey !== undefined) {
                onSelectWeek?.(week);
              } else {
                setSelectedWeekKey(weekKey);
              }
            }
          }}
          showWeekNumber
          showOutsideDays
          weekStartsOn={1}
          modifiers={{
            weekAvailable: (date) => weekStatusMap.get(getIsoWeekKeyForDate(date)) === "available",
            weekTaken: (date) => weekStatusMap.get(getIsoWeekKeyForDate(date)) === "taken",
            weekLocked: (date) => weekStatusMap.get(getIsoWeekKeyForDate(date)) === "locked",
            weekStart: (date) => date.getDay() === 1,
            weekEnd: (date) => date.getDay() === 0,
          }}
          modifiersClassNames={{
            weekAvailable: "bg-green-50",
            weekTaken: "bg-red-50",
            weekLocked: "bg-slate-100",
            weekStart: "public-week-start",
            weekEnd: "public-week-end",
          }}
          classNames={{
            table: "w-full border-separate border-spacing-y-2 bg-white",
            row: "h-10 ring-1 ring-white",
            week_number: "text-xs font-normal text-slate-400",
            cell:
              "p-0 [&:has(.public-week-start)]:rounded-l-md [&:has(.public-week-end)]:rounded-r-md overflow-hidden",
            day: "h-10 w-10 rounded-none",
            selected: "ring-2 ring-blue-500 ring-inset",
          }}
          className="w-full"
        />
      </div>

      <div className="space-y-3 rounded-lg border bg-white p-4">
        <div className="grid gap-2 max-h-[360px] overflow-auto">
          {weeks.map((week) => (
            <StatusTile
              key={week.weekKey}
              status={week.status}
              selected={week.weekKey === selectedWeekKey}
              onClick={() => {
                if (controlledSelectedWeekKey !== undefined) {
                  onSelectWeek?.(week);
                } else {
                  setSelectedWeekKey(week.weekKey);
                }
              }}
              disabled={onlyAvailableSelection && week.status !== "available"}
              title={week.weekKey}
              subtitle={`${week.remainingSlots}/${week.totalSlots} remaining`}
              rightBadge={<Badge variant={week.status === "taken" ? "destructive" : "secondary"}>{statusLabel(week.status)}</Badge>}
            />
          ))}
        </div>

        {selectedWeek ? (
          <div className="rounded-md border bg-white p-3 text-sm">
            <p className="font-medium">Selected week</p>
            <p className="text-muted-foreground">{selectedWeek.weekKey}</p>
            <p className="mt-2 font-medium">Status</p>
            <p className="text-muted-foreground">{statusLabel(selectedWeek.status)}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
