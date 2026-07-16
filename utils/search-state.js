const SEARCH_STATE_STORAGE_KEY = 'poetry_search_state_v1'
const SEARCH_TABS = new Set(['all', 'poem', 'author', 'place'])

function normalizeSearchState(value) {
  const input = value || {}
  const scrollTop = Number(input.scrollTop)
  return {
    keyword: String(input.keyword || '').trim().slice(0, 50),
    activeTab: SEARCH_TABS.has(input.activeTab) ? input.activeTab : 'all',
    scrollTop: Number.isFinite(scrollTop) ? Math.max(0, Math.round(scrollTop)) : 0,
  }
}

function readStoredSearchState(storage) {
  if (!storage || typeof storage.getStorageSync !== 'function') return null
  try {
    return normalizeSearchState(storage.getStorageSync(SEARCH_STATE_STORAGE_KEY))
  } catch (e) {
    return null
  }
}

function writeStoredSearchState(storage, value) {
  if (!storage || typeof storage.setStorageSync !== 'function') return false
  try {
    storage.setStorageSync(SEARCH_STATE_STORAGE_KEY, normalizeSearchState(value))
    return true
  } catch (e) {
    return false
  }
}

module.exports = {
  SEARCH_STATE_STORAGE_KEY,
  normalizeSearchState,
  readStoredSearchState,
  writeStoredSearchState,
}
