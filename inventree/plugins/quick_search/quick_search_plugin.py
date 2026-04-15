"""
Quick Search Plugin for InvenTree
Adds a navigation item and search page to find parts by IPN, UPC or name.
Compatible with InvenTree 1.x (React PUI).
"""

from plugin import InvenTreePlugin
from plugin.mixins import NavigationMixin, UrlsMixin, UserInterfaceMixin
from django.urls import re_path
from django.shortcuts import render
from django.contrib.auth.decorators import login_required


class QuickSearchPlugin(InvenTreePlugin):
    NAME = "QuickSearch"
    SLUG = "quick-search"
    TITLE = "快速搜索"
    DESCRIPTION = "通过 IPN、UPC 条码或产品名快速定位产品"
    VERSION = "1.1.0"
    AUTHOR = "Mini ERP"

    # New React UI navigation (InvenTree 1.x)
    def get_ui_navigation_items(self, request, context, **kwargs):
        """Inject a navigation item into the React UI sidebar."""
        return [
            {
                "key": "quick-search-nav",
                "title": "快速搜索",
                "icon": "ti:search",
                "options": {"url": "/plugin/quick-search/search/"},
            }
        ]

    def setup_urls(self):
        return [
            re_path(r"^search/?$", self.search_view, name="search"),
        ]

    def search_view(self, request):
        if not request.user.is_authenticated:
            from django.contrib.auth.views import redirect_to_login
            return redirect_to_login(request.get_full_path())
        return render(request, "quick_search/search.html", {"plugin": self})
