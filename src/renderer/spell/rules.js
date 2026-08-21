/**
 * Spell Chess rules engine.
 *
 * Spell Chess is standard chess plus two consumable spells ("potions") per side:
 *
 *   FREEZE (F/f) - targets any square; the 3x3 area centred on it is frozen.
 *                  Pieces of BOTH colours standing inside cannot move, and they
 *                  do not attack (no checks, no defence, no castle veto).
 *   JUMP   (J/j) - targets an OCCUPIED square, which becomes transparent.
 *                  Sliders of BOTH colours see through it. Nothing may land on
 *                  a transparent square that is empty.
 *
 * A spell is never cast on its own: it is glued to the move of the same turn and
 * resolves BEFORE it, which is why a freeze can lock the caster's own pieces.
 * UCI syntax is `<spell>@<gate>,<move>`, e.g. `f@g4,e7g5`.
 *
 * Zone lifetime: the zone is alive for the caster's own move and for the single
 * enemy reply, then dies. Casting sets a cooldown of 3, ticked down by one every
 * time the turn comes back around, so the spell is castable again three of the
 * owner's turns later.
 *
 * Every rule here was verified against the Spell-Stockfish binary with
 * `go perft 1`; `npm run test:spell` re-runs that differential check.
 */

export const FILE_NAMES = 'abcdefgh'
export const SPELL_FREEZE = 'F'
export const SPELL_JUMP = 'J'
export const SPELLS = [SPELL_FREEZE, SPELL_JUMP]

/** Human facing metadata, shared by every piece of Spell UI. */
export const SPELL_INFO = {
  F: {
    id: 'F',
    key: 'freeze',
    name: 'Freeze',
    letter: 'f',
    blurb: 'Freezes the 3x3 area around the target. Pieces inside cannot move and do not attack — including your own.',
    target: 'Any square'
  },
  J: {
    id: 'J',
    key: 'jump',
    name: 'Jump',
    letter: 'j',
    blurb: 'Makes the target square transparent. Sliders of both colours see through it, and nothing may land on it while empty.',
    target: 'Any occupied square'
  }
}

export const COOLDOWN_ON_CAST = 3

/* ------------------------------------------------------------------ *
 * Square helpers. Index 0 = a1, 63 = h8 (index = rank * 8 + file).
 * ------------------------------------------------------------------ */

export function squareIndex (name) {
  if (!name || name.length < 2) return -1
  const f = FILE_NAMES.indexOf(name[0])
  const r = parseInt(name.slice(1), 10) - 1
  if (f < 0 || !(r >= 0 && r < 8)) return -1
  return r * 8 + f
}

export function squareName (index) {
  if (index < 0 || index > 63) return '-'
  return FILE_NAMES[index & 7] + (((index >> 3) + 1))
}

export function fileOf (index) { return index & 7 }
export function rankOf (index) { return index >> 3 }

/** The 3x3 block centred on `index`, clipped to the board. */
export function freezeArea (index) {
  const out = []
  if (index < 0 || index > 63) return out
  const f0 = fileOf(index)
  const r0 = rankOf(index)
  for (let dr = -1; dr <= 1; dr++) {
    for (let df = -1; df <= 1; df++) {
      const f = f0 + df
      const r = r0 + dr
      if (f >= 0 && f < 8 && r >= 0 && r < 8) out.push(r * 8 + f)
    }
  }
  return out
}

/* ------------------------------------------------------------------ *
 * FEN
 * ------------------------------------------------------------------ */

export const INITIAL_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[JJFFFFFjjfffff] ' +
  '{F@-:0,J@-:0,f@-:0,j@-:0} w KQkq - 0 1'

function emptySpellState () {
  return {
    w: { F: { gate: -1, cooldown: 0 }, J: { gate: -1, cooldown: 0 } },
    b: { F: { gate: -1, cooldown: 0 }, J: { gate: -1, cooldown: 0 } }
  }
}

/**
 * Parse a Spell Chess FEN. Returns null when the string is not parseable, so
 * callers can fall back instead of rendering a corrupt board.
 */
