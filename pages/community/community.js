/**
 * 社区 Feed 主页（根 pages/ → tabBar 第 6 项）
 * 流程: banner(用户数/动态数) → Feed 列表(头像+昵称+关联标签+内容+图+点赞❤️+评论💬+时间)
 *       下拉刷新 + 触底加载更多；FAB「写一写」→ 发布器
 * 云函数: community (feed/publish/toggleLike)
 */
const { timeAgo } = require('../../utils/util.js')

const PAGE_SIZE = 10

// 从 posts 列表聚合「用户数」（去重 openid）
function countUsers(posts) {
  const s = new Set()
  posts.forEach((p) => p.openid && s.add(p.openid))
  return s.size
}

Page({
  data: {
    openid: '',
    bannerUsers: 0,
    bannerPosts: 0,
    posts: [],
    page: 1,
    pageSize: PAGE_SIZE,
    loading: true,
    loadingMore: false,
    noMore: false,
    expandedComment: '', // 当前展开评论的 post._id
  },

  onLoad() {
    const app = getApp()
    this.setData({ openid: app.globalData.openid || '' })
  },

  onShow() {
    // 从发布页返回时若有刷新标记，重置列表
    let refreshed = false
    try {
      refreshed = wx.getStorageSync('community_need_refresh')
      if (refreshed) wx.removeStorageSync('community_need_refresh')
    } catch (e) {}
    this.loadFeed(refreshed || this.data.posts.length === 0 ? 'refresh' : 'keep')
  },

  onPullDownRefresh() {
    this.loadFeed('refresh')
  },

  onReachBottom() {
    if (this.data.noMore || this.data.loadingMore) return
    this.loadFeed('more')
  },

  async loadFeed(mode) {
    if (mode === 'refresh') {
      if (this.data.loading) return
      this.setData({ loading: true, noMore: false, page: 1 })
      await this._fetch(1, true)
      wx.stopPullDownRefresh()
      this.setData({ loading: false })
    } else if (mode === 'more') {
      this.setData({ loadingMore: true })
      await this._fetch(this.data.page + 1, false)
      this.setData({ loadingMore: false })
    } else {
      // keep: 轻量刷新 banner 计数，已在 onShow 兜底；若无数据则加载
      if (!this.data.posts.length) {
        this.setData({ loading: true })
        await this._fetch(1, true)
        this.setData({ loading: false })
      }
    }
  },

  async _fetch(page, replace) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'community',
        data: { action: 'feed', page, pageSize: PAGE_SIZE },
      })
      const r = res.result || {}
      if (!r.ok) {
        wx.showToast({ title: r.error || '加载失败', icon: 'none' })
        return
      }
      const me = getApp().globalData.openid || this.data.openid
      const raw = (r.data || []).map((p) => ({
        ...p,
        timeText: timeAgo(p.created_at),
        showFull: false,
        owner: me && p.openid === me,
        following: false,
      }))
      const posts = replace ? raw : this.data.posts.concat(raw)
      this.setData({
        posts,
        page,
        noMore: raw.length < PAGE_SIZE,
        bannerPosts: posts.length,
        bannerUsers: countUsers(posts),
      })
    } catch (err) {
      console.warn('[community] feed failed:', err)
      wx.showToast({ title: '网络异常', icon: 'none' })
    }
  },

  // 点赞 toggle — 乐观更新 + 云函数回写
  async onToggleLike(e) {
    const id = e.currentTarget.dataset.id
    const idx = this.data.posts.findIndex((p) => p._id === id)
    if (idx < 0) return
    const post = this.data.posts[idx]
    const nextLiked = !post.liked
    const nextCount = Math.max(0, (post.likes_count || 0) + (nextLiked ? 1 : -1))
    // 乐观更新
    this.setData({
      [`posts[${idx}].liked`]: nextLiked,
      [`posts[${idx}].likes_count`]: nextCount,
    })
    try {
      const res = await wx.cloud.callFunction({
        name: 'community',
        data: { action: 'toggleLike', target_type: 'post', target_id: id },
      })
      const r = res.result || {}
      if (!r.ok) {
        // 回滚
        this.setData({
          [`posts[${idx}].liked`]: post.liked,
          [`posts[${idx}].likes_count`]: post.likes_count,
        })
      }
    } catch (err) {
      this.setData({
        [`posts[${idx}].liked`]: post.liked,
        [`posts[${idx}].likes_count`]: post.likes_count,
      })
    }
  },

  // 展开/收起评论
  onToggleComments(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ expandedComment: this.data.expandedComment === id ? '' : id })
  },

  // 同步评论组件回传的列表与计数
  onCommentsChange(e) {
    const { postId, commentCount } = e.detail
    const idx = this.data.posts.findIndex((p) => p._id === postId)
    if (idx < 0) return
    this.setData({ [`posts[${idx}].comments_count`]: commentCount })
  },

  // 删除帖子（仅本人，由 post.owner 控制显隐）
  onRemovePost(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除动态',
      content: '确定删除这条动态？',
      confirmColor: '#9e2b23',
      success: (m) => { if (m.confirm) this._removePost(id) },
    })
  },

  async _removePost(id) {
    wx.showLoading({ title: '删除中…', mask: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'community',
        data: { action: 'removePost', postId: id },
      })
      wx.hideLoading()
      const r = res.result || {}
      if (!r.ok) {
        wx.showToast({ title: r.error || '删除失败', icon: 'none' })
        return
      }
      this.setData({ posts: this.data.posts.filter((p) => p._id !== id) })
      wx.showToast({ title: '已删除', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '网络异常', icon: 'none' })
    }
  },

  // 关联诗词 → 跳诗词详情
  onTapPoem(e) {
    const id = e.currentTarget.dataset.poem
    if (id) wx.navigateTo({ url: '/pages-sub/info/poem/poem?id=' + id })
  },

  // FAB：打开发布器
  onOpenPublish() {
    wx.navigateTo({ url: '/pages-sub/community/publish/publish' })
  },

  // 关注 — 乐观翻转 + response 带 following bool 切换按钮文案
  onToggleFollow(e) {
    const following = e.currentTarget.dataset.openid
    if (!following || following === this.data.openid) return
    const idx = this.data.posts.findIndex((p) => p.openid === following)
    const wasFollowing = idx >= 0 && this.data.posts[idx].following
    if (idx >= 0) {
      this.setData({ [`posts[${idx}].following`]: !wasFollowing })
    }
    wx.cloud.callFunction({
      name: 'community',
      data: { action: 'follow', following_openid: following },
      success: (res) => {
        const r = res.result || {}
        const nowFollowing = typeof r.following === 'boolean' ? r.following : !wasFollowing
        if (idx >= 0) this.setData({ [`posts[${idx}].following`]: nowFollowing })
        if (r.ok) wx.showToast({ title: nowFollowing ? '已关注' : '已取消', icon: 'success' })
      },
      fail: () => {
        // 回滚
        if (idx >= 0) this.setData({ [`posts[${idx}].following`]: wasFollowing })
        wx.showToast({ title: '网络异常', icon: 'none' })
      },
    })
  },

  // 空 handler：阻止 FAB 触摸穿透触底
  noop() {},

  onPreviewImage(e) {
    const { post, idx } = e.currentTarget.dataset
    wx.previewImage({ urls: post.images, current: post.images[idx] })
  },

  onShareAppMessage() {
    return { title: '诗词社区 — 一起来聊诗', path: '/pages/community/community' }
  },
})
