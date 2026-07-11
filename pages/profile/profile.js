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
  onTapRoute() { wx.showToast({ title: "自建路线（即将开放）", icon: "none" }) },
  onTapQuiz() { wx.showToast({ title: "诗词对战（即将开放）", icon: "none" }) },
  onTapRecitation() { wx.showToast({ title: "诗词朗诵（即将开放）", icon: "none" }) },
  onTapCommunity() { wx.showToast({ title: "社区（即将开放）", icon: "none" }) },

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
