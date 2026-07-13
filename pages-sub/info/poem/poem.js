/**
 * 诗词详情页 — 注释/译文/赏析（数据集原文）+ 收藏 + 朗诵
 * 合规：个人主体不提供生成式 AI / 深度合成能力。
 */
const { getDB } = require('../../../utils/cloudbase.js')
const { splitPoemLines } = require('../../../utils/util.js')

Page({
  data: {
    poem: null,
    places: [],
    loading: true,
    isFavorited: false,
    poemMode: 'v', // v=竖排卷轴, h=横排
    recitations: [],
    recitationCount: 0,
    showMiniPlayer: false,
    playerSrc: '',
    playerDuration: 0,
    playerRecitationId: '',
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

  // 加载朗诵列表（静默失败 — 不影响诗词详情主流程）
  async loadRecitations() {
    if (!this.poemId) return
    try {
      const res = await wx.cloud.callFunction({
        name: 'recitations',
        data: { action: 'list', poem_id: this.poemId },
      })
      const result = res.result || {}
      const recitations = (result.ok && result.data) || []
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
    // 合成「注释与赏析」：仅拼接数据集字段，不调用任何生成模型
    const parts = [poem.annotation, poem.translation, poem.appreciation].filter(Boolean)
    this.setData({
      poem: {
        title: poem.title, author: poem.author, dynasty: poem.dynasty, content: poem.content,
        lines,
        linesChars: lines.map((l) => Array.from(l)),
        annotation: poem.annotation || '',
        translation: poem.translation || '',
        appreciation: poem.appreciation || '',
        interpretText: parts.join('\n\n'),
      },
      places, loading: false,
    })
    // globalData 路径（如旅行页跳转）可能未带 _id，补上以便加载朗诵
    if (!this.poemId && poem._id) this.poemId = poem._id
    if (this.poemId) {
      this.checkFavorite()
      this.loadRecitations()
    }
  },

  // 横/竖排卷轴切换
  onTogglePoemMode(e) {
    const mode = e.currentTarget.dataset.mode
    this.setData({ poemMode: mode })
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

  // 诗词→地点跳转（通过 name 精确查 _id）
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
      // 精确匹配优先
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

  // ===== 朗诵播放 =====
  onPlayRecitation(e) {
    const item = e.currentTarget.dataset.item
    if (!item) return
    // MVP 客户端防连点：5s 内重复点击忽略；生产改用 recitation_plays 幂等表（服务端按 recitation_id+openid 去重）
    const now = Date.now()
    if (this._lastPlayAt && now - this._lastPlayAt < 5000) return
    this._lastPlayAt = now
    this.setData({
      showMiniPlayer: true,
      playerSrc: item.audio_url || '',
      playerDuration: item.duration || 0,
      playerRecitationId: item._id || '',
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
    this.setData({ showMiniPlayer: false })
  },

  onShareAppMessage() {
    const t = this.data.poem
    const title = t ? t.title + ' - ' + t.author : '诗词地图'
    const path = this.poemId ? '/pages-sub/info/poem/poem?id=' + this.poemId : '/pages/index/index'
    return { title, path }
  },
})
