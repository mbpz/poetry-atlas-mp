const MAP_FILTER_STORAGE_KEY = 'poetry_map_filter_v1'
const PLACE_CONTEXT_STORAGE_KEY = 'poetry_place_context_v1'

function cleanString(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength)
}

function normalizeMapFilter(value) {
  const input = value || {}
  return { selectedDynasty: cleanString(input.selectedDynasty, 12) }
}

function normalizePlaceContext(value) {
  const input = value || {}
  const placeId = cleanString(input.placeId, 100)
  if (!placeId) return null
  const scrollTop = Number(input.scrollTop)
  const loadedCount = Number(input.loadedCount)
  return {
    placeId,
    selectedDynasty: cleanString(input.selectedDynasty, 12),
    scrollTop: Number.isFinite(scrollTop) ? Math.max(0, Math.round(scrollTop)) : 0,
    loadedCount: Number.isFinite(loadedCount) ? Math.max(0, Math.min(200, Math.round(loadedCount))) : 0,
  }
}

function readValue(storage, key, normalize) {
  if (!storage || typeof storage.getStorageSync !== 'function') return null
  try {
    return normalize(storage.getStorageSync(key))
  } catch (e) {
    return null
  }
}

function writeValue(storage, key, value, normalize) {
  if (!storage || typeof storage.setStorageSync !== 'function') return false
  const normalized = normalize(value)
  if (!normalized) return false
  try {
    storage.setStorageSync(key, normalized)
    return true
  } catch (e) {
    return false
  }
}

function readStoredMapFilter(storage) {
  return readValue(storage, MAP_FILTER_STORAGE_KEY, normalizeMapFilter)
}

function writeStoredMapFilter(storage, value) {
  return writeValue(storage, MAP_FILTER_STORAGE_KEY, value, normalizeMapFilter)
}

function readStoredPlaceContext(storage, placeId) {
  const context = readValue(storage, PLACE_CONTEXT_STORAGE_KEY, normalizePlaceContext)
  return context && context.placeId === placeId ? context : null
}

function writeStoredPlaceContext(storage, value) {
  return writeValue(storage, PLACE_CONTEXT_STORAGE_KEY, value, normalizePlaceContext)
}

module.exports = {
  MAP_FILTER_STORAGE_KEY,
  PLACE_CONTEXT_STORAGE_KEY,
  normalizeMapFilter,
  normalizePlaceContext,
  readStoredMapFilter,
  writeStoredMapFilter,
  readStoredPlaceContext,
  writeStoredPlaceContext,
}
