// Map controls: Google's 3D controls, the enlarged view, the replay button and the gesture hint.
import test from "node:test";
import assert from "node:assert/strict";
import { CARD_SHOWS_3D_UI, HINT_POINTER, HINT_TOUCH, afterDialogClose, hintText, map3dSettings, replayLabel, replayPlan, showHint } from "../lib/map-ui.ts";
import { buildingCamera, cityCamera } from "../lib/map-view.ts";

test("card is cooperative; the enlarged view is greedy and always shows Google's controls", () => {
  assert.deepEqual(map3dSettings("card", true), { gestureHandling: "COOPERATIVE", defaultUIHidden: false });
  assert.deepEqual(map3dSettings("card", false), { gestureHandling: "COOPERATIVE", defaultUIHidden: true });
  assert.deepEqual(map3dSettings("dialog", false), { gestureHandling: "GREEDY", defaultUIHidden: false });
  assert.deepEqual(map3dSettings("dialog"), { gestureHandling: "GREEDY", defaultUIHidden: false });
  assert.equal(map3dSettings("card").defaultUIHidden, !CARD_SHOWS_3D_UI);
});

test("closing the modal shows the map inline again; the close that precedes showModal is ignored", () => {
  assert.equal(afterDialogClose(false), "show-inline");
  assert.equal(afterDialogClose(true), "keep");
});

test("hint text per device", () => {
  assert.equal(hintText(true), HINT_TOUCH);
  assert.equal(hintText(false), HINT_POINTER);
  assert.match(HINT_POINTER, /⌘\/Ctrl \+ scroll to zoom/);
  assert.match(HINT_TOUCH, /pinch to zoom/);
});

test("hint only on the first view, gone after the first interaction", () => {
  assert.equal(showHint(null, false), true);
  assert.equal(showHint(undefined, false), true);
  assert.equal(showHint(null, true), false);
  assert.equal(showHint("1", false), false);
});

test("replay flies from the city shot to the building; reduced motion jumps", () => {
  const coords = { lon: -71.06, lat: 42.36 };
  const end = buildingCamera(coords, 12);
  const start = cityCamera([[[-71.1, 42.3], [-71.0, 42.3], [-71.0, 42.4], [-71.1, 42.3]]], coords)!;
  assert.deepEqual(replayPlan(start, end, false), { kind: "fly", from: start, to: end });
  assert.deepEqual(replayPlan(start, end, true), { kind: "jump", camera: end });
  assert.deepEqual(replayPlan(null, end, false), { kind: "jump", camera: end });
  assert.deepEqual(replayPlan(start, null, false), { kind: "jump", camera: start });
  assert.equal(replayPlan(null, null, false), null);
});

test("replay button names what it does", () => {
  assert.equal(replayLabel(false, true), "Replay the fly-in");
  assert.equal(replayLabel(true, true), "Back to the building");
  assert.equal(replayLabel(false, false), "Back to the city view");
});
