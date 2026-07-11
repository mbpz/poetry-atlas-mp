/**
 * 我的 — 用户中心 Hub
 * 收藏统计 / 自建数据（路线/对战/朗诵）/ 昵称编辑 / 4 方向入口
 */
const { getDB } = require("../../utils/cloudbase.js")
const config = require("../../config.js")

Page({
  data: {
    openid: "",
    nickname: "",
    avatarText: "诗",
    favCount: 0,
    stats: { routes_count: 0, quiz_total: 0, quiz_wins: 0, recitation_count: 0 },
    version: config.VERSION,
    showNickModal: false,
  },

  onShow() {
    // 同步 TabBar 激活态到我的
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 'me' })
    }
    const app = getApp()
    this.setData({
      openid: app.globalData.openid || "",
      nickname: (app.globalData.user && app.globalData.user.nickname) || "",
      avatarText: ((app.globalData.user && app.globalData.user.nickname) || "诗").slice(0, 1),
    })
    this.loadStats()
  },

  async loadStats() {
    const { db } = getDB()
    try {
      const fav = await db.collection("favorites").count()
      this.setData({ favCount: fav.total })
    } catch (e) {
      this.setData({ favCount: 0 })
    }
    // 从 users 档案读自建统计
    const app = getApp()
    if (app.globalData.user && app.globalData.user.stats) {
      this.setData({ stats: app.globalData.user.stats })
    }
  },

  // ---- 微信昵称接入（必须由用户点击触发 getUserProfile）----
  onUseWxProfile() {
    wx.getUserProfile({
      desc: '用于完善您的昵称和头像',
      success: (res) => {
        const u = res.userInfo || {}
        const nick = u.nickName || ''
        const avatar = u.avatarUrl || ''
        if (!nick) {
          wx.showToast({ title: '获取昵称失败', icon: 'none' })
          return
        }
        wx.showLoading({ title: '保存…' })
        wx.cloud.callFunction({
          name: 'updateUser',
          data: { nickname: nick, avatar_url: avatar },
        }).then((r) => {
          const user = (r.result && r.result.user) || { nickname: nick, avatar_url: avatar }
          const app = getApp()
          app.globalData.user = Object.assign({}, app.globalData.user || {}, user)
          this.setData({
            nickname: user.nickname || nick,
            avatarText: (user.nickname || nick).slice(0, 1) || '诗',
          })
          wx.showToast({ title: '已同步微信昵称', icon: 'success' })
        }).catch((err) => {
          wx.showToast({ title: '保存失败', icon: 'none' })
        }).finally(() => wx.hideLoading())
      },
      fail: () => { wx.showToast({ title: '已取消', icon: 'none' }) },
    })
  },

  // ---- 昵称编辑 ----
  onEditNickname() { this.setData({ showNickModal: true }) },
  onCancelNick() { this.setData({ showNickModal: false }) },
  onNickInput(e) { this.setData({ nickname: e.detail.value }) },
  async onSaveNick() {
    const nick = (this.data.nickname || "").trim().slice(0, 12)
    wx.showLoading({ title: "保存…" })
    try {
      await wx.cloud.callFunction({
        name: "updateUser",
        data: { nickname: nick },
      })
      getApp().globalData.user.nickname = nick
      this.setData({ showNickModal: false, nickname: nick, avatarText: nick.slice(0, 1) || "诗" })
      wx.showToast({ title: "已保存", icon: "success" })
    } catch (err) {
      wx.showToast({ title: "保存失败", icon: "none" })
    } finally {
      wx.hideLoading()
    }
  },

  // ---- OPENID 复制 ----
  onCopyOpenid() {
    if (!this.data.openid) {
      wx.showToast({ title: "暂无 OPENID", icon: "none" })
      return
    }
    wx.setClipboardData({
      data: this.data.openid,
      success: () => wx.showToast({ title: "已复制", icon: "success" }),
    })
  },

  // ---- 入口跳转 ----
  onTapFavorites() { wx.switchTab({ url: "/pages/favorites/favorites" }) },
  onTapRoute() { wx.navigateTo({ url: "/pages-sub/routes/list/list" }) },
  onTapQuiz() { wx.navigateTo({ url: "/pages-sub/quiz/quiz" }) },
  onTapRecitation() {
    // 朗诵无独立着陆页 → 跳搜索找有朗诵数据的诗词
    wx.navigateTo({ url: "/pages/search/search?kw=%E9%9D%99%E5%A4%9C%E6%80%9D" })
  },
  onTapCommunity() { wx.navigateTo({ url: "/pages/community/community" }) },

  onTapAbout() {
    wx.showModal({
      title: "关于 诗词地图",
      content: "在地图上阅读中国，在诗词中穿越历史。\n\n版本 v" + config.VERSION + "\n数据：中国古诗词开源数据集\n地图 + AI 由 CloudBase 驱动",
      showCancel: false,
    })
  },

  onShareAppMessage() {
    return { title: "在地图上阅读中国 — 诗词地图", path: "/pages/index/index" }
  },
})
