/**
 * 收藏页 — 用户收藏的诗词列表
 * 数据路径：favorites 集合 → poem_id → poems 集合联表
 * 安全规则保证仅本人可读写
 */
const { getDB } = require("../../utils/cloudbase.js")
const { splitPoemLines } = require("../../utils/util.js")

const PAGE_SIZE = 20
const MAX_IN = 100 // CloudBase _.in() 数组上限

Page({
  data: {
    favorites: [],
    loading: true,
    hasMore: true,
    openid: "",
  },

  onShow() {
    // 同步 TabBar 激活态到收藏
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 'fav' })
    }
    // 每次进入刷新（收藏可能在诗词页变更）
    this.resetAndLoad()
  },

  resetAndLoad() {
    this._favOffset = 0
    this.setData({ favorites: [], hasMore: true }, () => {
      this.loadFavorites(true)
    })
  },

  async loadFavorites(refresh) {
    const { db } = getDB()
    this.setData({ loading: true })
    try {
      // 分页查收藏记录（按时间倒序，skip+limit 避免全表）
      const favRes = await db.collection("favorites")
        .orderBy("created_at", "desc")
        .skip(this._favOffset || 0)
        .limit(PAGE_SIZE)
        .get()
      const favs = favRes.data

      if (!favs.length) {
        this.setData({ hasMore: false, loading: false })
        return
      }

      // 仅当次页的 poemIds（并控制在 MAX_IN 内）查 poems 集合
      const poemIds = favs.map((f) => f.poem_id).filter(Boolean).slice(0, MAX_IN)
      let poemsMap = {}
      if (poemIds.length) {
        const poemRes = await db.collection("poems").where({
          _id: db.command.in(poemIds),
        }).get()
        poemRes.data.forEach((p) => { poemsMap[p._id] = p })
      }

      const newFavs = favs.map((f) => {
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

      this._favOffset = (this._favOffset || 0) + favs.length
      const all = refresh ? newFavs : this.data.favorites.concat(newFavs)
      this.setData({
        favorites: all,
        hasMore: favs.length === PAGE_SIZE,
        loading: false,
      })
    } catch (err) {
      console.error("[favorites] error:", err)
      this.setData({ loading: false })
      wx.showToast({ title: "加载失败", icon: "none" })
    }
  },

  onTapPoem(e) {
    const item = e.currentTarget.dataset.item
    if (!item) return
    // 统一用 ?id= 导航（不再依赖 globalData，避免跨页形状不一致）
    wx.navigateTo({ url: "/pages-sub/info/poem/poem?id=" + item.poemId })
  },

  onExplore() {
    wx.switchTab({ url: "/pages/index/index" })
  },

  onLoadMore() {
    if (this.data.loading || !this.data.hasMore) return
    this.loadFavorites(false)
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
