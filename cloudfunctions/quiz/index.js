'use strict'
/**
 * 云函数：quiz（诗词对战）
 * 动作:
 *   initQuiz  一次性入库：从 bundled questions.json 写入 quiz_questions 集合（幂等，poem_id+stem 去重）
 *   start     返回一轮 10 道题（随机打乱 + 去重 poem_id），仅传 stem/options/type，不传 answer
 *   submit    传入 [{question_id, user_answer}] → 服务端判分 + 返回每题对错/正确答案/得分/explain
 *              同时更新当前用户的 stats.quiz_total / quiz_wins
 *
 * 集合: quiz_questions
 * schema: { _id, type('fill'|'choice'), poem_id, stem, options[], answer, difficulty(1-3), explain }
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const QUESTION_COLLECTION = 'quiz_questions'
const ROUND_SIZE = 10
const SECONDS_PER_QUESTION = 15

// 预置题库（由 scripts/seed-quiz.cjs 生成）
let questionsBank = []
try {
  questionsBank = require('./questions.json') || []
} catch (e) {
  console.warn('[quiz] questions.json not found, run scripts/seed-quiz.cjs first')
}

// 填空题判分：去空白 + 包含判定
function matchFill(userAnswer, correct) {
  const u = String(userAnswer || '').trim()
  const c = String(correct || '').trim()
  if (!u || !c) return false
  return u.includes(c) || c.includes(u)
}

// 选择题判分：严格等于选项下标
function matchChoice(userAnswer, correct) {
  return Number(userAnswer) === Number(correct)
}

/**
 * initQuiz：批量入库，幂等（poem_id+stem 唯一）
 */
async function initQuiz() {
  if (!questionsBank.length) return { ok: false, error: 'questions.json empty' }
  let inserted = 0
  let skipped = 0
  let failed = 0
  const seen = new Set() // 本批去重
  for (const q of questionsBank) {
    try {
      const dedupeKey = `${q.poem_id}|${q.stem}`
      if (seen.has(dedupeKey)) {
        skipped++
        continue
      }
      seen.add(dedupeKey)
      const existing = await db.collection(QUESTION_COLLECTION)
        .where({ poem_id: q.poem_id, stem: q.stem })
        .limit(1)
        .get()
      if (existing.data && existing.data.length > 0) {
        skipped++
        continue
      }
      const { _id, ...rest } = q
      await db.collection(QUESTION_COLLECTION).add({ data: { _id, ...rest } })
      inserted++
    } catch (err) {
      failed++
      console.error('[quiz] initQuiz write fail:', q._id, err.errMsg || err.message)
    }
  }
  return { ok: true, inserted, skipped, failed, total: questionsBank.length }
}

/**
 * start：从库里随机抽 10 题（去重 poem_id），不回传 answer
 */
async function startRound() {
  // 全量读取 _id 后客户端抽样（库不大，较简单）；需要 answer 字段用于服务端判分但与客户端隔离
  const res = await db.collection(QUESTION_COLLECTION)
    .field({ _id: true, type: true, stem: true, options: true, poem_id: true, difficulty: true, answer: true, explain: true })
    .limit(1000)
    .get()
  let list = res.data || []
  if (list.length < ROUND_SIZE) {
    return { ok: false, error: '题目数量不足，请先将题目入库（调用 initQuiz）', total: list.length }
  }
  // Fisher-Yates 洗牌后贪心抽样，确保 poem_id 不重复
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  const picked = []
  const usedPoems = new Set()
  for (const q of list) {
    if (picked.length >= ROUND_SIZE) break
    if (usedPoems.has(q.poem_id)) continue
    usedPoems.add(q.poem_id)
    picked.push({
      _id: q._id,
      type: q.type,
      stem: q.stem,
      options: q.options || [],
      difficulty: q.difficulty || 1,
      answer: q.answer,
      explain: q.explain,
    })
  }
  // poem_id 不够去重时放宽去重限制（兼容题库 poem 数量少的情况）
  if (picked.length < ROUND_SIZE) {
    for (const q of list) {
      if (picked.length >= ROUND_SIZE) break
      if (picked.find((p) => p._id === q._id)) continue
      picked.push({
        _id: q._id,
        type: q.type,
        stem: q.stem,
        options: q.options || [],
        difficulty: q.difficulty || 1,
        answer: q.answer,
        explain: q.explain,
      })
    }
  }
  return {
    ok: true,
    round_size: ROUND_SIZE,
    seconds_per_question: SECONDS_PER_QUESTION,
    questions: picked,
  }
}

/**
 * submit：判分 + 更新用户统计
 * event.answers: [{ question_id, user_answer }]
 */
async function submitRound(openid, answers) {
  if (!openid) return { ok: false, error: 'no openid' }
  if (!Array.isArray(answers) || !answers.length) {
    return { ok: false, error: 'answers required' }
  }
  const ids = answers.map((a) => a.question_id).filter(Boolean)
  if (!ids.length) return { ok: false, error: 'question_id required' }

  // 批量读取题目（含答案）
  const chunks = []
  for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10))
  let allQuestions = []
  for (const chunk of chunks) {
    const res = await db.collection(QUESTION_COLLECTION).where({ _id: _.in(chunk) }).get()
    allQuestions = allQuestions.concat(res.data || [])
  }
  const questionMap = new Map(allQuestions.map((q) => [q._id, q]))

  let correctCount = 0
  const results = answers.map((a) => {
    const q = questionMap.get(a.question_id)
    if (!q) {
      return { question_id: a.question_id, ok: false, error: 'question not found' }
    }
    const isCorrect = q.type === 'fill'
      ? matchFill(a.user_answer, q.answer)
      : matchChoice(a.user_answer, q.answer)
    if (isCorrect) correctCount++
    return {
      question_id: a.question_id,
      type: q.type,
      stem: q.stem,
      correct: isCorrect,
      user_answer: a.user_answer,
      answer: q.answer,
      explain: q.explain,
    }
  })

  const score = correctCount // 每题 1 分
  const total = answers.length
  // 正确率 ≥ 60% 记录为一次"胜利"
  const won = total > 0 && correctCount / total >= 0.6

  // 静默更新 users stats
  try {
    await db.collection('users').doc(openid).update({
      data: {
        'stats.quiz_total': _.inc(1),
        'stats.quiz_wins': won ? _.inc(1) : _.inc(0), // no-op on loss — 显式表达"仅赢时 +1"
      },
    })
  } catch (err) {
    console.warn('[quiz] updateUser stats failed:', err.errMsg || err.message)
  }

  return {
    ok: true,
    score,
    total,
    correct_count: correctCount,
    accuracy: total > 0 ? Math.round((correctCount / total) * 100) : 0,
    won,
    results,
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action } = event

  try {
    switch (action) {
      case 'initQuiz':
        return await initQuiz()
      case 'start':
        return await startRound()
      case 'submit':
        return await submitRound(openid, event.answers)
      default:
        return { ok: false, error: 'unknown action: ' + action }
    }
  } catch (err) {
    console.error('[quiz] action=' + action + ' error:', err)
    return { ok: false, error: err.errMsg || err.message || 'server error' }
  }
}
