/**
 * QA scenario: drives the running app through every new Spell Chess UI state and
 * saves a screenshot of each into qa/.
 *
 *   node tools/qa-shot.mjs tools/qa/spell-states.mjs
 */

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[JJFFFFFjjfffff] {F@-:0,J@-:0,f@-:0,j@-:0} w KQkq - 0 1'

async function setup (page) {
  await page.eval(`
    const store = document.querySelector('#app').__vue__.$store
    window.__store = store
    if (store.getters.variant !== 'spell-chess') {
      return store.dispatch('variant', 'spell-chess')
    }
  `)
  await page.wait(900)
}

async function setFen (page, fen) {
  await page.eval(`
    const store = window.__store
    store.commit('newBoard', { fen: ${JSON.stringify(fen)} })
    return store.dispatch('fen', ${JSON.stringify(fen)})
  `)
  await page.wait(500)
}

/** Page coordinates of the centre of a board square. */
async function squareAt (page, name) {
  return page.eval(`
    const wrap = document.querySelector('.cg-board-wrap cg-container') ||
                 document.querySelector('.cg-board-wrap')
    const b = wrap.getBoundingClientRect()
    const orientation = window.__store.getters.orientation
    const files = 'abcdefgh'
    const f = files.indexOf(${JSON.stringify(name)}[0])
    const r = parseInt(${JSON.stringify(name)}.slice(1), 10) - 1
    const col = orientation === 'black' ? 7 - f : f
    const row = orientation === 'black' ? r : 7 - r
    return { x: b.x + (col + 0.5) * b.width / 8, y: b.y + (row + 0.5) * b.height / 8 }
  `)
}

/** Set the armed potion outright; the UI toggle would depend on prior state. */
async function armSpell (page, spell) {
  await page.eval(`
    window.__store.commit('pendingCast', ${spell ? `{ spell: ${JSON.stringify(spell)}, gate: -1 }` : 'null'})
  `)
  await page.wait(250)
}

async function pickGate (page, square) {
  await page.eval(`
    const files = 'abcdefgh'
    const name = ${JSON.stringify(square)}
    const gate = (parseInt(name.slice(1), 10) - 1) * 8 + files.indexOf(name[0])
    const cast = window.__store.getters.pendingCast
    window.__store.commit('pendingCast', { spell: cast.spell, gate })
  `)
  await page.wait(300)
}

async function playMoves (page, moves) {
  await page.eval(`
    const store = window.__store
    let prev = undefined
    const list = ${JSON.stringify(moves)}
    return list.reduce((p, m) => p.then(() => {
      const cur = store.getters.moves.filter(x => x.uci === m && x.prev === prev)[0]
      return store.dispatch('push', { move: m, prev }).then(() => {
        prev = store.getters.moves[store.getters.moves.length - 1]
      })
    }), Promise.resolve())
  `)
  await page.wait(600)
}

async function setDark (page, dark) {
  await page.eval(`
    const store = window.__store
    if (store.getters.darkMode !== ${dark}) return store.dispatch('switchDarkMode')
  `)
  await page.wait(400)
}

export default async function (page) {
  await setup(page)
  // The theme persists across restarts now, so pin it rather than inherit it.
  await setDark(page, false)

  // --- 1. the board as the variant opens -------------------------------
  await setFen(page, START)
  await page.shot('01-board-initial')
  await page.shot('02-hands-panel', { selector: '.spell-hands', pad: 6, scale: 3 })

  // --- 2. a potion picked up: legal targets appear ----------------------
  await armSpell(page, 'F')
  await page.shot('03-cast-armed-freeze', { selector: '#chessboard', pad: 4, scale: 2 })
  await page.shot('03b-hands-armed', { selector: '.spell-hands', pad: 6, scale: 3 })

  // --- 3. aiming: the 3x3 preview follows the cursor --------------------
  await page.hover(await squareAt(page, 'e6'))
  await page.wait(250)
  await page.shot('04-cast-preview-freeze', { selector: '#chessboard', pad: 4, scale: 2 })

  // --- 4. the jump preview: only occupied squares are legal targets ------
  await armSpell(page, 'J')
  await page.hover(await squareAt(page, 'd7'))
  await page.wait(250)
  await page.shot('05-cast-preview-jump', { selector: '#chessboard', pad: 4, scale: 2 })

  // --- 5. target locked in: step two asks for the move ------------------
  await armSpell(page, 'F')
  await pickGate(page, 'e3')
  await page.hover(await squareAt(page, 'a1'))
  await page.wait(250)
  await page.shot('05b-cast-gate-chosen', { selector: '#chessboard', pad: 4, scale: 2 })

  // --- 5. live zones, after the cast actually lands ---------------------
  await armSpell(page, null)
  await setFen(page, START)
  await playMoves(page, ['f@e6,e2e4'])
  await page.shot('06-zone-freeze-active', { selector: '#chessboard', pad: 4, scale: 2 })
  await page.shot('06b-hands-cooldown', { selector: '.spell-hands', pad: 6, scale: 3 })

  await setFen(page, START)
  await playMoves(page, ['j@d7,e2e4'])
  await page.shot('07-zone-jump-active', { selector: '#chessboard', pad: 4, scale: 2 })

  // --- 6. cooldown counting down over several plies ---------------------
  await setFen(page, START)
  await playMoves(page, ['f@e6,e2e4', 'a7a6', 'd2d4', 'b7b6'])
  await page.shot('08-cooldown-pips', { selector: '.spell-hands', pad: 6, scale: 3 })
  await page.shot('08b-move-history-casts', { selector: '#move-history', pad: 6, scale: 2 })

  // --- 7. hands running dry --------------------------------------------
  await setFen(page, 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R[Jf] {F@-:0,J@-:0,f@-:0,j@-:0} w KQkq - 6 5')
  await page.shot('09-hands-depleted', { selector: '.spell-hands', pad: 6, scale: 3 })

  // --- 8. dark mode -----------------------------------------------------
  await setDark(page, true)
  await setFen(page, START)
  await playMoves(page, ['f@e6,e2e4'])
  await page.shot('10-dark-zone-freeze', { selector: '#chessboard', pad: 4, scale: 2 })
  await page.shot('10b-dark-hands', { selector: '.spell-hands', pad: 6, scale: 3 })
  await page.shot('10c-dark-full')
  await setDark(page, false)

  console.log('scenario complete')
}
