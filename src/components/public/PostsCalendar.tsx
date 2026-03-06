"use client";

import { useEffect, useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";

import { StatusTile, type PublicStatus } from "@/components/public/StatusTile";
import { TimezoneBar } from "@/components/timezone/TimezoneBar";
import { useUserTimezone } from "@/components/timezone/useUserTimezone";
import {
  REFERENCE_TIMEZONE,
  getDayShiftFromReference,
  getDayShiftLabel,
  formatInTimeZone,
  formatTimeZoneLabel,
  resolveTimeZoneDateTimeToUtc,
} from "@/lib/timezone";

export type PublicPostProduct = "NEWS" | "PROMO_DEAL" | "GIVEAWAY";

type PostDay = {
  dayStatus: PublicStatus;
  hours: Record<number, PublicStatus>;
};

type PostsResponse = {
  product: "news" | "promo" | "giveaway";
  tz: string;
  days: Record<string, PostDay>;
  meta: {
    lockDays: number;
    tz: string;
  };
};

type PostsCalendarProps = {
  product: PublicPostProduct;
  selectedDayKey: string | null;
  onSelectDayKey: (dayKey: string | null) => void;
  selectedHour: number | null;
  onSelectHour: (hour: number | null) => void;
};

function mapProductParam(product: PublicPostProduct): string {
  if (product === "PROMO_DEAL") return "PROMO_DEAL";
  return product;
}

function dateFromDayKey(dayKey: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return undefined;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0));
}

function dayKeyForDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function statusLabel(status: PublicStatus): string {
  if (status === "available") return "Available";
  if (status === "taken") return "Taken";
  return "Locked";
}

