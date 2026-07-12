'use strict'
/**
 * 云函数：updateUser
 * 更新当前用户档案（nickname / avatar_url / stats 等可增量）
 * 入参: { nickname?, avatar_url?, stats?, [其他用户字段] }
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return { ok: false, error: 'no openid' }

  const db = cloud.database()
  const _ = db.command

  // 仅允许更新的字段（白名单）
  const ALLOW = ['nickname', 'avatar_url', 'gender', 'bio']
  const update = {}
  for (const k of ALLOW) {
    if (event[k] !== undefined) update[k] = event[k]
  }
  // stats 支持增量合并（如 recitation_count+1）
  if (event.stats && typeof event.stats === 'object') {
    for (const k in event.stats) {
      // 数字走 inc，其他走 set
      if (typeof event.stats[k] === 'number') {
        update['stats.' + k] = _.inc(event.stats[k])
      } else {
        update['stats.' + k] = event.stats[k]
      }
    }
  }

  if (!Object.keys(update).length) return { ok: false, error: 'nothing to update' }

  try {
    await db.collection('users').doc(openid).update({ data: update })
    // 返回更新后的用户档案
    const fresh = await db.collection('users').doc(openid).get()
    return { ok: true, user: fresh.data }
  } catch (err) {
    return { ok: false, error: err.errMsg || err.message || 'update failed' }
  }
}