export function parseFen (fen) {
  if (typeof fen !== 'string') return null
  const trimmed = fen.trim()

  const boardMatch = /^([^\s[]+)(?:\[([^\]]*)\])?/.exec(trimmed)
  if (!boardMatch) return null
  const boardPart = boardMatch[1]
  const handPart = boardMatch[2] === undefined ? '' : boardMatch[2]

  let rest = trimmed.slice(boardMatch[0].length).trim()

  const spells = emptySpellState()
  const spellMatch = /^\{([^}]*)\}/.exec(rest)
  if (spellMatch) {
    for (const entry of spellMatch[1].split(',')) {
      const m = /^\s*([FJfj])@(-|[a-h][1-8]):(\d+)\s*$/.exec(entry)
      if (!m) continue
      const color = m[1] === m[1].toUpperCase() ? 'w' : 'b'
      const spell = m[1].toUpperCase()
      spells[color][spell] = {
        gate: m[2] === '-' ? -1 : squareIndex(m[2]),
        cooldown: parseInt(m[3], 10)
      }
    }
    rest = rest.slice(spellMatch[0].length).trim()
  }

  const fields = rest.split(/\s+/)
  const board = new Array(64).fill(null)
  const rows = boardPart.split('/')
  if (rows.length !== 8) return null
  for (let i = 0; i < 8; i++) {
    const rank = 7 - i
    let file = 0
    for (const ch of rows[i]) {
      if (ch >= '1' && ch <= '9') {
        file += parseInt(ch, 10)
      } else if (/[a-zA-Z]/.test(ch)) {
        if (file > 7) return null
        board[rank * 8 + file] = ch
        file++
      } else if (ch !== '~' && ch !== '+') {
        return null
      }
    }
    if (file !== 8) return null
  }

  const hands = { w: { F: 0, J: 0 }, b: { F: 0, J: 0 } }
  for (const ch of handPart) {
    if (ch === '-') continue
    const color = ch === ch.toUpperCase() ? 'w' : 'b'
    const spell = ch.toUpperCase()
    if (spell === 'F' || spell === 'J') hands[color][spell]++
  }

  const turn = fields[0] === 'b' ? 'b' : 'w'
  const castling = fields[1] === undefined ? '-' : fields[1]
  const epName = fields[2] === undefined ? '-' : fields[2]

  return {
    board,
    turn,
    castling: castling === '-' ? '' : castling,
    ep: epName === '-' ? -1 : squareIndex(epName),
    halfmove: parseInt(fields[3], 10) || 0,
    fullmove: parseInt(fields[4], 10) || 1,
    hands,
    spells
  }
}

/** Serialise a state back into the engine's FEN dialect. */
export function toFen (state) {
  let boardPart = ''
  for (let rank = 7; rank >= 0; rank--) {
    let empty = 0
    for (let file = 0; file < 8; file++) {
      const piece = state.board[rank * 8 + file]
      if (piece) {
        if (empty) { boardPart += empty; empty = 0 }
        boardPart += piece
      } else {
        empty++
      }
    }
    if (empty) boardPart += empty
    if (rank > 0) boardPart += '/'
  }

  // Hand order matches the engine: white jumps, white freezes, then black's.
  let hand = ''
  hand += 'J'.repeat(state.hands.w.J)
  hand += 'F'.repeat(state.hands.w.F)
  hand += 'j'.repeat(state.hands.b.J)
  hand += 'f'.repeat(state.hands.b.F)

  const cell = (color, spell) => {
    const s = state.spells[color][spell]
    const letter = color === 'w' ? spell : spell.toLowerCase()
    return `${letter}@${s.gate < 0 ? '-' : squareName(s.gate)}:${s.cooldown}`
  }
  const spellPart = `{${cell('w', 'F')},${cell('w', 'J')},${cell('b', 'F')},${cell('b', 'J')}}`

  return `${boardPart}[${hand}] ${spellPart} ${state.turn} ${state.castling || '-'} ` +
    `${state.ep < 0 ? '-' : squareName(state.ep)} ${state.halfmove} ${state.fullmove}`
}

