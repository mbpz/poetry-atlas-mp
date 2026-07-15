/**
 * 我的 — 用户中心 Hub
 * 微信头像昵称填写能力（chooseAvatar + type=nickname）+ 收藏/路线统计
 */
const config = require("../../config.js")
const { getDB } = require("../../utils/cloudbase.js")
const { syncTabBar } = require("../../utils/tab-bar.js")

Page({
  data: {
    nickname: "",
    avatarUrl: "",
    avatarText: "诗",
    hasProfile: false,
    favCount: 0,
    stats: { routes_count: 0, recitation_count: 0 },
    version: config.VERSION,
  },

  onShow() {
    syncTabBar(this, "me")
    this.syncFromGlobal()
    this.loadStats()
  },

  syncFromGlobal() {
    const app = getApp()
    const user = (app.globalData && app.globalData.user) || {}
    const nickname = user.nickname || ""
    const avatarUrl = user.avatar_url || ""
    this.setData({
      nickname,
      avatarUrl,
      avatarText: (nickname || "诗").slice(0, 1),
      hasProfile: !!(nickname || avatarUrl),
    })
  },

  async loadStats() {
    const { db } = getDB()
    try {
      const fav = await db.collection("favorites").count()
      this.setData({ favCount: fav.total })
    } catch (e) {
      this.setData({ favCount: 0 })
    }
    const app = getApp()
    if (app.globalData.user && app.globalData.user.stats) {
      this.setData({ stats: app.globalData.user.stats })
    }
  },

  /** 选择微信头像 → 上传云存储 → 写入 users */
  async onChooseAvatar(e) {
    const tempPath = e.detail && e.detail.avatarUrl
    if (!tempPath) {
      wx.showToast({ title: "未获取到头像", icon: "none" })
      return
    }
    if (this._savingAvatar) return
    this._savingAvatar = true
    this.setData({ avatarUrl: tempPath, hasProfile: true })
    wx.showLoading({ title: "保存头像…", mask: true })
    try {
      const cloudPath = `avatars/${Date.now()}.jpg`
      const up = await wx.cloud.uploadFile({ cloudPath, filePath: tempPath })
      const fileID = up.fileID
      const user = await this._saveUser({ avatar_url: fileID })
      const url = (user && user.avatar_url) || fileID
      this.setData({ avatarUrl: url, hasProfile: true })
      this._toast("头像已更新", "success")
    } catch (err) {
      console.warn("[profile] avatar save fail", err)
      this._toast("头像保存失败", "none")
    } finally {
      this._savingAvatar = false
    }
  },

  /** 昵称填写（键盘上方可一键选微信昵称）—— 只用 blur，避免 change+blur 双触发 */
  async onNicknameBlur(e) {
    const nick = String((e.detail && e.detail.value) || "").trim().slice(0, 12)
    if (!nick) return
    if (nick === this.data.nickname) return
    if (this._savingNick) return
    this._savingNick = true
    // 先乐观更新 UI，避免输入框回跳
    this.setData({
      nickname: nick,
      avatarText: nick.slice(0, 1) || "诗",
      hasProfile: true,
    })
    wx.showLoading({ title: "保存…", mask: true })
    try {
      const user = await this._saveUser({ nickname: nick })
      const saved = (user && user.nickname) || nick
      this.setData({
        nickname: saved,
        avatarText: saved.slice(0, 1) || "诗",
        hasProfile: true,
      })
      this._toast("昵称已更新", "success")
    } catch (err) {
      console.warn("[profile] nickname save fail", err)
      this._toast("保存失败", "none")
    } finally {
      this._savingNick = false
    }
  },

  /** 先关 loading 再 toast，避免 hideLoading 把 toast 冲掉 */
  _toast(title, icon) {
    wx.hideLoading({
      complete: () => {
        wx.showToast({ title, icon: icon || "none", duration: 2000 })
      },
    })
  },

  async _saveUser(payload) {
    // 优先云函数（可 upsert）；失败则直写 users 集合兜底
    try {
      const r = await wx.cloud.callFunction({ name: "updateUser", data: payload })
      const result = r.result || {}
      if (result.ok) {
        const user = result.user || payload
        this._mergeGlobalUser(user)
        return user
      }
      console.warn("[profile] updateUser not ok:", result.error)
    } catch (err) {
      console.warn("[profile] updateUser call fail, fallback to db:", err)
    }

    const app = getApp()
    const openid = app.globalData && app.globalData.openid
    if (!openid) throw new Error("no openid")

    const { db } = getDB()
    const doc = db.collection("users").doc(openid)
    try {
      await doc.update({ data: payload })
    } catch (err) {
      const prev = (app.globalData && app.globalData.user) || {}
      await doc.set({
        data: Object.assign(
          {
            nickname: "",
            avatar_url: "",
            created_at: Date.now(),
            stats: { routes_count: 0, recitation_count: 0 },
          },
          prev,
          payload
        ),
      })
    }
    const user = Object.assign({}, app.globalData.user || {}, payload)
    this._mergeGlobalUser(user)
    return user
  },

  _mergeGlobalUser(user) {
    const app = getApp()
    app.globalData.user = Object.assign({}, app.globalData.user || {}, user)
  },

  onTapFavorites() {
    wx.switchTab({ url: "/pages/favorites/favorites" })
  },
  onTapRoute() {
    wx.navigateTo({ url: "/pages-sub/routes/list/list" })
  },
  onTapRecitation() {
    wx.navigateTo({ url: "/pages/search/search?kw=%E9%9D%99%E5%A4%9C%E6%80%9D" })
  },

  onTapAbout() {
    wx.showModal({
      title: "关于 诗词地图",
      content:
        "在地图上阅读中国，在诗词中穿越历史。\n\n版本 v" +
        config.VERSION +
        "\n数据：中国古诗词开源数据集\n地图与云端能力由 CloudBase 驱动",
      showCancel: false,
    })
  },

  onShareAppMessage() {
    return { title: "在地图上阅读中国 — 诗词地图", path: "/pages/index/index" }
  },
})
