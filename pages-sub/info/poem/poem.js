/**
 * 诗词详情页 — 交互增强（Spotify抽屉 + 共享元素 + Linear弹簧）
 */
const { getDB } = require('../../../utils/cloudbase.js')
const { splitPoemLines } = require('../../../utils/util.js')

Page({
  data: {
    poem: null,
    places: [],
    loading: true,
    isFavorited: false,
    AI: { show: false, loading: false, content: '', structured: null, dragging: false, sheetHeight: 30 },
    poemMode: 'v', // v=竖排卷轴, h=横排（沉浸主题默认竖排）
    // 朗诵
    recitations: [],
    recitationCount: 0,
    showMiniPlayer: false,
    playerSrc: '',
    playerDuration: 0,
    playerRecitationId: '',
  },

  onLoad(options) {
    this.setData({ systemInfo: wx.getSystemInfoSync() })
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
    // 合成一个"注释与赏析"字段（拼接三段，用空行分隔；全空则留空让模板引导 AI）
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

  // ===== #1 Spotify 底部抽屉吸附点 =====
  onAskAI() {
    if (this.data.AI.loading) return
    this.setData({ AI: { loading: true, content: '', structured: null, show: true, dragging: false, sheetHeight: 30 } })
    wx.showLoading({ title: '解读中…' })
    wx.cloud
      .callFunction({
        name: 'analyzePoem',
        data: {
          title: this.data.poem.title,
          author: this.data.poem.author,
          dynasty: this.data.poem.dynasty,
          content: this.data.poem.content,
        },
      })
      .then((res) => {
        wx.hideLoading()
        const result = res.result || {}
        if (result.ok) {
          this.setData({ AI: { loading: false, content: result.text || '', structured: result.structured || null, show: true, dragging: false, sheetHeight: 65 } })
        } else {
          this.setData({ AI: { loading: false, content: '', show: false } })
          wx.showToast({ title: result.error || 'AI 解析失败', icon: 'none' })
        }
      })
      .catch(() => {
        wx.hideLoading()
        this.setData({ AI: { loading: false, content: '', show: false } })
        wx.showToast({ title: 'AI 调用异常', icon: 'none' })
      })
  },

  // 卡片触摸 #2 - 共享元素过渡
  onCardTouch(e) { this.setData({ cardPressed: true }) },
  onCardTouchEnd() { this.setData({ cardPressed: false }) },

  // 抽屉把手点击
  onHandleTap() {
    const h = this.data.AI.sheetHeight
    const next = h < 40 ? 65 : 85
    this.setData({ 'AI.sheetHeight': next, 'AI.dragging': false })
  },

  onMaskTouchMove() {},

  // 抽屉拖拽
  onSheetTouchStart(e) {
    this._touchY0 = e.touches[0].clientY
    this._height0 = this.data.AI.sheetHeight
    this._touchT0 = Date.now()
    this.setData({ 'AI.dragging': true })
  },
  onSheetTouchMove(e) {
    if (!this.data.AI.dragging) return
    const deltaY = this._touchY0 - e.touches[0].clientY          // 上滑+
    const screenH = this.data.systemInfo && this.data.systemInfo.windowHeight || 600
    const deltaPct = (deltaY / screenH) * 100
    let newH = this._height0 + deltaPct
    newH = Math.max(20, Math.min(95, newH))
    this.setData({ 'AI.sheetHeight': newH })
  },
  onSheetTouchEnd(e) {
    if (!this.data.AI.dragging) return
    this.setData({ 'AI.dragging': false })
    const dy = this._touchY0 - (e.changedTouches[0] ? e.changedTouches[0].clientY : this._touchY0)
    const dt = Math.max(1, Date.now() - this._touchT0)
    const velocity = dy / dt                         // px/ms, 上滑正
    let h = this.data.AI.sheetHeight
    if (velocity > 0.4) h = 85                   // 快速上滑 → 全屏
    else if (velocity < -0.4) h = 30             // 快速下滑 → peek
    else if (h < 45) h = 30
    else if (h < 75) h = 65
    else h = 85
    this.setData({ 'AI.sheetHeight': h })
  },

  onHideAI() { this.setData({ 'AI.show': false }) },

  noop() {},

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
