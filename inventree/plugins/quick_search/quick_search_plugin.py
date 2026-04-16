"""
Quick Search Plugin for InvenTree
Adds a dashboard search widget and Cmd+K spotlight action
to find parts by IPN, UPC barcode or name.
Compatible with InvenTree 1.x (React PUI).
"""

from django.urls import re_path
from django.shortcuts import render

from plugin import InvenTreePlugin
from plugin.mixins import UrlsMixin, UserInterfaceMixin


class QuickSearchPlugin(UserInterfaceMixin, UrlsMixin, InvenTreePlugin):
    NAME = "QuickSearch"
    SLUG = "quick-search"
    TITLE = "快速搜索"
    DESCRIPTION = "通过 IPN、UPC 条码或产品名快速定位产品"
    VERSION = "1.3.0"
    AUTHOR = "Mini ERP"

    # ── Dashboard search widget (InvenTree home page) ───────────────────────
    def get_ui_dashboard_items(self, request, context, **kwargs):
        """Add a search widget to the InvenTree dashboard."""
        return [
            {
                "key": "quick-search-dashboard",
                "title": "快速搜索产品",
                "description": "通过 IPN、UPC 条码或产品名称快速搜索",
                "icon": "ti:search:outline",
                "source": "/static/plugins/quick-search/quick_search_dashboard.js",
                "options": {"width": 6, "height": 3},
            }
        ]

    # ── Spotlight action (Cmd+K search palette) ──────────────────────────────
    def get_ui_spotlight_actions(self, request, context, **kwargs):
        """Add a quick-search entry to the Cmd+K spotlight palette."""
        return [
            {
                "key": "quick-search-spotlight",
                "title": "快速搜索产品",
                "description": "按 IPN、UPC 条码或产品名称搜索",
                "icon": "ti:search:outline",
                "source": "/static/plugins/quick-search/quick_search_action.js:performQuickSearch",
            }
        ]

    # ── URL routes (standalone search page for Cmd+K landing) ────────────────
    def setup_urls(self):
        return [
            re_path(r"^search/?$", self.search_view, name="search"),
        ]

    def search_view(self, request):
        if not request.user.is_authenticated:
            from django.contrib.auth.views import redirect_to_login
            return redirect_to_login(request.get_full_path())
        return render(request, "quick_search/search.html", {"plugin": self})
