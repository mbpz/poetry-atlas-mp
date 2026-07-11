/**
 * 我的 — 用户中心（OPENID / 收藏统计 / 功能入口）
 * 小程序无需登录，身份由 CloudBase 自动注入 OPENID
 */
const { getDB } = require("../../utils/cloudbase.js")
const config = require("../../config.js")

Page({
  data: {
    openid: "",
    favCount: 0,
    version: config.VERSION,
    config: {
      envShort: config.ENV_ID.slice(0, 8) + "...",
    },
  },

  onShow() {
    // 显示启动时已静默拿到的 openid（失败时为空，按钮会引导重试）
    this.setData({ openid: getApp().globalData.openid || "" })
    this.loadStats()
  },

  async loadStats() {
    const { db } = getDB()
    try {
      // 收藏数（favorites 集合，仅本人可见）
      const fav = await db.collection("favorites").count()
      this.setData({ favCount: fav.total })
    } catch (e) {
      this.setData({ favCount: 0 })
    }
  },

  onTapFavorites() {
    wx.switchTab({ url: "/pages/favorites/favorites" })
  },

  onTapAbout() {
    wx.showModal({
      title: "关于 诗词地图",
      content: "在地图上阅读中国，在诗词中穿越历史。\n\n版本 v" + config.VERSION + "\n数据：中国古诗词开源数据集\n地图 + AI 由 CloudBase 驱动",
      showCancel: false,
    })
  },

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

  onShareAppMessage() {
    return { title: "在地图上阅读中国 — 诗词地图", path: "/pages/index/index" }
  },
})
