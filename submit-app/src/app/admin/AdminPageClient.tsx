"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { CalendarClock, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AdminShell } from "@/components/admin/AdminShell";
import { PostsAvailabilityPanel, type PostAvailabilityDay } from "@/components/admin/PostsAvailabilityPanel";
import { PostsBookingForm } from "@/components/admin/PostsBookingForm";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ProductView = "sponsorship" | "ads" | "news" | "promo" | "giveaway";
type SponsorshipSelectionMode = "COUNT" | "RANGE";

type ApiBooking = {
  key: string;
  groupId: string | null;
  product: "SPONSORSHIP" | "ADS" | "NEWS" | "PROMO" | "GIVEAWAY";
  slotLabel: string;
  companyName: string;
  status: "DRAFT_RESERVED" | "SUBMITTED" | "CANCELLED" | "PUBLISHED";
  orderReference: string;
  bookingIds: string[];
  createdAt: string;
};
type UpcomingRow = {
  key: string;
  groupId: string | null;
  bookingIds: string[];
  product: ApiBooking["product"];
  slotLabel: string;
  companyName: string;
  status: ApiBooking["status"];
  orderReference: string;
  createdAt: string;
};

type UpcomingSortKey = "slot" | "slotDateTime" | "company" | "status";
type UpcomingSortDir = "asc" | "desc";

type MetaState = {
  companyName: string;
  customerEmail: string;
  orderRef: string;
  internalNote: string;
};

type AdsWeekStatus = "LOCKED" | "AVAILABLE" | "FULL";
type AdsWeek = {
  weekKey: string;
  bookedCount: number;
  remainingSlots: number;
  status: AdsWeekStatus;
};

const BUSINESS_TZ = "Europe/Brussels";
const ADMIN_TOKEN_KEY = "adminToken";
const SPONSORSHIP_MONTH_WINDOW = 12;
const ADS_WEEK_WINDOW = 52;
const POSTS_DAY_WINDOW = 365;
const PRODUCT_LABELS: Record<ProductView, string> = {
  sponsorship: "Sponsorship",
  ads: "Ads",
  news: "News post",
  promo: "Promodeal post",
  giveaway: "Giveaway post",
};

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getBrusselsCalendarDateUtc(date: Date): Date {
  const parts = getTimeZoneParts(date, BUSINESS_TZ);
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 0, 0, 0, 0));
}

function startOfBrusselsMonthUtc(date: Date): Date {
  const day = getBrusselsCalendarDateUtc(date);
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1, 0, 0, 0, 0));
}

function startOfBrusselsIsoWeekUtc(date: Date): Date {
  const day = getBrusselsCalendarDateUtc(date);
  const dayNumber = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - dayNumber);
  return day;
}

function getTimeZoneParts(date: Date, timeZone: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const map: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }
  return map;
}

function getOffsetMsForTimeZone(date: Date, timeZone: string): number {
  const parts = getTimeZoneParts(date, timeZone);
  const zonedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return zonedAsUtc - date.getTime();
}

function resolveZonedTimeToUtc(year: number, month: number, day: number, hour: number, timeZone: string): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, 0, 0, 0);
  let utc = new Date(utcGuess - getOffsetMsForTimeZone(new Date(utcGuess), timeZone));
  utc = new Date(utcGuess - getOffsetMsForTimeZone(utc, timeZone));
  return utc;
}

function isoWeekKeyForDate(date: Date): string {
  const parts = getTimeZoneParts(date, BUSINESS_TZ);
  const d = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 0, 0, 0, 0));
  const dayNumber = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNumber + 3);

  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);

  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / 604800000);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

function monthKeyForDate(date: Date): string {
  const parts = getTimeZoneParts(date, BUSINESS_TZ);
  return `${parts.year}-${parts.month}`;
}

function getCurrentMonthKey(timeZone: string): string {
  const parts = getTimeZoneParts(new Date(), timeZone);
  return `${parts.year}-${parts.month}`;
}

function displayMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: BUSINESS_TZ }).format(
    new Date(Date.UTC(year, month - 1, 1))
  );
}

function formatMonthRange(monthKeys: string[]): string {
  const sorted = [...monthKeys].sort();
  if (sorted.length === 0) return "-";
  if (sorted.length === 1) return sorted[0];
  return `${sorted[0]} \u2192 ${sorted[sorted.length - 1]} (${sorted.length} months)`;
}

function formatWeekRange(weekKeys: string[]): string {
  const sorted = [...weekKeys].sort();
  if (sorted.length === 0) return "-";
  if (sorted.length === 1) return sorted[0];
  return `${sorted[0]} \u2192 ${sorted[sorted.length - 1]} (${sorted.length} weeks)`;
}

function parseMonthKey(monthKey: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

function compareMonthKeys(left: string, right: string): number {
  const a = parseMonthKey(left);
  const b = parseMonthKey(right);
  if (!a || !b) return left.localeCompare(right);
  if (a.year !== b.year) return a.year - b.year;
  return a.month - b.month;
}

function isMonthKeyPastOrCurrent(monthKey: string, currentMonthKey: string): boolean {
  return compareMonthKeys(monthKey, currentMonthKey) <= 0;
}

function addMonthsToMonthKey(monthKey: string, months: number): string | null {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return null;
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, 1, 0, 0, 0, 0));
  date.setUTCMonth(date.getUTCMonth() + months);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function enumerateMonthKeys(startMonthKey: string, endMonthKey: string): string[] {
  const start = compareMonthKeys(startMonthKey, endMonthKey) <= 0 ? startMonthKey : endMonthKey;
  const end = compareMonthKeys(startMonthKey, endMonthKey) <= 0 ? endMonthKey : startMonthKey;
  const items: string[] = [];
  let cursor = start;
  while (compareMonthKeys(cursor, end) <= 0) {
    items.push(cursor);
    const next = addMonthsToMonthKey(cursor, 1);
    if (!next) break;
    cursor = next;
  }
  return items;
}

