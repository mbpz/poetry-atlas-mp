/**
 * 地理位置解析工具 — 统一处理两种 GeoPoint 格式
 *   (a) 扁平对象:        { longitude, latitude }
 *   (b) GeoJSON:         { type:'Point', coordinates:[lng, lat] }
 *   (c) GeoJSON geometry: { geometry: { coordinates:[lng, lat] } }
 * 小程序端与云函数端共用。
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
