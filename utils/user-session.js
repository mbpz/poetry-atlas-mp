async function ensureOpenId() {
  const app = getApp()
  if (app.globalData && app.globalData.openid) return app.globalData.openid
  if (!app._openidPromise) {
    app._openidPromise = wx.cloud.callFunction({ name: 'login' })
      .then((res) => {
        const result = (res && res.result) || {}
        if (!result.openid) throw new Error('无法获取当前用户身份')
        app.globalData.openid = result.openid
        if (result.user) app.globalData.user = result.user
        return result.openid
      })
      .finally(() => { app._openidPromise = null })
  }
  return app._openidPromise
}

module.exports = { ensureOpenId }
