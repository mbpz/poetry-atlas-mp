/**
 * 隐私协议弹框 — 首次启动全屏覆盖，必须"同意"才能使用
 * 用法: <privacy-dialog id="privacyDialog" bind:agreed="onPrivacyAgreed" />
 * 外部通过 selectComponent 调用 show() 弹出；"同意"后触发 'agreed' 事件；"不同意"退出小程序
 */
Component({
  data: {
    show: false,
  },

  methods: {
    show() {
      this.setData({ show: true })
    },

    hide() {
      this.setData({ show: false })
    },

    onAgree() {
      try {
        wx.setStorageSync('poetry_privacy_agreed', 'agreed')
      } catch (e) {}
      this.setData({ show: false })
      this.triggerEvent('agreed')
    },

    onDisagree() {
      // 不同意 → 退出小程序（不缓存同意标记）
      try {
        wx.exitMiniProgram()
      } catch (e) {}
    },

    noop() {},
  },
})
