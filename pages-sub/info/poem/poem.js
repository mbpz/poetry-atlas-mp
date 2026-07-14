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
    const { db } = getDB()
    try {
      const res = await db.collection('poems').doc(id).get()
      if (!res.data) {
        wx.showToast({ title: '诗词不存在', icon: 'none' })
        return
      }
      this.renderPoem(res.data)
    } catch (err) {
      console.error('[poem] error:', err)
      this.setData({ loading: false })
    }
  },

  renderPoem(poem) {
    const places = (poem.place_names || []).map((name) => ({ name }))
    const lines = splitPoemLines(poem.content)
    this.setData({
      poem: {
        title: poem.title,
        author: poem.author,
        dynasty: poem.dynasty,
        content: poem.content,
        lines,
      },
      places,
      loading: false,
    })
    if (!this.poemId && poem._id) this.poemId = poem._id
    if (this.poemId) {
      this.checkFavorite()
      this.loadRecitations()
    }
  },

  async checkFavorite() {
    const { db } = getDB()
    try {
      const res = await db.collection('favorites').where({ poem_id: this.poemId }).count()
      this.setData({ isFavorited: res.total > 0 })
    } catch (e) {}
  },

  async onToggleFavorite() {
    if (!this.poemId) {
      wx.showToast({ title: '暂不支持收藏', icon: 'none' })
      return
    }
    const { db } = getDB()
    const app = getApp()
    const openid = app.globalData.openid || ''
    const wasFav = this.data.isFavorited
    this.setData({ isFavorited: !wasFav })
    try {
      if (wasFav) {
        const res = await db.collection('favorites').where({ poem_id: this.poemId }).get()
        if (res.data[0]) await db.collection('favorites').doc(res.data[0]._id).remove()
        wx.showToast({ title: '已取消', icon: 'success' })
      } else {
        await db.collection('favorites').add({
          data: {
            _openid: openid,
            poem_id: this.poemId,
            poem_title: this.data.poem.title,
            poem_author: this.data.poem.author,
            created_at: Date.now(),
          },
        })
        wx.showToast({ title: '收藏成功', icon: 'success' })
      }
    } catch (err) {
      this.setData({ isFavorited: wasFav })
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  onTapPlace(e) {
    const place = e.currentTarget.dataset.place
    if (!place) return
    if (!getApp()._placeNameCache) getApp()._placeNameCache = {}
    const cache = getApp()._placeNameCache
    if (cache[place.name]) {
      wx.navigateTo({ url: '/pages-sub/info/place/place?id=' + cache[place.name] })
      return
    }
    wx.showLoading({ title: '定位…' })
    wx.cloud.callFunction({
      name: 'listPlaces',
      data: { keyword: place.name, limit: 5 },
    }).then((res) => {
      wx.hideLoading()
      const list = (res.result && res.result.data) || []
      const matched = list.find((p) => p.name === place.name) || list[0]
      if (matched && matched._id) {
        cache[place.name] = matched._id
        wx.navigateTo({ url: '/pages-sub/info/place/place?id=' + matched._id })
      } else {
        wx.showToast({ title: '地点详情暂不可用', icon: 'none' })
      }
    }).catch(() => {
      wx.hideLoading()
      wx.showToast({ title: '地点详情暂不可用', icon: 'none' })
    })
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
    try {
      const res = await wx.cloud.callFunction({
        name: 'ttsPoem',
        data: {
          poem_id: this.poemId || '',
          voice,
          text: this.poemId ? undefined : poem.content,
          title: poem.title,
          author: poem.author,
          dynasty: poem.dynasty,
        },
      })
      const result = res.result || {}
      if (!result.ok) {
        throw new Error(result.error || '朗读失败')
      }
      const src = result.audio_url || result.fileID
      if (!src) throw new Error('未返回音频')
      this.setData({
        showMiniPlayer: true,
        playerSrc: src,
        playerDuration: result.duration || 0,
        playerRecitationId: '',
        playerAutoplay: true,
      })
    } catch (err) {
      console.warn('[poem] tts failed:', err)
      const msg = (err && err.message) || '朗读失败'
      wx.showToast({
        title: msg.length > 20 ? '朗读暂不可用' : msg,
        icon: 'none',
        duration: 2500,
      })
    } finally {
      this.setData({ ttsLoading: false, ttsVoice: '' })
    }
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
