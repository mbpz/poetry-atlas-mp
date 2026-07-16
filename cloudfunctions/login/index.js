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
  const openid = wxContext.OPENID || wxContext.openid || ''
  const appid = wxContext.APPID || wxContext.appid || ''
  const unionid = wxContext.UNIONID || wxContext.unionid || ''
  const db = cloud.database()

  let user = null
  if (openid) {
    // upsert users：首次登录写入，后续读出
    const exists = await db.collection(DB_COLLECTION).where({ _id: openid }).limit(1).get()
    if (!exists.data || !exists.data.length) {
      const initUser = {
        _openid: openid,
        nickname: '',
        avatar_url: '',
        created_at: Date.now(),
        stats: { routes_count: 0, recitation_count: 0 },
      }
      await db.collection(DB_COLLECTION).doc(openid).set({ data: initUser })
      user = Object.assign({ _id: openid }, initUser)
    } else {
      user = exists.data[0]
    }
  }

  return { openid, appid, unionid, user }
}
