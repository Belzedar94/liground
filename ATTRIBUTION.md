# Attribution

## Spell Chess artwork

The potion icons, the board zone overlays and the Spell-Stockfish engine badge
are original SVG drawn for this project:

- `src/renderer/components/SpellPotionIcon.vue` — freeze and jump potions
- `src/renderer/components/SpellOverlay.vue` — frost zone and portal ring
- `src/renderer/assets/images/engines/spell-stockfish.svg` — engine badge

They carry no third-party licence and inherit the repository's AGPL-3.0.

Colours come from the theme tokens in `src/renderer/theme.js` rather than being
hard coded, so the artwork follows the light and dark palettes.

## Spell Chess rules

The variant is implemented by
[Spell-Stockfish](https://github.com/Belzedar94/Spell-Stockfish), which is the
authority on legality. `tools/spell-perft-check.mjs` checks the GUI's rules
engine against that binary rather than against a written spec.

## Existing LiGround assets

Everything else — piece sets, board styles, sounds, the bundled engines — keeps
the attribution it already had upstream; see `README.md` and `LICENSE`.
