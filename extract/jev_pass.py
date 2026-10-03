"""The bounded-decision pass: one Jev call per document over candidates found by code.

Questions: document type and status; per section its content type and category;
per date what it marks. Jev only chooses among the listed options.
"""
import json
from concurrent.futures import ThreadPoolExecutor

from . import config, llm
from .corpus import load_text

CATEGORIES = {
    "rent_increase_limits": "Limits on how much or how often rent may be increased; rent control or rent stabilization coverage.",
    "just_cause_eviction": "When and why a landlord may end a tenancy or evict; eviction notices; relocation assistance.",
    "security_deposits": "Security deposits: maximum amount, uses and deductions, interest, return deadlines.",
    "application_screening_fees": "Fees or charges for rental applications or tenant screening; limits on upfront charges such as broker fees.",
    "screening_restrictions": "Limits on how applicants may be screened or chosen: criminal history, source of income, credit, discrimination.",
    "algorithmic_rent_setting": "Software or algorithms that set or recommend rents, including bans on shared pricing algorithms.",
    "none": "None of the above housing topics, or not a legal rule at all.",
}
CONTENT = {
    "rule": "States a duty, limit, prohibition, cap or right (e.g. 'a landlord shall not demand more than ...').",
    "exception_or_scope": "Says who or what is covered or not covered, or creates an exception to another provision "
                          "(e.g. 'This section shall not apply to ...', 'Notwithstanding paragraph (1) ...').",
    "definition": "Defines a term used elsewhere.",
    "procedure_or_remedy": "Notice, filing, timing, enforcement, penalties, damages or other remedies.",
    "findings_or_intent": "Legislative findings, declarations, purpose or intent, with no operative duty.",
    "dates_or_history": "When the law takes effect, becomes operative or is repealed, or its enactment history.",
    "boilerplate": "Website navigation, page furniture or a bare heading with no legal content.",
}
DATE_KIND = {
    "enacted_or_signed": "The law was signed, approved, chaptered or enacted on this date.",
    "takes_effect": "The law or one of its provisions takes effect on this date.",
    "becomes_operative": "A provision becomes operative on this date (stated separately from taking effect).",
    "repealed_or_expires": "The law or provision is repealed or expires on this date.",
    "legislative_step": "A bill was filed, referred, reported, amended or had another legislative action on this date.",
    "condition_inside_rule": "The date is part of a rule's condition, e.g. buildings built before it or deposits collected after it.",
    "page_or_publication": "The page or notice was published, updated or retrieved on this date.",
    "other": "Something else.",
}
DOC_TYPE = {
    "code_section": "The official text of a code section or general law as currently in force.",
    "enacted_act": "The text of an enacted act, chaptered bill or session law.",
    "bill_text": "The text of a bill that has not (yet) been enacted.",
    "bill_status": "A bill's status or history page.",
    "ordinance_text": "The text of a city ordinance or municipal code chapter.",
    "agency_summary": "A government agency's explanation, guide, notice or announcement about the law.",
    "other": "Anything else, e.g. news or a page without legal content.",
}
DOC_STATUS = {
    "enacted": "The law it describes has been enacted (whether or not it is in effect yet).",
    "pending": "It describes a proposal or bill that has not been enacted.",
    "failed": "It describes a measure that failed, was struck or was withdrawn.",
    "mixed_or_unclear": "Several statuses, or no way to tell.",
}


def own_text(text, sections, i):
    """A section's text up to its first child, so the question targets this level."""
    s = sections[i]
    children = [c["start"] for c in sections if c is not s and s["start"] < c["start"] < s["end"]]
    return text[s["start"]:min(children) if children else s["end"]]


def section_targets(entry, text):
    secs = entry["sections"]
    out = []
    for i, s in enumerate(secs):
        body = own_text(text, secs, i).strip()
        if sum(ch.isalpha() for ch in body) < 25:
            continue
        out.append((i, s["path"], body))
    return out


