/* Controls around the address map: Google's own 3D controls, the enlarged (modal) view, the
   replay of the fly-in and the one-line gesture hint. Pure functions, testable with node --test. */

import type { Camera } from "./map-view.ts";

export type MapPlace = "card" | "dialog";
export type Gestures = "COOPERATIVE" | "GREEDY";

/**
 * Google's zoom / compass / tilt controls on the small card: off. Google hides them by itself at
 * card size (checked 04.10.2026 at 378×258, 834×236 and 358×200 px), so they live in the enlarged
 * view; switching them off here keeps the card the same whatever Google's size threshold.
 */
export const CARD_SHOWS_3D_UI = false;

/**
 * Map3DElement settings per place: on the page the map is cooperative (plain scroll scrolls the
 * page; ⌘/Ctrl + scroll or two fingers move the map). In the enlarged view plain scroll and drag
 * zoom and pan, and Google's controls are always shown.
 */
export function map3dSettings(place: MapPlace, cardUI: boolean = CARD_SHOWS_3D_UI): { gestureHandling: Gestures; defaultUIHidden: boolean } {
  return place === "dialog"
    ? { gestureHandling: "GREEDY", defaultUIHidden: false }
    : { gestureHandling: "COOPERATIVE", defaultUIHidden: !cardUI };
}

/** localStorage key: set once the visitor has touched the 3D map, so the hint stays away. */
export const HINT_SEEN_KEY = "homerule.map3dHintSeen";

export const HINT_POINTER = "Drag to look around · ⌘/Ctrl + scroll to zoom";
export const HINT_TOUCH = "Two fingers to move · pinch to zoom";

/** The hint for this device: touch (coarse pointer) or mouse/trackpad. */
export function hintText(coarsePointer: boolean): string {
  return coarsePointer ? HINT_TOUCH : HINT_POINTER;
}

/** Shown on the first view only: not once the visitor has interacted, now or on an earlier visit. */
export function showHint(stored: string | null | undefined, interacted: boolean): boolean {
  return !interacted && stored !== "1";
}

/** Events on the 3D map that count as the first interaction (hide the hint). */
export const INTERACTION_EVENTS = ["pointerdown", "wheel", "touchstart", "keydown"] as const;

export type ReplayStep = { kind: "jump"; camera: Camera } | { kind: "fly"; from: Camera; to: Camera };

/**
 * The ↻ button: fly in again from the city shot to the building. With reduced motion, or when
 * there is nothing to fly to (no pin), it jumps straight to the final shot (or the city shot).
 */
export function replayPlan(start: Camera | null, end: Camera | null, reduceMotion: boolean): ReplayStep | null {
  if (!end) return start ? { kind: "jump", camera: start } : null;
  if (reduceMotion || !start) return { kind: "jump", camera: end };
  return { kind: "fly", from: start, to: end };
}

/** Accessible name of the ↻ button, matching what it does. */
export function replayLabel(reduceMotion: boolean, hasTarget: boolean): string {
  if (!hasTarget) return "Back to the city view";
  return reduceMotion ? "Back to the building" : "Replay the fly-in";
}

/**
 * The 3D map lives in one <dialog> that is shown inline (non-modal) on the card and modal when
 * enlarged, so the Map3DElement is never re-created or moved and Google is loaded once.
 * After a `close` event (Esc or the close button) the card shows the map inline again.
 */
export function afterDialogClose(stillOpen: boolean): "keep" | "show-inline" {
  return stillOpen ? "keep" : "show-inline";
}
