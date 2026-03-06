"use client";

import { useEffect, useState } from "react";

import { COMMON_TIMEZONES, getDefaultUserTz } from "@/lib/timezone";

const USER_TZ_STORAGE_KEY = "user_tz";

export function useUserTimezone() {
  const [userTz, setUserTzState] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(USER_TZ_STORAGE_KEY);
    if (stored && COMMON_TIMEZONES.includes(stored as (typeof COMMON_TIMEZONES)[number])) {
      setUserTzState(stored);
      return;
    }

    const detected = getDefaultUserTz();
    if (detected) {
      setUserTzState(detected);
      window.localStorage.setItem(USER_TZ_STORAGE_KEY, detected);
      return;
    }

    setUserTzState(null);
  }, []);

  const setUserTz = (next: string | null) => {
    if (!next) {
      setUserTzState(null);
      window.localStorage.removeItem(USER_TZ_STORAGE_KEY);
      return;
    }

    if (!COMMON_TIMEZONES.includes(next as (typeof COMMON_TIMEZONES)[number])) {
      return;
    }

    setUserTzState(next);
    window.localStorage.setItem(USER_TZ_STORAGE_KEY, next);
  };

  return { userTz, setUserTz };
}
