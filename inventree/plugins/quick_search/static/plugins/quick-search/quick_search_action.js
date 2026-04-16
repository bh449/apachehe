/**
 * Quick Search spotlight action for InvenTree.
 * Navigates to the quick-search page, passing any spotlight query as ?q=
 */
export function performQuickSearch(data) {
    const query = (data && (data.query || data.search || data.value)) || '';
    const url = '/plugin/quick-search/search/' +
                (query ? '?q=' + encodeURIComponent(query) : '');
    window.location.href = url;
}
