<template>
  <div
    class="spell-hands"
    :class="{ mirror: orientation === 'black' }"
  >
    <section
      v-for="hand in hands"
      :key="hand.color"
      class="hand"
      :class="{ 'hand--turn': hand.color === turn }"
    >
      <header class="hand__head">
        <span
          class="hand__dot"
          :class="'hand__dot--' + hand.color"
        />
        <span class="hand__name">{{ hand.color === 'w' ? 'White' : 'Black' }}</span>
      </header>

      <div class="hand__slots">
        <button
          v-for="slot in hand.slots"
          :key="slot.spell"
          type="button"
          class="slot"
          :class="[
            slot.spell === 'F' ? 'slot--freeze' : 'slot--jump',
            {
              'slot--armed': slot.armed,
              'slot--ready': slot.ready,
              'slot--cooling': slot.cooldown > 0,
              'slot--spent': slot.count === 0
            }
          ]"
          :disabled="!slot.ready"
          :title="slot.tooltip"
          @click="$emit('arm', slot.spell)"
        >
          <span class="slot__art">
            <SpellPotionIcon
              :spell="slot.spell"
              :size="34"
            />
            <span
              v-if="slot.cooldown > 0"
              class="slot__cooldown"
            >{{ slot.cooldown }}</span>
          </span>

          <span class="slot__label">{{ slot.name }}</span>

          <span class="slot__foot">
            <span class="slot__count">&times;{{ slot.count }}</span>
            <span
              class="slot__pips"
              :aria-label="slot.cooldown > 0 ? slot.cooldown + ' turns until ready' : 'ready'"
            >
              <span
                v-for="pip in 3"
                :key="pip"
                class="pip"
                :class="{ 'pip--lit': pip <= slot.cooldown }"
              />
            </span>
          </span>
        </button>
      </div>

      <p
        v-if="hand.empty"
        class="hand__empty"
      >
        No potions left
      </p>
    </section>
  </div>
</template>

<script>
import SpellPotionIcon from './SpellPotionIcon'
import { SPELLS, SPELL_INFO } from '../spell/rules'

export default {
  name: 'SpellHands',
  components: { SpellPotionIcon },
  props: {
    /** Parsed Spell Chess position; null renders nothing useful, so guard above. */
    position: {
      type: Object,
      default: null
    },
    orientation: {
      type: String,
      default: 'white'
    },
    /** The spell the local player has picked up, if any. */
    armed: {
      type: String,
      default: ''
    },
    /** False while browsing history or watching an engine game. */
    interactive: {
      type: Boolean,
      default: true
    }
  },
  computed: {
    turn () {
      return this.position ? this.position.turn : 'w'
    },
    hands () {
      // Black first so the flex column reads top-to-bottom as it does on the
      // board; `mirror` flips it when the board is seen from Black's side.
      return ['b', 'w'].map(color => {
        const slots = SPELLS.map(spell => this.buildSlot(color, spell))
        return {
          color,
          slots,
          empty: slots.every(s => s.count === 0)
        }
      })
    }
  },
  methods: {
    buildSlot (color, spell) {
      const info = SPELL_INFO[spell]
      if (!this.position) {
        return { spell, name: info.name, count: 0, cooldown: 0, ready: false, armed: false, tooltip: info.blurb }
      }
      const count = this.position.hands[color][spell]
      const cooldown = this.position.spells[color][spell].cooldown
      const ours = color === this.position.turn
      const ready = this.interactive && ours && count > 0 && cooldown === 0

      let tooltip = `${info.name} — ${info.blurb}`
      if (count === 0) tooltip += '\nNone left.'
      else if (cooldown > 0) tooltip += `\nRecharging: ready in ${cooldown} more turn${cooldown === 1 ? '' : 's'}.`
      else if (ours && this.interactive) tooltip += '\nClick to pick it up, then choose a target square.'

      return {
        spell,
        name: info.name,
        count,
        cooldown,
        ready,
        armed: ready && this.armed === spell,
        tooltip
      }
    }
  }
}
</script>

