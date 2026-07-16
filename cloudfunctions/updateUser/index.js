'use strict'
/**
 * 云函数：updateUser
 * 更新当前用户档案（仅 nickname / avatar_url / gender / bio）
 * 文档不存在时自动创建，避免首次保存失败。
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return { ok: false, error: 'no openid' }

  const db = cloud.database()
  const col = db.collection('users')

  const ALLOW = ['nickname', 'avatar_url', 'gender', 'bio']
  const LIMITS = { nickname: 12, avatar_url: 1024, gender: 20, bio: 200 }
  const fields = {}
  for (const k of ALLOW) {
    if (event[k] !== undefined) fields[k] = String(event[k] || '').trim().slice(0, LIMITS[k])
  }

  if (!Object.keys(fields).length) {
    return { ok: false, error: 'nothing to update' }
  }

  try {
    const existing = await col.where({ _id: openid }).limit(1).get()
    const hasDoc = !!(existing.data && existing.data.length)

    if (hasDoc) {
      const updated = await col.doc(openid).update({ data: fields })
      if (!updated.stats || updated.stats.updated !== 1) {
        return { ok: false, error: 'profile update failed' }
      }
    } else {
      const base = {
        _openid: openid,
        nickname: '',
        avatar_url: '',
        created_at: Date.now(),
        stats: { routes_count: 0, recitation_count: 0 },
      }
      Object.assign(base, fields)
      await col.doc(openid).set({ data: base })
    }

    const fresh = await col.doc(openid).get()
    return { ok: true, user: fresh.data }
  } catch (err) {
    console.error('[updateUser]', err)
    return { ok: false, error: err.errMsg || err.message || 'update failed' }
  }
}
