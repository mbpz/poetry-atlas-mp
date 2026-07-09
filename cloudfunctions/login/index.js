/**
 * 云函数：login
 * 获取用户 OPENID（小程序端无需显式登录，openid 由云函数自动注入）
 * 参考：auth-wechat — 小程序身份自动注入
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  return {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
  }
}
