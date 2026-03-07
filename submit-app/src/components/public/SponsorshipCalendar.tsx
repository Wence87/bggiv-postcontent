"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { StatusTile, type PublicStatus } from "@/components/public/StatusTile";

export type SponsorshipMonth = {
  monthKey: string;
  status: PublicStatus;
};

type SponsorshipResponse = {
  product: "sponsorship";
  tz: string;
  months: SponsorshipMonth[];
};

type SponsorshipCalendarProps = {
  selectedMonthKey?: string | null;
  onSelectMonth?: (month: SponsorshipMonth | null) => void;
  onlyAvailableSelection?: boolean;
  reservedMonthKeys?: string[];
};

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "Europe/Brussels",
  }).format(new Date(Date.UTC(year, month - 1, 1, 12, 0, 0, 0)));
}

function statusLabel(status: PublicStatus): string {
  if (status === "available") return "Available";
  if (status === "taken") return "Full";
  if (status === "mine") return "My reservation";
  return "Locked";
}

export function SponsorshipCalendar({
  selectedMonthKey: controlledSelectedMonthKey,
  onSelectMonth,
  onlyAvailableSelection = false,
  reservedMonthKeys = [],
}: SponsorshipCalendarProps = {}) {
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState<SponsorshipMonth[]>([]);
  const [selectedMonthKeyInternal, setSelectedMonthKeyInternal] = useState<string | null>(null);
  const selectedMonthKey = controlledSelectedMonthKey ?? selectedMonthKeyInternal;
  const setSelectedMonthKey = (value: string | null) => {
    if (controlledSelectedMonthKey === undefined) {
      setSelectedMonthKeyInternal(value);
    }
  };

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      try {
        const response = await fetch("/api/public/availability/sponsorship", { signal: controller.signal });
        const data = (await response.json()) as SponsorshipResponse;
        setMonths(Array.isArray(data.months) ? data.months : []);
      } catch {
        setMonths([]);
      } finally {
        setLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!months.length) {
      setSelectedMonthKey(null);
      return;
    }

    if (!selectedMonthKey || !months.some((month) => month.monthKey === selectedMonthKey)) {
      setSelectedMonthKey(months[0].monthKey);
    }
  }, [months, selectedMonthKey]);

  const selectedMonth = useMemo(
    () => months.find((month) => month.monthKey === selectedMonthKey) ?? null,
    [months, selectedMonthKey]
  );

  useEffect(() => {
    onSelectMonth?.(selectedMonth);
  }, [onSelectMonth, selectedMonth]);

  const monthStatusMap = useMemo(() => {
    const map = new Map<string, PublicStatus>();
    const reservedSet = new Set(reservedMonthKeys);
    for (const month of months) {
      map.set(month.monthKey, reservedSet.has(month.monthKey) ? "mine" : month.status);
    }
    return map;
  }, [months, reservedMonthKeys]);

  if (loading) {
    return <div className="rounded-lg border bg-white p-4 text-sm text-muted-foreground">Loading sponsorship availability...</div>;
  }

  if (!months.length) {
    return <div className="rounded-lg border bg-white p-4 text-sm text-muted-foreground">No sponsorship data available.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {months.map((month) => (
          <StatusTile
            key={month.monthKey}
            status={monthStatusMap.get(month.monthKey) ?? month.status}
            selected={selectedMonthKey === month.monthKey}
            onClick={() => {
              if (controlledSelectedMonthKey !== undefined) {
                onSelectMonth?.(month);
              } else {
                setSelectedMonthKey(month.monthKey);
              }
            }}
            disabled={onlyAvailableSelection && (monthStatusMap.get(month.monthKey) ?? month.status) !== "available"}
            title={formatMonthLabel(month.monthKey)}
            subtitle={month.monthKey}
            rightBadge={
              <Badge
                variant={(monthStatusMap.get(month.monthKey) ?? month.status) === "taken" ? "destructive" : "secondary"}
              >
                {statusLabel(monthStatusMap.get(month.monthKey) ?? month.status)}
              </Badge>
            }
          />
        ))}
      </div>

      {selectedMonth ? (
        <div className="rounded-lg border bg-white p-4 text-sm">
          <p className="font-medium">Slot</p>
          <p className="text-muted-foreground">{selectedMonth.monthKey}</p>
          <p className="mt-2 font-medium">Status</p>
          <p className="text-muted-foreground">{statusLabel(monthStatusMap.get(selectedMonth.monthKey) ?? selectedMonth.status)}</p>
        </div>
      ) : null}
    </div>
  );
}
