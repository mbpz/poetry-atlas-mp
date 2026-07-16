/**
 * 诗词详情页 — 横排正文 + 收藏 + 朗读 + 相关地点
 * 合规：个人主体不提供生成式 AI；注释/赏析暂不展示。
 * 朗读：云函数 ttsPoem（腾讯云基础 TTS），非大模型生成。
 */
const { getDB } = require('../../../utils/cloudbase.js')
const { splitPoemLines } = require('../../../utils/util.js')

Page({
  data: {
    poem: null,
    places: [],
    loading: true,
    isFavorited: false,
    recitations: [],
    recitationCount: 0,
    ttsLoading: false,
    ttsVoice: '',
    showMiniPlayer: false,
    playerSrc: '',
    playerDuration: 0,
    playerRecitationId: '',
    playerAutoplay: false,
    loadError: '',
    favoriteBusy: false,
    favoriteChecking: false,
    favoriteError: '',
    placeBusy: false,
    placeError: '',
  },

  onLoad(options) {
    if (options.id) {
      this.poemId = options.id
      this.loadPoemById(options.id)
    } else {
      const poem = getApp().globalData.currentPoem
      if (!poem) {
        wx.showToast({ title: '请先选择一首诗', icon: 'none' })
        this._backTimer = setTimeout(() => wx.navigateBack(), 1000)
        return
      }
      this.poemId = poem._id || ''
      this.renderPoem(poem)
    }
  },

  onUnload() {
    getApp().globalData.currentPoem = null
    if (this._backTimer) clearTimeout(this._backTimer)
  },

  onShow() {
    if (this.poemId && this.data.poem && !this.data.favoriteBusy) this.checkFavorite()
  },

  async loadRecitations() {
    if (!this.poemId) return
    try {
      const res = await wx.cloud.callFunction({
        name: 'recitations',
        data: { action: 'list', poem_id: this.poemId },
      })
      const result = res.result || {}
      const all = (result.ok && result.data) || []
      const recitations = all.filter((r) => r.audio_url && !String(r.audio_url).startsWith('data:'))
      this.setData({
        recitations,
        recitationCount: recitations.length,
      })
    } catch (err) {
      console.warn('[poem] loadRecitations failed:', err)
      this.setData({ recitations: [], recitationCount: 0 })
    }
  },

  async loadPoemById(id) {
    if (this._loadingPoem) return
    this._loadingPoem = true
    this.setData({ loading: true, loadError: '' })
    const { db } = getDB()
    try {
      const res = await db.collection('poems').doc(id).get()
      if (!res.data) {
        this.setData({ loading: false, loadError: '诗词不存在或已下线。' })
        return
      }
      this.renderPoem(res.data)
    } catch (err) {
      console.error('[poem] error:', err)
      this.setData({ loading: false, loadError: '诗词加载失败，请检查网络后重试。' })
    } finally {
      this._loadingPoem = false
    }
  },

  onRetryPoem() {
    if (this.poemId) this.loadPoemById(this.poemId)
  },

  renderPoem(poem) {
    const places = (poem.place_names || []).map((name) => ({ name }))
    const lines = splitPoemLines(poem.content)
    this.setData({
      poem: {
        _id: poem._id || poem.canonical_id || '',
        canonical_id: poem.canonical_id || poem._id || '',
        title: poem.title,
        author: poem.author,
        dynasty: poem.dynasty,
        content: poem.content,
        lines,
        content_kind: poem.content_kind || '',
        data_version: poem.data_version || '',
        review_status: poem.review_status || '',
        source_name: poem.source_name || '',
        source_url: poem.source_url || '',
        source_license: poem.source_license || '',
        source_checked_at: poem.source_checked_at || '',
        review_note: poem.review_note || '',
      },
      places,
      loading: false,
      loadError: '',
    })
    if (!this.poemId && poem._id) this.poemId = poem._id
    if (this.poemId) {
      this.checkFavorite()
      this.loadRecitations()
    }
  },

  async checkFavorite() {
    if (!this.poemId) return
    this.setData({ favoriteChecking: true })
    const { db } = getDB()
    try {
      const openid = await this._requireOpenId()
      const res = await db.collection('favorites').where({ _openid: openid, poem_id: this.poemId }).count()
      this.setData({ isFavorited: res.total > 0, favoriteError: '' })
    } catch (err) {
      console.warn('[poem] checkFavorite failed:', err)
      this.setData({ favoriteError: '收藏状态同步失败，请重试。' })
    } finally {
      this.setData({ favoriteChecking: false })
    }
  },

  async _requireOpenId() {
    const app = getApp()
    if (app.globalData.openid) return app.globalData.openid
    const res = await wx.cloud.callFunction({ name: 'login' })
    const result = res.result || {}
    if (!result.openid) throw new Error('无法获取当前用户身份')
    app.globalData.openid = result.openid
    if (result.user) app.globalData.user = result.user
    return result.openid
  },

  onRetryFavorite() {
    if (this.data.favoriteBusy) return
    this.checkFavorite()
  },

  async onToggleFavorite() {
    if (this.data.favoriteBusy || this.data.favoriteChecking) return
    if (!this.poemId) {
      this.setData({ favoriteError: '当前诗词缺少唯一标识，暂不支持收藏。' })
      return
    }
    const { db } = getDB()
    const app = getApp()
    const wasFav = this.data.isFavorited
    this.setData({ isFavorited: !wasFav, favoriteBusy: true, favoriteError: '' })
    try {
      const openid = await this._requireOpenId()
      const condition = { _openid: openid, poem_id: this.poemId }
      if (wasFav) {
        const res = await db.collection('favorites').where(condition).limit(20).get()
        for (const favorite of (res.data || [])) {
          const removed = await db.collection('favorites').doc(favorite._id).remove()
          if (!removed.stats || removed.stats.removed !== 1) throw new Error('收藏删除未生效')
        }
        wx.showToast({ title: '已取消', icon: 'success' })
      } else {
        const existing = await db.collection('favorites').where(condition).limit(1).get()
        if (!existing.data || !existing.data.length) {
          const added = await db.collection('favorites').add({
            data: {
              poem_id: this.poemId,
              poem_title: this.data.poem.title,
              poem_author: this.data.poem.author,
              created_at: Date.now(),
            },
          })
          if (!added._id) throw new Error('收藏写入未返回文档 ID')
        }
        wx.showToast({ title: '收藏成功', icon: 'success' })
      }
      app.globalData.favoriteRevision = Date.now()
    } catch (err) {
      console.error('[poem] toggle favorite failed:', err)
      this.setData({ isFavorited: wasFav })
      this.setData({ favoriteError: '收藏操作失败，已恢复原状态。请检查网络后重试。' })
    } finally {
      this.setData({ favoriteBusy: false })
    }
  },

  onTapAuthor() {
    const author = this.data.poem && this.data.poem.author
    if (!author) return
    wx.navigateTo({ url: '/pages-sub/info/author/author?name=' + encodeURIComponent(author) })
  },

  onCopySource() {
    const url = this.data.poem && this.data.poem.source_url
    if (!url) return
    wx.setClipboardData({ data: url })
  },

  async onTapPlace(e) {
    const place = (e && e.currentTarget && e.currentTarget.dataset.place) || this._lastPlace
    if (!place || this.data.placeBusy) return
    this._lastPlace = place
    this.setData({ placeBusy: true, placeError: '' })
    if (!getApp()._placeNameCache) getApp()._placeNameCache = {}
    const cache = getApp()._placeNameCache
    if (cache[place.name]) {
      this.setData({ placeBusy: false })
      wx.navigateTo({ url: '/pages-sub/info/place/place?id=' + cache[place.name] })
      return
    }
    wx.showLoading({ title: '定位…' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'listPlaces',
        data: { keyword: place.name, limit: 5 },
      })
      wx.hideLoading()
      const list = (res.result && res.result.data) || []
      const matched = list.find((p) => p.name === place.name) || list[0]
      if (matched && matched._id) {
        cache[place.name] = matched._id
        wx.navigateTo({ url: '/pages-sub/info/place/place?id=' + matched._id })
      } else {
        this.setData({ placeError: '没有找到这个地点的详情。' })
      }
    } catch (err) {
      wx.hideLoading()
      console.warn('[poem] resolve place failed:', err)
      this.setData({ placeError: '地点详情加载失败，请检查网络后重试。' })
    } finally {
      this.setData({ placeBusy: false })
    }
  },

  onRetryPlaceNavigation() {
    this.onTapPlace()
  },

  async onTapTts(e) {
    if (this.data.ttsLoading) return
    const voice = (e.currentTarget.dataset.voice === 'male') ? 'male' : 'female'
    const poem = this.data.poem
    if (!poem) return

    const now = Date.now()
    if (this._lastTtsAt && now - this._lastTtsAt < 2000) return
    this._lastTtsAt = now

    this.setData({ ttsLoading: true, ttsVoice: voice })
    // ① 纯本地 JS TTS（微信内置、零依赖、零网络）—— Android/iOS 真机秒播
    if (wx.textToSpeech) {
      try {
        const src = await this._localTTS(poem.content, voice)
        this.setData({
          showMiniPlayer: true,
          playerSrc: src,
          playerDuration: 0,
          playerRecitationId: '',
          playerAutoplay: true,
        })
        return
      } catch (err) {
        console.warn('[poem] local tts failed:', err)
        this.setData({ ttsLoading: false, ttsVoice: '' })
        wx.showToast({ title: '朗读暂不可用', icon: 'none', duration: 1800 })
        return
      }
    }
    // ② wx.textToSpeech 不可用（旧微信 / 模拟器）→ 提示升级微信
    this.setData({ ttsLoading: false, ttsVoice: '' })
    const info = wx.getSystemInfoSync() || {}
    wx.showModal({
      title: '朗读功能',
      content:
        '朗读需要较新的微信版本（≥ 8.0.30 / 基础库 ≥ 2.21.0）。\n' +
        '当前基础库：' + (info.SDKVersion || '未知') + '\n' +
        '请升级微信后，点右上角「预览」在手机微信体验。',
      showCancel: false,
      confirmText: '知道了',
    })
  },

  // 纯本地 TTS（微信内置 wx.textToSpeech，零依赖）
  _localTTS(content, voice) {
    return new Promise((resolve, reject) => {
      wx.textToSpeech({
        lang: 'zh_CN',
        ttsVoice: voice === 'male' ? 1 : 0,
        content: String(content || ''),
        success: (res) => {
          if (res.errCode === 0 && res.tempFilePath) resolve(res.tempFilePath)
          else reject(new Error(res.errMsg || 'local tts failed'))
        },
        fail: (e) => reject(new Error((e && e.errMsg) || 'local tts unavailable')),
      })
    })
  },

  onPlayRecitation(e) {
    const item = e.currentTarget.dataset.item
    if (!item || !item.audio_url) {
      wx.showToast({ title: '暂无音频', icon: 'none' })
      return
    }
    const now = Date.now()
    if (this._lastPlayAt && now - this._lastPlayAt < 5000) return
    this._lastPlayAt = now
    this.setData({
      showMiniPlayer: true,
      playerSrc: item.audio_url,
      playerDuration: item.duration || 0,
      playerRecitationId: item._id || '',
      playerAutoplay: true,
    })
  },

  onPlayerPlay(e) {
    const recitationId = e.detail && e.detail.recitationId
    if (!recitationId) return
    wx.cloud.callFunction({
      name: 'recitations',
      data: { action: 'recordPlay', recitation_id: recitationId },
    }).catch((err) => console.warn('[poem] recordPlay failed:', err))
  },

  onClosePlayer() {
    this.setData({ showMiniPlayer: false, playerAutoplay: false })
  },

  onShareAppMessage() {
    const t = this.data.poem
    const title = t ? t.title + ' - ' + t.author : '诗词地图'
    const path = this.poemId ? '/pages-sub/info/poem/poem?id=' + this.poemId : '/pages/index/index'
    return { title, path }
  },
})
