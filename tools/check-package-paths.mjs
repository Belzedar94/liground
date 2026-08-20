/**
 * Fails the build when a packaged bundle carries an absolute path belonging to
 * the machine that produced it. A path like that resolves for whoever built the
 * package and breaks for everyone else, so it must never reach a release.
 *
 *   node tools/check-package-paths.mjs build/win-unpacked/resources/app.asar
 *   node tools/check-package-paths.mjs            # scans every asar under build/
 *
 * Only paths rooted in this build environment count. Third party packages ship
 * their own authors' directories inside webpack comments and source maps, and
 * those are inert text, so flagging them would make the check useless noise.
 */

import { readFile, readdir, stat } from 'fs/promises'
import path from 'path'

/** Match a literal string with either slash style, escaped or not. */
function pathPattern (literal) {
  const body = literal
    .replace(/[.*+?^${}()|[\]]/g, '\\$&')
    .replace(/[\\/]+/g, '[\\\\/]{1,2}')
  return new RegExp(body, 'gi')
}

const roots = []
const add = (label, value) => {
  if (value && value.length > 3) roots.push([label, value, pathPattern(value)])
}

add('the build workspace', process.env.GITHUB_WORKSPACE)
add('the runner temp directory', process.env.RUNNER_TEMP)
add('the build home directory', process.env.HOME)
add('the build user profile', process.env.USERPROFILE)
add('the current working directory', process.cwd())

// Always forbidden, whatever the environment: an agent scratch checkout.
roots.push(['an agent scratch directory', 'Temp/claude', /Temp[\\/]{1,2}claude/gi])

async function findAsars (dir) {
  const found = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...await findAsars(full))
    else if (entry.name.endsWith('.asar')) found.push(full)
  }
  return found
}

async function scan (file) {
  const buf = await readFile(file)
  // latin1 keeps byte offsets stable, which is what the context slice needs.
  const text = buf.toString('latin1')
  const hits = []
  for (const [label, value, pattern] of roots) {
    const matches = text.match(pattern)
    if (matches) {
      const at = text.search(pattern)
      hits.push({ label, value, count: matches.length, sample: text.slice(Math.max(0, at - 50), at + 90) })
    }
  }
  const size = (await stat(file)).size
  if (hits.length === 0) {
    console.log(`ok   ${file} (${size} bytes)`)
    return 0
  }
  console.error(`FAIL ${file} (${size} bytes)`)
  for (const hit of hits) {
    console.error(`     ${hit.label} (${hit.value}): ${hit.count} occurrence(s)`)
    console.error(`     near: ${JSON.stringify(hit.sample)}`)
  }
  return hits.length
}

const targets = process.argv.length > 2 ? process.argv.slice(2) : await findAsars('build')
if (targets.length === 0) {
  console.error('no asar found to check')
  process.exit(1)
}

console.log(`checking against ${roots.length} forbidden root(s):`)
for (const [label, value] of roots) console.log(`  ${label}: ${value}`)
console.log('')

let bad = 0
for (const target of targets) bad += await scan(target)

if (bad > 0) {
  console.error(`\n${bad} build machine path(s) found inside the package. Refusing to publish.`)
  process.exit(1)
}
console.log(`\n${targets.length} bundle(s) checked, no build machine paths.`)
