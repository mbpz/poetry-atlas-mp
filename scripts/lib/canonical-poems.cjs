const crypto = require('crypto')
const { truncationReason } = require('./poem-audit.cjs')

class CorpusConflictError extends Error {
  constructor(conflicts) {
    super(`存在 ${conflicts.length} 组未解决的诗词冲突`)
    this.name = 'CorpusConflictError'
    this.conflicts = conflicts
  }
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, '').trim()
}

function sourceKey(poem) {
  return `${String(poem.title || '').trim()}|${String(poem.author || '').trim()}`
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex')
}

function canonicalIdFor(poem) {
  if (poem && poem.canonical_id) return String(poem.canonical_id)
  const identity = [poem && poem.dynasty, poem && poem.author, poem && poem.title]
    .map((part) => String(part || '').trim())
    .join('\u0000')
  return 'poem_' + sha256(identity).slice(0, 20)
}

function collectPoemReferences(places) {
  const groups = new Map()
  ;(places || []).forEach((place) => {
    ;(place.poems || []).forEach((poem) => {
      const key = sourceKey(poem)
      if (!key.replace('|', '').trim()) return
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push({
        poem,
        placeId: place.id || '',
        placeName: place.name || '',
      })
    })
  })
  return groups
}

function uniqueVariants(references) {
  const variants = new Map()
  references.forEach((reference) => {
    const displayContent = String(reference.poem.content || '').trim()
    const normalizedContent = normalizeText(displayContent)
    if (!variants.has(normalizedContent)) {
      variants.set(normalizedContent, {
        content: displayContent,
        normalizedContent,
        places: [],
        placeNames: [],
        source: reference.poem,
      })
    }
    const variant = variants.get(normalizedContent)
    if (reference.placeId && !variant.places.includes(reference.placeId)) variant.places.push(reference.placeId)
    if (reference.placeName && !variant.placeNames.includes(reference.placeName)) variant.placeNames.push(reference.placeName)
  })
  return [...variants.values()].sort((a, b) => (
    a.normalizedContent.length - b.normalizedContent.length ||
    a.normalizedContent.localeCompare(b.normalizedContent, 'zh-CN')
  ))
}

function isPrefixFamily(variants) {
  if (variants.length < 2) return true
  const longest = variants[variants.length - 1].normalizedContent
  return variants.slice(0, -1).every((variant) => longest.startsWith(variant.normalizedContent))
}

function provenanceOf(poem) {
  const item = poem || {}
  const nested = item.provenance || {}
  return {
    source_name: item.source_name || nested.name || '',
    source_url: item.source_url || nested.url || '',
    source_license: item.source_license || nested.license || '',
  }
}

function buildCanonicalPoems(places, options) {
  const opts = options || {}
  const dataVersion = opts.dataVersion || 'draft'
  const overrides = opts.overrides || {}
  const groups = collectPoemReferences(places)
  const unresolved = []
  const poems = []

  for (const [key, references] of groups.entries()) {
    const variants = uniqueVariants(references)
    const override = overrides[key]
    const metadata = references[0].poem
    const dynasties = [...new Set(references.map((item) => String(item.poem.dynasty || '').trim()))]
    if (dynasties.length > 1 && !override) {
      unresolved.push({ key, type: 'metadata-dynasty', values: dynasties })
      continue
    }

    let chosen
    let alternateVersions = []
    let conflictType = ''
    if (override && override.content) {
      chosen = Object.assign({}, metadata, override, { content: String(override.content).trim() })
      conflictType = variants.length > 1 ? 'resolved-by-override' : ''
      alternateVersions = variants
        .filter((variant) => variant.normalizedContent !== normalizeText(chosen.content))
        .map((variant) => ({
          content: variant.content,
          content_kind: normalizeText(chosen.content).startsWith(variant.normalizedContent) ? 'excerpt' : 'alternate',
          content_hash: sha256(variant.normalizedContent),
          places: variant.places,
        }))
    } else if (variants.length <= 1 || isPrefixFamily(variants)) {
      const longest = variants[variants.length - 1]
      chosen = Object.assign({}, metadata, longest.source, { content: longest.content })
      if (variants.length > 1) conflictType = 'excerpt-vs-full'
      alternateVersions = variants.slice(0, -1).map((variant) => ({
        content: variant.content,
        content_kind: 'excerpt',
        content_hash: sha256(variant.normalizedContent),
        places: variant.places,
      }))
    } else {
      unresolved.push({
        key,
        type: 'divergent-content',
        variants: variants.map((variant) => ({
          content: variant.content,
          content_hash: sha256(variant.normalizedContent),
          places: variant.places,
        })),
      })
      continue
    }

    const placesForPoem = [...new Set(references.map((item) => item.placeId).filter(Boolean))].sort()
    const placeNames = [...new Set(references.map((item) => item.placeName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'))
    const provenance = provenanceOf(chosen)
    const hasSource = !!(provenance.source_name || provenance.source_url)
    const reviewStatus = override && hasSource
      ? 'verified'
      : (conflictType ? 'needs-review' : (hasSource ? 'verified' : 'needs-source'))
    const canonicalId = canonicalIdFor(chosen)
    const contentKind = chosen.content_kind || (truncationReason(chosen.content) ? 'excerpt' : 'full')

    poems.push(Object.assign({
      _id: canonicalId,
      canonical_id: canonicalId,
      title: chosen.title,
      author: chosen.author,
      dynasty: chosen.dynasty,
      content: chosen.content,
      content_kind: contentKind,
      content_hash: sha256(normalizeText(chosen.content)),
      data_version: dataVersion,
      review_status: reviewStatus,
      conflict_type: conflictType,
      places: placesForPoem,
      place_names: placeNames,
      tags: Array.isArray(chosen.tags) ? chosen.tags : [],
      popularity: Number(chosen.popularity || 0),
      alternate_versions: alternateVersions,
    }, provenance))
  }

  if (unresolved.length) throw new CorpusConflictError(unresolved)
  poems.sort((a, b) => a.canonical_id.localeCompare(b.canonical_id))
  return poems
}

module.exports = {
  CorpusConflictError,
  normalizeText,
  sourceKey,
  sha256,
  canonicalIdFor,
  collectPoemReferences,
  uniqueVariants,
  isPrefixFamily,
  buildCanonicalPoems,
}
