/**
 * 收藏页 — 用户收藏的诗词列表
 * 数据路径：favorites 集合 → poem_id → poems 集合联表
 * 安全规则保证仅本人可读写
 */
const { getDB } = require("../../utils/cloudbase.js")
const { splitPoemLines } = require("../../utils/util.js")

Page({
  data: {
    favorites: [],
    loading: true,
    openid: "",
  },

  onShow() {
    // 每次进入刷新（收藏可能在诗词页变更）
    this.loadFavorites()
  },

  async loadFavorites() {
    const { db } = getDB()
    this.setData({ loading: true })
    try {
      // 查收藏记录（按时间倒序，默认排序即插入序）
      const favRes = await db.collection("favorites").orderBy("created_at", "desc").get()
      const favs = favRes.data

      if (!favs.length) {
        this.setData({ favorites: [], loading: false })
        return
      }

      // 批量查对应诗词详情（poems 集合安全规则为公开可读）
      const poemIds = favs.map((f) => f.poem_id).filter(Boolean)
      let poemsMap = {}
      if (poemIds.length) {
        const poemRes = await db.collection("poems").where({
          _id: db.command.in(poemIds),
        }).get()
        poemRes.data.forEach((p) => { poemsMap[p._id] = p })
      }

      const favorites = favs.map((f) => {
        const poem = poemsMap[f.poem_id] || {}
        return {
          favId: f._id,
          poemId: f.poem_id,
          title: f.poem_title || poem.title || "未知",
          author: f.poem_author || poem.author || "",
          dynasty: poem.dynasty || "",
          content: poem.content || "",
          lines: splitPoemLines(poem.content || ""),
        }
      })

      this.setData({ favorites, loading: false })
    } catch (err) {
      console.error("[favorites] error:", err)
      this.setData({ loading: false })
      wx.showToast({ title: "加载失败", icon: "none" })
    }
  },

  onTapPoem(e) {
    const item = e.currentTarget.dataset.item
    if (!item) return
    getApp().globalData.currentPoem = {
      title: item.title,
      author: item.author,
      dynasty: item.dynasty,
      content: item.content,
      _id: item.poemId,
    }
    wx.navigateTo({ url: "/pages/poem/poem?id=" + item.poemId })
  },

  onExplore() {
    wx.switchTab({ url: "/pages/index/index" })
  },

  async onRemove(e) {
    const item = e.currentTarget.dataset.item
    if (!item) return
    const { db } = getDB()
    try {
      await db.collection("favorites").doc(item.favId).remove()
      this.setData({ favorites: this.data.favorites.filter((f) => f.favId !== item.favId) })
      wx.showToast({ title: "已取消收藏", icon: "success" })
    } catch (err) {
      wx.showToast({ title: "操作失败", icon: "none" })
    }
  },
})
