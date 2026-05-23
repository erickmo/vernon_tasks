"""Each report module exposes:

  SLUG: str
  TITLE: str
  AUDIENCE: tuple[str, ...]   # roles allowed; () means any logged-in user
  COLUMNS: list[dict]         # [{key, label, type}]
  def run(filters: dict) -> dict:
      return {"viz": {...}, "rows": [...], "narrative": [...]}
"""
