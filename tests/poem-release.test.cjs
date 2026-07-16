const assert = require('assert')
const places = require('../data/places.json')
const release = require('../data/poem-overrides.json')
const {
  buildCanonicalPoems,
  sourceKey,
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

const poems = buildCanonicalPoems(places, {
  dataVersion: release.data_version,
  overrides: release.overrides,
})
const byKey = new Map(poems.map((poem) => [sourceKey(poem), poem]))
const reviewBatch = release.release.review_batch

test('release freezes the eight known high-exposure conflict groups', () => {
  assert.strictEqual(release.data_version, '2026-q3-batch-1')
  assert.strictEqual(new Set(reviewBatch).size, 8)
  assert.deepStrictEqual([...reviewBatch].sort(), Object.keys(release.overrides).sort())
  assert.strictEqual(release.release.previous_version, '2026-q3-draft')
  assert.ok(release.release.rollback)
})

test('every reviewed work builds as a sourced full-text canonical poem', () => {
  reviewBatch.forEach((key) => {
    const poem = byKey.get(key)
    assert.ok(poem, `missing canonical poem: ${key}`)
    assert.strictEqual(poem.data_version, release.data_version, key)
    assert.strictEqual(poem.content_kind, 'full', key)
    assert.strictEqual(poem.review_status, 'verified', key)
    assert.ok(poem.source_name, key)
    assert.ok(poem.source_url.startsWith('https://'), key)
    assert.ok(poem.source_license.includes('公有领域'), key)
    assert.strictEqual(poem.source_checked_at, '2026-07-16', key)
    assert.ok(poem.review_note, key)
    assert.strictEqual(poem.content, release.overrides[key].content, key)
  })
})

test('reviewed conflicts retain their old variants for rollback and audit', () => {
  reviewBatch.forEach((key) => {
    const poem = byKey.get(key)
    assert.ok(poem.alternate_versions.length >= 1, key)
    assert.strictEqual(poem.conflict_type, 'resolved-by-override', key)
    poem.alternate_versions.forEach((variant) => assert.ok(variant.content_hash, key))
  })
})

test('the corpus now builds deterministically without unresolved conflicts', () => {
  const second = buildCanonicalPoems(JSON.parse(JSON.stringify(places)), {
    dataVersion: release.data_version,
    overrides: JSON.parse(JSON.stringify(release.overrides)),
  })
  assert.strictEqual(poems.length, 491)
  assert.deepStrictEqual(poems, second)
})

if (failed) process.exitCode = 1
