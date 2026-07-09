/**
 * 诗词详情页
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
  },

  onLoad(options) {
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
        title: poem.title,
        author: poem.author,
        dynasty: poem.dynasty,
        content: poem.content,
        lines: splitPoemLines(poem.content),
        annotation: poem.annotation || '',
        translation: poem.translation || '',
        appreciation: poem.appreciation || '',
      },
      places,
      loading: false,
    })
    if (this.poemId) this.checkFavorite()
  },

  onSelectTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.key })
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
            poem_id: this.poemId,
            poem_title: this.data.poem.title,
            poem_author: this.data.poem.author,
          },
        })
        wx.showToast({ title: '收藏成功', icon: 'success' })
      }
    } catch (err) {
      this.setData({ isFavorited: wasFav })
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  onAskAI() {
    wx.showModal({
      title: 'AI 诗词解析',
      content: 'AI 深度解读将在 M5 接入 CloudBase 内置大模型，敬请期待。',
      showCancel: false,
    })
  },

  onTapPlace(e) {
    const place = e.currentTarget.dataset.place
    if (!place) return
    wx.showToast({ title: place.name + '（地图联动开发中）', icon: 'none' })
  },

  onShareAppMessage() {
    const t = this.data.poem
    const title = t ? t.title + ' - ' + t.author : '诗词地图'
    const path = this.poemId ? '/pages/poem/poem?id=' + this.poemId : '/pages/index/index'
    return { title, path }
  },
})
