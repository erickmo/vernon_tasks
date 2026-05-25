"""VT Brand controller — Vernon Tasks Brand domain.

Layer: Frappe DocType controller (Layer 2, Priority 1 per vernon-dev
Frappe Hooks-First rule). All business logic for a Brand lifecycle lives
here so the standard REST endpoints `/api/resource/VT Brand` enforce the
same rules without any custom whitelisted wrapper.

ADR-022 — REST-first, hooks-for-logic. FK integrity guard lives here so the
standard `/api/resource/VT Brand` REST endpoints enforce it automatically
without needing a custom whitelisted wrapper.

Naming policy: `autoname: field:brand_name` + default `allow_rename: 0` →
`brand_name` is the permanent primary key. Frappe silently coerces
`brand_name` back to `name` on save, so PUT cannot change it. The portal
(`brandsApi.updateBrand`) rejects any rename attempt with a friendly
Indonesian message. To "rename" a brand, delete (FK-guarded by `on_trash`)
and recreate. `before_rename` here is the server-side belt-and-braces.

Source of truth: docs/domains/brand/README.html
"""
import hashlib
import re

import frappe
from frappe.model.document import Document

# --- Cross-doctype FK target ----------------------------------------------
# Brand is referenced by VT Project via the `brand` link field. on_trash
# must block when any project still points here (ADR-022).
LINKED_PROJECT_DOCTYPE = "VT Project"
LINKED_PROJECT_FK = "brand"

# --- Validation caps ------------------------------------------------------
# Frappe Data column is VARCHAR(140) by default. We enforce 140 explicitly
# so the error surfaces in `validate()` (clear message) rather than a raw
# DB truncation error at insert time.
BRAND_NAME_MAX_LEN = 140
# Small Text in Frappe is TEXT (no hard cap), but Brand descriptions are
# meant to be a single tagline / short blurb. Cap to keep list views and
# REST payloads compact.
DESCRIPTION_MAX_LEN = 2000
# Whitespace runs collapse to a single space — prevents look-alike duplicates
# like "Acme  Inc" vs "Acme Inc".
_WHITESPACE_RUN = re.compile(r"\s+")
# Reject any control characters in brand_name (newline, tab, NUL, etc.) —
# they break list-view rendering and CSV exports.
_CONTROL_CHAR = re.compile(r"[\x00-\x1f\x7f]")

# --- Avatar generation ----------------------------------------------------
# Deterministic palette: pick by hashing the brand_name so the same brand
# always gets the same colour (stable across renders + servers).
AVATAR_PALETTE = (
	"#0ea5e9", "#6366f1", "#a855f7", "#ec4899", "#ef4444",
	"#f97316", "#eab308", "#22c55e", "#14b8a6", "#0891b2",
)
AVATAR_FILE_PREFIX = "brand-avatar-"


def _render_avatar_svg(brand_name: str) -> tuple[str, str]:
	"""Build an initial-based SVG avatar for a brand.

	Args:
		brand_name: Brand display name. First non-whitespace char becomes
			the avatar letter; `?` if the name is empty.

	Returns:
		(svg_text, hex_color) — `svg_text` is the full `<svg>` markup
		ready to be persisted as a public File.
	"""
	# Take first character only — multi-letter avatars look noisy at 32px.
	letter = (brand_name or "?").strip()[:1].upper() or "?"
	# md5 here is for colour selection only (not security), so MD5 is fine
	# and faster than SHA-2 family.
	digest = hashlib.md5(brand_name.encode("utf-8")).digest()
	color = AVATAR_PALETTE[digest[0] % len(AVATAR_PALETTE)]
	svg = (
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
		f'<rect width="64" height="64" rx="12" fill="{color}"/>'
		'<text x="50%" y="50%" dy=".1em" text-anchor="middle" '
		'dominant-baseline="middle" font-family="Inter,Segoe UI,system-ui,sans-serif" '
		f'font-size="32" font-weight="700" fill="#ffffff">{letter}</text>'
		'</svg>'
	)
	return svg, color