export function cloneState (state) {
  return {
    board: state.board.slice(),
    turn: state.turn,
    castling: state.castling,
    ep: state.ep,
    halfmove: state.halfmove,
    fullmove: state.fullmove,
    hands: {
      w: { F: state.hands.w.F, J: state.hands.w.J },
      b: { F: state.hands.b.F, J: state.hands.b.J }
    },
    spells: {
      w: { F: { ...state.spells.w.F }, J: { ...state.spells.w.J } },
      b: { F: { ...state.spells.b.F }, J: { ...state.spells.b.J } }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Active zones
 * ------------------------------------------------------------------ */

/**
 * Zones currently on the board, each `{ color, spell, gate, cooldown, squares }`.
 * A zone belongs to whoever cast it, but its effect is colour-blind.
 */
export function activeZones (state) {
  const zones = []
  for (const color of ['w', 'b']) {
    for (const spell of SPELLS) {
      const s = state.spells[color][spell]
      if (s.gate >= 0) {
        zones.push({
          color,
          spell,
          gate: s.gate,
          cooldown: s.cooldown,
          squares: spell === SPELL_FREEZE ? freezeArea(s.gate) : [s.gate]
        })
      }
    }
  }
  return zones
}

function zoneMasks (zones) {
  const frozen = new Uint8Array(64)
  const transparent = new Uint8Array(64)
  for (const z of zones) {
    if (z.spell === SPELL_FREEZE) {
      for (const sq of z.squares) frozen[sq] = 1
    } else {
      transparent[z.gate] = 1
    }
  }
  return { frozen, transparent }
}

function makeZone (color, spell, gate) {
  return {
    color,
    spell,
    gate,
    cooldown: COOLDOWN_ON_CAST,
    squares: spell === SPELL_FREEZE ? freezeArea(gate) : [gate]
  }
}

/* ------------------------------------------------------------------ *
 * Move generation
 * ------------------------------------------------------------------ */

const EMPTY_MASK = new Uint8Array(64)

const KNIGHT_DELTAS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]
const KING_DELTAS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]]

function colorOf (piece) {
  return piece === piece.toUpperCase() ? 'w' : 'b'
}

/**
 * Walk a ray. Transparent squares never block, whatever stands on them.
 * `visit(target, occupantPiece)` returns true to keep walking.
 */
function ray (board, transparent, from, df, dr, visit, ignore) {
  let f = fileOf(from) + df
  let r = rankOf(from) + dr
  while (f >= 0 && f < 8 && r >= 0 && r < 8) {
    const to = r * 8 + f
    const occupant = board[to]
    visit(to, occupant)
    if (occupant && !transparent[to] && to !== ignore) return
    f += df
    r += dr
  }
}

/**
 * Squares attacked by `color`. `frozen` holds only the squares frozen by a zone
 * the OTHER side cast — a freeze disarms its victims, never the caster's own
 * pieces — which is what makes "freeze the defender, then take the piece" the
 * native tactic of the variant.
 *
 * `ignore` is treated as empty when tracing rays, so a king can be asked whether
 * a square is still attacked once he stops blocking the line himself.
 */
function attackMap (state, color, frozen, transparent, ignore) {
  const attacked = new Uint8Array(64)
  const board = state.board
  const mark = to => { attacked[to] = 1 }

  for (let from = 0; from < 64; from++) {
    const piece = board[from]
    if (!piece || colorOf(piece) !== color || frozen[from]) continue
    const role = piece.toLowerCase()

    if (role === 'p') {
      const dr = color === 'w' ? 1 : -1
      const r = rankOf(from) + dr
      if (r >= 0 && r < 8) {
        const f = fileOf(from)
        if (f > 0) mark(r * 8 + f - 1)
        if (f < 7) mark(r * 8 + f + 1)
      }
    } else if (role === 'n') {
      for (const [df, dr] of KNIGHT_DELTAS) {
        const f = fileOf(from) + df
        const r = rankOf(from) + dr
        if (f >= 0 && f < 8 && r >= 0 && r < 8) mark(r * 8 + f)
      }
    } else if (role === 'k') {
      for (const [df, dr] of KING_DELTAS) {
        const f = fileOf(from) + df
        const r = rankOf(from) + dr
        if (f >= 0 && f < 8 && r >= 0 && r < 8) mark(r * 8 + f)
      }
    } else {
      const dirs = role === 'r' ? ROOK_DIRS : role === 'b' ? BISHOP_DIRS : ROOK_DIRS.concat(BISHOP_DIRS)
      for (const [df, dr] of dirs) ray(board, transparent, from, df, dr, mark, ignore)
    }
  }
  return attacked
}

