"""
Quick Search Plugin for InvenTree
Adds a navigation item and search page to find parts by IPN, UPC or name.
"""

from plugin import InvenTreePlugin
from plugin.mixins import NavigationMixin, UrlsMixin
from django.urls import re_path
from django.shortcuts import render
from django.contrib.auth.decorators import login_required


class QuickSearchPlugin(InvenTreePlugin):
    NAME = "QuickSearch"
    SLUG = "quick-search"
    TITLE = "快速搜索"
    DESCRIPTION = "通过 IPN、UPC 条码或产品名快速定位产品"
    VERSION = "1.0.0"
    AUTHOR = "Mini ERP"

    NAVIGATION = [
        {
            "name": "快速搜索",
            "link": "plugin:quick-search:search",
            "icon": "fas fa-search",
        }
    ]

    def setup_urls(self):
        return [
            re_path(r"^search/?$", self.search_view, name="search"),
        ]

    @login_required
    def search_view(self, request):
        return render(request, "quick_search/search.html", {
            "plugin": self,
        })
