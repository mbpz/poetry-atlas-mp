const MAP_VIEW_STORAGE_KEY = 'poetry_map_view_v1'

const CITY_CENTERS = [
  { id: 'beijing', name: '北京', longitude: 116.41, latitude: 39.90, scale: 10 },
  { id: 'shanghai', name: '上海', longitude: 121.47, latitude: 31.23, scale: 10 },
  { id: 'hangzhou', name: '杭州', longitude: 120.16, latitude: 30.25, scale: 10 },
  { id: 'nanjing', name: '南京', longitude: 118.80, latitude: 32.06, scale: 10 },
  { id: 'xian', name: '西安', longitude: 108.94, latitude: 34.34, scale: 10 },
  { id: 'chengdu', name: '成都', longitude: 104.07, latitude: 30.67, scale: 10 },
  { id: 'wuhan', name: '武汉', longitude: 114.31, latitude: 30.59, scale: 10 },
  { id: 'guangzhou', name: '广州', longitude: 113.26, latitude: 23.13, scale: 10 },
  { id: 'changsha', name: '长沙', longitude: 112.94, latitude: 28.23, scale: 10 },
  { id: 'kaifeng', name: '开封', longitude: 114.31, latitude: 34.80, scale: 10 },
  { id: 'luoyang', name: '洛阳', longitude: 112.45, latitude: 34.62, scale: 10 },
  { id: 'suzhou', name: '苏州', longitude: 120.59, latitude: 31.30, scale: 10 },
]

function roundCoordinate(value) {
  return Math.round(Number(value) * 100) / 100
}

function normalizeMapView(view, limits) {
  const input = view || {}
  const bounds = limits || {}
  const longitude = Number(input.longitude)
  const latitude = Number(input.latitude)
  const scale = Number(input.scale)
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null
  if (!Number.isFinite(scale)) return null
  const minScale = Number.isFinite(bounds.minScale) ? bounds.minScale : 3
  const maxScale = Number.isFinite(bounds.maxScale) ? bounds.maxScale : 18
  return {
    longitude: roundCoordinate(longitude),
    latitude: roundCoordinate(latitude),
    scale: Math.max(minScale, Math.min(maxScale, Math.round(scale))),
  }
}

function readStoredMapView(storage, limits) {
  if (!storage || typeof storage.getStorageSync !== 'function') return null
  try {
    return normalizeMapView(storage.getStorageSync(MAP_VIEW_STORAGE_KEY), limits)
  } catch (e) {
    return null
  }
}

function writeStoredMapView(storage, view, limits) {
  if (!storage || typeof storage.setStorageSync !== 'function') return false
  const normalized = normalizeMapView(view, limits)
  if (!normalized) return false
  try {
    storage.setStorageSync(MAP_VIEW_STORAGE_KEY, normalized)
    return true
  } catch (e) {
    return false
  }
}

module.exports = {
  MAP_VIEW_STORAGE_KEY,
  CITY_CENTERS,
  normalizeMapView,
  readStoredMapView,
  writeStoredMapView,
}
