"use client";

import { useEffect, useMemo, useState } from "react";
import { PostsCalendar } from "@/components/public/PostsCalendar";
import { StatusTile } from "@/components/public/StatusTile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveTimeZoneDateTimeToUtc } from "@/lib/timezone";

type ProductType = "sponsorship" | "ads" | "news" | "promo" | "giveaway";
type AvailabilityStatus = "available" | "taken" | "locked";

type DraftResponse = {
  draft: {
    orderId: string;
    email: string;
    productType: ProductType;
    durationWeeks: number | null;
    status: "DRAFT" | "SUBMITTED" | "APPROVED" | "CANCELLED";
    title: string | null;
    body: string | null;
    booking: {
      id: string;
      status: "DRAFT_RESERVED" | "SUBMITTED" | "CANCELLED" | "PUBLISHED";
      monthKey: string | null;
      weekKey: string | null;
      startsAtUtc: string | null;
      expiresAt: string | null;
    } | null;
  };
};

type SponsorshipResponse = {
  months: { monthKey: string; status: AvailabilityStatus }[];
};

type AdsResponse = {
  weeks: { weekKey: string; status: AvailabilityStatus; remainingSlots: number; totalSlots: number }[];
};

type PostsResponse = {
  days: Record<string, { dayStatus: AvailabilityStatus; hours: Record<number, AvailabilityStatus> }>;
};

function toPostsProduct(product: ProductType): "NEWS" | "PROMO_DEAL" | "GIVEAWAY" {
  if (product === "promo") return "PROMO_DEAL";
  if (product === "giveaway") return "GIVEAWAY";
  return "NEWS";
}

function localDatetime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Brussels",
  }).format(new Date(value));
}

type SubmitPageClientProps = {
  token: string;
};

