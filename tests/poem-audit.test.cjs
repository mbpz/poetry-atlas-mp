const assert = require('assert')
const {
  isLikelyCompleteShortVerse,
  truncationReason,
  auditPoems,
  formatMarkdown,
} = require('../scripts/lib/poem-audit.cjs')

let failed = 0
function test(name, fn) {
  try {
    fn()
    console.log('ok - ' + name)
  } catch (err) {
    failed += 1
    console.error('not ok - ' + name)
    console.error(err.stack || err)
  }
}

const full = '孤山寺北贾亭西，水面初平云脚低。几处早莺争暖树，谁家新燕啄春泥。乱花渐欲迷人眼，浅草才能没马蹄。最爱湖东行不足，绿杨阴里白沙堤。'
const excerpt = '孤山寺北贾亭西，水面初平云脚低。几处早莺争暖树，谁家新燕啄春泥。'

test('recognizes complete five-character quatrain instead of flagging by length alone', () => {
  const poem = '白日依山尽，黄河入海流。欲穷千里目，更上一层楼。'
  assert.strictEqual(isLikelyCompleteShortVerse(poem), true)
  assert.strictEqual(truncationReason(poem), '')
})

test('flags a one-line fragment', () => {
  assert.strictEqual(truncationReason('登临送目。'), 'too-short')
})

test('detects excerpt versus full conflicts and missing provenance', () => {
  const report = auditPoems([
    { name: '杭州', poems: [{ title: '钱塘湖春行', author: '白居易', dynasty: '唐', content: excerpt }] },
    { name: '西湖', poems: [{ title: '钱塘湖春行', author: '白居易', dynasty: '唐', content: full }] },
  ])
  assert.strictEqual(report.summary.uniquePoems, 1)
  assert.strictEqual(report.summary.duplicateReferences, 1)
  assert.strictEqual(report.summary.conflicts, 1)
  assert.strictEqual(report.issues.conflicts[0].type, 'excerpt-vs-full')
  assert.strictEqual(report.summary.missingProvenance, 1)
  assert.ok(report.summary.blockingCount > 0)
})

test('identical references merge without a content conflict', () => {
  const poem = { title: '登鹳雀楼', author: '王之涣', dynasty: '唐', content: '白日依山尽，黄河入海流。欲穷千里目，更上一层楼。', source_url: 'https://example.test' }
  const report = auditPoems([
    { name: '蒲州', poems: [poem] },
    { name: '鹳雀楼', poems: [Object.assign({}, poem)] },
  ])
  assert.strictEqual(report.summary.conflicts, 0)
  assert.strictEqual(report.summary.missingProvenance, 0)
})

test('reports missing required fields and invalid characters', () => {
  const report = auditPoems([{ title: '', author: '佚名', dynasty: '', content: '正文\uFFFD' }])
  assert.strictEqual(report.summary.missingFields, 1)
  assert.strictEqual(report.summary.invalidCharacters, 1)
})

test('formats a reviewable markdown summary', () => {
  const report = auditPoems([{ title: '短句', author: '佚名', dynasty: '唐', content: '一句。' }], { name: 'fixture' })
  const markdown = formatMarkdown(report)
  assert.ok(markdown.includes('# 诗词语料质量报告'))
  assert.ok(markdown.includes('疑似截断'))
})

if (failed) process.exitCode = 1