function pushMove (out, from, to, promotion) {
  out.push(squareName(from) + squareName(to) + (promotion || ''))
}

/**
 * Pseudo-legal + king-safety filtered moves, in plain `e2e4` form.
 *
 * `preZones` are the zones already on the board — always the opponent's, since a
 * zone dies after the single reply it was cast for. `castZone` is the spell the
 * side to move is casting this very turn, and the engine treats it differently
 * in three places, all verified by differential test:
 *
 *  - you may not land on a square YOUR OWN cast just made transparent, but you
 *    may capture a piece sheltering on the opponent's transparency;
 *  - a pawn may push straight onto an occupied square made transparent by the
 *    opponent, capturing forwards;
 *  - castling is vetoed by the opponent's freeze on your rook, but not by your
 *    own — while your own freeze gate standing on the king's path does veto it.
 */
function generateBaseMoves (state, preZones, castZone) {
  const zones = castZone ? preZones.concat([castZone]) : preZones
  const { frozen, transparent } = zoneMasks(zones)
  const pre = zoneMasks(preZones)
  const board = state.board
  const us = state.turn
  const them = us === 'w' ? 'b' : 'w'
  const out = []

  // A jump we cast ourselves phases the target out of our own reach.
  const ownTransparent = new Uint8Array(64)
  if (castZone && castZone.spell === SPELL_JUMP) ownTransparent[castZone.gate] = 1

  /** Never onto a friendly piece, our own transparency, or an empty hole. */
  const canLand = to => {
    if (ownTransparent[to]) return false
    const occupant = board[to]
    if (!occupant) return !transparent[to]
    return colorOf(occupant) !== us
  }

  // Only a freeze WE cast disarms them: the zone already on the board is theirs,
  // and a caster's own pieces keep attacking from inside their own ice.
  const disarmed = new Uint8Array(64)
  if (castZone && castZone.spell === SPELL_FREEZE) {
    for (const sq of castZone.squares) disarmed[sq] = 1
  }

  let enemyAttacks = null
  const enemyAttackMap = () => {
    if (!enemyAttacks) enemyAttacks = attackMap(state, them, disarmed, transparent)
    return enemyAttacks
  }

  /**
   * En passant is the one capture the engine drops while the king is in check —
   * unless the pawn that just double-pushed is itself the piece giving check,
   * which is the classic Stockfish evasion carve-out. Freezing the checker with
   * this turn's cast counts, since that attack map is the post-cast one.
   */
  let epVerdict = null
  const epAllowed = () => {
    if (epVerdict !== null) return epVerdict
    const king = findKing(state, us)
    if (king < 0 || state.ep < 0) return (epVerdict = true)
    if (!enemyAttackMap()[king]) return (epVerdict = true)
    const victim = us === 'w' ? state.ep - 8 : state.ep + 8
    // Silence the victim pawn and see whether anything still checks us.
    const silenced = disarmed.slice()
    silenced[victim] = 1
    epVerdict = !attackMap(state, them, silenced, transparent, victim)[king]
    return epVerdict
  }

  for (let from = 0; from < 64; from++) {
    const piece = board[from]
    if (!piece || colorOf(piece) !== us || frozen[from]) continue
    const role = piece.toLowerCase()

    if (role === 'p') {
      const dr = us === 'w' ? 1 : -1
      const startRank = us === 'w' ? 1 : 6
      const promoRank = us === 'w' ? 7 : 0
      const f = fileOf(from)
      const r = rankOf(from)

      // A push lands on a square that reads as empty after the phase flip:
      // really empty and opaque, or occupied but transparent — in which case the
      // pawn destroys what it lands on, straight ahead, friend or foe.
      const pushable = to => {
        if (ownTransparent[to]) return false
        if (transparent[to]) return !!board[to]
        return !board[to]
      }

      const one = (r + dr) * 8 + f
      if (r + dr >= 0 && r + dr < 8 && pushable(one)) {
        if (rankOf(one) === promoRank) {
          for (const p of ['q', 'r', 'b', 'n']) pushMove(out, from, one, p)
        } else {
          pushMove(out, from, one)
        }
      }
      // Double push. Landing and crossing are different tests: the crossed
      // square only has to be passable, and a transparent square always is —
      // even with a piece standing on it.
      if (r === startRank) {
        const two = (r + 2 * dr) * 8 + f
        const crossable = !board[one] || transparent[one]
        if (crossable && pushable(two)) pushMove(out, from, two)
      }

      for (const df of [-1, 1]) {
        const cf = f + df
        const cr = r + dr
        if (cf < 0 || cf > 7 || cr < 0 || cr > 7) continue
        const to = cr * 8 + cf
        if (ownTransparent[to]) continue
        const occupant = board[to]
        const isCapture = occupant && colorOf(occupant) !== us
        const isEp = to === state.ep && !occupant
        if (isEp && !epAllowed()) continue
        if (isCapture || isEp) {
          if (cr === promoRank) {
            for (const p of ['q', 'r', 'b', 'n']) pushMove(out, from, to, p)
          } else {
            pushMove(out, from, to)
          }
        }
      }
    } else if (role === 'n') {
      for (const [df, dr] of KNIGHT_DELTAS) {
        const f = fileOf(from) + df
        const r = rankOf(from) + dr
        if (f < 0 || f > 7 || r < 0 || r > 7) continue
        const to = r * 8 + f
        if (canLand(to)) pushMove(out, from, to)
      }
    } else if (role === 'k') {
      // Stepping off the square also stops blocking whatever aims at it, so the
      // safety test is run with this king lifted off the board.
      const attacksWithoutKing = attackMap(state, them, disarmed, transparent, from)
      for (const [df, dr] of KING_DELTAS) {
        const f = fileOf(from) + df
        const r = rankOf(from) + dr
        if (f < 0 || f > 7 || r < 0 || r > 7) continue
        const to = r * 8 + f
        if (!canLand(to)) continue
        const occupant = board[to]
        // The one hard legality rule of the variant: a king may not step onto an
        // attacked square. Capturing the enemy king ends the game, so it wins
        // the race and is allowed even there.
        const capturesKing = occupant && occupant.toLowerCase() === 'k'
        if (attacksWithoutKing[to] && !capturesKing) continue
        pushMove(out, from, to)
      }

      // Castling has the most spell-specific baggage of any move, and the
      // opponent's standing zone and our own fresh cast are weighed differently:
      //
      //  * being in check bans it, and that test is taken BEFORE our cast — so
      //    freezing the checker does not buy back the castle;
      //  * the opponent freezing our rook bans it, but our own freeze on the
      //    same rook does not;
      //  * our own freeze gate standing on a square the king walks over bans it,
      //    even though the rest of that 3x3 is harmless;
      //  * a transparent rook square bans it, because castling is internally the
      //    king landing on its own rook, and nothing lands on transparency;
      //  * the squares the king walks over must be unattacked AFTER our cast, so
      //    freezing an attacker does buy back the castle, and opening a line with
      //    a jump loses it.
      const backRank = us === 'w' ? 0 : 7
      if (from === backRank * 8 + 4) {
        const rights = us === 'w' ? ['K', 'Q'] : ['k', 'q']
        const attacks = enemyAttackMap()
        // The "not in check" gate is settled before our cast resolves, so
        // freezing the piece that checks us does not buy the castle back.
        const preAttacks = attackMap(state, them, EMPTY_MASK, pre.transparent)
        const castFreezeGate = castZone && castZone.spell === SPELL_FREEZE ? castZone.gate : -1
        for (const right of rights) {
          if (state.castling.indexOf(right) < 0) continue
          if (preAttacks[from]) continue
          const kingSide = right.toLowerCase() === 'k'
          const rookFrom = backRank * 8 + (kingSide ? 7 : 0)
          const rook = board[rookFrom]
          if (!rook || rook.toLowerCase() !== 'r' || colorOf(rook) !== us) continue
          if (transparent[rookFrom] || pre.frozen[rookFrom]) continue
          const between = kingSide ? [5, 6] : [1, 2, 3]
          let blocked = false
          for (const file of between) {
            if (board[backRank * 8 + file]) { blocked = true; break }
          }
          if (blocked) continue
          // The origin square is already covered by the pre-cast check test
          // above, so only the squares the king actually travels to are re-tested
          // against the post-cast attack map.
          const path = kingSide ? [5, 6] : [3, 2]
          let unsafe = false
          for (const file of path) {
            const sq = backRank * 8 + file
            if (attacks[sq] || sq === castFreezeGate) { unsafe = true; break }
          }
          if (unsafe) continue
          pushMove(out, from, backRank * 8 + (kingSide ? 6 : 2))
        }
      }
    } else {
      const dirs = role === 'r' ? ROOK_DIRS : role === 'b' ? BISHOP_DIRS : ROOK_DIRS.concat(BISHOP_DIRS)
      for (const [df, dr] of dirs) {
        ray(board, transparent, from, df, dr, to => {
          if (canLand(to)) pushMove(out, from, to)
        })
      }
    }
  }
  return out
}

