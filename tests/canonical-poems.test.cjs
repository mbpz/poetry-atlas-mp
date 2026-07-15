const assert = require('assert')
const {
  CorpusConflictError,
  canonicalIdFor,
  buildCanonicalPoems,
} = require('../scripts/lib/canonical-poems.cjs')

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

const excerpt = '孤山寺北贾亭西，水面初平云脚低。几处早莺争暖树，谁家新燕啄春泥。'
const full = excerpt + '乱花渐欲迷人眼，浅草才能没马蹄。最爱湖东行不足，绿杨阴里白沙堤。'

test('canonical IDs are deterministic across repeated builds', () => {
  const poem = { title: '钱塘湖春行', author: '白居易', dynasty: '唐' }
  assert.strictEqual(canonicalIdFor(poem), canonicalIdFor(Object.assign({}, poem)))
})

test('repeated builds are deeply deterministic and preserve display line breaks', () => {
  const places = [{
    id: 'p1', name: '地点',
    poems: [{ title: '登鹳雀楼', author: '王之涣', dynasty: '唐', content: '白日依山尽，黄河入海流。\n欲穷千里目，更上一层楼。' }],
  }]
  const first = buildCanonicalPoems(places, { dataVersion: 'test-v1' })
  const second = buildCanonicalPoems(JSON.parse(JSON.stringify(places)), { dataVersion: 'test-v1' })
  assert.deepStrictEqual(first, second)
  assert.ok(first[0].content.includes('\n'))
})

test('merges identical content references without creating alternates', () => {
  const poem = { title: '登鹳雀楼', author: '王之涣', dynasty: '唐', content: '白日依山尽，黄河入海流。\n欲穷千里目，更上一层楼。' }
  const poems = buildCanonicalPoems([
    { id: 'p1', name: '蒲州', poems: [poem] },
    { id: 'p2', name: '鹳雀楼', poems: [Object.assign({}, poem)] },
  ])
  assert.deepStrictEqual(poems[0].places, ['p1', 'p2'])
  assert.deepStrictEqual(poems[0].alternate_versions, [])
  assert.strictEqual(poems[0].conflict_type, '')
})

test('merges places and keeps the longest prefix-family content', () => {
  const poems = buildCanonicalPoems([
    { id: 'hangzhou', name: '杭州', poems: [{ title: '钱塘湖春行', author: '白居易', dynasty: '唐', content: excerpt }] },
    { id: 'xihu', name: '西湖', poems: [{ title: '钱塘湖春行', author: '白居易', dynasty: '唐', content: full }] },
  ], { dataVersion: 'test-v1' })
  assert.strictEqual(poems.length, 1)
  assert.strictEqual(poems[0].content, full)
  assert.deepStrictEqual(poems[0].places, ['hangzhou', 'xihu'])
  assert.strictEqual(poems[0].alternate_versions[0].content_kind, 'excerpt')
  assert.strictEqual(poems[0].review_status, 'needs-review')
})

test('marks an obviously truncated single source as an excerpt', () => {
  const poems = buildCanonicalPoems([
    { id: 'p1', name: '地点', poems: [{ title: '桂枝香', author: '王安石', dynasty: '宋', content: '登临送目。' }] },
  ])
  assert.strictEqual(poems[0].content_kind, 'excerpt')
  assert.strictEqual(poems[0].review_status, 'needs-source')
})

test('blocks divergent content without an explicit override', () => {
  assert.throws(() => buildCanonicalPoems([
    { id: 'a', name: '甲地', poems: [{ title: '岳阳楼记', author: '范仲淹', dynasty: '宋', content: '先天下之忧而忧，后天下之乐而乐。' }] },
    { id: 'b', name: '乙地', poems: [{ title: '岳阳楼记', author: '范仲淹', dynasty: '宋', content: '衔远山，吞长江，浩浩汤汤，横无际涯。' }] },
  ]), (err) => err instanceof CorpusConflictError && err.conflicts[0].type === 'divergent-content')
})

test('resolves divergence only through a sourced manual override', () => {
  const key = '岳阳楼记|范仲淹'
  const content = '先天下之忧而忧，后天下之乐而乐。'
  const poems = buildCanonicalPoems([
    { id: 'a', name: '甲地', poems: [{ title: '岳阳楼记', author: '范仲淹', dynasty: '宋', content }] },
    { id: 'b', name: '乙地', poems: [{ title: '岳阳楼记', author: '范仲淹', dynasty: '宋', content: '衔远山，吞长江。' }] },
  ], {
    dataVersion: 'test-v2',
    overrides: {
      [key]: {
        title: '岳阳楼记', author: '范仲淹', dynasty: '宋', content,
        source_name: '可信来源', source_url: 'https://example.test/source', source_license: 'reviewed',
      },
    },
  })
  assert.strictEqual(poems[0].review_status, 'verified')
  assert.strictEqual(poems[0].conflict_type, 'resolved-by-override')
  assert.strictEqual(poems[0].source_name, '可信来源')
})

if (failed) process.exitCode = 1
