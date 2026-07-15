#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { auditPoems, formatMarkdown } = require('./lib/poem-audit.cjs')

function parseArgs(argv) {
  const args = { format: 'markdown', strict: false, includeSeed: true }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--strict') args.strict = true
    else if (arg === '--no-seed') args.includeSeed = false
    else if (arg === '--format' && argv[i + 1]) args.format = argv[++i]
    else if (arg === '--input' && argv[i + 1]) args.input = argv[++i]
    else if (arg === '--seed' && argv[i + 1]) args.seed = argv[++i]
  }
  return args
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function run(argv) {
  const args = parseArgs(argv || [])
  if (args.format !== 'json' && args.format !== 'markdown') {
    throw new Error('--format 仅支持 json 或 markdown')
  }
  const root = path.join(__dirname, '..')
  const inputPath = path.resolve(root, args.input || 'data/places.json')
  const seedPath = path.resolve(root, args.seed || 'cloudfunctions/initData/seed.json')
  const reports = [auditPoems(readJson(inputPath), { name: path.relative(root, inputPath) })]
  if (args.includeSeed) {
    reports.push(auditPoems(readJson(seedPath), { name: path.relative(root, seedPath) }))
  }

  const output = args.format === 'json'
    ? JSON.stringify({ reports }, null, 2)
    : formatMarkdown(reports)
  process.stdout.write(output + '\n')

  const blockingCount = reports.reduce((sum, report) => sum + report.summary.blockingCount, 0)
  if (args.strict && blockingCount > 0) process.exitCode = 1
  return { reports, blockingCount }
}

if (require.main === module) {
  try {
    run(process.argv.slice(2))
  } catch (err) {
    console.error('[audit-poems] ' + (err && err.message ? err.message : err))
    process.exitCode = 2
  }
}

module.exports = { parseArgs, run }
