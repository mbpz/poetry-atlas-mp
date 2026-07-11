/**
 * 云函数：login
 * 获取用户 OPENID + 维护 users 档案集合
 * 小程序端无需显式登录，openid 由云函数自动注入
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const DB_COLLECTION = 'users'

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { openid, appid, unionid } = wxContext
  const db = cloud.database()

  let user = null
  if (openid) {
    // upsert users：首次登录写入，后续读出
    const exists = await db.collection(DB_COLLECTION).doc(openid).get().catch(() => null)
    if (!exists.data) {
      const initUser = {
        _id: openid,
        _openid: openid,
        nickname: '',
        avatar_url: '',
        created_at: Date.now(),
        // TODO: recitation_count 占位已清，等 recordPlay 联动累加 users.stats 时再加回。
        stats: { routes_count: 0, quiz_total: 0, quiz_wins: 0 },
      }
      await db.collection(DB_COLLECTION).doc(openid).set({ data: initUser }).catch(() => null)
      user = initUser
    } else {
      user = exists.data
    }
  }

  return { openid, appid, unionid, user }
}