def _avatar_filename(brand_name: str) -> str:
	"""Slugify brand name into a safe File filename.

	Lowercases, replaces non-alnum runs with `-`, strips leading/trailing `-`.
	Falls back to `brand` so a malformed name still produces a valid filename.
	"""
	slug = re.sub(r"[^a-z0-9]+", "-", (brand_name or "brand").lower()).strip("-") or "brand"
	return f"{AVATAR_FILE_PREFIX}{slug}.svg"


def _save_avatar_file(brand_doc: "VTBrand", svg: str) -> str:
	"""Create or overwrite the public File holding this brand's avatar.

	Stored as a real public File so the doctype's `Attach Image` (VARCHAR 140)
	only keeps a short `/files/...` URL instead of an oversized data URL —
	a data URL would overflow the column.

	Args:
		brand_doc: The brand whose avatar we're saving (used as File parent).
		svg: SVG markup from `_render_avatar_svg`.

	Returns:
		Public file_url suitable for storing in `vt_brand.logo`.
	"""
	filename = _avatar_filename(brand_doc.brand_name or brand_doc.name or "brand")
	# Look up existing avatar File attached to this brand — overwrite path
	# avoids accumulating one File per save.
	existing = frappe.db.exists(
		"File",
		{"file_name": filename, "attached_to_doctype": brand_doc.doctype, "attached_to_name": brand_doc.name},
	)
	if existing:
		file_doc = frappe.get_doc("File", existing)
		file_doc.is_private = 0
		file_doc.save_file(content=svg.encode("utf-8"), overwrite=True)
		return file_doc.file_url
	file_doc = frappe.get_doc(
		{
			"doctype": "File",
			"file_name": filename,
			"is_private": 0,
			"content": svg,
			"attached_to_doctype": brand_doc.doctype,
			"attached_to_name": brand_doc.name,
		}
	)
	file_doc.insert(ignore_permissions=True)
	return file_doc.file_url


def _normalize_brand_name(raw: str | None) -> str:
	"""Trim + collapse internal whitespace runs to a single space.

	Prevents look-alike duplicates ("Acme  Inc" vs "Acme Inc") which
	would otherwise pass the unique constraint as distinct names.
	"""
	if not raw:
		return ""
	return _WHITESPACE_RUN.sub(" ", raw).strip()


