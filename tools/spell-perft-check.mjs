/**
 * Differential test for the Spell Chess rules engine.
 *
 * The engine binary is the authority on Spell Chess legality, so this script
 * compares src/renderer/spell/rules.js against it move for move: from a set of
 * seed positions it plays random legal games, and at every ply it checks that
 * our legal-move list and our resulting FEN are byte-identical to the binary's
 * `go perft 1` and `d` output.
 *
 *   node tools/spell-perft-check.mjs --engine <path-to-spell-stockfish> [--games 40] [--plies 24]
 *
 * Any mismatch is printed with the offending FEN and the symmetric difference,
 * and the process exits non-zero.
 */

import { spawn } from 'child_process'
import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import path from 'path'

const here = path.dirname(fileURLToPath(import.meta.url))

// rules.js is an ES module inside a CommonJS package, so load it through a
// data: URL to get real ESM semantics without touching the package type.
const rulesSource = await readFile(path.join(here, '..', 'src', 'renderer', 'spell', 'rules.js'), 'utf8')
const rules = await import('data:text/javascript;base64,' + Buffer.from(rulesSource).toString('base64'))

function arg (name, fallback) {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const ENGINE = arg('engine', process.env.SPELL_ENGINE || '')
const GAMES = parseInt(arg('games', '40'), 10)
const PLIES = parseInt(arg('plies', '24'), 10)
const SEED = parseInt(arg('seed', '20260819'), 10)

if (!ENGINE) {
  console.error('usage: node tools/spell-perft-check.mjs --engine <path to Spell-Stockfish>')
  process.exit(2)
}

/** Deterministic RNG so a failure can be replayed exactly. */
let rngState = SEED >>> 0
function rand () {
  rngState = (rngState * 1664525 + 1013904223) >>> 0
  return rngState / 4294967296
}

class EngineSession {
  constructor (bin) {
    this.proc = spawn(bin, [], { stdio: ['pipe', 'pipe', 'ignore'] })
    this.buffer = ''
    this.waiters = []
    this.proc.stdout.on('data', chunk => {
      this.buffer += chunk.toString()
      let idx
      while ((idx = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, idx).replace(/\r$/, '')
        this.buffer = this.buffer.slice(idx + 1)
        for (const w of this.waiters.slice()) {
          if (w.test(line)) {
            this.waiters.splice(this.waiters.indexOf(w), 1)
            w.resolve()
          } else {
            w.lines.push(line)
          }
        }
      }
    })
  }

  send (line) { this.proc.stdin.write(line + '\n') }

  /** Send commands, then collect every line until `test` matches. */
  collect (commands, test) {
    return new Promise((resolve, reject) => {
      const lines = []
      const waiter = { test, lines, resolve: () => { clearTimeout(timer); resolve(lines) } }
      const timer = setTimeout(() => {
        const i = this.waiters.indexOf(waiter)
        if (i >= 0) this.waiters.splice(i, 1)
        reject(new Error('engine timed out after: ' + commands.join(' | ')))
      }, 30000)
      this.waiters.push(waiter)
      for (const c of commands) this.send(c)
    })
  }

  async init () {
    await this.collect(['uci'], l => l === 'uciok')
    await this.collect(['isready'], l => l === 'readyok')
  }

  async query (fen, moves) {
    const pos = 'position fen ' + fen + (moves.length ? ' moves ' + moves.join(' ') : '')
    const lines = await this.collect([pos, 'd', 'go perft 1'], l => l.startsWith('Nodes searched'))
    let engineFen = null
    const legal = []
    for (const line of lines) {
      if (line.startsWith('Fen: ')) engineFen = line.slice(5).trim()
      const m = /^([a-h][1-8][a-h][1-8][qrbnk]?|[fj]@[a-h][1-8],[a-h][1-8][a-h][1-8][qrbnk]?):\s*\d+$/.exec(line)
      if (m) legal.push(m[1])
    }
    return { fen: engineFen, legal }
  }

  quit () { this.send('quit'); this.proc.kill() }
}

function diff (a, b) {
  const sa = new Set(a)
  const sb = new Set(b)
  return {
    missing: [...sb].filter(x => !sa.has(x)).sort(),
    extra: [...sa].filter(x => !sb.has(x)).sort()
  }
}

const SEEDS = [
  rules.INITIAL_FEN,
  // Middlegame with both sides fully stocked.
  'r3k2r/pppq1ppp/2npbn2/4p3/4P3/2NPBN2/PPPQ1PPP/R3K2R[JJFFFFFjjfffff] {F@-:0,J@-:0,f@-:0,j@-:0} w KQkq - 0 10',
  // A freeze zone alive over the enemy camp.
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR[JJFFFFjjfffff] {F@e6:3,J@-:0,f@-:0,j@-:0} b KQkq - 0 1',
  // A jump zone alive, plus depleted hands and staggered cooldowns.
  'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R[JFFjjff] {F@-:2,J@d7:3,f@-:1,j@-:0} b KQkq - 6 5',
  // Endgame, thin hands, promotion races.
  '8/2P2ppk/8/8/8/8/2p2PPK/8[JFjf] {F@-:0,J@-:0,f@-:0,j@-:0} w - - 0 40',
  // En passant available.
  'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR[JJFFFFFjjfffff] {F@-:0,J@-:0,f@-:0,j@-:0} w KQkq f6 0 3',
  // Castling under pressure from both directions.
  'r3k2r/8/8/8/8/8/6P1/R3K2R[JJFFFFFjjfffff] {F@-:0,J@-:0,f@-:0,j@-:0} w KQkq - 0 20',
  // Empty hands: pure chess inside the spell dialect.
  'r2q1rk1/pp2ppbp/2np1np1/8/3NP3/2N1BP2/PPPQ2PP/R3KB1R[] {F@-:0,J@-:0,f@-:0,j@-:0} w KQ - 4 9'
]

const engine = new EngineSession(ENGINE)
await engine.init()

let checked = 0
let failures = 0

for (let g = 0; g < GAMES; g++) {
  const seedFen = SEEDS[g % SEEDS.length]
  const moves = []
  let state = rules.parseFen(seedFen)
  if (!state) {
    console.error('FAIL seed unparseable:', seedFen)
    failures++
    continue
  }

  for (let ply = 0; ply < PLIES; ply++) {
    const truth = await engine.query(seedFen, moves)
    const ours = rules.legalMoves(state)
    checked++

    const d = diff(ours, truth.legal)
    if (d.missing.length || d.extra.length) {
      failures++
      console.error('\nFAIL legal moves')
      console.error('  seed :', seedFen)
      console.error('  path :', moves.join(' ') || '(root)')
      console.error('  fen  :', rules.toFen(state))
      console.error('  ours=%d engine=%d', ours.length, truth.legal.length)
      if (d.missing.length) console.error('  missing (engine has, we do not):', d.missing.slice(0, 25).join(' '))
      if (d.extra.length) console.error('  extra   (we have, engine does not):', d.extra.slice(0, 25).join(' '))
      break
    }

    const ourFen = rules.toFen(state)
    if (truth.fen && ourFen !== truth.fen) {
      failures++
      console.error('\nFAIL fen roundtrip')
      console.error('  seed  :', seedFen)
      console.error('  path  :', moves.join(' ') || '(root)')
      console.error('  ours  :', ourFen)
      console.error('  engine:', truth.fen)
      break
    }

    if (!ours.length) break
    const pick = ours[Math.floor(rand() * ours.length)]
    const next = rules.applyMove(state, pick)
    if (!next) {
      failures++
      console.error('\nFAIL applyMove returned null for', pick, 'at', ourFen)
      break
    }
    moves.push(pick)
    state = next
    // A captured king ends the game; the engine will not answer about a
    // position with a missing king, so stop the walk here.
    if (rules.findKing(state, 'w') < 0 || rules.findKing(state, 'b') < 0) break
  }
  process.stdout.write(`\rgames ${g + 1}/${GAMES}  positions checked ${checked}  failures ${failures}   `)
}

engine.quit()
console.log('')
if (failures) {
  console.error(`spell-perft-check: ${failures} failure(s) over ${checked} positions`)
  process.exit(1)
}
console.log(`spell-perft-check: OK — ${checked} positions match the engine exactly (${GAMES} random games)`)
