"""
Quick Search Plugin for InvenTree
Adds a sidebar navigation item, Cmd+K spotlight action, and search page
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
    VERSION = "1.2.0"
    AUTHOR = "Mini ERP"

    # ── Sidebar navigation item (React PUI sidebar) ─────────────────────────
    def get_ui_navigation_items(self, request, context, **kwargs):
        """Inject a navigation item into the React UI sidebar."""
        return [
            {
                "key": "quick-search-nav",
                "title": "快速搜索",
                "icon": "ti:search:outline",
                "options": {"url": "/plugin/quick-search/search/"},
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
                # Static file — no auth required, loadable as an ES module
                "source": "/static/plugins/quick-search/quick_search_action.js:performQuickSearch",
            }
        ]

    # ── URL routes ───────────────────────────────────────────────────────────
    def setup_urls(self):
        return [
            re_path(r"^search/?$", self.search_view, name="search"),
        ]

    def search_view(self, request):
        if not request.user.is_authenticated:
            from django.contrib.auth.views import redirect_to_login
            return redirect_to_login(request.get_full_path())
        return render(request, "quick_search/search.html", {"plugin": self})
