/**
 * 收藏页 — 用户收藏的诗词列表
 * 数据路径：favorites 集合 → poem_id → poems 集合联表
 * 安全规则保证仅本人可读写
 */
const { getDB } = require("../../utils/cloudbase.js")
const { splitPoemLines } = require("../../utils/util.js")
const { syncTabBar } = require("../../utils/tab-bar.js")
const { ensureOpenId } = require("../../utils/user-session.js")

const PAGE_SIZE = 20
const MAX_IN = 100 // CloudBase _.in() 数组上限

Page({
  data: {
    favorites: [],
    loading: true,
    hasMore: true,
    openid: "",
    listError: "",
    removingId: "",
  },

  onShow() {
    syncTabBar(this, 'fav')
    // 每次进入刷新（收藏可能在诗词页变更）
    this.resetAndLoad()
  },

  resetAndLoad() {
    if (this._loadingFavorites) return
    this._favOffset = 0
    this.setData({ favorites: [], hasMore: true, listError: "" }, () => {
      this.loadFavorites(true)
    })
  },

  async loadFavorites(refresh) {
    if (this._loadingFavorites) return
    this._loadingFavorites = true
    const { db } = getDB()
    this.setData({ loading: true, listError: "" })
    try {
      const openid = await ensureOpenId()
      this.setData({ openid })
      // 分页查收藏记录（按时间倒序，skip+limit 避免全表）
      const favRes = await db.collection("favorites")
        .where({ _openid: openid })
        .orderBy("created_at", "desc")
        .skip(this._favOffset || 0)
        .limit(PAGE_SIZE)
        .get()
      const favs = favRes.data || []

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
        listError: "",
      })
    } catch (err) {
      console.error("[favorites] error:", err)
      this.setData({ loading: false, listError: "收藏加载失败，请检查网络后重试。" })
    } finally {
      this._loadingFavorites = false
    }
  },

  onRetryLoad() {
    if (this.data.favorites.length) this.loadFavorites(false)
    else this.resetAndLoad()
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
    if (!item || this.data.removingId) return
    const { db } = getDB()
    this.setData({ removingId: item.favId, listError: "" })
    try {
      const result = await db.collection("favorites").doc(item.favId).remove()
      if (!result.stats || result.stats.removed !== 1) throw new Error('收藏删除未生效')
      this.setData({ favorites: this.data.favorites.filter((f) => f.favId !== item.favId) })
      getApp().globalData.favoriteRevision = Date.now()
      wx.showToast({ title: "已取消收藏", icon: "success" })
    } catch (err) {
      console.error('[favorites] remove failed:', err)
      this.setData({ listError: "取消收藏失败，列表没有发生变化。请重试。" })
    } finally {
      this.setData({ removingId: "" })
    }
  },
})
