/**
 * 地理位置解析工具 (云函数副本，与 utils/loc.js 同构)
 * 统一处理两种 GeoPoint 格式 + GeoJSON geometry 格式
 */
function locToLngLat(loc) {
  if (!loc) return { longitude: 0, latitude: 0 }
  if (typeof loc.longitude === "number" && typeof loc.latitude === "number") {
    return { longitude: loc.longitude, latitude: loc.latitude }
  }
  const coords = loc.coordinates || (loc.geometry && loc.geometry.coordinates)
  if (Array.isArray(coords) && coords.length >= 2) {
    return { longitude: coords[0], latitude: coords[1] }
  }
  return { longitude: 0, latitude: 0 }
}

module.exports = { locToLngLat }
