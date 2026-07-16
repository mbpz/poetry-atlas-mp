function poemIdentity(poem) {
  const item = poem || {}
  return String(item.canonical_id || item._id || `${item.title || ''}|${item.author || ''}`).trim()
}

function mergeUniquePoems(current, incoming) {
  const merged = []
  const positions = new Map()

  function add(poem) {
    const key = poemIdentity(poem)
    if (!key) return
    if (positions.has(key)) {
      merged[positions.get(key)] = Object.assign({}, merged[positions.get(key)], poem)
      return
    }
    positions.set(key, merged.length)
    merged.push(poem)
  }

  ;(current || []).forEach(add)
  ;(incoming || []).forEach(add)
  return merged
}

module.exports = {
  poemIdentity,
  mergeUniquePoems,
}