function parseWeekKey(weekKey: string): { year: number; week: number } | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!match) return null;
  return { year: Number(match[1]), week: Number(match[2]) };
}

function compareWeekKeys(left: string, right: string): number {
  const a = parseWeekKey(left);
  const b = parseWeekKey(right);
  if (!a || !b) return left.localeCompare(right);
  if (a.year !== b.year) return a.year - b.year;
  return a.week - b.week;
}

function getDateFromWeekKey(weekKey: string): Date | null {
  const parsed = parseWeekKey(weekKey);
  if (!parsed) return null;

  const january4th = new Date(Date.UTC(parsed.year, 0, 4));
  const january4thDay = (january4th.getUTCDay() + 6) % 7;
  const firstIsoMonday = new Date(january4th);
  firstIsoMonday.setUTCDate(january4th.getUTCDate() - january4thDay);
  firstIsoMonday.setUTCDate(firstIsoMonday.getUTCDate() + (parsed.week - 1) * 7);
  return firstIsoMonday;
}

function dateKeyInBrussels(date: Date): string {
  const parts = getTimeZoneParts(date, BUSINESS_TZ);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function isEmailValid(value: string): boolean {
  return /^\S+@\S+\.\S+$/.test(value.trim());
}

function getPostSlotLabel(date: Date, hour: number): string {
  const parts = getTimeZoneParts(date, BUSINESS_TZ);
  return `${parts.year}-${parts.month}-${parts.day} ${String(hour).padStart(2, "0")}:00`;
}

function dateFromDayKey(dayKey: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return undefined;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0));
}

function BookingMetaFields({
  state,
  onChange,
}: {
  state: MetaState;
  onChange: (next: MetaState) => void;
}) {
  return (
    <div className="grid gap-4 py-2">
      <div className="grid gap-2">
        <Label htmlFor="companyName">Company name</Label>
        <Input
          id="companyName"
          value={state.companyName}
          onChange={(e) => onChange({ ...state, companyName: e.target.value })}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="customerEmail">Customer email</Label>
        <Input
          id="customerEmail"
          type="email"
          value={state.customerEmail}
          onChange={(e) => onChange({ ...state, customerEmail: e.target.value })}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="orderRef">Order reference</Label>
        <Input
          id="orderRef"
          value={state.orderRef}
          onChange={(e) => onChange({ ...state, orderRef: e.target.value })}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="internalNote">Internal note (optional)</Label>
        <Input
          id="internalNote"
          value={state.internalNote}
          onChange={(e) => onChange({ ...state, internalNote: e.target.value })}
        />
      </div>
    </div>
  );
}

function compactOrderRef(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 10) return trimmed;
  return `${trimmed.slice(0, 10)}...`;
}

function formatUpcomingDateTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "-";
  return new Date(timestamp).toLocaleString("en-GB");
}

