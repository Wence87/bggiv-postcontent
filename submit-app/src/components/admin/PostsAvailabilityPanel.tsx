import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";

import { StatusTile, type AvailabilityStatus } from "@/components/admin/StatusTile";
import {
  REFERENCE_TIMEZONE,
  formatInTimeZone,
  resolveTimeZoneDateTimeToUtc,
} from "@/lib/timezone";

export type PostAvailabilityDay = {
  dateKey: string;
  dayStatus: AvailabilityStatus;
  hours: Record<number, AvailabilityStatus>;
};

type PostsAvailabilityPanelProps = {
  days: Record<string, PostAvailabilityDay>;
  selectedDayKey: string | null;
  selectedHours: number[];
  onSelectDay: (dayKey: string) => void;
  onSelectHour: (hour: number) => void;
  timeZone?: string;
};

function getTimeZoneDayKey(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") {
      parts[part.type] = part.value;
    }
  }

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dateFromDayKey(dayKey: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return undefined;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0));
}

export function PostsAvailabilityPanel({
  days,
  selectedDayKey,
  selectedHours,
  onSelectDay,
  onSelectHour,
  timeZone = "Europe/Brussels",
}: PostsAvailabilityPanelProps) {
  const selectedDate = selectedDayKey ? dateFromDayKey(selectedDayKey) : undefined;
  const selectedDay = selectedDayKey ? days[selectedDayKey] : undefined;
  const allHours = Array.from({ length: 24 }, (_, index) => index);

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

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[330px_1fr]">
        <div>
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              if (!date) return;
              onSelectDay(getTimeZoneDayKey(date, timeZone));
            }}
            showOutsideDays
            weekStartsOn={1}
            modifiers={{
              dayAvailable: (date) => days[getTimeZoneDayKey(date, timeZone)]?.dayStatus === "available",
              dayTaken: (date) => days[getTimeZoneDayKey(date, timeZone)]?.dayStatus === "taken",
              dayLocked: (date) => days[getTimeZoneDayKey(date, timeZone)]?.dayStatus === "locked",
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
            className="rounded-md border px-5 py-3"
          />
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 rounded-md bg-white p-2">
            {allHours.map((hour) => {
              const status = selectedDay?.hours[hour] ?? "locked";
              const slotUtcDate =
                selectedDayKey && selectedDay ? getSlotUtcDate(selectedDayKey, hour) : null;
              const brusselsLabel = slotUtcDate
                ? formatInTimeZone(slotUtcDate, REFERENCE_TIMEZONE)
                : `${String(hour).padStart(2, "0")}:00`;

              return (
                <StatusTile
                  key={hour}
                  status={status}
                  selected={selectedHours.includes(hour)}
                  disabled={!selectedDay || status !== "available"}
                  onClick={() => onSelectHour(hour)}
                  title={
                    <div className="flex flex-col items-center gap-0.5 leading-tight">
                      <span className="text-sm font-semibold text-foreground">{brusselsLabel}</span>
                    </div>
                  }
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
