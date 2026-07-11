/**
 * 诗词对战 — 单人闯关页
 * 流程: start(段位/开始) → playing(10 题 + 15s 倒计时) → result(结算+集中显示解析)
 * 云函数: quiz (start/submit)
 */
const { splitPoemLines } = require('../../../utils/util.js')

// 段位晋升阈值（得分率 %）
const RANKS = [
  { name: '童生', threshold: 0, emoji: '📖', color: '#9a9386' },
  { name: '秀才', threshold: 30, emoji: '🖌️', color: '#3d6b86' },
  { name: '举人', threshold: 50, emoji: '🎋', color: '#a88848' },
  { name: '进士', threshold: 70, emoji: '🏯', color: '#9e2b23' },
  { name: '状元', threshold: 90, emoji: '👑', color: '#9e2b23' },
]

function rankFromAccuracy(accuracy) {
  let r = RANKS[0]
  for (const ri of RANKS) {
    if (accuracy >= ri.threshold) r = ri
  }
  return r
}

Page({
  data: {
    phase: 'start', // start | playing | result
    // start
    rank: RANKS[0],
    bestScore: 0,
    quizTotal: 0,
    quizWins: 0,
    // playing
    questions: [],
    currentIndex: 0,
    currentQuestion: null,
    selectedOption: -1,
    fillValue: '',
    remaining: 15,
    answers: [], // { question_id, user_answer }
    roundStart: 0,
    questionStart: 0,
    secondsPerQuestion: 15,
    // result
    result: null,
    newRank: null,
    isPromoted: false,
  },

  onLoad() {
    const app = getApp()
    const stats = (app.globalData.user && app.globalData.user.stats) || {}
    const best = wx.getStorageSync('quiz_best_score') || 0
    // 初始展示用默认段位；ondisplay 后根据当前最佳（无历史时显示童生）
    const fakeAccuracy = best || 0
    this.setData({
      bestScore: best,
      quizTotal: stats.quiz_total || 0,
      quizWins: stats.quiz_wins || 0,
      rank: rankFromAccuracy(fakeAccuracy),
    })
  },

  onUnload() {
    this._clearTimer()
  },

  _clearTimer() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
    if (this._advanceTimer) {
      clearTimeout(this._advanceTimer)
      this._advanceTimer = null
    }
  },

  // ===== start =====
  async onStart() {
    wx.showLoading({ title: '出题中…' })
    try {
      const res = await wx.cloud.callFunction({ name: 'quiz', data: { action: 'start' } })
      wx.hideLoading()
      const r = res.result || {}
      if (!r.ok) {
        wx.showToast({ title: r.error || '出题失败', icon: 'none' })
        return
      }
      const questions = (r.questions || []).map((q) => ({
        ...q,
        stemLines: splitPoemLines(q.stem).length
          ? splitPoemLines(q.stem)
          : [q.stem],
      }))
      this._locked = false
      const secs = r.seconds_per_question || 15
      this.setData({
        phase: 'playing',
        questions,
        currentIndex: 0,
        currentQuestion: questions[0],
        selectedOption: -1,
        fillValue: '',
        answers: [],
        secondsPerQuestion: secs,
        remaining: secs,
        roundStart: Date.now(),
        questionStart: Date.now(),
      })
      this._startCountdown(secs)
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '网络异常', icon: 'none' })
    }
  },

  _startCountdown(seconds) {
    this._clearTimer()
    this.setData({ remaining: seconds })
    this._timer = setInterval(() => {
      const rem = this.data.remaining - 1
      if (rem <= 0) {
        this.setData({ remaining: 0 })
        this._clearTimer()
        this._onTimeout()
        return
      }
      this.setData({ remaining: rem })
    }, 1000)
  },

  _onTimeout() {
    // 到时不答算错：用 -1 作哨兵，确保不会命中任何有效选项下标
    if (this._locked) return
    this._submitAnswer(-1)
  },

  // ===== playing: choose =====
  onPickOption(e) {
    if (this._locked) return
    const idx = Number(e.currentTarget.dataset.index)
    this.setData({ selectedOption: idx })
    this._submitAnswer(idx)
  },

  onFillInput(e) {
    this.setData({ fillValue: e.detail.value })
  },

  onSubmitFill() {
    if (this._locked) return
    const v = this.data.fillValue
    this._submitAnswer(v)
  },

  _submitAnswer(userAnswer) {
    if (this._locked) return
    this._locked = true
    this._clearTimer()
    const q = this.data.currentQuestion
    const question_id = q._id
    // 仅记录作答，判分与解析统一在 submit 后由服务端返回并在 result 阶段集中展示
    this.setData({
      answers: this.data.answers.concat({ question_id, userAnswer }),
    })
    // 稍后自动进入下一题（无单题解析，直接推进）
    this._advanceTimer = setTimeout(() => {
      this._advance()
    }, 800)
  },

  _advance() {
    const next = this.data.currentIndex + 1
    if (next >= this.data.questions.length) {
      this._finishRound()
      return
    }
    this._locked = false
    this.setData({
      currentIndex: next,
      currentQuestion: this.data.questions[next],
      selectedOption: -1,
      fillValue: '',
      questionStart: Date.now(),
    })
    this._startCountdown(this.data.secondsPerQuestion)
  },

  // 下一题
  onNextQuestion() {
    this._advance()
  },

  async _finishRound() {
    wx.showLoading({ title: '算分中…' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'quiz',
        data: { action: 'submit', answers: this.data.answers },
      })
      wx.hideLoading()
      const r = res.result || {}
      if (!r.ok) {
        wx.showToast({ title: r.error || '提交失败', icon: 'none' })
        return
      }
      const accuracy = r.accuracy || 0
      const newRank = rankFromAccuracy(accuracy)
      const prevAccuracy = this.data.bestScore || 0
      const prevRank = rankFromAccuracy(prevAccuracy)
      if (accuracy > prevAccuracy) {
        wx.setStorageSync('quiz_best_score', accuracy)
      }
      this.setData({
        phase: 'result',
        result: r,
        newRank,
        isPromoted: newRank.threshold > prevRank.threshold,
        bestScore: Math.max(accuracy, prevAccuracy),
      })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '网络异常', icon: 'none' })
    }
  },

  // ===== result =====
  onRetry() {
    this.setData({ phase: 'start' })
    this.onShowReload()
  },

  onShowReload() {
    // TODO(quiz-stats-refresh): 当前 quizTotal / quizWins 来自 globalData.user.stats，
    //   仅首次登录 / 回到该页时从全局数据刷新；submit 后云函数返回 score/accuracy/won
    //   但不返回更新后的 totals，因此提交一次后首页数字"停住"直到下次登录。
    //   修法：submitRound 在返回里补 quiz_total / quiz_wins；此处 replace 全量读取。
    const app = getApp()
    const stats = (app.globalData.user && app.globalData.user.stats) || {}
    const best = wx.getStorageSync('quiz_best_score') || 0
    this.setData({
      bestScore: best,
      quizTotal: stats.quiz_total || 0,
      quizWins: stats.quiz_wins || 0,
      rank: rankFromAccuracy(best || 0),
    })
  },

  onBack() {
    wx.navigateBack()
  },

  onShareAppMessage() {
    const acc = (this.data.result && this.data.result.accuracy) || 0
    return {
      title: `我在诗词对战中答对 ${acc}%，来挑战！`,
      path: '/pages/index/index',
    }
  },
})
