/**
 * 诗词详情页 — 交互增强（Spotify抽屉 + 共享元素 + Linear弹簧）
 */
const { getDB } = require('../../utils/cloudbase.js')
const { splitPoemLines } = require('../../utils/util.js')

Page({
  data: {
    poem: null,
    tabs: [
      { key: 'annotation', label: '注释' },
      { key: 'translation', label: '译文' },
      { key: 'appreciation', label: '赏析' },
    ],
    activeTab: 'annotation',
    places: [],
    loading: true,
    isFavorited: false,
    AI: { show: false, loading: false, content: '', structured: null, dragging: false, sheetHeight: 30 },
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
        setTimeout(() => wx.navigateBack(), 1000)
        return
      }
      this.poemId = poem._id || ''
      this.renderPoem(poem)
    }
  },

  onUnload() {
    getApp().globalData.currentPoem = null
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
    this.setData({
      poem: {
        title: poem.title, author: poem.author, dynasty: poem.dynasty, content: poem.content,
        lines: splitPoemLines(poem.content),
        annotation: poem.annotation || '', translation: poem.translation || '', appreciation: poem.appreciation || '',
      },
      places, loading: false,
    })
    if (this.poemId) this.checkFavorite()
  },

  onSelectTab(e) { this.setData({ activeTab: e.currentTarget.dataset.key }) },

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
    const wasFav = this.data.isFavorited
    this.setData({ isFavorited: !wasFav })
    try {
      if (wasFav) {
        const res = await db.collection('favorites').where({ poem_id: this.poemId }).get()
        if (res.data[0]) await db.collection('favorites').doc(res.data[0]._id).remove()
        wx.showToast({ title: '已取消', icon: 'success' })
      } else {
        await db.collection('favorites').add({
          data: { poem_id: this.poemId, poem_title: this.data.poem.title, poem_author: this.data.poem.author },
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

  onTapPlace(e) {
    const place = e.currentTarget.dataset.place
    if (!place) return
    wx.showToast({ title: place.name + '（地图联动开发中）', icon: 'none' })
  },

  onShareAppMessage() {
    const t = this.data.poem
    const title = t ? t.title + ' - ' + t.author : '诗词地图'
    const path = this.poemId ? '/pages-sub/info/poem/poem?id=' + this.poemId : '/pages/index/index'
    return { title, path }
  },
})
