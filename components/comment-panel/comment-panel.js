/**
 * 评论面板组件 — Feed 帖子底部 inline 展开
 * 用法: <comment-panel post-id="{{item._id}}" comments="{{item.comments}}" bind:change="onCommentsChange" />
 *  外部传入 post-id；组件自建列表 + 输入框 + 删除（仅本人）
 *  事件 change: { postId, comments, commentCount } 通知父层同步计数与列表
 */
const { debounce } = require('../../utils/util.js')

Component({
  properties: {
    postId: { type: String, value: '' },
    // 可为空；未传时组件自己拉
    comments: { type: Array, value: [] },
  },
  data: {
    list: [],
    draft: '',
    loading: false,
    loaded: false,
  },
  observers: {
    'comments': function (v) {
      if (Array.isArray(v) && v.length) {
        this.setData({ list: v, loaded: true })
      }
    },
  },
  lifetimes: {
    attached() {
      if (!this.data.list.length && this.data.postId) this.refresh()
    },
  },
  methods: {
    async refresh() {
      if (!this.data.postId) return
      this.setData({ loading: true })
      try {
        const res = await wx.cloud.callFunction({
          name: 'community',
          data: { action: 'comments', postId: this.data.postId },
        })
        const r = res.result || {}
        if (r.ok) this.setData({ list: r.data || [], loaded: true })
      } catch (err) {
        console.warn('[comment-panel] refresh failed:', err)
      } finally {
        this.setData({ loading: false })
      }
    },

    onInput(e) { this.setData({ draft: e.detail.value }) },

    onSend: debounce(function () {
      const content = this.data.draft.trim()
      if (!content || !this.data.postId) return
      this._send(content)
    }, 400),

    async _send(content) {
      wx.showLoading({ title: '发送中…', mask: true })
      try {
        const res = await wx.cloud.callFunction({
          name: 'community',
          data: { action: 'comment', postId: this.data.postId, content },
        })
        wx.hideLoading()
        const r = res.result || {}
        if (!r.ok) {
          wx.showToast({ title: r.error || '评论失败', icon: 'none' })
          return
        }
        const comment = r.comment || { content, nickname: '', created_at: Date.now(), owner: true }
        const list = this.data.list.concat(comment)
        this.setData({ list, draft: '' })
        this._emit(list)
      } catch (err) {
        wx.hideLoading()
        wx.showToast({ title: '网络异常', icon: 'none' })
      }
    },

    onRemove(e) {
      const id = e.currentTarget.dataset.id
      const item = this.data.list.find((c) => c._id === id)
      if (!item) return
      wx.showModal({
        title: '删除评论',
        content: '确定删除这条评论？',
        confirmColor: '#9e2b23',
        success: (m) => { if (m.confirm) this._remove(id) },
      })
    },

    async _remove(id) {
      wx.showLoading({ title: '删除中…', mask: true })
      try {
        const res = await wx.cloud.callFunction({
          name: 'community',
          data: { action: 'removeComment', commentId: id },
        })
        wx.hideLoading()
        const r = res.result || {}
        if (!r.ok) {
          wx.showToast({ title: r.error || '删除失败', icon: 'none' })
          return
        }
        const list = this.data.list.filter((c) => c._id !== id)
        this.setData({ list })
        this._emit(list)
      } catch (err) {
        wx.hideLoading()
        wx.showToast({ title: '网络异常', icon: 'none' })
      }
    },

    _emit(list) {
      this.triggerEvent('change', {
        postId: this.data.postId,
        comments: list,
        commentCount: list.length,
      })
    },
  },
})
