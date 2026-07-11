/**
 * 发布动态页
 * 入参: poem_id? poem_title? author_name? （从诗词/作者页引用入口传入）
 * 流程: 文字(≤500) + 图片( chooseMedia ≤9 本地预览) + 可选关联诗词 → community.publish → 返回并刷新 Feed
 */
const { debounce } = require('../../../utils/util.js')

const MAX_CONTENT = 500
const MAX_IMAGES = 9

Page({
  data: {
    MAX_CONTENT,
    MAX_IMAGES,
    content: '',
    images: [],
    poemId: '',
    poemTitle: '',
    authorName: '',
    count: 0,
    submitting: false,
  },

  onLoad(options) {
    const payload = {}
    if (options.poem_id) payload.poemId = options.poem_id
    if (options.poem_title) payload.poemTitle = decodeURIComponent(options.poem_title)
    if (options.author_name) payload.authorName = decodeURIComponent(options.author_name)
    if (Object.keys(payload).length) this.setData(payload)
  },

  onShow() {
    // 从搜索页选诗返回后，回写 poem_id + title
    const ret = getApp()._publishReturn
    if (ret && ret.poem_id) {
      this.setData({
        poemId: ret.poem_id,
        poemTitle: ret.poem_title || '',
        authorName: ret.author_name || this.data.authorName,
      })
      getApp()._publishReturn = null
    }
  },

  // 引用一首诗 → 跳搜索页选诗
  onPickPoem() {
    wx.navigateTo({ url: '/pages/search/search?from=publish' })
  },

  onContentInput(e) {
    const v = e.detail.value.slice(0, MAX_CONTENT)
    this.setData({ content: v, count: v.length })
  },

  onChooseImages() {
    const remain = MAX_IMAGES - this.data.images.length
    if (remain <= 0) {
      wx.showToast({ title: `最多 ${MAX_IMAGES} 张`, icon: 'none' })
      return
    }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const paths = res.tempFiles.map((f) => f.tempFilePath)
        this.setData({ images: this.data.images.concat(paths).slice(0, MAX_IMAGES) })
      },
      fail: () => {},
    })
  },

  onPreviewImage(e) {
    const idx = e.currentTarget.dataset.index
    wx.previewImage({ urls: this.data.images, current: this.data.images[idx] })
  },

  onRemoveImage(e) {
    const idx = e.currentTarget.dataset.index
    const images = this.data.images.slice()
    images.splice(idx, 1)
    this.setData({ images })
  },

  // 移除已关联的诗词/作者
  onClearPoem() { this.setData({ poemId: '', poemTitle: '' }) },
  onClearAuthor() { this.setData({ authorName: '' }) },

  onSubmit: debounce(function () {
    this._submit()
  }, 500),

  async _submit() {
    const content = this.data.content.trim()
    if (!content) {
      wx.showToast({ title: '写点什么吧', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    wx.showLoading({ title: '发布中…', mask: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'community',
        data: {
          action: 'publish',
          content,
          images: this.data.images,
          poem_id: this.data.poemId || '',
          author_name: this.data.authorName || '',
        },
      })
      wx.hideLoading()
      const r = res.result || {}
      if (!r.ok) {
        wx.showToast({ title: r.error || '发布失败', icon: 'none' })
        this.setData({ submitting: false })
        return
      }
      // 通知 Feed 刷新；返回上一页
      try { wx.setStorageSync('community_need_refresh', true) } catch (e) {}
      wx.showToast({ title: '已发布', icon: 'success' })
      setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/community/community' }) }), 600)
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '网络异常', icon: 'none' })
      this.setData({ submitting: false })
    }
  },

  onShareAppMessage() {
    return { title: '诗词社区 — 分享你的感悟', path: '/pages/community/community' }
  },
})
