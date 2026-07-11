/**
 * 诗词对战 — 单人闯关页
 * 流程: start(段位/开始) → playing(10 题 + 15s 倒计时, 每题显示解析) → result(结算+段位晋升)
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
    showExplain: false,
    lastResult: null, // { correct, answer, explain }
    roundStart: 0,
    questionStart: 0,
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
      this.setData({
        phase: 'playing',
        questions,
        currentIndex: 0,
        currentQuestion: questions[0],
        selectedOption: -1,
        fillValue: '',
        answers: [],
        showExplain: false,
        lastResult: null,
        remaining: r.seconds_per_question || 15,
        roundStart: Date.now(),
        questionStart: Date.now(),
      })
      this._startCountdown(r.seconds_per_question || 15)
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
    // 到时不答算错
    if (this.data.showExplain) return
    this._submitAnswer(null)
  },

  // ===== playing: choose =====
  onPickOption(e) {
    if (this.data.showExplain) return
    const idx = Number(e.currentTarget.dataset.index)
    this.setData({ selectedOption: idx })
    this._submitAnswer(idx)
  },

  onFillInput(e) {
    this.setData({ fillValue: e.detail.value })
  },

  onSubmitFill() {
    if (this.data.showExplain) return
    const v = this.data.fillValue
    this._submitAnswer(v)
  },

  _submitAnswer(userAnswer) {
    if (this.data.showExplain) return
    this._clearTimer()
    const q = this.data.currentQuestion
    const question_id = q._id
    // 本地先"判分"：需要服务端答案才能判对错 → 改为全部进入"下一题"，结算时统一提交
    // 为实现每题显示解析的效果，我们在 submit 每题时立即拿到正确答案
    this.setData({
      showExplain: false,
      answers: this.data.answers.concat({ question_id, userAnswer }),
    })
    this._advance()
  },

  _advance() {
    const next = this.data.currentIndex + 1
    if (next >= this.data.questions.length) {
      this._finishRound()
      return
    }
    this.setData({
      currentIndex: next,
      currentQuestion: this.data.questions[next],
      selectedOption: -1,
      fillValue: '',
      showExplain: false,
      lastResult: null,
      questionStart: Date.now(),
    })
    this._startCountdown(this.data.remaining > 0 ? this.data.secondsPerQuestion || 15 : 15)
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
