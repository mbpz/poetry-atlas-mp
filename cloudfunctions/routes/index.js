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
  return points.map((p) => ({
    name: String(p.name || '').slice(0, 60),
    lng: Number(p.lng) || 0,
    lat: Number(p.lat) || 0,
    poem_title: String(p.poem_title || '').slice(0, 80),
    poem_author: String(p.poem_author || '').slice(0, 60),
    poem_content: String(p.poem_content || '').slice(0, 500),
    note: String(p.note || '').slice(0, 200),
  }))
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action } = event
  const db = cloud.database()

  // ---- 写操作需要身份 ----
  const needAuth = ['create', 'update', 'delete'].includes(action)
  if (needAuth && !openid) return { ok: false, error: 'no openid' }

  try {
    switch (action) {
      case 'create': {
        const data = {
          _openid: openid,
          openid,
          name: String(event.name || '').slice(0, 60),
          theme: String(event.theme || '').slice(0, 120),
          description: String(event.description || '').slice(0, 500),
          points: normalizePoints(event.points),
          created_at: Date.now(),
        }
        if (!data.name) return { ok: false, error: 'name required' }
        const res = await db.collection(DB_COLLECTION).add({ data })
        return { ok: true, _id: res._id }
      }

      case 'update': {
        const doc = event.routeId
        if (!doc) return { ok: false, error: 'routeId required' }
        // 校验本人
        const owner = await db.collection(DB_COLLECTION).doc(doc).field({ openid: true }).get()
        if (!owner.data) return { ok: false, error: 'not found' }
        if (owner.data.openid !== openid) return { ok: false, error: 'forbidden' }
        const update = { updated_at: Date.now() }
        for (const k of ALLOW_FIELDS) {
          if (event[k] !== undefined) update[k] = k === 'points' ? normalizePoints(event[k]) : event[k]
        }
        if (!Object.keys(update).length) return { ok: false, error: 'nothing to update' }
        await db.collection(DB_COLLECTION).doc(doc).update({ data: update })
        return { ok: true }
      }

      case 'delete': {
        const doc = event.routeId
        if (!doc) return { ok: false, error: 'routeId required' }
        const owner = await db.collection(DB_COLLECTION).doc(doc).field({ openid: true }).get()
        if (!owner.data) return { ok: false, error: 'not found' }
        if (owner.data.openid !== openid) return { ok: false, error: 'forbidden' }
        await db.collection(DB_COLLECTION).doc(doc).remove()
        return { ok: true }
      }

      case 'list': {
        const page = Math.max(1, Number(event.page) || 1)
        const pageSize = Math.min(50, Math.max(1, Number(event.pageSize) || 20))
        // 私有路线：严格按当前 openid 过滤
        const res = await db.collection(DB_COLLECTION)
          .where({ openid })
          .orderBy('created_at', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .field({ openid: false })
          .get()
        return { ok: true, data: res.data, page, pageSize }
      }

      case 'detail': {
        const doc = event.routeId
        if (!doc) return { ok: false, error: 'routeId required' }
        const owner = await db.collection(DB_COLLECTION).doc(doc).field({ openid: true }).get()
        if (!owner.data) return { ok: false, error: 'not found' }
        if (owner.data.openid !== openid) return { ok: false, error: 'forbidden' }
        const res = await db.collection(DB_COLLECTION).doc(doc).get()
        const { openid: _, ...safe } = res.data
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