/**
 * Squares a spell may legally target: freeze anywhere, jump only on a piece.
 *
 * One square is off limits for a freeze: the exact centre of a live enemy
 * freeze zone. Overlap is fine, only the centre itself is refused, so after
 * 1.freeze@e6 e4 black has 63 gates and freeze@d6 (6 of the 9 squares shared)
 * is still one of them. Only the enemy zone can be live when we are choosing a
 * gate: our own expires during the opponent's reply, one ply before our
 * cooldown reaches 0.
 */
export function legalGates (state, spell) {
  const enemy = state.turn === 'w' ? 'b' : 'w'
  const blocked = spell === SPELL_FREEZE ? state.spells[enemy][SPELL_FREEZE].gate : -1
  const gates = []
  for (let i = 0; i < 64; i++) {
    if (spell === SPELL_JUMP && !state.board[i]) continue
    if (i === blocked) continue
    gates.push(i)
  }
  return gates
}

/** True when `color` may cast `spell` right now (has one in hand, off cooldown). */
export function canCast (state, color, spell) {
  return state.hands[color][spell] > 0 && state.spells[color][spell].cooldown === 0
}

/**
 * Every legal move, in engine notation. Plain moves look like `e2e4`; a move
 * carrying a spell looks like `f@g4,e7g5`.
 */
