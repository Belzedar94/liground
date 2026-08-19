/**
 * A drop-in stand-in for `ffish.Board`, backed by the Spell Chess rules engine.
 *
 * ffish.js has no spell-chess variant, so every place the app would ask the WASM
 * board about legality, SAN, pockets or game state asks this object instead. It
 * deliberately mirrors the ffish surface (`fen()`, `turn()`, `legalMoves()`,
 * `push()`, `sanMove()`, `variationSan()`, `pocket()`, `isGameOver()`,
 * `result()`, `moveStack()`, `is960()`, `delete()`) so the store needs a factory
 * swap rather than a rewrite.
 */

import {
  INITIAL_FEN,
  SPELL_INFO,
  applyMove,
  describeMove,
  findKing,
  gameResult,
  legalMoves,
  parseFen,
  parseMove,
  toFen
} from './rules'

/**
 * Plain-text form of a move that carries a cast: `Fg4:Bg5`.
 * The UI splits this back apart to draw the potion as an icon; anything that
 * just prints strings still gets something readable.
 */
export const CAST_SAN_PATTERN = /^([FJ])([a-h][1-8]):(.+)$/

export function castSan (spell, gateName, san) {
  return `${spell}${gateName}:${san}`
}

/** `Fg4:Bg5` -> `{ spell: 'F', gate: 'g4', san: 'Bg5' }`, or null for plain SAN. */
export function splitCastSan (san) {
  const m = CAST_SAN_PATTERN.exec(san || '')
  if (!m) return null
  return { spell: m[1], gate: m[2], san: m[3] }
}

export default class SpellBoard {
  constructor (fen) {
    this.setFen(typeof fen === 'string' && fen.trim() ? fen : INITIAL_FEN)
  }

  setFen (fen) {
    const state = parseFen(fen)
    this.state = state || parseFen(INITIAL_FEN)
    this.stack = []
    this._legal = null
  }

  fen () { return toFen(this.state) }

  /** ffish reports the side to move as a boolean, true for white. */
  turn () { return this.state.turn === 'w' }

  legalMoves () {
    if (this._legal === null) this._legal = legalMoves(this.state).join(' ')
    return this._legal
  }

  legalMovesSan () {
    return legalMoves(this.state).map(uci => this.sanMove(uci)).join(' ')
  }

  push (uci) {
    const next = applyMove(this.state, uci)
    if (!next) return false
    this.state = next
    this.stack.push(uci)
    this._legal = null
    return true
  }

  pop () {
    if (!this.stack.length) return false
    const moves = this.stack.slice(0, -1)
    const start = this.startFen || INITIAL_FEN
    this.setFen(start)
    for (const m of moves) this.push(m)
    return true
  }

  moveStack () { return this.stack.join(' ') }

  sanMove (uci) {
    const described = describeMove(this.state, uci)
    if (!described) return uci
    if (!described.spell) return described.san
    return castSan(described.spell, described.gateName, described.san)
  }

  /**
   * SAN for a whole line. Signature matches ffish: the second argument is a
   * notation enum we ignore (there is only one Spell notation), the third turns
   * move numbers off.
   */
  variationSan (uciLine, _notation, moveNumbers) {
    const withNumbers = moveNumbers === undefined ? true : !!moveNumbers
    const moves = String(uciLine || '').trim().split(/\s+/).filter(Boolean)
    let state = this.state
    const parts = []
    for (const uci of moves) {
      const described = describeMove(state, uci)
      if (!described) break
      const next = applyMove(state, uci)
      if (!next) break
      if (withNumbers) {
        if (state.turn === 'w') parts.push(`${state.fullmove}.`)
        else if (parts.length === 0) parts.push(`${state.fullmove}...`)
      }
      parts.push(described.spell
        ? castSan(described.spell, described.gateName, described.san)
        : described.san)
      state = next
    }
    return parts.join(' ')
  }

  /**
   * Hand contents as a letter string, the way ffish reports a crazyhouse pocket.
   * Spell hands hold potions rather than pieces, so the letters are F and J.
   */
  pocket (white) {
    const hand = this.state.hands[white ? 'w' : 'b']
    return SPELL_INFO.F.id.repeat(hand.F) + SPELL_INFO.J.id.repeat(hand.J)
  }

  isGameOver () { return gameResult(this.state).over }

  result () {
    const r = gameResult(this.state)
    if (!r.over) return '*'
    if (r.winner === 'w') return '1-0'
    if (r.winner === 'b') return '0-1'
    return '1/2-1/2'
  }

  /** Reason string for the end-of-game modal. */
  resultReason () { return gameResult(this.state).reason }

  is960 () { return false }

  /** ffish boards hold WASM memory; ours does not, but callers still free them. */
  delete () {}
}

/** Cheap structural check used in place of `ffish.validateFen`. */
export function validateSpellFen (fen) {
  const state = parseFen(fen)
  if (!state) return false
  if (findKing(state, 'w') < 0 || findKing(state, 'b') < 0) return false
  return true
}

/** True when `uci` is a legal move string shape for this variant. */
export function isSpellMove (uci) {
  return !!parseMove(uci)
}
