"""Building facts for sample addresses, as ranges, with provenance and named inferences.

A test-local stand-in for Silvan's out/addresses.resolved.json (interface I3): legal city
comes from the postal city plus the neighbourhood aliases in the jurisdiction list.
"""
import csv
import re

from extract import config

NEIGHBOURHOODS = {"Dorchester": "Boston", "Roxbury": "Boston", "East Boston": "Boston", "Brighton": "Boston",
                  "Allston": "Boston", "South Boston": "Boston", "Jamaica Plain": "Boston", "Hyde Park": "Boston",
                  "Mattapan": "Boston", "San Ysidro": "San Diego"}

# use description -> (units interval, use class); dataset code tables
UNIT_PATTERNS = [
    (r"Five or more apartments", (5, None), "apartment"),
    (r"\(5\+ units\)", (5, None), "apartment"),
    (r"APT (\d+)-(\d+) UNITS", "range", "apartment"),
    (r"Apartment 5 to 14 Units|Flats 5 to 14 units", (5, 14), "apartment"),
    (r"Flat & Store 5 to 14 units", (5, 14), "mixed_use"),
    (r"Apartment 15 Units or more", (15, None), "apartment"),
    (r"TIC Bldg 4 units or less", (1, 4), "tic"),
    (r"MXD >8-UNIT-APT", (9, None), "mixed_use"),
    (r">8-UNIT-APT", (9, None), "apartment"),
    (r"(\d+)-(\d+)-UNIT-APT", "range", "apartment"),
    (r"(\d+)U\b", "exact", "apartment"),
]


class Fact:
    def __init__(self, lo=None, hi=None, values=None, known=True, source="", assumption=None, conflict=False):
        self.lo, self.hi, self.values, self.known = lo, hi, values, known
        self.source, self.assumption, self.conflict = source, assumption, conflict

    def __repr__(self):
        if not self.known:
            return "unknown" + (" (conflict)" if self.conflict else "")
        return f"{self.values}" if self.values is not None else f"[{self.lo}, {self.hi}]"


UNKNOWN = Fact(known=False)


def units_from_description(desc):
    for pat, val, cls in UNIT_PATTERNS:
        m = re.search(pat, desc)
        if not m:
            continue
        if val == "range":
            return (int(m.group(1)), int(m.group(2))), cls
        if val == "exact":
            return (int(m.group(1)), int(m.group(1))), cls
        return val, cls
    return None, None


def address_facts(row):
    f = {}
    city = NEIGHBOURHOODS.get(row["postal_city"], row["postal_city"])
    f["address.city"] = Fact(values=[f"{city}, {row['state']}"], source="postal city + neighbourhood aliases")
    f["address.state"] = Fact(values=[row["state"]], source="CSV")
    desc = row["use_description"]
    interval, use_class = units_from_description(desc)
    if row["state"] == "NJ" and row["use_code"] == "4C":
        use_class = "apartment"
        if interval is None:
            interval = (5, None)   # NJ property class 4C: apartments, more than four units [assumed: N.J.A.C. 18:12-2.2]
    if row["use_code"].startswith("A/"):
        use_class = "elderly" if "ELDERLY" in desc else "apartment"
        interval = interval or (7, None)   # Boston land use A: 7 or more units [assumed: assessing code table]
    if row["units"]:
        n = int(row["units"])
        if interval and not (interval[0] <= n <= (interval[1] or 10 ** 9)):
            f["building.units"] = Fact(known=False, conflict=True, source=f"units={n} vs '{desc}'")
        else:
            f["building.units"] = Fact(n, n, source="CSV units")
    elif interval:
        f["building.units"] = Fact(interval[0], interval[1], source=f"use description '{desc}'")
    f["building.use_class"] = Fact(values=[use_class]) if use_class else UNKNOWN
    if row["year_built"]:
        y = int(row["year_built"])
        f["building.year_built"] = Fact(y, y, source="CSV year_built")
        f["building.built_date"] = Fact(f"{y}-01-01", f"{y}-12-31", source="CSV year_built")
        f["building.certificate_date"] = Fact(f"{y}-01-01", f"{y}-12-31", source="CSV year_built",
                                              assumption="co_from_year_built")
    # the parcel is one whole rental building and its owner is the landlord
    units = f.get("building.units")
    if use_class in ("apartment", "mixed_use", "elderly") and units and units.known:
        f["landlord.portfolio_units"] = Fact(units.lo, None, source="building units",
                                             assumption="portfolio_lower_bound")
    if use_class in ("apartment", "mixed_use", "elderly"):
        f["building.separately_alienable"] = Fact(values=[False], source="whole-building rental parcel")
    subsidised = "SUBSD" in desc
    if subsidised:
        f["building.affordable_restricted"] = Fact(values=[True], source=f"use description '{desc}'")
    elif use_class:
        f["building.affordable_restricted"] = Fact(values=[False], source="no affordability code in the parcel record",
                                                   assumption="no_recorded_affordability_restriction")
    return f


def load():
    return {r["address_id"]: r for r in csv.DictReader(open(config.ADDRESSES, encoding="utf-8"))}
