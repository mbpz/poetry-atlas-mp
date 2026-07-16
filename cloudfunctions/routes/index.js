/**
 * 云函数：routes（自建旅行路线 CRUD）— 私有路线，仅创建者本人可见
 * 动作: create / update / delete / list / detail
 * 安全: 全部操作校验 openid 本人
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const DB_COLLECTION = 'routes'

// 允许客户端直接写入的字段白名单（路线为私有，无 is_public / likes_count）
const ALLOW_FIELDS = ['name', 'theme', 'description', 'points']

function normalizePoints(points) {
  if (!Array.isArray(points)) return []
  return points
    .map((p) => {
      const lng = Number(p.lng)
      const lat = Number(p.lat)
      return {
        name: String(p.name || '').trim().slice(0, 60),
        lng: Number.isFinite(lng) && lng >= -180 && lng <= 180 ? lng : 0,
        lat: Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : 0,
        poem_title: String(p.poem_title || '').trim().slice(0, 80),
        poem_author: String(p.poem_author || '').trim().slice(0, 60),
        poem_content: String(p.poem_content || '').trim().slice(0, 500),
        note: String(p.note || '').trim().slice(0, 200),
      }
    })
    .filter((point) => point.name)
    .slice(0, 50)
}

async function syncRouteCount(db, openid) {
  const count = await db.collection(DB_COLLECTION).where({ openid }).count()
  const total = count.total || 0
  await db.collection('users').doc(openid).update({
    data: { 'stats.routes_count': total },
  }).catch((err) => console.warn('[routes] sync user stats failed:', err.errMsg || err.message))
  return total
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action } = event
  const db = cloud.database()

  // 私有资源的读写动作全部要求微信上下文身份，绝不信任客户端传入的 openid。
  if (!openid) return { ok: false, error: 'no openid' }

  try {
    switch (action) {
      case 'create': {
        const requestId = String(event.request_id || '').trim().slice(0, 80)
        if (requestId) {
          const existing = await db.collection(DB_COLLECTION)
            .where({ openid, request_id: requestId })
            .limit(1)
            .get()
          if (existing.data && existing.data[0]) {
            const routesCount = await syncRouteCount(db, openid)
            return { ok: true, _id: existing.data[0]._id, duplicate: true, routes_count: routesCount }
          }
        }
        const data = {
          _openid: openid,
          openid,
          request_id: requestId,
          name: String(event.name || '').trim().slice(0, 60),
          theme: String(event.theme || '').trim().slice(0, 120),
          description: String(event.description || '').trim().slice(0, 500),
          points: normalizePoints(event.points),
          created_at: Date.now(),
        }
        if (!data.name) return { ok: false, error: 'name required' }
        if (!data.points.length) return { ok: false, error: 'at least one point required' }
        const res = await db.collection(DB_COLLECTION).add({ data })
        if (!res._id) return { ok: false, error: 'create failed' }
        const routesCount = await syncRouteCount(db, openid)
        return { ok: true, _id: res._id, routes_count: routesCount }
      }

      case 'update': {
        const doc = event.routeId
        if (!doc) return { ok: false, error: 'routeId required' }
        // 校验本人
        const owner = await db.collection(DB_COLLECTION).doc(doc).field({ openid: true }).get()
        if (!owner.data) return { ok: false, error: 'not found' }
        if (owner.data.openid !== openid) return { ok: false, error: 'forbidden' }
        const update = {}
        for (const k of ALLOW_FIELDS) {
          if (event[k] === undefined) continue
          if (k === 'points') update[k] = normalizePoints(event[k])
          else update[k] = String(event[k] || '').trim().slice(0, k === 'description' ? 500 : (k === 'theme' ? 120 : 60))
        }
        if (!Object.keys(update).length) return { ok: false, error: 'nothing to update' }
        if (update.name !== undefined && !update.name) return { ok: false, error: 'name required' }
        if (update.points !== undefined && !update.points.length) return { ok: false, error: 'at least one point required' }
        update.updated_at = Date.now()
        const result = await db.collection(DB_COLLECTION).doc(doc).update({ data: update })
        if (!result.stats || result.stats.updated !== 1) return { ok: false, error: 'update failed' }
        return { ok: true }
      }

      case 'delete': {
        const doc = event.routeId
        if (!doc) return { ok: false, error: 'routeId required' }
        const owner = await db.collection(DB_COLLECTION).doc(doc).field({ openid: true }).get()
        if (!owner.data) return { ok: false, error: 'not found' }
        if (owner.data.openid !== openid) return { ok: false, error: 'forbidden' }
        const removed = await db.collection(DB_COLLECTION).doc(doc).remove()
        if (!removed.stats || removed.stats.removed !== 1) return { ok: false, error: 'delete failed' }
        const routesCount = await syncRouteCount(db, openid)
        return { ok: true, routes_count: routesCount }
      }

      case 'list': {
        const page = Math.max(1, Number(event.page) || 1)
        const pageSize = Math.min(50, Math.max(1, Number(event.pageSize) || 20))
        // 私有路线：严格按当前 openid 过滤
        const query = db.collection(DB_COLLECTION).where({ openid })
        const [res, count] = await Promise.all([
          query
          .orderBy('created_at', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .field({ openid: false, _openid: false, request_id: false })
          .get(),
          db.collection(DB_COLLECTION).where({ openid }).count(),
        ])
        return { ok: true, data: res.data, page, pageSize, total: count.total || 0 }
      }

      case 'detail': {
        const doc = event.routeId
        if (!doc) return { ok: false, error: 'routeId required' }
        const owner = await db.collection(DB_COLLECTION).doc(doc).field({ openid: true }).get()
        if (!owner.data) return { ok: false, error: 'not found' }
        if (owner.data.openid !== openid) return { ok: false, error: 'forbidden' }
        const res = await db.collection(DB_COLLECTION).doc(doc).get()
        const { openid: ownerOpenid, _openid, request_id, ...safe } = res.data
        return { ok: true, data: safe }
      }

      default:
        return { ok: false, error: 'unknown action: ' + action }
    }
  } catch (err) {
    console.error('[routes] action=' + action + ' error:', err)
    return { ok: false, error: err.errMsg || err.message || 'server error' }
  }
}
