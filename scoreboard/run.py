"""Chatbot scoreboard (issue #20): the same dated city-level questions to a plain chatbot and to HomeRule.

Arms (same model, so the only difference is the data):
- plain:        the question alone
- plain_web:    the question alone, with the provider's web search (":online")
- homerule:     the question plus HomeRule's records for that city, topic and date (scoreboard/chat.py)
Grading: Jev (a different model), blind to the arm, against the answer key in scoreboard/questions.yaml:
correct / partly / wrong. Writes scoreboard/results/results.json and scoreboard/results/SCOREBOARD.md.

python3 -m scoreboard.run
"""
import datetime as dt
import json
import random
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import yaml

from extract import llm
from scoreboard import chat as C

HERE = Path(__file__).resolve().parent
ARMS = {"plain": C.MODEL, "plain_web": C.MODEL + ":online", "homerule": C.MODEL}
GRADE = {
    "correct": "The answer states what the key requires as correct and nothing the key lists as wrong. Extra "
               "correct detail is fine; hedging is fine if the required facts are stated.",
    "partly": "The answer gets the main point but misses or muddles a deciding fact the key requires (the status "
              "on the date, the limit or start date, or what it depends on), without saying anything the key "
              "lists as wrong.",
    "wrong": "The answer says something the key lists as wrong, or misses the main point.",
}


def answer(q, arm):
    ref = f"{q['id']}:{arm}"
    try:
        if arm == "homerule":
            text, model, recs = C.ask_homerule(q["city"], q["as_of"], q["card"], ref)
            return {"text": text, "model": model, "records": {"rules": len(recs["rules"]), "findings": len(recs["findings"])}}
        text, model = C.ask_plain(q["city"], q["as_of"], q["card"], ref, ARMS[arm])
        return {"text": text, "model": model}
    except Exception as e:                       # noqa: BLE001 - a failed arm is reported, never fatal
        return {"text": None, "error": str(e)[:300]}


def grade(q, text, ref):
    state = (f"QUESTION: {C.question_text(q['city'], q['as_of'], q['card'])}\n\n"
             f"ANSWER KEY\nCorrect if: {q['key']['correct']}\nWrong if: {q['key']['wrong']}\n\n"
             f"ANSWER TO GRADE\n{text}")
    a, _ = llm.jev(state, {"grade": {"type": "choice", "criteria": GRADE,
                                     "instructions": "Grade the answer against the answer key. Judge only the "
                                                     "facts for this city on this date."}},
                   stage="scoreboard_grade", ref=ref)
    return a["grade"]


def run():
    qs = yaml.safe_load(open(HERE / "questions.yaml"))
    jobs = [(q, arm) for q in qs for arm in ARMS]
    with ThreadPoolExecutor(8) as ex:
        answers = list(ex.map(lambda j: answer(*j), jobs))
    # grade in shuffled order so position never hints at the arm
    order = list(range(len(jobs)))
    random.Random(20).shuffle(order)

    def g(i):
        q, arm = jobs[i]
        a = answers[i]
        return i, (grade(q, a["text"], f"{q['id']}:{i}") if a.get("text") else None)

    with ThreadPoolExecutor(8) as ex:
        grades = dict(ex.map(g, order))
    rows = []
    for i, (q, arm) in enumerate(jobs):
        gr = grades[i]
        rows.append({"id": q["id"], "city": q["city"], "as_of": q["as_of"], "card": q["card"], "arm": arm,
                     **answers[i], "grade": gr["choice"] if gr else "error",
                     "grade_confidence": gr["confidence"] if gr else None})
    summary = {}
    for arm in ARMS:
        rs = [r for r in rows if r["arm"] == arm]
        summary[arm] = {k: sum(r["grade"] == k for r in rs) for k in ("correct", "partly", "wrong", "error")}
        summary[arm]["n"] = len(rs)
        summary[arm]["model"] = next((r.get("model") for r in rs if r.get("model")), ARMS[arm])
    out = {"run_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"), "arms": ARMS,
           "grader": "typesafe/jev-1.13", "summary": summary, "rows": rows}
    (HERE / "results").mkdir(exist_ok=True)
    (HERE / "results" / "results.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
    (HERE / "results" / "SCOREBOARD.md").write_text(markdown(out, qs))
    return out


def markdown(out, qs):
    s = out["summary"]
    L = ["# Chatbot scoreboard", "",
         f"Run {out['run_at']}. {len(qs)} dated city-level questions (`scoreboard/questions.yaml`), built from the "
         "six card questions of the address page; answer key from the challenge guide, change tests and brief, "
         "written before any chatbot ran. Same model in every arm; grader "
         f"`{out['grader']}`, blind to the arm. Not legal advice.", "",
         "| Arm | Model | Correct | Partly | Wrong |", "|---|---|---|---|---|"]
    names = {"plain": "Plain chatbot", "plain_web": "Plain chatbot + web search", "homerule": "HomeRule"}
    for arm, v in s.items():
        L.append(f"| {names[arm]} | `{v['model']}` | **{v['correct']}/{v['n']}** | {v['partly']} | {v['wrong']}"
                 + (f" (+{v['error']} errors)" if v["error"] else "") + " |")
    L += ["", "| Question | City | Date | " + " | ".join(names[a] for a in s) + " |", "|---|---|---|" + "---|" * len(s)]
    mark = {"correct": "✓", "partly": "~", "wrong": "✗", "error": "–"}
    for q in qs:
        cells = [mark[next(r["grade"] for r in out["rows"] if r["id"] == q["id"] and r["arm"] == a)] for a in s]
        L.append(f"| {q['card']} | {q['city']} | {q['as_of']} | " + " | ".join(cells) + " |")
    return "\n".join(L) + "\n"


if __name__ == "__main__":
    o = run()
    for arm, v in o["summary"].items():
        print(f"{arm:10} {v['correct']}/{v['n']} correct, {v['partly']} partly, {v['wrong']} wrong, {v['error']} errors  ({v['model']})")