export function legalMoves (state) {
  const zones = activeZones(state)
  const out = generateBaseMoves(state, zones, null)

  for (const spell of SPELLS) {
    if (!canCast(state, state.turn, spell)) continue
    const letter = SPELL_INFO[spell].letter
    for (const gate of legalGates(state, spell)) {
      const prefix = `${letter}@${squareName(gate)},`
      for (const move of generateBaseMoves(state, zones, makeZone(state.turn, spell, gate))) {
        // A cast cannot ride along with a promotion — the engine has no move
        // encoding for both at once.
        if (move.length > 4) continue
        out.push(prefix + move)
      }
    }
  }
  return out
}

/**
 * Base moves available for a given cast, without generating the whole universe.
 * Used by the UI to grey out pieces the cast would lock.
 */
export function movesUnderCast (state, spell, gate) {
  const zones = activeZones(state)
  if (!spell) return generateBaseMoves(state, zones, null)
  // Promotions cannot carry a cast, so the UI must not offer them either.
  return generateBaseMoves(state, zones, makeZone(state.turn, spell, gate))
    .filter(move => move.length === 4)
}

/* ------------------------------------------------------------------ *
 * Move application
 * ------------------------------------------------------------------ */

/**
 * Split `f@g4,e7g5` into `{ spell: 'F', gate: 42, move: 'e7g5' }`.
 *
 * The engine only accepts the cast first, but other Spell tooling writes the
 * base move first, so both orders are read and only the engine's is written.
 */
export function parseMove (uci) {
  if (typeof uci !== 'string') return null

  const castFirst = /^([fj])@([a-h][1-8]),([a-h][1-8][a-h][1-8][qrbn]?)$/.exec(uci)
  const moveFirst = castFirst ? null : /^([a-h][1-8][a-h][1-8][qrbn]?),([fj])@([a-h][1-8])$/.exec(uci)
  if (castFirst || moveFirst) {
    const spell = castFirst ? castFirst[1] : moveFirst[2]
    const gate = castFirst ? castFirst[2] : moveFirst[3]
    const move = castFirst ? castFirst[3] : moveFirst[1]
    return {
      spell: spell.toUpperCase(),
      gate: squareIndex(gate),
      move,
      from: squareIndex(move.slice(0, 2)),
      to: squareIndex(move.slice(2, 4)),
      promotion: move.length > 4 ? move[4] : ''
    }
  }
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null
  return {
    spell: null,
    gate: -1,
    move: uci,
    from: squareIndex(uci.slice(0, 2)),
    to: squareIndex(uci.slice(2, 4)),
    promotion: uci.length > 4 ? uci[4] : ''
  }
}

