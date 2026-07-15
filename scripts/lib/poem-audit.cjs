const REQUIRED_FIELDS = ['title', 'author', 'dynasty', 'content']
const INVALID_CHAR_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/
const DEFAULT_TRUNCATION_RULES = {
  minFragmentChinese: 12,
  singleFragmentMaxChinese: 40,
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, '').trim()
}

function poemKey(poem) {
  return `${String(poem.title || '').trim()}|${String(poem.author || '').trim()}`
}

function collectEntries(input) {
  if (input && !Array.isArray(input) && Array.isArray(input.poems)) {
    return input.poems.map((poem) => ({ poem, place: '', sourceIndex: -1 }))
  }
  if (!Array.isArray(input)) return []
  if (input.some((item) => item && Array.isArray(item.poems))) {
    const entries = []
    input.forEach((place, placeIndex) => {
      ;(place.poems || []).forEach((poem) => {
        entries.push({ poem, place: place.name || place.id || '', sourceIndex: placeIndex })
      })
    })
    return entries
  }
  return input.map((poem, index) => ({ poem, place: '', sourceIndex: index }))
}

function textSegments(text) {
  return String(text || '')
    .split(/[，。！？；、\n]/)
    .map((part) => normalizeText(part))
    .filter(Boolean)
}

function isLikelyCompleteShortVerse(text) {
  const segments = textSegments(text)
  if (segments.length !== 2 && segments.length !== 4 && segments.length !== 8) return false
  const lengths = segments.map((part) => part.length)
  const first = lengths[0]
  return (first === 5 || first === 7) && lengths.every((length) => length === first)
}

function truncationReason(text, rules) {
  const config = Object.assign({}, DEFAULT_TRUNCATION_RULES, rules || {})
  const raw = String(text || '').trim()
  const normalized = normalizeText(raw)
  if (!normalized) return 'empty'
  if (isLikelyCompleteShortVerse(raw)) return ''
  const segments = textSegments(raw)
  const chineseCount = (normalized.match(/[\u3400-\u9FFF]/g) || []).length
  if (chineseCount < config.minFragmentChinese) return 'too-short'
  if (segments.length <= 1 && chineseCount < config.singleFragmentMaxChinese) return 'single-fragment'
  if (/[，；、：:]$/.test(raw)) return 'incomplete-ending'
  return ''
}

function hasProvenance(poem) {
  return !!(
    poem.source ||
    poem.source_name ||
    poem.source_url ||
    (poem.provenance && (poem.provenance.name || poem.provenance.url))
  )
}

function auditPoems(input, options) {
  const opts = options || {}
  const entries = collectEntries(input)
  const groups = new Map()
  const missingFields = []
  const invalidCharacters = []

  entries.forEach((entry, index) => {
    const poem = entry.poem || {}
    const key = poemKey(poem) || `#${index}`
    const missing = REQUIRED_FIELDS.filter((field) => !String(poem[field] || '').trim())
    if (missing.length) missingFields.push({ key, missing, place: entry.place })
    if (INVALID_CHAR_RE.test(String(poem.content || ''))) {
      invalidCharacters.push({ key, place: entry.place })
    }
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(entry)
  })

  const conflicts = []
  const suspiciousTruncations = []
  const missingProvenance = []
  let under40Count = 0

  for (const [key, group] of groups.entries()) {
    const variants = []
    const seenTexts = new Set()
    group.forEach((entry) => {
      const text = normalizeText(entry.poem.content)
      if (!seenTexts.has(text)) {
        seenTexts.add(text)
        variants.push({
          text,
          length: text.length,
          places: group.filter((item) => normalizeText(item.poem.content) === text).map((item) => item.place).filter(Boolean),
        })
      }
    })
    if (variants.length > 1) {
      const sorted = variants.slice().sort((a, b) => a.length - b.length)
      const prefixConflict = sorted.slice(0, -1).some((variant) => sorted[sorted.length - 1].text.startsWith(variant.text))
      conflicts.push({ key, type: prefixConflict ? 'excerpt-vs-full' : 'divergent', variants: sorted })
    }

    const representative = group[0].poem
    const normalized = normalizeText(representative.content)
    if (normalized.length < 40) under40Count += 1
    const reason = truncationReason(representative.content, opts.truncationRules)
    if (reason) {
      suspiciousTruncations.push({
        key,
        reason,
        length: normalized.length,
        preview: normalized.slice(0, 80),
      })
    }
    if (!group.some((entry) => hasProvenance(entry.poem))) {
      missingProvenance.push({ key })
    }
  }

  conflicts.sort((a, b) => a.key.localeCompare(b.key, 'zh-CN'))
  suspiciousTruncations.sort((a, b) => a.length - b.length || a.key.localeCompare(b.key, 'zh-CN'))

  const blockingCount = missingFields.length + invalidCharacters.length + conflicts.length + missingProvenance.length
  return {
    name: opts.name || 'poems',
    summary: {
      references: entries.length,
      uniquePoems: groups.size,
      duplicateReferences: Math.max(0, entries.length - groups.size),
      conflicts: conflicts.length,
      suspiciousTruncations: suspiciousTruncations.length,
      under40Characters: under40Count,
      missingFields: missingFields.length,
      invalidCharacters: invalidCharacters.length,
      missingProvenance: missingProvenance.length,
      blockingCount,
    },
    issues: {
      conflicts,
      suspiciousTruncations,
      missingFields,
      invalidCharacters,
      missingProvenance,
    },
  }
}

function formatMarkdown(reports) {
  const list = Array.isArray(reports) ? reports : [reports]
  const lines = ['# 诗词语料质量报告', '']
  list.forEach((report) => {
    const summary = report.summary
    lines.push(`## ${report.name}`, '')
    lines.push('| 指标 | 数量 |', '|---|---:|')
    Object.entries(summary).forEach(([key, value]) => lines.push(`| ${key} | ${value} |`))
    lines.push('')
    if (report.issues.conflicts.length) {
      lines.push('### 正文冲突', '')
      report.issues.conflicts.slice(0, 50).forEach((item) => {
        const lengths = item.variants.map((variant) => variant.length).join(' / ')
        lines.push(`- ${item.key}：${item.type}，长度 ${lengths}`)
      })
      lines.push('')
    }
    if (report.issues.suspiciousTruncations.length) {
      lines.push('### 疑似截断（前 50 项）', '')
      report.issues.suspiciousTruncations.slice(0, 50).forEach((item) => {
        lines.push(`- ${item.key}：${item.reason}，${item.length} 字，${item.preview}`)
      })
      lines.push('')
    }
  })
  return lines.join('\n')
}

module.exports = {
  normalizeText,
  DEFAULT_TRUNCATION_RULES,
  poemKey,
  collectEntries,
  isLikelyCompleteShortVerse,
  truncationReason,
  auditPoems,
  formatMarkdown,
}