<style scoped>
.spell-hands {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 10px;
  height: 100%;
  padding: 8px 7px;
  margin-right: 1.5px;
  background-color: var(--spell-panel-bg);
  border-radius: 5px;
  box-sizing: border-box;
}

.spell-hands.mirror {
  flex-direction: column-reverse;
}

.hand {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hand__head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-left: 2px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--spell-muted-text);
}

.hand__dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1px solid var(--spell-slot-border);
  flex: none;
}

.hand__dot--w { background: #fff; }
.hand__dot--b { background: #23262b; }

/* The side to move gets its label lit so the panel answers "whose turn" too. */
.hand--turn .hand__head {
  color: var(--main-text-color);
}

.hand__slots {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.slot {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-areas:
    'art label'
    'art foot';
  align-items: center;
  gap: 2px 8px;
  width: 100%;
  padding: 8px;
  font: inherit;
  text-align: left;
  color: var(--main-text-color);
  background: var(--spell-slot-bg);
  border: 1px solid var(--spell-slot-border);
  border-radius: 7px;
  box-shadow: 0 1px 2px var(--spell-slot-shadow);
  cursor: default;
  transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease, opacity 0.12s ease;
}

.slot--ready {
  cursor: pointer;
}

.slot--ready:hover {
  transform: translateY(-1px);
  border-color: var(--highlight-color);
  box-shadow: 0 3px 7px var(--spell-slot-shadow);
}

.slot--ready:focus-visible {
  outline: 2px solid var(--highlight-color);
  outline-offset: 2px;
}

.slot__art {
  grid-area: art;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 6px;
}

/* The recharge number sits in a corner badge rather than over the whole flask,
   so a potion on cooldown is still recognisable as which potion it is. */
.slot__cooldown {
  position: absolute;
  right: -1px;
  bottom: -1px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 15px;
  height: 15px;
  padding: 0 3px;
  font-size: 10.5px;
  font-weight: 700;
  line-height: 1;
  color: var(--spell-slot-bg);
  background: var(--main-text-color);
  border-radius: 999px;
}

.slot--cooling .slot__art {
  opacity: 0.45;
}

.slot--cooling .slot__cooldown {
  opacity: 1;
}

.slot__label {
  grid-area: label;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: 0.01em;
}

.slot__foot {
  grid-area: foot;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.slot__count {
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  color: var(--spell-muted-text);
}

.slot__pips {
  display: flex;
  gap: 2.5px;
}

.pip {
  width: 8px;
  height: 3px;
  border-radius: 1.5px;
  background: var(--spell-slot-border);
  opacity: 0.55;
}

/* Lit pips count down the turns left, so the panel shows the wait shrinking. */
.pip--lit {
  opacity: 1;
}

.slot--freeze .pip--lit { background: var(--spell-freeze); }
.slot--jump .pip--lit { background: var(--spell-jump); }

.slot--cooling .slot__label,
.slot--cooling .slot__count {
  color: var(--spell-muted-text);
}

.slot--spent {
  opacity: 0.42;
}

.slot--spent .slot__count::before {
  content: '';
}

/* Armed: the potion is in hand and the board is waiting for a target. */
.slot--armed {
  border-color: transparent;
  box-shadow:
    0 0 0 2px var(--armed-color, var(--highlight-color)),
    0 4px 12px var(--armed-glow, transparent);
  transform: translateY(-1px);
}

.slot--freeze.slot--armed {
  --armed-color: var(--spell-freeze);
  --armed-glow: var(--spell-freeze-glow);
}

.slot--jump.slot--armed {
  --armed-color: var(--spell-jump);
  --armed-glow: var(--spell-jump-glow);
}

.hand__empty {
  margin: 0;
  padding-left: 2px;
  font-size: 10px;
  font-style: italic;
  color: var(--spell-muted-text);
}
</style>