export function formatMove (spell, gate, move) {
  if (!spell) return move
  return `${SPELL_INFO[spell].letter}@${typeof gate === 'number' ? squareName(gate) : gate},${move}`
}

/**
 * Apply a move and return the new state (the input is not mutated).
 * Returns null if the move cannot be parsed.
 */
export function applyMove (state, uci) {
  const parsed = parseMove(uci)
  if (!parsed) return null
  const next = cloneState(state)
  const us = state.turn
  const them = us === 'w' ? 'b' : 'w'

  if (parsed.spell) {
    next.hands[us][parsed.spell]--
    next.spells[us][parsed.spell] = { gate: parsed.gate, cooldown: COOLDOWN_ON_CAST }
  }

  const { from, to } = parsed
  const piece = next.board[from]
  const captured = next.board[to]
  const role = piece ? piece.toLowerCase() : ''

  next.board[to] = parsed.promotion
    ? (us === 'w' ? parsed.promotion.toUpperCase() : parsed.promotion.toLowerCase())
    : piece
  next.board[from] = null

  // En passant capture removes the pawn that is beside, not under, the target.
  let epCapture = false
  if (role === 'p' && to === state.ep && !captured) {
    const victim = (us === 'w' ? to - 8 : to + 8)
    if (next.board[victim] && next.board[victim].toLowerCase() === 'p') {
      next.board[victim] = null
      epCapture = true
    }
  }

  // Castling moves the rook along with the king.
  if (role === 'k' && Math.abs(fileOf(to) - fileOf(from)) === 2) {
    const backRank = rankOf(from)
    const kingSide = fileOf(to) === 6
    const rookFrom = backRank * 8 + (kingSide ? 7 : 0)
    const rookTo = backRank * 8 + (kingSide ? 5 : 3)
    next.board[rookTo] = next.board[rookFrom]
    next.board[rookFrom] = null
  }

  // Castling rights.
  let castling = next.castling
  const drop = chars => { for (const c of chars) castling = castling.replace(c, '') }
  if (role === 'k') drop(us === 'w' ? 'KQ' : 'kq')
  if (from === 0 || to === 0) drop('Q')
  if (from === 7 || to === 7) drop('K')
  if (from === 56 || to === 56) drop('q')
  if (from === 63 || to === 63) drop('k')
  next.castling = castling

  // The ep square is only recorded when an enemy pawn is actually standing next
  // to the pushed pawn, matching the engine (and keeping FENs comparable).
  next.ep = -1
  if (role === 'p' && Math.abs(rankOf(to) - rankOf(from)) === 2) {
    const enemyPawn = us === 'w' ? 'p' : 'P'
    for (const df of [-1, 1]) {
      const f = fileOf(to) + df
      if (f < 0 || f > 7) continue
      if (next.board[rankOf(to) * 8 + f] === enemyPawn) {
        next.ep = (rankOf(from) + rankOf(to)) / 2 * 8 + fileOf(from)
        break
      }
    }
  }

  next.halfmove = (role === 'p' || captured || epCapture) ? 0 : state.halfmove + 1
  if (us === 'b') next.fullmove = state.fullmove + 1
  next.turn = them

  // The turn coming back around is what ticks a cooldown down, and the very
  // first tick is also what kills the zone.
  for (const spell of SPELLS) {
    const s = next.spells[them][spell]
    if (s.cooldown > 0) s.cooldown--
    s.gate = -1
  }

  return next
}

/** Convenience: FEN in, FEN out. Returns null when the move is unparseable. */
export function fenAfterMove (fen, uci) {
  const state = parseFen(fen)
  if (!state) return null
  const next = applyMove(state, uci)
  return next ? toFen(next) : null
}

/* ------------------------------------------------------------------ *
 * Game state
 * ------------------------------------------------------------------ */

export function findKing (state, color) {
  const target = color === 'w' ? 'K' : 'k'
  for (let i = 0; i < 64; i++) if (state.board[i] === target) return i
  return -1
}

