"""VT Project controller — Project domain.

Layer: Frappe DocType controller (Layer 2, Priority 1 per vernon-dev
Frappe Hooks-First rule). Owns Project lifecycle plus a set of
user-relationship helpers used by API permission checks.

Source of truth: docs/domains/project/README.html.
ADR-022 — REST-first, hooks-for-logic.
"""
import re

import frappe
from frappe.model.document import Document
from frappe.utils import getdate

# --- Validation caps ------------------------------------------------------
PROJECT_TITLE_MAX_LEN = 200
_WHITESPACE_RUN = re.compile(r"\s+")

# --- PDCA state machine (mirrors Objective) ------------------------------
VALID_PDCA_TRANSITIONS = {
	"PLAN": ["DO"],
	"DO": ["CHECK"],
	"CHECK": ["ACT", "CLOSED"],
	"ACT": ["PLAN", "DO"],
	"CLOSED": [],
}
PDCA_TERMINAL = "CLOSED"
STATUS_CLOSED = "Closed"

# Linked downstream doctypes — deleting a project with children would
# orphan tasks / sprints. Blocked at on_trash.
LINKED_DOCTYPES = (
	("VT Task", "project"),
	("VT Sprint", "project"),
)


def _normalize_title(raw: str | None) -> str:
	"""Trim + collapse whitespace runs to a single space."""
	if not raw:
		return ""
	return _WHITESPACE_RUN.sub(" ", raw).strip()


class VTProject(Document):
	"""Project entity — collection of tasks/sprints scoped by Brand."""

	def validate(self) -> None:
		self._validate_title()
		self._validate_dates()
		self._validate_pdca_transition()
		self._sync_status_with_pdca()
		self._validate_team_excludes_owner_leader()
		self._validate_objective_brand()
		# Child rows: explicit invoke because Frappe doesn't auto-call.
		for row in (self.team_members or []):
			row.run_method("validate")
		for row in (self.milestones or []):
			row.run_method("validate")
		for row in (self.documentation or []):
			row.run_method("validate")

	def _validate_title(self) -> None:
		"""Normalize + cap title."""
		self.title = _normalize_title(self.title)
		if not self.title:
			frappe.throw("Judul project wajib diisi", frappe.MandatoryError)
		if len(self.title) > PROJECT_TITLE_MAX_LEN:
			frappe.throw(
				f"Judul project maksimal {PROJECT_TITLE_MAX_LEN} karakter",
				frappe.ValidationError,
			)

	def _validate_dates(self) -> None:
		"""end_date strictly after start_date."""
		if self.end_date and self.start_date:
			if getdate(self.end_date) <= getdate(self.start_date):
				frappe.throw(
					"End Date harus setelah Start Date",
					frappe.ValidationError,
				)

	def _validate_pdca_transition(self) -> None:
		"""Reject illegal PDCA moves."""
		if self.is_new():
			return
		old_phase = frappe.db.get_value("VT Project", self.name, "pdca_phase")
		if old_phase == self.pdca_phase:
			return
		allowed = VALID_PDCA_TRANSITIONS.get(old_phase, [])
		if self.pdca_phase not in allowed:
			frappe.throw(
				f"Transisi PDCA tidak valid: {old_phase} → {self.pdca_phase}. "
				f"Yang diperbolehkan: {', '.join(allowed) or '(tidak ada)'}",
				frappe.ValidationError,
			)

	def _sync_status_with_pdca(self) -> None:
		"""When PDCA reaches CLOSED, force status to Closed for dashboard consistency."""
		if self.pdca_phase == PDCA_TERMINAL:
			self.status = STATUS_CLOSED

	def _validate_objective_brand(self) -> None:
		"""When linked Objective is set, its brand must equal project.brand.

		Prevents OKR drift — a Brand A project bound to a Brand B objective
		would smear rollup metrics across brands.
		"""
		if not (self.objective and self.brand):
			return
		obj_brand = frappe.db.get_value("Objective", self.objective, "brand")
		if obj_brand and obj_brand != self.brand:
			frappe.throw(
				f"Linked Objective bermilik brand '{obj_brand}', tapi Project ini "
				f"di brand '{self.brand}'. Pilih Objective dengan brand sama "
				"atau kosongkan.",
				frappe.ValidationError,
			)

	def _validate_team_excludes_owner_leader(self) -> None:
		"""Owner / Leader cannot also be a row in team_members (avoids double-counting)."""
		blocked = {u for u in (self.project_owner, self.project_leader) if u}
		for row in self.team_members or []:
			if row.user in blocked:
				role = "Owner" if row.user == self.project_owner else "Leader"
				frappe.throw(
					f"{row.user} sudah jadi Project {role}; tidak boleh "
					"ditambahkan lagi sebagai Team Member",
					frappe.ValidationError,
				)

	def on_trash(self) -> None:
		"""Block delete when VT Task or VT Sprint still link here."""
		blockers: list[str] = []
		for doctype, fk in LINKED_DOCTYPES:
			count = frappe.db.count(doctype, {fk: self.name})
			if count:
				blockers.append(f"{count} {doctype}")
		if blockers:
			frappe.throw(
				"Project masih dipakai oleh: " + ", ".join(blockers)
				+ ". Hapus / pindahkan dulu sebelum menghapus project.",
				frappe.ValidationError,
			)


# --- User-relationship helpers (used by API permission checks) -----------

def is_user_owner(project_name: str, user: str) -> bool:
	"""Return True iff `user` is the project_owner of `project_name`."""
	return frappe.db.get_value("VT Project", project_name, "project_owner") == user


def is_user_leader(project_name: str, user: str) -> bool:
	"""Return True iff `user` is the project_leader OR has Leader role in team_members."""
	leader = frappe.db.get_value("VT Project", project_name, "project_leader")
	if leader == user:
		return True
	return bool(frappe.db.get_value(
		"Project Team Member",
		{"parent": project_name, "user": user, "role": "Leader"},
		"name",
	))


def is_user_in_project(project_name: str, user: str) -> bool:
	"""Return True iff `user` is the owner OR a team member of the project."""
	if is_user_owner(project_name, user):
		return True
	return bool(frappe.db.get_value(
		"Project Team Member",
		{"parent": project_name, "user": user},
		"name",
	))


def assert_user_is_leader(project_name: str, user: str) -> None:
	"""Raise PermissionError unless `user` is the Leader or Owner of the project."""
	if not is_user_leader(project_name, user) and not is_user_owner(project_name, user):
		frappe.throw(
			"Hanya Project Leader atau Owner yang dapat melakukan aksi ini",
			frappe.PermissionError,
		)


def validate_team(doc, method):
	"""Hook stub — wired in hooks.py for future per-doctype validation extensions."""
	return None
