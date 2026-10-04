"use client";

import { useSyncExternalStore } from "react";

/*
  The as-of date lives in the URL (?as_of=YYYY-MM-DD), so a date view can be shared.
  A tiny external store: the server renders the default date; after hydration the
  URL value takes over. Pages with a timeline write it with replaceState.
*/

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("popstate", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("popstate", cb);
  };
}

function getSnapshot() {
  return new URLSearchParams(window.location.search).get("as_of") ?? "";
}

function getServerSnapshot() {
  return "";
}

/** Any query parameter, read after hydration ("" on the server). */
export function useUrlParam(name: string): string {
  return useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get(name) ?? "",
    getServerSnapshot,
  );
}

export function useAsOf(dates: string[], fallback: string): string {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return dates.includes(raw) ? raw : fallback;
}

export function setAsOf(date: string, fallback: string) {
  const url = new URL(window.location.href);
  if (date === fallback) url.searchParams.delete("as_of");
  else url.searchParams.set("as_of", date);
  window.history.replaceState(null, "", url);
  listeners.forEach((l) => l());
}

const noop = () => () => {};

/** False during server render and hydration, true once the page is interactive. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
