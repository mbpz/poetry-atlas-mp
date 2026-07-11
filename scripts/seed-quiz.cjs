/**
 * Quiz 出题脚本：从 places.json 的 poems 生成 quiz_questions JSON 题库
 *
 * 输出: data/quiz-questions.json (由 quiz 云函数的 initQuiz action 入库)
 *
 *  填空题 (fill)：随机取 poem.content 一句，挖掉一个非虚词汉字（[一-龥] 且不在停用词表）
 *                → stem:"床前明月光，疑是地上____"  answer:"霜"
 *  选择题 (choice)：随机出「作者题」或「朝代题」(正确答案 + 3 个同朝代干扰项)
 *
 * 文档结构（与 quiz 云函数入库 schema 一致）:
 *  { _id, type, poem_id, stem, options[], answer, difficulty(1-3), explain }
 *
 * 用法：node scripts/seed-quiz.cjs
 *       node scripts/seed-quiz.cjs --dry-run   # 仅预览不写文件
 */
const fs = require('fs')
const path = require('path')

const DRY_RUN = process.argv.includes('--dry-run')
const DATA_FILE = path.join(__dirname, '..', 'data', 'places.json')
const OUT_FILE = path.join(__dirname, '..', 'data', 'quiz-questions.json')
const CLOUD_OUT = path.join(__dirname, '..', 'cloudfunctions', 'quiz', 'questions.json')

// 虚词/停用词表（挖空时跳过这些字）
const STOP_WORDS = new Set(
  '兮之乎者也矣焉哉邪哉欤邪耶欪耳尔然且夫盖故虽则即以于与和其若所为奈何云云兮些焉只恐也许似乎了着过的么呢吧啊吗'
)

// 朝代参考数据（用于朝代选择题干扰项）
const DYNASTIES = ['先秦', '汉', '魏晋', '南北朝', '隋', '唐', '五代', '宋', '元', '明', '清', '近现代']

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 从一个汉字句子里选一个"实词"下标（停用词 + 标点跳过）
function pickKeyIndex(line) {
  const chars = Array.from(line)
  const candidates = []
  chars.forEach((c, i) => {
    if (/[一-龥]/.test(c) && !STOP_WORDS.has(c)) candidates.push(i)
  })
  if (!candidates.length) return -1
  return pickRandom(candidates)
}

