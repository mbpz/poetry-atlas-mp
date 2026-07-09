/**
 * CloudBase 初始化与数据访问封装
 *
 * 运行时：NoSQL 文档数据库（wx.cloud.database）
 * 参考：.no-sql-wx-mp-sdk — 小程序端通过 wx.cloud 访问云开发
 */
const config = require('../config.js')

let _inited = false

/**
 * 初始化 CloudBase（幂等，整个小程序生命周期只调一次）
 */
function initCloudBase() {
  if (_inited) return
  if (!wx.cloud) {
    console.error('[cloudbase] 当前微信版本过低，请升级微信')
    return
  }
  wx.cloud.init({
    env: config.ENV_ID,
    traceUser: true, // 记录用户访问（云开发控制台可见）
  })
  _inited = true
  console.log('[cloudbase] init ok, env =', config.ENV_ID)
}

/** 获取数据库实例（带 command 操作符） */
function getDB() {
  initCloudBase()
  const db = wx.cloud.database()
  return { db, _: db.command }
}

/**
 * 统一错误包装：将 CloudBase 错误转为可展示的 message
 */
function wrapPromise(promise, { loadingText } = {}) {
  if (loadingText) wx.showLoading({ title: loadingText, mask: true })
  return promise
    .then((res) => {
      if (loadingText) wx.hideLoading()
      return res
    })
    .catch((err) => {
      if (loadingText) wx.hideLoading()
      console.error('[cloudbase] wrapPromise error:', err)
      const msg = (err && err.errMsg) || '网络异常，请稍后重试'
      wx.showToast({ title: msg, icon: 'none' })
      throw err
    })
}

module.exports = {
  initCloudBase,
  getDB,
  wrapPromise,
}
