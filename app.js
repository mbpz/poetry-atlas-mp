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
  },

  onError(msg) {
    console.error('[app] global error:', msg)
  },
})
