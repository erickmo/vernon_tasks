# Copyright (c) 2026, Vernon Corp and contributors
# For license information, please see license.txt

import frappe
from frappe.utils.nestedset import NestedSet


class VTItem(NestedSet):
	nsm_parent_field = "parent_vt_item"
