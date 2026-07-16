/**
 * 我的 — 用户中心 Hub
 * 微信头像昵称填写能力（chooseAvatar + type=nickname）+ 收藏/路线统计
 */
const config = require("../../config.js")
const { getDB } = require("../../utils/cloudbase.js")
const { syncTabBar } = require("../../utils/tab-bar.js")
const { writeStoredSearchState } = require("../../utils/search-state.js")
const { ensureOpenId } = require("../../utils/user-session.js")

Page({
  data: {
    nickname: "",
    avatarUrl: "",
    avatarText: "诗",
    hasProfile: false,
    favCount: 0,
    stats: { routes_count: 0, recitation_count: 0 },
    version: config.VERSION,
    savingAvatar: false,
    savingNickname: false,
    profileError: "",
    statsLoading: false,
    statsError: "",
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
    if (this._loadingStats) return
    this._loadingStats = true
    this.setData({ statsLoading: true, statsError: "" })
    const { db } = getDB()
    try {
      const openid = await ensureOpenId()
      const fav = await db.collection("favorites").where({ _openid: openid }).count()
      this.setData({ favCount: fav.total })
      const routeRes = await wx.cloud.callFunction({
        name: 'routes',
        data: { action: 'list', page: 1, pageSize: 1 },
      })
      const routeResult = (routeRes && routeRes.result) || {}
      if (!routeResult.ok) throw new Error(routeResult.error || '路线统计失败')
      const app = getApp()
      const globalStats = (app.globalData.user && app.globalData.user.stats) || {}
      const stats = Object.assign(
        { routes_count: 0, recitation_count: 0 },
        globalStats,
        { routes_count: routeResult.total || 0 }
      )
      this.setData({ stats })
      if (app.globalData.user) app.globalData.user.stats = stats
    } catch (err) {
      console.warn('[profile] loadStats failed:', err)
      this.setData({ statsError: '个人统计同步失败，请检查网络后重试。' })
    } finally {
      this._loadingStats = false
      this.setData({ statsLoading: false })
    }
  },

  onRetryStats() {
    this.loadStats()
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
    const previousAvatar = this.data.avatarUrl
    const previousHasProfile = this.data.hasProfile
    this.setData({ avatarUrl: tempPath, hasProfile: true, savingAvatar: true, profileError: "" })
    wx.showLoading({ title: "保存头像…", mask: true })
    try {
      const openid = await ensureOpenId()
      const cloudPath = `avatars/${openid}/${Date.now()}.jpg`
      const up = await wx.cloud.uploadFile({ cloudPath, filePath: tempPath })
      const fileID = up.fileID
      const user = await this._saveUser({ avatar_url: fileID })
      const url = (user && user.avatar_url) || fileID
      this.setData({ avatarUrl: url, hasProfile: true })
      this._toast("头像已更新", "success")
    } catch (err) {
      console.warn("[profile] avatar save fail", err)
      this.setData({
        avatarUrl: previousAvatar,
        hasProfile: previousHasProfile,
        profileError: '头像保存失败，已恢复原头像。',
      })
      this._toast("头像保存失败", "none")
    } finally {
      this._savingAvatar = false
      this.setData({ savingAvatar: false })
    }
  },

  /** 昵称填写（键盘上方可一键选微信昵称）—— 只用 blur，避免 change+blur 双触发 */
  async onNicknameBlur(e) {
    const nick = String((e.detail && e.detail.value) || "").trim().slice(0, 12)
    if (!nick) return
    if (nick === this.data.nickname) return
    if (this._savingNick) return
    this._savingNick = true
    const previousNickname = this.data.nickname
    const previousAvatarText = this.data.avatarText
    const previousHasProfile = this.data.hasProfile
    // 先乐观更新 UI，避免输入框回跳
    this.setData({
      nickname: nick,
      avatarText: nick.slice(0, 1) || "诗",
      hasProfile: true,
      savingNickname: true,
      profileError: "",
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
      this.setData({
        nickname: previousNickname,
        avatarText: previousAvatarText,
        hasProfile: previousHasProfile,
        profileError: '昵称保存失败，已恢复原昵称。',
      })
      this._toast("保存失败", "none")
    } finally {
      this._savingNick = false
      this.setData({ savingNickname: false })
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
    const r = await wx.cloud.callFunction({ name: "updateUser", data: payload })
    const result = r.result || {}
    if (!result.ok) throw new Error(result.error || '用户资料保存失败')
    const user = result.user || payload
    this._mergeGlobalUser(user)
    return user
  },

  onDismissProfileError() {
    this.setData({ profileError: "" })
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
    const pending = { keyword: '静夜思', activeTab: 'poem', scrollTop: 0 }
    writeStoredSearchState(wx, pending)
    getApp().globalData.pendingSearch = pending
    wx.switchTab({ url: "/pages/search/search" })
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