/**
 * "In check" is a soft warning here, not a legality constraint: the side to move
 * may ignore it and race instead. We still surface it, because a player wants to
 * know their king can be taken next ply.
 */
export function isKingAttacked (state, color) {
  const king = findKing(state, color)
  if (king < 0) return false
  const { transparent } = zoneMasks(activeZones(state))
  const attacks = attackMap(state, color === 'w' ? 'b' : 'w', EMPTY_MASK, transparent)
  return !!attacks[king]
}

/**
 * Terminal test. Losing the king is the real loss condition; having no move at
 * all is a stalemate-shaped dead end.
 */
export function gameResult (state) {
  if (findKing(state, 'w') < 0) return { over: true, winner: 'b', reason: 'King captured' }
  if (findKing(state, 'b') < 0) return { over: true, winner: 'w', reason: 'King captured' }
  if (legalMoves(state).length === 0) {
    return { over: true, winner: null, reason: 'No legal moves' }
  }
  if (state.halfmove >= 100) return { over: true, winner: null, reason: '50-move rule' }
  return { over: false, winner: null, reason: '' }
}

/* ------------------------------------------------------------------ *
 * Notation
 * ------------------------------------------------------------------ */

const ROLE_LETTER = { n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' }

/**
 * SAN for the base move, with the spell kept as structured data so the UI can
 * render an icon rather than raw text.
 * Returns `{ spell, gate, san, uci }`.
 */
export function describeMove (state, uci) {
  const parsed = parseMove(uci)
  if (!parsed) return null
  const piece = state.board[parsed.from]
  let san

  if (!piece) {
    san = parsed.move
  } else {
    const role = piece.toLowerCase()
    const captured = state.board[parsed.to]
    const isEp = role === 'p' && parsed.to === state.ep && !captured
    const isCapture = !!captured || isEp

    if (role === 'k' && Math.abs(fileOf(parsed.to) - fileOf(parsed.from)) === 2) {
      san = fileOf(parsed.to) === 6 ? 'O-O' : 'O-O-O'
    } else if (role === 'p') {
      san = isCapture
        ? `${FILE_NAMES[fileOf(parsed.from)]}x${squareName(parsed.to)}`
        : squareName(parsed.to)
      if (parsed.promotion) san += '=' + parsed.promotion.toUpperCase()
    } else {
      // Disambiguate against same-role pieces that could also reach the square.
      const zones = activeZones(state)
      const cast = parsed.spell ? makeZone(state.turn, parsed.spell, parsed.gate) : null
      const rivals = generateBaseMoves(state, zones, cast)
        .filter(m => m !== parsed.move &&
          squareIndex(m.slice(2, 4)) === parsed.to &&
          (state.board[squareIndex(m.slice(0, 2))] || '').toLowerCase() === role)
        .map(m => squareIndex(m.slice(0, 2)))
      let hint = ''
      if (rivals.length) {
        const sameFile = rivals.some(sq => fileOf(sq) === fileOf(parsed.from))
        const sameRank = rivals.some(sq => rankOf(sq) === rankOf(parsed.from))
        if (!sameFile) hint = FILE_NAMES[fileOf(parsed.from)]
        else if (!sameRank) hint = String(rankOf(parsed.from) + 1)
        else hint = squareName(parsed.from)
      }
      san = ROLE_LETTER[role] + hint + (isCapture ? 'x' : '') + squareName(parsed.to)
    }
  }

  const after = applyMove(state, uci)
  if (after) {
    const enemy = state.turn === 'w' ? 'b' : 'w'
    if (findKing(after, enemy) < 0) san += '#'
    else if (isKingAttacked(after, enemy)) san += '+'
  }

  return {
    uci,
    san,
    spell: parsed.spell,
    gate: parsed.gate,
    gateName: parsed.gate >= 0 ? squareName(parsed.gate) : ''
  }
}

/** Describe a whole PV, threading the position forward. Bad moves stop the line. */
export function describeLine (fen, moves) {
  let state = parseFen(fen)
  const out = []
  if (!state) return out
  for (const uci of moves) {
    const described = describeMove(state, uci)
    if (!described) break
    const next = applyMove(state, uci)
    if (!next) break
    out.push({ ...described, turn: state.turn, fen: toFen(next), ply: out.length })
    state = next
  }
  return out
}