export function PostsCalendar({
  product,
  selectedDayKey,
  onSelectDayKey,
  selectedHour,
  onSelectHour,
}: PostsCalendarProps) {
  const { userTz, setUserTz } = useUserTimezone();
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<Record<string, PostDay>>({});

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      try {
        const query = new URLSearchParams({ product: mapProductParam(product) });
        const response = await fetch(`/api/public/availability/posts?${query.toString()}`, {
          signal: controller.signal,
        });
        const data = (await response.json()) as PostsResponse;
        setDays(data.days && typeof data.days === "object" ? data.days : {});
      } catch {
        setDays({});
      } finally {
        setLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, [product]);

  const dayKeys = useMemo(() => Object.keys(days).sort(), [days]);

  useEffect(() => {
    if (!dayKeys.length) {
      onSelectDayKey(null);
      return;
    }

    if (selectedDayKey && days[selectedDayKey]) {
      return;
    }

    const firstAvailable = dayKeys.find((dayKey) => days[dayKey]?.dayStatus === "available");
    onSelectDayKey(firstAvailable ?? dayKeys[0]);
  }, [dayKeys, days, onSelectDayKey, selectedDayKey]);

  const selectedDate = useMemo(
    () => (selectedDayKey ? dateFromDayKey(selectedDayKey) : undefined),
    [selectedDayKey]
  );
  const selectedDay = selectedDayKey ? days[selectedDayKey] : undefined;

  const inspectedHourStatus =
    selectedDay && selectedHour != null ? selectedDay.hours[selectedHour] ?? "locked" : null;

  const getSlotUtcDate = (dayKey: string, hour: number): Date | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
    if (!match) return null;
    return resolveTimeZoneDateTimeToUtc(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      hour,
      0,
      REFERENCE_TIMEZONE
    );
  };

  if (loading) {
    return <div className="rounded-lg border bg-white p-4 text-sm text-muted-foreground">Loading posts availability...</div>;
  }

  if (!dayKeys.length) {
    return <div className="rounded-lg border bg-white p-4 text-sm text-muted-foreground">No posts data available.</div>;
  }

  return (
    <div className="space-y-4">
      <TimezoneBar userTz={userTz} onUserTzChange={setUserTz} />

      <div className="grid gap-4 lg:grid-cols-[330px_1fr]">
        <div className="rounded-lg border bg-white px-5 py-3">
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              if (!date) return;
              onSelectDayKey(dayKeyForDate(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))));
              onSelectHour(null);
            }}
            showOutsideDays
            weekStartsOn={1}
            modifiers={{
              dayAvailable: (date) => {
                const dayKey = dayKeyForDate(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())));
                return days[dayKey]?.dayStatus === "available";
              },
              dayTaken: (date) => {
                const dayKey = dayKeyForDate(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())));
                return days[dayKey]?.dayStatus === "taken";
              },
              dayLocked: (date) => {
                const dayKey = dayKeyForDate(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())));
                return days[dayKey]?.dayStatus === "locked";
              },
            }}
            modifiersClassNames={{
              dayAvailable: "bg-green-50",
              dayTaken: "bg-red-50",
              dayLocked: "bg-slate-200",
            }}
            classNames={{
              table: "w-full border-separate border-spacing-1 bg-white",
              row: "ring-1 ring-white",
              week_number: "text-xs font-normal text-slate-400",
              cell: "rounded-md p-0 ring-1 ring-white overflow-hidden",
              day: "h-10 w-10 rounded-none",
              selected: "ring-2 ring-blue-500 ring-inset",
            }}
            className="w-full"
          />
        </div>

        <div className="space-y-3 rounded-lg border bg-white p-4">
          {!userTz ? (
            <p className="text-xs text-muted-foreground">
              Select your timezone to see local time conversion.
            </p>
          ) : null}
          <div className="grid grid-cols-3 gap-2 bg-white">
            {Array.from({ length: 24 }, (_, hour) => {
              const status = selectedDay ? selectedDay.hours[hour] ?? "locked" : "locked";
              const slotUtcDate =
                selectedDayKey && selectedDay ? getSlotUtcDate(selectedDayKey, hour) : null;
              const brusselsLabel = slotUtcDate
                ? formatInTimeZone(slotUtcDate, REFERENCE_TIMEZONE)
                : `${String(hour).padStart(2, "0")}:00`;
              const dayShiftLabel =
                userTz && slotUtcDate
                  ? getDayShiftLabel(getDayShiftFromReference(slotUtcDate, userTz, REFERENCE_TIMEZONE))
                  : null;

              return (
                <StatusTile
                  key={hour}
                  status={status}
                  selected={selectedHour === hour}
                  onClick={() => onSelectHour(hour)}
                  title={
                    <div className="flex flex-col items-center gap-0.5 leading-tight">
                      <span className="text-sm font-semibold text-foreground">{brusselsLabel}</span>
                      <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                        Brussels
                      </span>
                    </div>
                  }
                  subtitle={
                    userTz && slotUtcDate ? (
                      <div className="flex flex-col items-center gap-0.5 leading-tight">
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-semibold text-blue-600">
                            {formatInTimeZone(slotUtcDate, userTz)}
                          </span>
                          {dayShiftLabel ? (
                            <span className="text-[10px] font-medium text-blue-500">{dayShiftLabel}</span>
                          ) : null}
                        </div>
                        <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                          {formatTimeZoneLabel(userTz)}
                        </span>
                      </div>
                    ) : statusLabel(status)
                  }
                />
              );
            })}
          </div>
        </div>
      </div>

      {selectedDayKey && selectedDay ? (
        <div className="rounded-lg border bg-white p-4 text-sm">
          <p className="font-medium">Selected day</p>
          <p className="text-muted-foreground">{selectedDayKey}</p>
          <p className="mt-2 font-medium">Day status</p>
          <p className="text-muted-foreground">{statusLabel(selectedDay.dayStatus)}</p>
          {selectedHour != null && inspectedHourStatus ? (
            <>
              <p className="mt-2 font-medium">Selected hour</p>
              <p className="text-muted-foreground">
                {selectedDayKey} {String(selectedHour).padStart(2, "0")}:00 ({statusLabel(inspectedHourStatus)})
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