export function SubmitPageClient({ token }: SubmitPageClientProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftResponse["draft"] | null>(null);

  const [months, setMonths] = useState<SponsorshipResponse["months"]>([]);
  const [weeks, setWeeks] = useState<AdsResponse["weeks"]>([]);
  const [postDays, setPostDays] = useState<PostsResponse["days"]>({});

  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(null);
  const [selectedPostDayKey, setSelectedPostDayKey] = useState<string | null>(null);
  const [selectedPostHour, setSelectedPostHour] = useState<number | null>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [reserving, setReserving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadDraft = async () => {
    const response = await fetch(`/api/submit/bootstrap?token=${encodeURIComponent(token)}`);
    const data = (await response.json()) as DraftResponse | { code?: string; message?: string };
    if (!response.ok || !("draft" in data)) {
      throw new Error("message" in data && data.message ? data.message : "Token verification failed");
    }
    setDraft(data.draft);
    setTitle(data.draft.title ?? "");
    setBody(data.draft.body ?? "");
    return data.draft;
  };

  const loadAvailability = async (productType: ProductType) => {
    if (productType === "sponsorship") {
      const response = await fetch("/api/public/availability/sponsorship");
      const data = (await response.json()) as SponsorshipResponse;
      setMonths(data.months ?? []);
      return;
    }

    if (productType === "ads") {
      const response = await fetch("/api/public/availability/ads");
      const data = (await response.json()) as AdsResponse;
      setWeeks(data.weeks ?? []);
      return;
    }

    const response = await fetch(`/api/public/availability/posts?product=${productType.toUpperCase()}`);
    const data = (await response.json()) as PostsResponse;
    setPostDays(data.days ?? {});
  };

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const nextDraft = await loadDraft();
      await loadAvailability(nextDraft.productType);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load submission");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  useEffect(() => {
    if (!months.length) return;
    if (selectedMonthKey && months.some((month) => month.monthKey === selectedMonthKey)) return;
    const firstAvailable = months.find((month) => month.status === "available");
    setSelectedMonthKey(firstAvailable?.monthKey ?? months[0].monthKey);
  }, [months, selectedMonthKey]);

  useEffect(() => {
    if (!weeks.length) return;
    if (selectedWeekKey && weeks.some((week) => week.weekKey === selectedWeekKey)) return;
    const firstAvailable = weeks.find((week) => week.status === "available");
    setSelectedWeekKey(firstAvailable?.weekKey ?? weeks[0].weekKey);
  }, [weeks, selectedWeekKey]);

  const selectedPostStatus = useMemo(() => {
    if (!selectedPostDayKey || selectedPostHour == null) return null;
    return postDays[selectedPostDayKey]?.hours?.[selectedPostHour] ?? null;
  }, [postDays, selectedPostDayKey, selectedPostHour]);

  const selectedMonth = months.find((month) => month.monthKey === selectedMonthKey) ?? null;
  const selectedWeek = weeks.find((week) => week.weekKey === selectedWeekKey) ?? null;

  const canReserve = useMemo(() => {
    if (!draft) return false;
    if (draft.status === "SUBMITTED" || draft.booking?.status === "SUBMITTED") return false;

    if (draft.productType === "sponsorship") return selectedMonth?.status === "available";
    if (draft.productType === "ads") return selectedWeek?.status === "available";
    return selectedPostStatus === "available";
  }, [draft, selectedMonth, selectedPostStatus, selectedWeek]);

  const reserveSlot = async () => {
    if (!draft || !canReserve) return;
    setReserving(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = { token };
      if (draft.productType === "sponsorship") payload.monthKey = selectedMonthKey;
      if (draft.productType === "ads") payload.weekKey = selectedWeekKey;
      if (draft.productType === "news" || draft.productType === "promo" || draft.productType === "giveaway") {
        if (!selectedPostDayKey || selectedPostHour == null) {
          throw new Error("Select an available day and hour");
        }
        const [year, month, day] = selectedPostDayKey.split("-").map((v) => Number(v));
        const startsAtUtc = resolveTimeZoneDateTimeToUtc(year, month, day, selectedPostHour, 0, "Europe/Brussels");
        payload.startsAtUtc = startsAtUtc.toISOString();
      }

      const response = await fetch("/api/submit/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { code?: string };
      if (!response.ok) {
        throw new Error(data.code ?? "Reservation failed");
      }

      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reservation failed");
    } finally {
      setReserving(false);
    }
  };

  const submitContent = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/submit/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, title, body }),
      });
      const data = (await response.json()) as { code?: string };
      if (!response.ok) {
        throw new Error(data.code ?? "Submission failed");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="rounded-md border bg-white p-4 text-sm text-muted-foreground">Loading submission...</div>;
  }

  if (error || !draft) {
    return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error ?? "Invalid submission link"}</div>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-md border bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Order {draft.orderId}</h2>
          <Badge variant="secondary">{draft.productType.toUpperCase()}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{draft.email}</p>
        {draft.durationWeeks ? (
          <p className="mt-1 text-sm text-muted-foreground">Duration: {draft.durationWeeks} week(s)</p>
        ) : null}
      </section>

      <section className="rounded-md border bg-white p-4">
        <h3 className="text-base font-semibold">1. Select and reserve a slot</h3>

        {draft.productType === "sponsorship" ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {months.map((month) => (
              <StatusTile
                key={month.monthKey}
                status={month.status}
                selected={month.monthKey === selectedMonthKey}
                onClick={() => setSelectedMonthKey(month.monthKey)}
                title={month.monthKey}
                subtitle={month.status}
              />
            ))}
          </div>
        ) : null}

        {draft.productType === "ads" ? (
          <div className="mt-3 grid gap-2">
            {weeks.map((week) => (
              <StatusTile
                key={week.weekKey}
                status={week.status}
                selected={week.weekKey === selectedWeekKey}
                onClick={() => setSelectedWeekKey(week.weekKey)}
                title={week.weekKey}
                subtitle={`${week.remainingSlots}/${week.totalSlots} remaining`}
              />
            ))}
          </div>
        ) : null}

        {(draft.productType === "news" || draft.productType === "promo" || draft.productType === "giveaway") ? (
          <div className="mt-3">
            <PostsCalendar
              product={toPostsProduct(draft.productType)}
              selectedDayKey={selectedPostDayKey}
              onSelectDayKey={setSelectedPostDayKey}
              selectedHour={selectedPostHour}
              onSelectHour={setSelectedPostHour}
            />
          </div>
        ) : null}

        <div className="mt-4 flex items-center gap-3">
          <Button type="button" disabled={!canReserve || reserving} onClick={() => void reserveSlot()}>
            {reserving ? "Reserving..." : "Reserve selected slot"}
          </Button>
          {draft.booking?.status === "DRAFT_RESERVED" && draft.booking.expiresAt ? (
            <p className="text-sm text-muted-foreground">
              Reserved until {localDatetime(draft.booking.expiresAt)} (Europe/Brussels)
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-md border bg-white p-4">
        <h3 className="text-base font-semibold">2. Submit content</h3>
        <div className="mt-3 grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="submit-title">Title</Label>
            <Input id="submit-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="submit-body">Body</Label>
            <textarea
              id="submit-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={8}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <Button
            type="button"
            onClick={() => void submitContent()}
            disabled={
              submitting ||
              !(draft.booking?.status === "DRAFT_RESERVED" || draft.booking?.status === "SUBMITTED") ||
              !title.trim() ||
              !body.trim()
            }
          >
            {submitting ? "Submitting..." : "Submit"}
          </Button>
        </div>
      </section>
    </div>
  );
}