export default function AdminPage() {
  const [active, setActive] = useState<ProductView>("sponsorship");
  const [token, setToken] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [upcomingSortKey, setUpcomingSortKey] = useState<UpcomingSortKey>("slotDateTime");
  const [upcomingSortDir, setUpcomingSortDir] = useState<UpcomingSortDir>("asc");
  const [bookings, setBookings] = useState<ApiBooking[]>([]);
  const [monthsTaken, setMonthsTaken] = useState<string[]>([]);
  const [adsWeeks, setAdsWeeks] = useState<AdsWeek[]>([]);
  const [adsCurrentWeekKey, setAdsCurrentWeekKey] = useState("");
  const [adsMaxRotation, setAdsMaxRotation] = useState(10);
  const [postAvailabilityDays, setPostAvailabilityDays] = useState<Record<string, PostAvailabilityDay>>({});

  const [meta, setMeta] = useState<MetaState>({ companyName: "", customerEmail: "", orderRef: "", internalNote: "" });

  const [sponsorshipSelectionMode, setSponsorshipSelectionMode] = useState<SponsorshipSelectionMode>("COUNT");
  const [sponsorshipStartMonthKey, setSponsorshipStartMonthKey] = useState<string | null>(null);
  const [sponsorshipEndMonthKey, setSponsorshipEndMonthKey] = useState<string | null>(null);
  const [sponsorshipMonthsCount, setSponsorshipMonthsCount] = useState(1);

  const [adsDate, setAdsDate] = useState<Date | undefined>(new Date());
  const [consecutiveWeeks, setConsecutiveWeeks] = useState(1);

  const [postDate, setPostDate] = useState<Date | undefined>(new Date());
  const [postHoursSelected, setPostHoursSelected] = useState<number[]>([]);

  useEffect(() => {
    const stored = window.localStorage.getItem(ADMIN_TOKEN_KEY) ?? "";
    setToken(stored);
  }, []);

  const adminFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const response = await fetch(url, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": token,
          ...(init?.headers ?? {}),
        },
      });

      if (response.status === 401) {
        setUnauthorized(true);
        throw new Error("UNAUTHORIZED");
      }

      return response;
    },
    [token]
  );

  const refreshData = useCallback(async () => {
    setLoading(true);

    const now = new Date();
    const sponsorshipFrom = startOfBrusselsMonthUtc(now);
    const sponsorshipTo = addMonths(sponsorshipFrom, SPONSORSHIP_MONTH_WINDOW - 1);
    const adsFrom = startOfBrusselsIsoWeekUtc(now);
    const adsTo = addDays(adsFrom, ADS_WEEK_WINDOW * 7 - 1);
    const postsFrom = getBrusselsCalendarDateUtc(now);
    const postsTo = addDays(postsFrom, POSTS_DAY_WINDOW - 1);
    const adminFrom = sponsorshipFrom;
    const adminTo = postsTo;
    const postsProductForView: "news" | "promo" | "giveaway" =
      active === "promo" ? "promo" : active === "giveaway" ? "giveaway" : "news";

    try {
      const sponsorshipPromise = fetch(
        `/api/public/availability?product=sponsorship&from=${encodeURIComponent(sponsorshipFrom.toISOString())}&to=${encodeURIComponent(sponsorshipTo.toISOString())}`
      ).then((r) => r.json());

      const adsPromise = fetch(
        `/api/public/availability?product=ads&from=${encodeURIComponent(adsFrom.toISOString())}&to=${encodeURIComponent(adsTo.toISOString())}`
      ).then((r) => r.json());

      const postsPromise = fetch(
        `/api/public/availability?product=${postsProductForView}&from=${encodeURIComponent(postsFrom.toISOString())}&to=${encodeURIComponent(postsTo.toISOString())}`
      ).then((r) => r.json());

      const adminPromise = adminFetch(
        `/api/admin/bookings?from=${encodeURIComponent(adminFrom.toISOString())}&to=${encodeURIComponent(adminTo.toISOString())}`
      ).then((r) => r.json());

      const [sponsorshipData, adsData, postsData, adminData] = await Promise.all([
        sponsorshipPromise,
        adsPromise,
        postsPromise,
        adminPromise,
      ]);

      setMonthsTaken(Array.isArray(sponsorshipData.monthsTaken) ? sponsorshipData.monthsTaken : []);
      setAdsWeeks(Array.isArray(adsData.weeks) ? adsData.weeks : []);
      setAdsCurrentWeekKey(typeof adsData.currentWeekKey === "string" ? adsData.currentWeekKey : "");
      setAdsMaxRotation(typeof adsData.maxRotation === "number" ? adsData.maxRotation : 10);
      setPostAvailabilityDays(postsData?.days && typeof postsData.days === "object" ? postsData.days : {});
      setBookings(Array.isArray(adminData.items) ? adminData.items : []);
      setUnauthorized(false);
    } catch (error) {
      if (!(error instanceof Error && error.message === "UNAUTHORIZED")) {
        toast.error("Failed to refresh booking data.");
      }
    } finally {
      setLoading(false);
    }
  }, [active, adminFetch, token]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const updateToken = (value: string) => {
    setToken(value);
    window.localStorage.setItem(ADMIN_TOKEN_KEY, value);
    setUnauthorized(false);
  };

  const clearToken = () => {
    setToken("");
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    setUnauthorized(false);
  };

  const metaIsValid = useMemo(() => {
    return (
      Boolean(meta.companyName.trim()) &&
      Boolean(meta.orderRef.trim()) &&
      Boolean(meta.customerEmail.trim()) &&
      isEmailValid(meta.customerEmail)
    );
  }, [meta.companyName, meta.customerEmail, meta.orderRef]);

  const validateMeta = () => {
    if (!meta.companyName.trim() || !meta.customerEmail.trim() || !meta.orderRef.trim() || !isEmailValid(meta.customerEmail)) {
      toast.error("Company name, valid customer email and order reference are required.");
      return false;
    }
    return true;
  };

  const createSponsorship = async () => {
    if (!sponsorshipCanBook || !validateMeta() || !sponsorshipStartMonthKey) {
      return;
    }

    setCreating(true);
    try {
      const payload =
        sponsorshipSelectionMode === "COUNT"
          ? {
              product: "SPONSORSHIP",
              startMonthKey: sponsorshipStartMonthKey,
              monthsCount: sponsorshipMonthsCount,
            }
          : {
              product: "SPONSORSHIP",
              startMonthKey: sponsorshipStartMonthKey,
              endMonthKey: sponsorshipEndMonthKey,
            };

      const res = await adminFetch("/api/admin/bookings", {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          companyName: meta.companyName.trim(),
          customerEmail: meta.customerEmail.trim(),
          orderRef: meta.orderRef.trim(),
          internalNote: meta.internalNote.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { code?: string };
        toast.error(body.code ?? "Failed to create sponsorship booking.");
        return;
      }

      toast.success(`Sponsorship booked for ${formatMonthRange(sponsorshipSelectedMonths)}.`);
      setSponsorshipStartMonthKey(null);
      setSponsorshipEndMonthKey(null);
      setSponsorshipMonthsCount(1);
      await refreshData();
    } catch (error) {
      if (!(error instanceof Error && error.message === "UNAUTHORIZED")) {
        toast.error("Failed to create sponsorship booking.");
      }
    } finally {
      setCreating(false);
    }
  };

  const selectedAdsWeekKey = useMemo(() => (adsDate ? isoWeekKeyForDate(adsDate) : ""), [adsDate]);
  const adsWeekStatusMap = useMemo(() => {
    const map = new Map<string, AdsWeekStatus>();
    for (const week of adsWeeks) {
      map.set(week.weekKey, week.status);
    }
    return map;
  }, [adsWeeks]);
  const getAdsWeekStatus = useCallback(
    (weekKey: string): AdsWeekStatus => {
      const status = adsWeekStatusMap.get(weekKey);
      if (status) return status;
      if (adsCurrentWeekKey && compareWeekKeys(weekKey, adsCurrentWeekKey) <= 0) return "LOCKED";
      return "AVAILABLE";
    },
    [adsCurrentWeekKey, adsWeekStatusMap]
  );
  const selectedAdsWeekStatus = useMemo(
    () => (selectedAdsWeekKey ? getAdsWeekStatus(selectedAdsWeekKey) : null),
    [getAdsWeekStatus, selectedAdsWeekKey]
  );

  useEffect(() => {
    if (selectedAdsWeekKey && getAdsWeekStatus(selectedAdsWeekKey) !== "AVAILABLE") {
      setAdsDate(undefined);
    }
  }, [getAdsWeekStatus, selectedAdsWeekKey]);
  const adsWeekModifiers = useMemo(
    () => ({
      weekBooked: (date: Date) => {
        const weekKey = isoWeekKeyForDate(date);
        return getAdsWeekStatus(weekKey) === "FULL";
      },
      weekAvailable: (date: Date) => {
        const weekKey = isoWeekKeyForDate(date);
        return getAdsWeekStatus(weekKey) === "AVAILABLE";
      },
      weekLocked: (date: Date) => getAdsWeekStatus(isoWeekKeyForDate(date)) === "LOCKED",
      weekStart: (date: Date) => date.getDay() === 1,
      weekEnd: (date: Date) => date.getDay() === 0,
    }),
    [getAdsWeekStatus]
  );

  const handleAdsDateSelect = useCallback(
    (next: Date | undefined) => {
      if (!next) {
        setAdsDate(undefined);
        return;
      }

      const weekKey = isoWeekKeyForDate(next);
      const status = getAdsWeekStatus(weekKey);
      if (status === "LOCKED") {
        toast.error("Week already started.");
        return;
      }
      if (status === "FULL") {
        toast.error("Week is full.");
        return;
      }
      setAdsDate(next);
    },
    [getAdsWeekStatus]
  );

  const createAds = async () => {
    if (!adsDate || selectedAdsWeekStatus !== "AVAILABLE" || !validateMeta()) {
      if (adsDate && selectedAdsWeekStatus === "LOCKED") {
        toast.error("Week already started.");
      } else if (adsDate && selectedAdsWeekStatus === "FULL") {
        toast.error("Week is full.");
      }
      return;
    }

    setCreating(true);
    const start = new Date(adsDate);
    const weekKeys = Array.from({ length: consecutiveWeeks }).map((_, index) =>
      isoWeekKeyForDate(addDays(start, index * 7))
    );
    const firstUnavailableWeek = weekKeys.find((weekKey) => getAdsWeekStatus(weekKey) !== "AVAILABLE");
    if (firstUnavailableWeek) {
      const status = getAdsWeekStatus(firstUnavailableWeek);
      toast.error(status === "LOCKED" ? "Week already started." : "Week is full.");
      return;
    }
    const toastId = toast.loading(`Creating ${weekKeys.length} weeks...`);

    try {
      const res = await adminFetch("/api/admin/bookings", {
        method: "POST",
        body: JSON.stringify({
          product: "ADS",
          weekKeys,
          companyName: meta.companyName.trim(),
          customerEmail: meta.customerEmail.trim(),
          orderRef: meta.orderRef.trim(),
          internalNote: meta.internalNote.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { code?: string };
        toast.error(body.code ?? "Failed to create ad bookings.", { id: toastId });
        await refreshData();
        return;
      }

      toast.success(`Created ${weekKeys.length} ad bookings.`, { id: toastId });
      await refreshData();
    } catch (error) {
      if (!(error instanceof Error && error.message === "UNAUTHORIZED")) {
        toast.error("Failed to create ad bookings.", { id: toastId });
      }
    } finally {
      setCreating(false);
    }
  };

  const postType = active === "news" ? "NEWS" : active === "promo" ? "PROMO" : active === "giveaway" ? "GIVEAWAY" : null;
  const selectedPostDateKey = useMemo(() => (postDate ? dateKeyInBrussels(postDate) : null), [postDate]);
  const postAvailabilityByDate = postAvailabilityDays;
  const selectedPostDay = selectedPostDateKey ? postAvailabilityByDate[selectedPostDateKey] ?? null : null;

  useEffect(() => {
    setPostHoursSelected([]);
  }, [selectedPostDateKey, active]);

  const handleSelectPostDay = useCallback((dayKey: string) => {
    const nextDate = dateFromDayKey(dayKey);
    if (!nextDate) return;
    setPostDate(nextDate);
    setPostHoursSelected([]);
  }, []);

  const handleSelectPostHour = useCallback(
    (hour: number) => {
      const status = selectedPostDay?.hours[hour];
      if (!selectedPostDay || status !== "available") {
        return;
      }

      if (postType === "PROMO" || postType === "GIVEAWAY") {
        setPostHoursSelected((prev) => (prev.includes(hour) ? [] : [hour]));
        return;
      }

      setPostHoursSelected((prev) => (prev.includes(hour) ? prev.filter((value) => value !== hour) : [...prev, hour]));
    },
    [postType, selectedPostDay]
  );

  const createPost = async () => {
    if (!postType || !postDate || postHoursSelected.length === 0 || !validateMeta() || !selectedPostDay) {
      return;
    }

    const hasUnavailable = postHoursSelected.some((hour) => {
      return selectedPostDay.hours[hour] !== "available";
    });
    if (hasUnavailable) {
      toast.error("Selected slots are not available.");
      return;
    }

    const parts = getTimeZoneParts(postDate, BUSINESS_TZ);
    const startsAtUtcValues = [...postHoursSelected]
      .sort((a, b) => a - b)
      .map((hour) =>
        resolveZonedTimeToUtc(Number(parts.year), Number(parts.month), Number(parts.day), hour, BUSINESS_TZ).toISOString()
      );

    setCreating(true);

    try {
      const res = await adminFetch("/api/admin/bookings", {
        method: "POST",
        body: JSON.stringify({
          product: postType,
          startsAtUtcValues,
          companyName: meta.companyName.trim(),
          customerEmail: meta.customerEmail.trim(),
          orderRef: meta.orderRef.trim(),
          internalNote: meta.internalNote.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { code?: string };
        toast.error(body.code ?? "Failed to create post booking.");
        return;
      }

      setPostHoursSelected([]);
      toast.success(`${postType} bookings created (${startsAtUtcValues.length} slots).`);
      await refreshData();
    } catch (error) {
      if (!(error instanceof Error && error.message === "UNAUTHORIZED")) {
        toast.error("Failed to create post booking.");
      }
    } finally {
      setCreating(false);
    }
  };

  const canCreatePost = useMemo(() => {
    if (!metaIsValid || postHoursSelected.length === 0 || !selectedPostDay) return false;
    return postHoursSelected.every((hour) => selectedPostDay.hours[hour] === "available");
  }, [metaIsValid, postHoursSelected, selectedPostDay]);

  const selectedPostSlotsSummary = useMemo(() => {
    if (!postDate || postHoursSelected.length === 0) return undefined;
    return `Selected slots: ${[...postHoursSelected]
      .sort((a, b) => a - b)
      .map((hour) => getPostSlotLabel(postDate, hour))
      .join(", ")}`;
  }, [postDate, postHoursSelected]);

  const deleteBookings = async (row: UpcomingRow) => {
    const payload = row.groupId ? { groupId: row.groupId } : { id: row.bookingIds[0] };

    try {
      const res = await adminFetch("/api/admin/bookings", {
        method: "DELETE",
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("Booking deleted.");
        await refreshData();
        return;
      }
      const body = (await res.json()) as { code?: string };
      toast.error(body.code ?? "Delete failed.");
    } catch (error) {
      if (!(error instanceof Error && error.message === "UNAUTHORIZED")) {
        toast.error("Delete failed.");
      }
    }
  };

  const upcomingRows = useMemo<UpcomingRow[]>(() => {
    const now = new Date();
    if (active === "sponsorship") {
      return bookings
        .filter((b) => b.product === "SPONSORSHIP")
        .slice(0, 12)
        .map((b) => ({
          key: b.key,
          groupId: b.groupId,
          bookingIds: b.bookingIds,
          product: b.product,
          slotLabel: b.slotLabel,
          companyName: b.companyName,
          status: b.status,
          orderReference: b.orderReference,
          createdAt: b.createdAt,
        }));
    }
    if (active === "ads") {
      return bookings
        .filter((b) => b.product === "ADS")
        .map((b) => ({
          key: b.key,
          groupId: b.groupId,
          bookingIds: b.bookingIds,
          product: b.product,
          slotLabel: b.slotLabel,
          companyName: b.companyName,
          status: b.status,
          orderReference: b.orderReference,
          createdAt: b.createdAt,
        }))
        .sort((a, b) => a.slotLabel.localeCompare(b.slotLabel))
        .slice(0, 26);
    }
    const cutoff = addDays(now, 90).getTime();
    const targetProduct = active.toUpperCase();
    return bookings
      .filter((b) => b.product === targetProduct)
      .filter((b) => new Date(b.createdAt).getTime() <= cutoff)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((b) => ({
        key: b.key,
        groupId: b.groupId,
        bookingIds: b.bookingIds,
        product: b.product,
        slotLabel: b.slotLabel,
        companyName: b.companyName,
        status: b.status,
        orderReference: b.orderReference,
        createdAt: b.createdAt,
      }));
  }, [active, bookings]);

  const parseUpcomingSlotDateTime = useCallback((row: UpcomingRow): number => {
    const parsedFromLabel = Date.parse(row.slotLabel);
    if (Number.isFinite(parsedFromLabel)) return parsedFromLabel;
    const parsedFromCreatedAt = Date.parse(row.createdAt);
    return Number.isFinite(parsedFromCreatedAt) ? parsedFromCreatedAt : 0;
  }, []);

  const sortedUpcomingRows = useMemo(() => {
    const rows = [...upcomingRows];
    rows.sort((a, b) => {
      const left =
        upcomingSortKey === "slot"
          ? a.slotLabel.toLowerCase()
          : upcomingSortKey === "slotDateTime"
            ? parseUpcomingSlotDateTime(a)
            : upcomingSortKey === "company"
              ? a.companyName.toLowerCase()
              : a.status.toLowerCase();
      const right =
        upcomingSortKey === "slot"
          ? b.slotLabel.toLowerCase()
          : upcomingSortKey === "slotDateTime"
            ? parseUpcomingSlotDateTime(b)
            : upcomingSortKey === "company"
              ? b.companyName.toLowerCase()
              : b.status.toLowerCase();
      if (typeof left === "number" && typeof right === "number") {
        return upcomingSortDir === "asc" ? left - right : right - left;
      }
      if (left < right) return upcomingSortDir === "asc" ? -1 : 1;
      if (left > right) return upcomingSortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [upcomingRows, upcomingSortDir, upcomingSortKey, parseUpcomingSlotDateTime]);

  const onSortUpcoming = (key: UpcomingSortKey) => {
    if (upcomingSortKey === key) {
      setUpcomingSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setUpcomingSortKey(key);
    setUpcomingSortDir("asc");
  };

  const sponsorshipMonths = useMemo(() => {
    const start = startOfBrusselsMonthUtc(new Date());
    return Array.from({ length: SPONSORSHIP_MONTH_WINDOW }).map((_, index) => {
      const d = addMonths(start, index);
      const key = monthKeyForDate(d);
      return {
        key,
        label: displayMonthLabel(key),
        taken: monthsTaken.includes(key),
      };
    });
  }, [monthsTaken]);
  const sponsorshipMonthsMap = useMemo(
    () => new Map(sponsorshipMonths.map((month) => [month.key, month])),
    [sponsorshipMonths]
  );
  const sponsorshipCurrentMonthKey = useMemo(() => getCurrentMonthKey(BUSINESS_TZ), []);
  const isSponsorshipMonthClickable = useCallback(
    (monthKey: string) => {
      const month = sponsorshipMonthsMap.get(monthKey);
      if (!month) return false;
      if (month.taken) return false;
      return !isMonthKeyPastOrCurrent(monthKey, sponsorshipCurrentMonthKey);
    },
    [sponsorshipCurrentMonthKey, sponsorshipMonthsMap]
  );
  const sponsorshipMaxSelectableCount = useCallback(
    (startMonthKey: string) => {
      let count = 0;
      for (let index = 0; index < 12; index += 1) {
        const key = addMonthsToMonthKey(startMonthKey, index);
        if (!key || !isSponsorshipMonthClickable(key)) break;
        count += 1;
      }
      return count;
    },
    [isSponsorshipMonthClickable]
  );
  const sponsorshipSelectedMonths = useMemo(() => {
    if (!sponsorshipStartMonthKey) return [];

    if (sponsorshipSelectionMode === "COUNT") {
      const items: string[] = [];
      for (let index = 0; index < sponsorshipMonthsCount; index += 1) {
        const key = addMonthsToMonthKey(sponsorshipStartMonthKey, index);
        if (!key) break;
        items.push(key);
      }
      return items;
    }

    if (!sponsorshipEndMonthKey) {
      return [sponsorshipStartMonthKey];
    }
    return enumerateMonthKeys(sponsorshipStartMonthKey, sponsorshipEndMonthKey);
  }, [sponsorshipEndMonthKey, sponsorshipMonthsCount, sponsorshipSelectionMode, sponsorshipStartMonthKey]);
  const sponsorshipHasTakenInSelection = useMemo(() => {
    return sponsorshipSelectedMonths.some((key) => sponsorshipMonthsMap.get(key)?.taken);
  }, [sponsorshipMonthsMap, sponsorshipSelectedMonths]);
  const sponsorshipHasPastOrCurrentInSelection = useMemo(() => {
    return sponsorshipSelectedMonths.some((key) => isMonthKeyPastOrCurrent(key, sponsorshipCurrentMonthKey));
  }, [sponsorshipCurrentMonthKey, sponsorshipSelectedMonths]);
  const sponsorshipSelectionOutOfWindow = useMemo(
    () => sponsorshipSelectedMonths.some((key) => !sponsorshipMonthsMap.has(key)),
    [sponsorshipMonthsMap, sponsorshipSelectedMonths]
  );
  const sponsorshipSelectionHasUnclickableMonths = useMemo(
    () => sponsorshipSelectedMonths.some((key) => !isSponsorshipMonthClickable(key)),
    [isSponsorshipMonthClickable, sponsorshipSelectedMonths]
  );
  const sponsorshipSelectionMessage = useMemo(() => {
    if (!sponsorshipStartMonthKey) return "Select a start month.";
    if (sponsorshipSelectionOutOfWindow) return "Range exceeds available 12-month window.";
    if (sponsorshipHasTakenInSelection || sponsorshipHasPastOrCurrentInSelection || sponsorshipSelectionHasUnclickableMonths) {
      return "Selection includes past/current or taken months.";
    }
    return null;
  }, [
    sponsorshipHasPastOrCurrentInSelection,
    sponsorshipHasTakenInSelection,
    sponsorshipSelectionHasUnclickableMonths,
    sponsorshipSelectionOutOfWindow,
    sponsorshipStartMonthKey,
  ]);
  const sponsorshipCanBook = useMemo(
    () =>
      Boolean(sponsorshipStartMonthKey) &&
      sponsorshipSelectedMonths.length > 0 &&
      !sponsorshipHasTakenInSelection &&
      !sponsorshipHasPastOrCurrentInSelection &&
      !sponsorshipSelectionHasUnclickableMonths &&
      !sponsorshipSelectionOutOfWindow &&
      metaIsValid,
    [
      metaIsValid,
      sponsorshipHasPastOrCurrentInSelection,
      sponsorshipHasTakenInSelection,
      sponsorshipSelectedMonths,
      sponsorshipSelectionHasUnclickableMonths,
      sponsorshipSelectionOutOfWindow,
      sponsorshipStartMonthKey,
    ]
  );

  useEffect(() => {
    if (sponsorshipSelectionMode !== "COUNT" || !sponsorshipStartMonthKey) return;
    const maxSelectable = sponsorshipMaxSelectableCount(sponsorshipStartMonthKey);
    if (maxSelectable < 1) {
      clearSponsorshipSelection();
      return;
    }
    if (sponsorshipMonthsCount > maxSelectable) {
      setSponsorshipMonthsCount(maxSelectable);
      toast.error("Some months were not selectable; range truncated.");
    }
  }, [sponsorshipMonthsCount, sponsorshipSelectionMode, sponsorshipStartMonthKey, sponsorshipMaxSelectableCount]);

  const clearSponsorshipSelection = () => {
    setSponsorshipStartMonthKey(null);
    setSponsorshipEndMonthKey(null);
    setSponsorshipMonthsCount(1);
  };

  return (
    <AdminShell
      title="Booking Tools"
      subtitle="Manage sponsorship, ads and post booking availability."
      themeClassName="bg-violet-50"
      headerBorderClassName="border-violet-100"
      contentClassName="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]"
      headerRight={
        <>
          <Input
            type="password"
            placeholder="Admin token"
            value={token}
            onChange={(event) => updateToken(event.target.value)}
            className="w-64"
          />
          <Button type="button" variant="outline" onClick={clearToken}>
            Clear
          </Button>
        </>
      }
    >
        <aside className="rounded-lg border bg-background p-3">
          <nav className="grid gap-2">
            {(Object.keys(PRODUCT_LABELS) as ProductView[]).map((key) => (
              <button
                key={key}
                type="button"
                className={`rounded-md px-3 py-2 text-left text-sm ${active === key ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                onClick={() => setActive(key)}
              >
                {PRODUCT_LABELS[key]}
              </button>
            ))}
          </nav>
        </aside>

        <section className="space-y-6">
          {unauthorized && (
            <Alert variant="destructive">
              <AlertTitle>Unauthorized</AlertTitle>
              <AlertDescription>Unauthorized: check Admin Token.</AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="flex min-h-[200px] items-center justify-center rounded-lg border bg-background">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : null}

          {!loading && active === "sponsorship" && (
            <div className="space-y-6">
              <div className="rounded-lg border bg-background p-5">
                <h2 className="mb-3 text-lg font-semibold">Sponsorship availability (12 months)</h2>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <div className="inline-flex rounded-md border p-1">
                    <button
                      type="button"
                      className={`rounded px-3 py-1 text-sm ${
                        sponsorshipSelectionMode === "COUNT" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      }`}
                      onClick={() => {
                        setSponsorshipSelectionMode("COUNT");
                        setSponsorshipEndMonthKey(null);
                      }}
                    >
                      Number of months
                    </button>
                    <button
                      type="button"
                      className={`rounded px-3 py-1 text-sm ${
                        sponsorshipSelectionMode === "RANGE" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      }`}
                      onClick={() => setSponsorshipSelectionMode("RANGE")}
                    >
                      Range (2 clicks)
                    </button>
                  </div>
                  {sponsorshipSelectionMode === "COUNT" ? (
                    <div className="flex items-center gap-2">
                      <Label htmlFor="sponsorshipMonthsCount">Number of months</Label>
                      <Input
                        id="sponsorshipMonthsCount"
                        type="number"
                        min={1}
                        max={12}
                        value={sponsorshipMonthsCount}
                        onChange={(event) => {
                          const requested = Math.min(12, Math.max(1, Number(event.target.value) || 1));
                          if (!sponsorshipStartMonthKey) {
                            setSponsorshipMonthsCount(requested);
                            return;
                          }
                          const maxSelectable = sponsorshipMaxSelectableCount(sponsorshipStartMonthKey);
                          const clamped = Math.max(1, Math.min(requested, Math.max(1, maxSelectable)));
                          if (clamped < requested) {
                            toast.error("Some months were not selectable; range truncated.");
                          }
                          setSponsorshipMonthsCount(clamped);
                        }}
                        className="w-24"
                      />
                    </div>
                  ) : null}
                  <Button type="button" variant="outline" onClick={clearSponsorshipSelection}>
                    Reset selection
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {sponsorshipMonths.map((month) => {
                    const isTaken = month.taken;
                    const isPastOrCurrent = isMonthKeyPastOrCurrent(month.key, sponsorshipCurrentMonthKey);
                    const isLocked = !isTaken && isPastOrCurrent;
                    const isClickable = !isTaken && !isLocked;
                    const isSelectedStartOrEnd =
                      sponsorshipStartMonthKey === month.key || sponsorshipEndMonthKey === month.key;
                    const isInRange = sponsorshipSelectedMonths.includes(month.key);

                    const cardClass = isTaken
                      ? "bg-destructive/10"
                      : isLocked
                        ? "bg-slate-100 text-slate-600"
                        : isSelectedStartOrEnd
                          ? "border-primary bg-primary/20"
                          : isInRange
                            ? "bg-primary/10"
                            : "bg-emerald-500/10";

                    return (
                      <button
                        key={month.key}
                        type="button"
                        aria-disabled={!isClickable}
                        className={`rounded-lg border p-4 text-left ${cardClass} ${
                          isClickable ? "cursor-pointer" : "cursor-not-allowed"
                        }`}
                        onClick={() => {
                          if (!isClickable) {
                            if (isTaken) {
                              toast.error("Already taken.");
                            }
                            return;
                          }

                          if (sponsorshipSelectionMode === "COUNT") {
                            setSponsorshipStartMonthKey(month.key);
                            setSponsorshipEndMonthKey(null);
                            const maxSelectable = sponsorshipMaxSelectableCount(month.key);
                            if (sponsorshipMonthsCount > maxSelectable) {
                              setSponsorshipMonthsCount(Math.max(1, maxSelectable));
                              toast.error("Some months were not selectable; range truncated.");
                            }
                            return;
                          }

                          if (!sponsorshipStartMonthKey) {
                            setSponsorshipStartMonthKey(month.key);
                            setSponsorshipEndMonthKey(null);
                          } else if (!sponsorshipEndMonthKey) {
                            setSponsorshipEndMonthKey(month.key);
                          } else {
                            setSponsorshipStartMonthKey(month.key);
                            setSponsorshipEndMonthKey(null);
                          }
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{month.label}</span>
                          <Badge variant={isTaken ? "destructive" : "secondary"}>
                            {isTaken ? "Taken" : isLocked ? "Past" : "Available"}
                          </Badge>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <Badge variant="secondary">{sponsorshipSelectedMonths.length} selected</Badge>
                </div>
                {sponsorshipSelectedMonths.length > 0 && (
                  <div className="mt-4 rounded-md border p-4">
                    <h3 className="text-base font-semibold">Booking details</h3>
                    <BookingMetaFields state={meta} onChange={setMeta} />
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{formatMonthRange(sponsorshipSelectedMonths)}</p>
                        {sponsorshipSelectionMessage ? (
                          <p className="text-sm text-destructive">{sponsorshipSelectionMessage}</p>
                        ) : null}
                      </div>
                      <Button onClick={() => void createSponsorship()} disabled={creating || !sponsorshipCanBook}>
                        {creating ? "Creating..." : "Book selected months"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {!loading && active === "ads" && (
            <div className="space-y-6">
              <div className="grid items-stretch gap-6 rounded-lg border bg-background p-5 lg:grid-cols-[360px_minmax(0,1fr)]">
                <div className="h-full">
                  <h2 className="mb-2 text-lg font-semibold">Ads weeks (12 months)</h2>
                  <div className="h-full rounded-md border px-5 py-3">
                  <DayPicker
                    mode="single"
                    selected={adsDate}
                    onSelect={handleAdsDateSelect}
                    showWeekNumber
                    showOutsideDays
                    weekStartsOn={1}
                    modifiers={adsWeekModifiers}
                    modifiersClassNames={{
                      weekBooked: "ads-week-booked bg-red-50",
                      weekAvailable: "ads-week-available bg-green-50",
                      weekLocked: "ads-week-locked bg-slate-100",
                      weekStart: "ads-week-start",
                      weekEnd: "ads-week-end",
                    }}
                    classNames={{
                      table: "w-full border-separate border-spacing-y-2 bg-white",
                      row: "h-10 ring-1 ring-white",
                      week_number: "text-xs font-normal text-slate-400",
                      cell:
                        "p-0 [&:has(.ads-week-locked)]:bg-slate-100 [&:has(.ads-week-start)]:rounded-l-md [&:has(.ads-week-end)]:rounded-r-md overflow-hidden",
                      day: "h-10 w-10 rounded-none",
                    }}
                    className="w-full"
                  />
                  </div>
                </div>
                <div className="flex h-full flex-col gap-4 px-4 sm:px-5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarClock className="h-4 w-4" />
                    Selected week: <span className="font-medium text-foreground">{selectedAdsWeekKey || "-"}</span>
                  </div>
                  {selectedAdsWeekStatus === "LOCKED" && (
                    <p className="text-sm text-muted-foreground">Week already started.</p>
                  )}
                  {selectedAdsWeekStatus === "FULL" && (
                    <p className="text-sm text-muted-foreground">Week is full.</p>
                  )}
                  <div className="grid flex-1 gap-2 rounded-md border p-4 overflow-auto min-h-[420px]">
                    {adsWeeks.map((week) => (
                      <button
                        key={week.weekKey}
                        type="button"
                        disabled={week.status !== "AVAILABLE"}
                        onClick={() => {
                          const monday = getDateFromWeekKey(week.weekKey);
                          if (monday) {
                            setAdsDate(monday);
                          }
                        }}
                        className={`flex items-center justify-between rounded border px-3 py-2 text-sm text-left ${
                          week.status === "LOCKED"
                            ? "bg-slate-100 opacity-50 cursor-not-allowed pointer-events-none"
                            : week.status === "FULL"
                              ? "bg-red-50 opacity-90 cursor-not-allowed pointer-events-none"
                              : "bg-green-50 hover:bg-green-100"
                        }`}
                      >
                        <span>{week.weekKey}</span>
                        <Badge variant={week.status === "FULL" ? "destructive" : "secondary"}>
                          {week.remainingSlots}/{adsMaxRotation} remaining
                        </Badge>
                      </button>
                    ))}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="consecutiveWeeks">Number of consecutive weeks</Label>
                    <Input
                      id="consecutiveWeeks"
                      type="number"
                      min={1}
                      max={52}
                      value={consecutiveWeeks}
                      onChange={(e) => setConsecutiveWeeks(Math.min(52, Math.max(1, Number(e.target.value) || 1)))}
                    />
                  </div>

                  <BookingMetaFields state={meta} onChange={setMeta} />

                  <Button
                    onClick={() => void createAds()}
                    disabled={creating || !adsDate || !metaIsValid || selectedAdsWeekStatus !== "AVAILABLE"}
                  >
                    {creating ? "Creating..." : "Create booking"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {!loading && (active === "news" || active === "promo" || active === "giveaway") && (
            <div className="space-y-6">
              <div className="rounded-lg border bg-background p-5">
                <Tabs value={active} onValueChange={(value) => setActive(value as ProductView)}>
                  <TabsList>
                    <TabsTrigger value="news">News post</TabsTrigger>
                    <TabsTrigger value="promo">Promodeal post</TabsTrigger>
                    <TabsTrigger value="giveaway">Giveaway post</TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="mt-4 space-y-4">
                  <PostsAvailabilityPanel
                    days={postAvailabilityByDate}
                    selectedDayKey={selectedPostDateKey}
                    selectedHours={postHoursSelected}
                    onSelectDay={handleSelectPostDay}
                    onSelectHour={handleSelectPostHour}
                    timeZone={BUSINESS_TZ}
                  />

                  <PostsBookingForm
                    values={meta}
                    onChange={setMeta}
                    selectedSummary={selectedPostSlotsSummary}
                    canSubmit={canCreatePost}
                    onSubmit={() => void createPost()}
                    submitting={creating}
                    submitLabel="Create booking"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg border bg-background p-5">
            <h3 className="mb-3 text-lg font-semibold">Upcoming bookings</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">
                    <button type="button" className="hover:underline" onClick={() => onSortUpcoming("slot")}>Slot</button>
                  </TableHead>
                  <TableHead className="whitespace-nowrap">
                    <button type="button" className="hover:underline" onClick={() => onSortUpcoming("slotDateTime")}>Date/time</button>
                  </TableHead>
                  <TableHead>
                    <button type="button" className="hover:underline" onClick={() => onSortUpcoming("company")}>Company</button>
                  </TableHead>
                  <TableHead>
                    <button type="button" className="hover:underline" onClick={() => onSortUpcoming("status")}>Status</button>
                  </TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedUpcomingRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No upcoming bookings found.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedUpcomingRows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="whitespace-nowrap">{row.slotLabel}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatUpcomingDateTime(parseUpcomingSlotDateTime(row))}</TableCell>
                      <TableCell>{row.companyName}</TableCell>
                      <TableCell>{row.status}</TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="font-mono text-xs hover:underline"
                          title={row.orderReference}
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(row.orderReference);
                              toast.success("Order reference copied.");
                            } catch {
                              toast.error("Copy failed.");
                            }
                          }}
                        >
                          {compactOrderRef(row.orderReference)}
                        </button>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0"
                          title="Delete booking"
                          aria-label="Delete booking"
                          onClick={() => void deleteBookings(row)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>
    </AdminShell>
  );
}
