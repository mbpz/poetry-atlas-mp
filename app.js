/**
 * 小程序入口 — 诗词地图
 */
const { initCloudBase } = require('./utils/cloudbase.js')
const config = require('./config.js')

App({
  globalData: {
    userInfo: null,
    config,
  },

  onLaunch() {
    // 初始化 CloudBase
    initCloudBase()
    console.log(`[app] launch, version = ${config.VERSION}`)
    // 静默登录：取 openid 存入 globalData（失败不阻塞启动）
    this.login()
  },

  login() {
    wx.cloud.callFunction({ name: 'login' })
      .then((res) => {
        const r = res.result || {}
        this.globalData.openid = r.openid || ''
        this.globalData.user = r.user || null
        console.log('[app] login ok, openid =', this.globalData.openid ? this.globalData.openid.slice(0, 6) + '…' : '(empty)')
      })
      .catch((err) => {
        console.warn('[app] login failed:', err && err.errMsg || err)
      })
  },

  onError(msg) {
    console.error('[app] global error:', msg)
  },
})
