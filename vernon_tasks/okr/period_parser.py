import re
from datetime import date

QUARTER_BOUNDS = {
    "Q1": ((1, 1), (3, 31)),
    "Q2": ((4, 1), (6, 30)),
    "Q3": ((7, 1), (9, 30)),
    "Q4": ((10, 1), (12, 31)),
}
HALF_BOUNDS = {
    "H1": ((1, 1), (6, 30)),
    "H2": ((7, 1), (12, 31)),
}
_QUARTER_RE = re.compile(r"^(\d{4})-Q([1-4])$")
_HALF_RE = re.compile(r"^(\d{4})-H([12])$")
_YEAR_RE = re.compile(r"^(\d{4})$")


def parse_period(value):
    if not value or not isinstance(value, str):
        return None
    m = _QUARTER_RE.match(value)
    if m:
        year = int(m.group(1))
        start, end = QUARTER_BOUNDS[f"Q{m.group(2)}"]
        return date(year, *start), date(year, *end)
    m = _HALF_RE.match(value)
    if m:
        year = int(m.group(1))
        start, end = HALF_BOUNDS[f"H{m.group(2)}"]
        return date(year, *start), date(year, *end)
    m = _YEAR_RE.match(value)
    if m:
        year = int(m.group(1))
        return date(year, 1, 1), date(year, 12, 31)
    return None
