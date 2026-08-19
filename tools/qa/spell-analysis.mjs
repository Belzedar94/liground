/**
 * QA scenario: run a real analysis with Spell-Stockfish and capture the engine
 * output, including principal variations that carry casts.
 *
 *   node tools/qa-shot.mjs tools/qa/spell-analysis.mjs
 */

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[JJFFFFFjjfffff] {F@-:0,J@-:0,f@-:0,j@-:0} w KQkq - 0 1'
const EVAL_FILE = process.env.SPELL_EVAL_FILE || ''

async function setup (page) {
  await page.eval(`
    const store = document.querySelector('#app').__vue__.$store
    window.__store = store
    if (store.getters.variant !== 'spell-chess') return store.dispatch('variant', 'spell-chess')
  `)
  await page.wait(2500)
}

async function setFen (page, fen) {
  await page.eval(`
    window.__store.commit('newBoard', { fen: ${JSON.stringify(fen)} })
    return window.__store.dispatch('fen', ${JSON.stringify(fen)})
  `)
  await page.wait(500)
}

async function analyse (page, seconds) {
  await page.eval(`
    const store = window.__store
    store.commit('multipv', [])
    store.dispatch('setEngineOptions', { MultiPV: 4 })
    return store.dispatch('position').then(() => {
      store.commit('active', true)
      return store.dispatch('goEngine')
    })
  `)
  await page.wait(seconds * 1000)
  await page.eval('return window.__store.dispatch(\'stopEngine\')')
  await page.wait(400)
}

export default async function (page) {
  await setup(page)

  const engineInfo = await page.eval(`
    const s = window.__store
    return { engine: s.getters.selectedEngine || s.state.activeEngine, options: Object.keys(s.getters.engineSettings || {}).length }
  `)
  console.log('engine:', JSON.stringify(engineInfo))

  if (EVAL_FILE) {
    await page.eval(`return window.__store.dispatch('setEngineOptions', { EvalFile: ${JSON.stringify(EVAL_FILE)} })`)
    await page.wait(1200)
    console.log('EvalFile set to', EVAL_FILE)
  }

  // A position where casts matter: both sides fully stocked, pieces engaged.
  await setFen(page, 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R[JJFFFFFjjfffff] {F@-:0,J@-:0,f@-:0,j@-:0} w KQkq - 6 5')
  await analyse(page, 14)

  const lines = await page.eval(`
    return (window.__store.getters.multipv || []).map(l => l && ({
      cp: l.cpDisplay, pv: l.pv, uci: l.ucimove, pvUCI: (l.pvUCI || '').split(' ').slice(0, 6).join(' ')
    }))
  `)
  console.log(JSON.stringify(lines, null, 2))

  await page.shot('11-engine-pv-lines', { selector: '#engine-lines,.pv-lines,#analysis', pad: 6, scale: 2 }).catch(async () => {
    await page.shot('11-engine-pv-lines')
  })
  await page.shot('11b-analysis-full')

  // Follow the engine's own line onto the board and screenshot the result.
  await page.eval(`
    const store = window.__store
    const line = (store.getters.multipv || []).find(l => l && l.pvUCI && l.pvUCI.includes('@'))
    if (!line) return 'no cast in any pv'
    const moves = line.pvUCI.split(' ').slice(0, 3)
    let prev
    return moves.reduce((p, m) => p.then(() => store.dispatch('push', { move: m, prev }).then(() => {
      prev = store.getters.moves[store.getters.moves.length - 1]
    })), Promise.resolve()).then(() => 'played ' + moves.join(' '))
  `).then(r => console.log('follow line:', r))
  await page.wait(900)
  await page.shot('12-board-after-engine-line', { selector: '#chessboard', pad: 4, scale: 2 })

  console.log('analysis scenario complete')
}
