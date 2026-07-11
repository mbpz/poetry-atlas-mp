/**
 * 朗诵播放组件 — 宣纸淡墨风格
 * 用法: <audio-player src="{{audioUrl}}" duration="{{duration}}" lines="{{poem.lines}}" title="{{poem.title}}" author="{{poem.author}}" bind:close="onClosePlayer" />
 *
 * Props:
 *   src      — 音频 URL（data URI / 远程 mp3）
 *   duration — 总时长（秒），用于进度条与字幕同步
 *   lines    — 诗词行数组（用于字幕逐句高亮）
 *   title    — 诗歌标题（全屏模式展示）
 *   author   — 作者（全屏模式展示）
 *   recitationId — 可选，用于上报播放计数
 *
 * Events:
 *   close    — 关闭播放器
 *   play     — 开始播放（用于 recordPlay）
 */
Component({
  properties: {
    src: { type: String, value: '' },
    duration: { type: Number, value: 0 },
    lines: { type: Array, value: [] },
    title: { type: String, value: '' },
    author: { type: String, value: '' },
    recitationId: { type: String, value: '' },
  },

  data: {
    isPlaying: false,
    currentTime: 0,
    currentLine: 0,
    expanded: false, // 是否全屏
    progress: 0, // 0-100
    timeText: '0:00',
    durationText: '0:00',
  },

  lifetimes: {
    detached() {
      this._destroyAudio()
    },
  },

  observers: {
    duration(d) {
      this.setData({ durationText: this._fmt(d || 0) })
    },
  },

  pageLifetimes: {
    hide() {
      // 页面隐藏（切后台）时暂停
      if (this.data.isPlaying) this._pause()
    },
  },

  methods: {
    // ===== 内部：音频实例管理 =====
    _ensureAudio() {
      if (this._audio) return this._audio
      const ctx = wx.createInnerAudioContext()
      ctx.src = this.properties.src
      ctx.onTimeUpdate(() => this._onTimeUpdate(ctx))
      ctx.onEnded(() => {
        this.setData({ isPlaying: false, currentTime: 0, currentLine: 0, progress: 0, timeText: '0:00' })
      })
      ctx.onError((err) => {
        console.warn('[audio-player] playback error:', err)
        this.setData({ isPlaying: false })
        wx.showToast({ title: '音频暂不可用', icon: 'none' })
      })
      this._audio = ctx
      return ctx
    },

    _destroyAudio() {
      if (this._audio) {
        try { this._audio.destroy() } catch (e) {}
        this._audio = null
      }
    },

    _onTimeUpdate(ctx) {
      const currentTime = ctx.currentTime || 0
      const duration = ctx.duration || this.properties.duration || 1
      const lines = this.properties.lines || []
      const totalLines = lines.length || 1
      // 估算当前行：按时间比例
      let idx = Math.floor((currentTime / duration) * totalLines)
      if (idx >= totalLines) idx = totalLines - 1
      if (idx < 0) idx = 0
      const progress = Math.min(100, (currentTime / duration) * 100)
      this.setData({
        currentTime,
        currentLine: idx,
        progress,
        timeText: this._fmt(currentTime),
      })
      // 字幕自动滚动到当前行
      if (this.data.expanded) {
        this._scrollToLine(idx)
      }
    },

    _scrollToLine(idx) {
      // 通过 selectorQuery 把当前行滚到字幕区可视内
      const query = this.createSelectorQuery()
      query.select('#line-' + idx).boundingClientRect()
      query.select('.lyrics-scroll').scrollOffset()
      query.exec((res) => {
        if (!res || !res[0] || !res[1]) return
        const rect = res[0]
        const scroll = res[1]
        // 当前行相对 scroll-view 内容顶部 = 行原本 scrollTop + (行的文档top - scroll-view文档top)
        const target = (rect.top - scroll.top) + scroll.scrollTop - 80
        this.setData({ scrollTop: Math.max(0, target) })
      })
    },

    _fmt(sec) {
      sec = Math.max(0, Math.floor(sec || 0))
      const m = Math.floor(sec / 60)
      const s = sec % 60
      return m + ':' + (s < 10 ? '0' : '') + s
    },

    // ===== 播放控制 =====
    onTogglePlay() {
      if (!this.properties.src) {
        wx.showToast({ title: '暂无朗诵音频', icon: 'none' })
        return
      }
      const ctx = this._ensureAudio()
      if (this.data.isPlaying) {
        this._pause()
      } else {
        ctx.play()
        this.setData({ isPlaying: true })
        // 首次播放上报
        if (!this._reported) {
          this._reported = true
          this.triggerEvent('play', { recitationId: this.properties.recitationId })
        }
      }
    },

    _pause() {
      if (this._audio) this._audio.pause()
      this.setData({ isPlaying: false })
    },

    onSeek(e) {
      const ratio = e.detail.value / 100
      const duration = this.properties.duration || 0
      const ctx = this._ensureAudio()
      const target = ratio * duration
      // seek 后继续播放
      try {
        ctx.seek(target)
        if (!this.data.isPlaying) {
          ctx.play()
          this.setData({ isPlaying: true })
        }
      } catch (err) {
        console.warn('[audio-player] seek failed:', err)
      }
    },

    // ===== 展开/收起全屏 =====
    onExpand() {
      this.setData({ expanded: true, scrollTop: 0 })
    },

    onCollapse() {
      this.setData({ expanded: false })
      this._pause()
      this.triggerEvent('close')
    },
  },
})
