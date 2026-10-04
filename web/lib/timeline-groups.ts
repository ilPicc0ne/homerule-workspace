import type { TimelineEvent } from "./address-view.ts";

export type TimelineGroup = { date: string; events: TimelineEvent[] };
/** Preserve chronological input order and every change, with one navigation target per day. */
export function groupTimelineEvents(events: TimelineEvent[]): TimelineGroup[] {
  const groups = new Map<string, TimelineEvent[]>();
  for (const event of events) {
    const group = groups.get(event.date) ?? [];
    group.push(event);
    groups.set(event.date, group);
  }
  return [...groups].map(([date, events]) => ({ date, events }));
}
