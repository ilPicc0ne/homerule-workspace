# Teach video validation insert

Use `make-check.mp4` at **00:51-00:54**, replacing the final three seconds of scene 6's diagram. The existing 112-word narration and six-second end card stay unchanged; the complete video remains 60 seconds.

The asset is a **three-second static terminal excerpt rendered from an actual completed `make check` run**, not a screen recording of the whole command or a claim that the check takes three seconds. It is 1920x1080, H.264, 30 fps, without audio. Preserve the captions from the narration in the video compositor.

Evidence is in `make-check.log` (local absolute paths normalized), the displayed `terminal.txt`, and `provenance.json`. The tested code combines #135 (`11323d8`) and #123 (`3e5533d`) on main `ab6d3d1`; its local merge revision is recorded in the JSON. Python ran 108 tests; engine/eval parity had zero differences; T1-T5 and the synthetic X001 ingestion rehearsal passed; 54/54 scored quotes were verbatim. The full check used cached model responses.

Limits are visible, not hidden: assertions remain 26/27 and tuning coverage is 23/24. Q2 expects a definite state rent-cap answer, but the requested subsidy fix leaves it unknown. Holdout coverage is 16/16 for this run, not a claim about fresh extraction stability. The cached replay also rewrote some extraction details; those artifacts were restored, and an evaluation using the committed law records confirms the same 23/24 result. These are repository checks, not an organizer score.

This completes the missing asset from issue #137. Final animation, voice, compositing and upload remain part of Silvan's production plan / issue #13. The wider PRD Teach checklist (including a separately labelled live rerun) is not claimed complete by this asset.
