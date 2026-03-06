"use client";

import { useEffect, useMemo, useState } from "react";

import { StatusTile, type PublicStatus } from "@/components/public/StatusTile";

type SponsorshipMonth = {
  monthKey: string;
  status: PublicStatus;
};

type SponsorshipResponse = {
  product: "sponsorship";
  tz: string;
  months: SponsorshipMonth[];
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
  if (status === "taken") return "Taken";
  return "Locked";
}

export function SponsorshipCalendar() {
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState<SponsorshipMonth[]>([]);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);

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
            status={month.status}
            selected={selectedMonthKey === month.monthKey}
            onClick={() => setSelectedMonthKey(month.monthKey)}
            title={formatMonthLabel(month.monthKey)}
            subtitle={statusLabel(month.status)}
            rightBadge={<span className="text-xs font-medium">{month.monthKey}</span>}
          />
        ))}
      </div>

      {selectedMonth ? (
        <div className="rounded-lg border bg-white p-4 text-sm">
          <p className="font-medium">Slot</p>
          <p className="text-muted-foreground">{selectedMonth.monthKey}</p>
          <p className="mt-2 font-medium">Status</p>
          <p className="text-muted-foreground">{statusLabel(selectedMonth.status)}</p>
        </div>
      ) : null}
    </div>
  );
}
