/**
 * 云函数：aggregateMap
 * 地图数据聚合 — 为小程序首页 <map> markers 提供数据
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const { locToLngLat } = require('./loc.js')

const PROVINCE_CENTERS = {
  '北京': [116.40, 39.90], '天津': [117.20, 39.13], '上海': [121.47, 31.23],
  '重庆': [106.55, 29.56], '河北': [114.50, 38.04], '山西': [112.55, 37.87],
  '辽宁': [123.43, 41.80], '吉林': [125.32, 43.88], '黑龙江': [126.65, 45.75],
  '江苏': [118.78, 32.04], '浙江': [120.15, 30.25], '安徽': [117.28, 31.86],
  '福建': [119.30, 26.08], '江西': [115.89, 28.68], '山东': [117.00, 36.65],
  '河南': [113.65, 34.76], '湖北': [114.30, 30.59], '湖南': [112.98, 28.11],
  '广东': [113.27, 23.13], '海南': [110.35, 20.02], '四川': [104.07, 30.65],
  '贵州': [106.71, 26.57], '云南': [102.71, 25.04], '陕西': [108.95, 34.27],
  '甘肃': [103.82, 36.06], '青海': [101.78, 36.62], '台湾': [121.50, 25.03],
  '内蒙古': [111.67, 40.82], '广西': [108.33, 22.84], '西藏': [91.13, 29.65],
  '宁夏': [106.28, 38.47], '新疆': [87.62, 43.80], '香港': [114.17, 22.28],
  '澳门': [113.54, 22.19],
}

function detectProvince(lng, lat) {
  let best = '其他'
  let bestDist = Infinity
  for (const [name, [plng, plat]] of Object.entries(PROVINCE_CENTERS)) {
    const d = (plng - lng) ** 2 + (plat - lat) ** 2
    if (d < bestDist) { bestDist = d; best = name }
  }
  return best
}

/**
 * 地点文档 → marker
 * 兼容两种 GeoPoint 返回格式：
 *   (a) GeoJSON:        { type:'Point', coordinates:[lng, lat] }
 *   (b) 扁平对象:        { longitude, latitude }
 */
function placeToMarker(p) {
  const { longitude: lng, latitude: lat } = locToLngLat(p.location)
  return {
    _id: p._id,
    name: p.name,
    longitude: lng,
    latitude: lat,
    poem_count: p.poem_count || 0,
    type: p.type,
  }
}

/** 省份聚合 */
async function aggregateProvince(dynasty) {
  const col = db.collection('places')
  const cond = dynasty ? { [`dynasty_stats.${dynasty}`]: _.gt(0) } : {}
  // 仅拉聚合所需字段 + 硬上限，避免 hot_poems 等大块数据传输
  const res = await col.where(cond)
    .field({ name: true, location: true, type: true, poem_count: true, dynasty_stats: !!dynasty })
    .orderBy('poem_count', 'desc')
    .limit(500)
    .get()

  const agg = {}
  for (const p of res.data) {
    const m = placeToMarker(p)
    if (!m.longitude || !m.latitude) continue
    const province = detectProvince(m.longitude, m.latitude)
    const dynCount = dynasty ? ((p.dynasty_stats && p.dynasty_stats[dynasty]) || 0) : m.poem_count
    if (!agg[province]) agg[province] = { name: province, poem_count: 0, lngSum: 0, latSum: 0, place_count: 0 }
    agg[province].poem_count += dynCount
    agg[province].lngSum += m.longitude
    agg[province].latSum += m.latitude
    agg[province].place_count += 1
  }

  return Object.values(agg).map((a) => ({
    provinceId: a.name,
    name: a.name,
    poem_count: a.poem_count,
    place_count: a.place_count,
    longitude: +(a.lngSum / a.place_count).toFixed(6),
    latitude: +(a.latSum / a.place_count).toFixed(6),
  }))
}

/** 附近地点 */
async function nearbyPlaces(lng, lat, radiusKm, dynasty, limit = 50) {
  const col = db.collection('places')
  const point = new db.Geo.Point(+lng, +lat)
  const res = await col.where({
    location: _.geoNear({ geometry: point, maxDistance: +radiusKm * 1000 }),
  }).limit(+limit).get()

  let data = res.data
  if (dynasty) data = data.filter((p) => p.dynasty_stats && p.dynasty_stats[dynasty] > 0)
  return data.map(placeToMarker)
}

/** 地点列表（朝代/关键词筛选） */
async function listPlaces({ dynasty, keyword, limit = 200 }) {
  const col = db.collection('places')
  let query = col
  const cond = {}
  if (dynasty) cond[`dynasty_stats.${dynasty}`] = _.gt(0)
  if (Object.keys(cond).length) query = query.where(cond)

  if (keyword) {
    const reg = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    const all = await query.orderBy('poem_count', 'desc').limit(+limit).get()
    return all.data.filter((p) => reg.test(p.name) || reg.test(p._id)).map(placeToMarker)
  }

  const res = await query.orderBy('poem_count', 'desc').limit(+limit).get()


  return res.data.map(placeToMarker)
}

exports.main = async (event) => {
  const { type = 'places', dynasty = '', lng, lat, radius_km = 50, keyword = '', limit = 200 } = event
  console.log('[aggregateMap]', JSON.stringify({ type, dynasty, lng, lat, radius_km, keyword, limit }))

  try {
    let data = []
    if (type === 'province') data = await aggregateProvince(dynasty || null)
    else if (type === 'nearby') data = await nearbyPlaces(+lng, +lat, +radius_km, dynasty || null, +limit)
    else data = await listPlaces({ dynasty: dynasty || null, keyword, limit: +limit })

    return { ok: true, data, total: data.length }
  } catch (err) {
    console.error('[aggregateMap] error:', err)
    return { ok: false, data: [], error: err.errMsg || err.message || '聚合失败' }
  }
}