def questions_for(entry, text, max_snippet=220):
    q = {"doc_type": {"type": "choice", "instructions": "What kind of document is this?", "criteria": DOC_TYPE},
         "doc_status": {"type": "choice", "instructions": "What is the legal status of the main law or measure this document is about?",
                        "criteria": DOC_STATUS}}
    for i, path, body in section_targets(entry, text):
        snippet = " ".join(body.split())[:max_snippet]
        where = f'the passage that begins "{snippet}"'
        q[f"s{i}_type"] = {"type": "choice", "criteria": CONTENT,
                           "instructions": f"Consider only {where}. What kind of content is that passage?"}
        q[f"s{i}_cat"] = {"type": "choice", "criteria": CATEGORIES,
                          "instructions": f"Consider only {where}. Which housing topic does that passage regulate?"}
    for j, d in enumerate(entry["dates"]):
        ctx = " ".join(text[max(entry["body_start"], d["start"] - 160):d["end"] + 80].split())
        q[f"d{j}_kind"] = {"type": "choice", "criteria": DATE_KIND,
                           "instructions": f'The date "{d["text"]}" appears in this passage: "...{ctx}...". What does this date mark?'}
    return q


def run_single(doc_id, chunk=None):
    entry = json.load(open(config.INDEX / f"{doc_id}.json"))
    text = load_text(entry)
    state = text[entry["body_start"]:]
    qs = questions_for(entry, text)
    items = list(qs.items())
    groups = [items] if not chunk else [items[k:k + chunk] for k in range(0, len(items), chunk)]
    answers, usage = {}, []
    for g in groups:
        a, u = llm.jev(state, dict(g), stage="jev_pass", ref=doc_id)
        answers.update(a)
        usage.append(u)
    return entry, answers, usage


def run_per_section(doc_id, workers=8):
    entry = json.load(open(config.INDEX / f"{doc_id}.json"))
    text = load_text(entry)

    def one(target):
        i, path, body = target
        q = {"type": {"type": "choice", "criteria": CONTENT, "instructions": "What kind of content is this passage?"},
             "cat": {"type": "choice", "criteria": CATEGORIES, "instructions": "Which housing topic does this passage regulate?"}}
        a, u = llm.jev(f"Section {path}:\n{body[:6000]}", q, stage="jev_per_section", ref=f"{doc_id}:{path}")
        return i, a, u

    with ThreadPoolExecutor(workers) as ex:
        results = list(ex.map(one, section_targets(entry, text)))
    answers = {}
    for i, a, _ in results:
        answers[f"s{i}_type"], answers[f"s{i}_cat"] = a["type"], a["cat"]
    return entry, answers, [u for _, _, u in results]


# ---------- focused calls: one kind of question per call, full document as state, run in parallel ----------
DOC_CATEGORY = {**CATEGORIES}


def focused_questions(entry, text):
    """J1 document, J2 section content type, J3 section category, J4 dates: four separate question sets."""
    allq = questions_for(entry, text)
    j1 = {k: allq[k] for k in ("doc_type", "doc_status")}
    j1["doc_category"] = {"type": "choice", "criteria": DOC_CATEGORY,
                          "instructions": "Which housing topic is the main subject of this document?"}
    j2 = {k: v for k, v in allq.items() if k.endswith("_type") and k.startswith("s")}
    j3 = {k: v for k, v in allq.items() if k.endswith("_cat")}
    j4 = {k: v for k, v in allq.items() if k.startswith("d") and k.endswith("_kind")}
    return {"J1": j1, "J2": j2, "J3": j3, "J4": j4}


def run_focused(doc_id, max_state=100000):
    entry = json.load(open(config.INDEX / f"{doc_id}.json"))
    text = load_text(entry)
    state = text[entry["body_start"]:][:max_state]
    groups = {k: v for k, v in focused_questions(entry, text).items() if v}

    def one(item):
        name, qs = item
        a, u = llm.jev(state, qs, stage=f"jev_{name}", ref=doc_id)
        return a, u

    answers, usage = {}, []
    with ThreadPoolExecutor(len(groups)) as ex:
        for a, u in ex.map(one, groups.items()):
            answers.update(a)
            usage.append(u)
    return entry, answers, usage
