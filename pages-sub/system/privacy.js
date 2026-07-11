/**
 * 隐私协议阻断页 — App 层 onLaunch 拦截未决时导航至此。
 *
 * 设计说明：
 *   app.js onLaunch 在 initCloudBase() 之前做隐私检查；未同意则 reLaunch 到本页，
 *   且在本页"同意"之前绝不初始化 CloudBase/openid 收集（见 app.js _privacyReady 门控）。
 *   本页本身不调用 initCloudBase / wx.cloud / getDB / 任何云函数，
 *   仅复用 privacy-dialog 组件 —— 同意写 storage 并触发 'agreed' 事件，不同意退岀小程序。
 */
Page({
  data: {},

  onReady() {
    // 弹出协议弹框；本页无任何数据内容，组件全屏遮罩即全部 UI
    const dialog = this.selectComponent('#privacyDialog')
    if (dialog && typeof dialog.show === 'function') {
      dialog.show()
    } else {
      // 极罕见兜底：组件不可用时至少避免进入空响应页面，直接退岀
      try { wx.exitMiniProgram() } catch (e) {}
    }
  },

  onPrivacyAgreed() {
    // 组件内部已写 storage poetry_privacy_agreed='agreed'
    // 回写 App 层标志 → 允许 app.loginOnAgreed 拉取 openid，然后跳回主页
    const app = getApp()
    if (app && typeof app.onPrivacyAgreed === 'function') {
      app.onPrivacyAgreed()
    } else {
      // 兜底：组件已写 storage，回退到首页进入正常流程
      try {
        if (getCurrentPages().length > 1) wx.navigateBack()
        else wx.reLaunch({ url: '/pages/index/index' })
      } catch (e) {}
    }
  },
})