// 切诗句为短句 (。？！；,，} 都视作断句)
function splitLines(content) {
  return content
    .split(/[。？！；？！\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function run() {
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))

  // 1. 去重 poems（title|author 去重，保留第一份）
  const poemMap = new Map()
  raw.forEach((place) => {
    ;(place.poems || []).forEach((poem) => {
      const key = `${poem.title || ''}|${poem.author || ''}`
      if (!key.trim() || poemMap.has(key)) return
      poemMap.set(key, {
        title: poem.title,
        author: poem.author,
        dynasty: poem.dynasty || '',
        content: poem.content || '',
        place_name: place.name,
      })
    })
  })
  const poems = [...poemMap.values()]
  console.log(`[seed-quiz] 去重诗词: ${poems.length} 首`)

  // 2. 预构造"同朝代作者"池（选择题干扰项）
  const authorsByDynasty = {}
  const allAuthors = new Set()
  poems.forEach((p) => {
    if (p.author) allAuthors.add(p.author)
    if (p.dynasty && p.author) {
      if (!authorsByDynasty[p.dynasty]) authorsByDynasty[p.dynasty] = []
      if (!authorsByDynasty[p.dynasty].includes(p.author)) {
        authorsByDynasty[p.dynasty].push(p.author)
      }
    }
  })
  const allAuthorsList = [...allAuthors]

  // 3. 出题
  const questions = []
  const seen = new Set() // 去重: poem_id|stem
  let fillCount = 0
  let choiceCount = 0
  let skipReason = { short: 0, dup: 0, noDynasty: 0, noAuthor: 0 }

  // 打乱顺序便于抽样
  const shuffledPoems = shuffle(poems)

  // 3a. 填空题：每首诗最多出 1 题
  shuffledPoems.forEach((poem) => {
    if (fillCount >= 80) return
    if (!poem.content) return
    const lines = splitLines(poem.content).filter((l) => Array.from(l).length >= 5)
    if (!lines.length) {
      skipReason.short++
      return
    }
    const line = pickRandom(lines)
    const idx = pickKeyIndex(line)
    if (idx === -1) {
      skipReason.short++
      return
    }
    const answer = Array.from(line)[idx]
    const stem = Array.from(line)
    stem[idx] = '____'
    const stemText = stem.join('')
    const poemKey = `${poem.title}_${poem.author}`
    const dedupeKey = `fill|${poemKey}|${stemText}`
    if (seen.has(dedupeKey)) {
      skipReason.dup++
      return
    }
    seen.add(dedupeKey)
    fillCount++
    questions.push({
      _id: `fill_${fillCount}`,
      type: 'fill',
      poem_id: poemKey,
      stem: stemText,
      options: [],
      answer,
      difficulty: Math.ceil(Math.random() * 3),
      explain: `出自《${poem.title}》，作者${poem.author}`
        + (poem.dynasty ? `（${poem.dynasty}）` : '')
        + (poem.place_name ? `，与「${poem.place_name}」相关` : '') + '。',
    })
  })

  // 3b. 选择题：作者题 / 朝代题
  shuffle(shuffledPoems).forEach((poem) => {
    if (choiceCount >= 120) return
    if (!poem.title) return

    const isAuthorQuiz = poem.author && Math.random() < 0.5
    if (isAuthorQuiz) {
      if (!poem.author || !poem.dynasty) {
        skipReason.noAuthor++
        return
      }
      // 同朝代作者作干扰（不够全朝代补）
      let pool = (authorsByDynasty[poem.dynasty] || []).filter((a) => a !== poem.author)
      if (pool.length < 3) {
        const extra = allAuthorsList.filter((a) => a !== poem.author && !pool.includes(a))
        pool = pool.concat(shuffle(extra).slice(0, 3 - pool.length))
      }
      if (pool.length < 3) return
      const distractors = shuffle(pool).slice(0, 3)
      const options = shuffle([poem.author, ...distractors])
      const answer = options.indexOf(poem.author)
      const stem = `《${poem.title}》的作者是？`
      const poemKey = `${poem.title}_${poem.author}`
      const dedupeKey = `choice|${poemKey}|author`
      if (seen.has(dedupeKey)) {
        skipReason.dup++
        return
      }
      seen.add(dedupeKey)
      choiceCount++
      questions.push({
        _id: `choice_author_${choiceCount}`,
        type: 'choice',
        poem_id: poemKey,
        stem,
        options,
        answer,
        difficulty: Math.ceil(Math.random() * 3),
        explain: `《${poem.title}》是${poem.dynasty}${poem.author}的代表作。`,
      })
    } else {
      // 朝代题
      if (!poem.dynasty) {
        skipReason.noDynasty++
        return
      }
      const sameGroup = DYNASTIES.filter((d) => d !== poem.dynasty)
      const distractors = shuffle(sameGroup).slice(0, 3)
      const options = shuffle([poem.dynasty, ...distractors])
      const answer = options.indexOf(poem.dynasty)
      const stem = `《${poem.title}》（${poem.author || '佚名'}）是什么朝代的作品？`
      const poemKey = `${poem.title}_${poem.author}`
      const dedupeKey = `choice|${poemKey}|dynasty`
      if (seen.has(dedupeKey)) {
        skipReason.dup++
        return
      }
      seen.add(dedupeKey)
      choiceCount++
      questions.push({
        _id: `choice_dynasty_${choiceCount}`,
        type: 'choice',
        poem_id: poemKey,
        stem,
        options,
        answer,
        difficulty: Math.ceil(Math.random() * 3),
        explain: `《${poem.title}》是${poem.dynasty}诗人${poem.author || '佚名'}的作品。`,
      })
    }
  })

  console.log(`[seed-quiz] 出题完成: ${questions.length} 道 (fill=${fillCount}, choice=${choiceCount})`)
  console.log('[seed-quiz] 跳过原因:', JSON.stringify(skipReason))

  if (DRY_RUN) {
    console.log('[seed-quiz] --dry-run 模式，不写文件')
    console.log('[seed-quiz] 前5题预览:')
    questions.slice(0, 5).forEach((q) => console.log('  ', JSON.stringify(q)))
    return
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(questions, null, 2))
  console.log(`[seed-quiz] 已写入 ${OUT_FILE}`)
  // 同时写到 cloudfunctions/quiz/ 供 initQuiz 云函数使用
  const cloudDir = path.dirname(CLOUD_OUT)
  fs.mkdirSync(cloudDir, { recursive: true })
  fs.writeFileSync(CLOUD_OUT, JSON.stringify(questions, null, 2))
  console.log(`[seed-quiz] 已写入 ${CLOUD_OUT}`)
}

run()