class VTBrand(Document):
	"""Brand entity — owns scope for Projects, Objectives, KPIs.

	Lifecycle hooks (order on a fresh insert):
		1. validate           — normalize + enforce field rules
		2. before_save        — (skipped on insert; see is_new() guard)
		3. (DB insert)
		4. after_insert       — generate placeholder avatar
		5. on_trash           — block delete if any VT Project links here
	"""

	# --- Lifecycle: autoname ---------------------------------------------
	def autoname(self) -> None:
		"""Normalize brand_name BEFORE Frappe derives `name` from it.

		`autoname: field:brand_name` in the JSON copies `brand_name` into
		`name`. Frappe runs this hook before validate(), so any cleanup
		must happen here to ensure both fields agree.

		Control-char rejection runs first (on raw input) — otherwise the
		whitespace-collapse regex would silently turn `\\n` and `\\t` into
		spaces, hiding the problem.
		"""
		raw = self.brand_name or ""
		if _CONTROL_CHAR.search(raw):
			frappe.throw(
				"Nama brand tidak boleh mengandung karakter kontrol",
				frappe.ValidationError,
			)
		self.brand_name = _normalize_brand_name(raw)
		# After Frappe's set_name_from_naming_options runs, `name` will
		# pick up this normalized value automatically.

	# --- Lifecycle: validate ---------------------------------------------
	def validate(self) -> None:
		"""Enforce field-level invariants on every insert + update.

		Raises `frappe.ValidationError` with an actionable Indonesian
		message when a rule fails (caller-facing). Normalization itself
		happens in `autoname` for inserts; for updates we re-run it here
		because `autoname` is skipped on saves of existing docs.
		"""
		# Re-normalize for the update path (autoname only runs on insert).
		# Also re-check control chars in case the value mutated after autoname.
		raw = self.brand_name or ""
		if _CONTROL_CHAR.search(raw):
			frappe.throw(
				"Nama brand tidak boleh mengandung karakter kontrol",
				frappe.ValidationError,
			)
		self.brand_name = _normalize_brand_name(raw)

		# `reqd: 1` in the JSON normally catches empty at the mandatory-field
		# stage. We re-check here so direct programmatic save paths that pass
		# `ignore_mandatory=True` still fail loudly.
		if not self.brand_name:
			frappe.throw(
				"Nama brand wajib diisi",
				frappe.MandatoryError,
			)

		if len(self.brand_name) > BRAND_NAME_MAX_LEN:
			frappe.throw(
				f"Nama brand maksimal {BRAND_NAME_MAX_LEN} karakter",
				frappe.ValidationError,
			)

		if self.description and len(self.description) > DESCRIPTION_MAX_LEN:
			frappe.throw(
				f"Deskripsi maksimal {DESCRIPTION_MAX_LEN} karakter",
				frappe.ValidationError,
			)

	# --- Lifecycle: before_rename ----------------------------------------
	def before_rename(self, old: str, new: str, merge: bool = False) -> None:
		"""Block rename — brand_name is the permanent PK per ADR-022.

		Even though `allow_rename: 0` in the JSON disables the UI rename
		button, server-side `frappe.rename_doc` can still be called from
		scripts. This hook is the belt-and-braces guard.
		"""
		frappe.throw(
			"Brand tidak dapat di-rename; hapus dan buat ulang",
			frappe.ValidationError,
		)

	# --- Lifecycle: before_save ------------------------------------------
	def before_save(self) -> None:
		"""Auto-generate an initial-based avatar when no logo is uploaded.

		Runs on every update (and on insert, but the `is_new()` guard
		defers new docs to `after_insert` which has a real `name` to
		attach the File to).

		Behaviour:
		  - logo empty            → regenerate placeholder
		  - logo is auto-avatar   → regenerate (brand_name may have changed)
		  - logo is custom upload → leave untouched
		"""
		current_logo = (self.logo or "").strip()
		# Preserve user-uploaded logos — only touch our own avatar files.
		if current_logo and not current_logo.startswith(f"/files/{AVATAR_FILE_PREFIX}"):
			return
		# Need a saved doc to attach the File to — defer to after_insert.
		if self.is_new():
			return
		svg, _ = _render_avatar_svg(self.brand_name or self.name or "")
		self.logo = _save_avatar_file(self, svg)

	# --- Lifecycle: after_insert -----------------------------------------
	def after_insert(self) -> None:
		"""For new brands, generate the avatar once the doc has a name.

		Uses `db_set` (not `save`) to avoid recursing into `before_save`
		and to skip another full validation cycle.
		"""
		# Respect a custom logo supplied at insert time.
		if (self.logo or "").strip():
			return
		svg, _ = _render_avatar_svg(self.brand_name or self.name or "")
		url = _save_avatar_file(self, svg)
		self.db_set("logo", url, update_modified=False)

	# --- Lifecycle: on_trash ---------------------------------------------
	def on_trash(self) -> None:
		"""Block delete when any VT Project still references this brand.

		Source of truth: docs/domains/brand/README.html (Brand cannot be
		orphaned while projects link to it). Enforced here so the standard
		REST DELETE endpoint and CLI both honour it (ADR-022).
		"""
		in_use = frappe.db.count(
			LINKED_PROJECT_DOCTYPE, {LINKED_PROJECT_FK: self.name}
		)
		if in_use:
			frappe.throw(
				f"Brand masih dipakai {in_use} proyek; pindahkan dulu sebelum dihapus",
				frappe.ValidationError,
			)
