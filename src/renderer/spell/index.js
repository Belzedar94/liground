/**
 * Entry point for Spell Chess support.
 *
 * The app talks to ffish.js for every other variant. Spell Chess is not in
 * ffish, so `createBoard` hands back a `SpellBoard` instead — same interface,
 * different engine underneath. Call it everywhere `new ffish.Board(...)` used to
 * appear and the rest of the app does not need to know the difference.
 */

import ffish from 'ffish'
import SpellBoard, { validateSpellFen } from './board'
import { INITIAL_FEN } from './rules'

export const SPELL_VARIANT = 'spell-chess'
export const SPELL_INITIAL_FEN = INITIAL_FEN

export function isSpellVariant (variant) {
  return variant === SPELL_VARIANT
}

/** Board for any variant: SpellBoard for spell-chess, ffish.Board otherwise. */
export function createBoard (variant, fen, is960) {
  if (isSpellVariant(variant)) {
    return new SpellBoard(typeof fen === 'string' && fen.trim() ? fen : INITIAL_FEN)
  }
  if (typeof fen === 'string' && fen.trim()) {
    return is960 ? new ffish.Board(variant, fen, true) : new ffish.Board(variant, fen)
  }
  return new ffish.Board(variant)
}

/** FEN validation for any variant, routed the same way. */
export function validateFen (fen, variant) {
  if (isSpellVariant(variant)) return validateSpellFen(fen)
  return ffish.validateFen(fen, variant)
}

export { default as SpellBoard } from './board'
export * from './rules'
