<template>
  <span
    v-if="cast"
    class="spell-move"
    :class="'spell-move--' + (cast.spell === 'F' ? 'freeze' : 'jump')"
    :title="title"
  >
    <span class="spell-move__cast">
      <SpellPotionIcon
        :spell="cast.spell"
        :size="13"
      />
      <span class="spell-move__gate">{{ cast.gate }}</span>
    </span>
    <span class="spell-move__san">{{ cast.san }}</span>
  </span>
  <span v-else>{{ text }}</span>
</template>

<script>
import SpellPotionIcon from './SpellPotionIcon'
import { splitCastSan } from '../spell/board'
import { SPELL_INFO } from '../spell/rules'

/**
 * One move inside a PV or the move list. A move that carries a spell is drawn as
 * a small potion chip glued to the SAN, so an engine line stays readable instead
 * of turning into a wall of `f@g4,e7g5`.
 */
export default {
  name: 'SpellMoveToken',
  components: { SpellPotionIcon },
  props: {
    text: {
      type: String,
      default: ''
    }
  },
  computed: {
    cast () {
      return splitCastSan(this.text)
    },
    title () {
      if (!this.cast) return ''
      const info = SPELL_INFO[this.cast.spell]
      return `${info.name} on ${this.cast.gate}, then ${this.cast.san}`
    }
  }
}
</script>

<style scoped>
.spell-move {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
}

.spell-move__cast {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  padding: 0 3px 0 2px;
  border-radius: 4px;
  line-height: 1;
}

.spell-move--freeze .spell-move__cast {
  background: var(--spell-freeze-soft);
  color: var(--spell-freeze-ink);
}

.spell-move--jump .spell-move__cast {
  background: var(--spell-jump-soft);
  color: var(--spell-jump-ink);
}

.spell-move__gate {
  font-size: 0.8em;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.spell-move__san {
  font-weight: inherit;
}
</style>
