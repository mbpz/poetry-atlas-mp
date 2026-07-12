'use strict'
/**
 * 云函数：updateUser
 * 更新当前用户档案（nickname / avatar_url / stats 等可增量）
 * 文档不存在时自动创建，避免首次保存失败。
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return { ok: false, error: 'no openid' }

  const db = cloud.database()
  const _ = db.command
  const col = db.collection('users')

  const ALLOW = ['nickname', 'avatar_url', 'gender', 'bio']
  const fields = {}
  for (const k of ALLOW) {
    if (event[k] !== undefined) fields[k] = event[k]
  }

  const statsPatch = {}
  if (event.stats && typeof event.stats === 'object') {
    for (const k in event.stats) {
      statsPatch[k] = event.stats[k]
    }
  }

  if (!Object.keys(fields).length && !Object.keys(statsPatch).length) {
    return { ok: false, error: 'nothing to update' }
  }

  try {
    const existing = await col.doc(openid).get().catch(() => null)
    const hasDoc = !!(existing && existing.data)

    if (hasDoc) {
      const update = Object.assign({}, fields)
      for (const k in statsPatch) {
        if (typeof statsPatch[k] === 'number') {
          update['stats.' + k] = _.inc(statsPatch[k])
        } else {
          update['stats.' + k] = statsPatch[k]
        }
      }
      await col.doc(openid).update({ data: update })
    } else {
      const base = {
        _openid: openid,
        nickname: '',
        avatar_url: '',
        created_at: Date.now(),
        stats: Object.assign(
          { routes_count: 0, recitation_count: 0 },
          statsPatch
        ),
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
