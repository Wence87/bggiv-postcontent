"use client";

import { useEffect, useState } from "react";

import { AdsCalendar } from "@/components/public/AdsCalendar";
import { PostsCalendar, type PublicPostProduct } from "@/components/public/PostsCalendar";
import { SponsorshipCalendar } from "@/components/public/SponsorshipCalendar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type PublicMainTab = "sponsorship" | "ads" | "posts";

export function PublicCalendar() {
  const [tab, setTab] = useState<PublicMainTab>("sponsorship");
  const [postsTab, setPostsTab] = useState<PublicPostProduct>("NEWS");
  const [selectedPostDayKey, setSelectedPostDayKey] = useState<string | null>(null);
  const [selectedPostHour, setSelectedPostHour] = useState<number | null>(null);

  useEffect(() => {
    setSelectedPostHour(null);
  }, [postsTab]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <section className="space-y-4 rounded-xl border bg-background p-5 shadow-sm">
        <Tabs value={tab} onValueChange={(value) => setTab(value as PublicMainTab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="sponsorship">Sponsorship</TabsTrigger>
            <TabsTrigger value="ads">Ads</TabsTrigger>
            <TabsTrigger value="posts">Posts</TabsTrigger>
          </TabsList>
        </Tabs>

        {tab === "sponsorship" ? <SponsorshipCalendar /> : null}

        {tab === "ads" ? <AdsCalendar /> : null}

        {tab === "posts" ? (
          <div className="space-y-4">
            <Tabs value={postsTab} onValueChange={(value) => setPostsTab(value as PublicPostProduct)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="NEWS">News post</TabsTrigger>
                <TabsTrigger value="PROMO_DEAL">Promo deal</TabsTrigger>
                <TabsTrigger value="GIVEAWAY">Giveaway</TabsTrigger>
              </TabsList>
            </Tabs>

            <PostsCalendar
              product={postsTab}
              selectedDayKey={selectedPostDayKey}
              onSelectDayKey={setSelectedPostDayKey}
              selectedHour={selectedPostHour}
              onSelectHour={setSelectedPostHour}
            />
          </div>
        ) : null}
      </section>

      <aside className="space-y-4 rounded-xl border bg-background p-5 shadow-sm">
        <div>
          <h2 className="text-base font-semibold">Legend</h2>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-md border border-white/60 bg-green-50 px-3 py-2">
              <span>Available</span>
              <Badge variant="secondary">Green</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border border-white/60 bg-red-50 px-3 py-2">
              <span>Taken</span>
              <Badge variant="destructive">Red</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border border-white/60 bg-slate-200 px-3 py-2">
              <span>Locked</span>
              <Badge variant="secondary">Gray</Badge>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4 text-sm">
          <h3 className="font-semibold">Rules</h3>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
            <li>Locked = too soon / current / past not bookable.</li>
            <li>Taken = already booked.</li>
            <li>Available = can be booked (admin-only).</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
