/**
 * 小程序入口 — 诗词地图
 *
 * 隐私协议全局门控（App 层 onLaunch 拦截）：
 *   1. 启动未同意隐私协议 → reLaunch 到 pages-sub/system/privacy（零云代码阻断页），
 *      且在本页"同意"前绝不调用 initCloudBase()/login()，避免任何 openid/用户数据收集。
 *   2. 已同意 → 正常 initCloudBase + 静默登录。
 *   3. 选 reLaunch 而非 redirectTo：onLaunch 阶段 redirectTo 历史上有替换/失败问题；
 *      reLaunch 清空栈跳到独立协议页，语义最干净，且协议页 navigateBack 回主页合理。
 */
const { initCloudBase } = require('./utils/cloudbase.js')
const config = require('./config.js')

App({
  globalData: {
    userInfo: null,
    config,
  },

  onLaunch() {
    // ① 隐私协议门控优先：未同意 → 跳协议页且不初始化云（不收集任何数据）
    if (!this._privacyAgreed()) {
      // 记录原目标，供协议页同意后续跳（冷启动默认落在地图首页）
      try {
        wx.reLaunch({ url: '/pages-sub/system/privacy' })
      } catch (e) {
        // reLaunch 失败兜底（极少见）：延迟重试一次
        setTimeout(() => {
          try { wx.reLaunch({ url: '/pages-sub/system/privacy' }) } catch (e2) {}
        }, 100)
      }
      return
    }
    // ② 协议通过后才允许启动 CloudBase（触发 openid 收集）
    this._startup()
  },

  _startup() {
    initCloudBase()
    console.log(`[app] launch, version = ${config.VERSION}`)
    this.login()
  },

  _privacyAgreed() {
    try {
      return wx.getStorageSync('poetry_privacy_agreed') === 'agreed'
    } catch (e) {
      return false
    }
  },

  /** 协议页"同意"后的回写：初始化云 + 拉取 openid + 回到主页 */
  onPrivacyAgreed() {
    this._startup()
    // 协议页是 reLaunch 独占栈，回到地图首页
    try { wx.reLaunch({ url: '/pages/index/index' }) } catch (e) {}
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
