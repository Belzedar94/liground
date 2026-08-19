<template>
  <svg
    class="potion"
    :class="'potion--' + info.key"
    :width="size"
    :height="size"
    viewBox="0 0 32 32"
    role="img"
    :aria-label="info.name + ' potion'"
    focusable="false"
  >
    <defs>
      <linearGradient
        :id="ids.liquid"
        x1="0"
        y1="0"
        x2="0.3"
        y2="1"
      >
        <stop
          offset="0"
          :stop-color="tint"
        />
        <stop
          offset="1"
          :stop-color="ink"
        />
      </linearGradient>
      <clipPath :id="ids.clip">
        <path :d="FLASK" />
      </clipPath>
    </defs>

    <!-- Liquid first, clipped to the glass, so it can never bleed past the rim.
         It stops short of the neck, which is what makes the glass read as glass
         rather than as a solid blob. -->
    <g :clip-path="'url(#' + ids.clip + ')'">
      <path
        :d="LIQUID"
        :fill="'url(#' + ids.liquid + ')'"
      />
      <path
        :d="LIQUID_TOP"
        :fill="tint"
        class="meniscus"
      />
    </g>

    <!-- The symbol that tells the two potions apart at a glance. -->
    <g
      v-if="spell === 'F'"
      class="glyph"
    >
      <path d="M16 15.6v10M12.1 17.9l7.8 4.5M19.9 17.9l-7.8 4.5" />
      <path d="M16 17.6l-1.4-1.4M16 17.6l1.4-1.4M16 23.6l-1.4 1.4M16 23.6l1.4 1.4" />
    </g>
    <g
      v-else
      class="glyph"
    >
      <ellipse
        cx="16"
        cy="23"
        rx="5.4"
        ry="2.4"
        fill="none"
      />
      <path d="M16 24.6V16.4" />
      <path d="M13.2 19.2 16 16.2l2.8 3" />
    </g>

    <!-- Glass outline on top of everything it contains. -->
    <path
      :d="FLASK"
      class="glass"
    />
    <path
      class="shine"
      d="M12.6 17.4q-1.3 3.6.5 6.6"
    />

    <!-- Neck ring and cork. -->
    <path
      class="glass glass--thin"
      d="M12.7 9.4h6.6"
    />
    <rect
      class="cork"
      x="12.4"
      y="2.4"
      width="7.2"
      height="4.4"
      rx="1.5"
    />
  </svg>
</template>

<script>
import { SPELL_INFO } from '../spell/rules'

let uid = 0

// One silhouette for both potions: a straight neck opening into a round bulb,
// so the glyph rather than the outline carries the meaning. The neck sides meet
// the bulb exactly on its circumference (centre 16,20.5 r 8.5), which is what
// keeps the join from showing a kink.
const FLASK = 'M13.4 6.2V12.4A8.5 8.5 0 1 0 18.6 12.4V6.2Z'
const LIQUID = 'M6 16.5h20V30H6Z'
// A wave on the liquid surface: the cheapest way to say "this is a fluid".
const LIQUID_TOP = 'M6 17q2.6-1.7 5-.1t5 .1 5-.1 5 .1V16H6Z'

export default {
  name: 'SpellPotionIcon',
  props: {
    spell: {
      type: String,
      required: true,
      validator: value => value === 'F' || value === 'J'
    },
    size: {
      type: [Number, String],
      default: 32
    }
  },
  data () {
    uid += 1
    return {
      FLASK,
      LIQUID,
      LIQUID_TOP,
      ids: {
        liquid: `spell-liquid-${uid}`,
        clip: `spell-clip-${uid}`
      }
    }
  },
  computed: {
    info () {
      return SPELL_INFO[this.spell]
    },
    tint () {
      return this.spell === 'F' ? 'var(--spell-freeze)' : 'var(--spell-jump)'
    },
    ink () {
      return this.spell === 'F' ? 'var(--spell-freeze-ink)' : 'var(--spell-jump-ink)'
    }
  }
}
</script>

<style scoped>
.potion {
  display: block;
}

.glass {
  fill: none;
  stroke: var(--main-text-color);
  stroke-width: 1.7;
  stroke-linejoin: round;
  opacity: 0.8;
}

.glass--thin {
  stroke-width: 1.3;
  stroke-linecap: round;
  opacity: 0.6;
}

.cork {
  fill: var(--main-text-color);
  opacity: 0.7;
}

.glyph {
  fill: none;
  stroke: var(--spell-slot-bg);
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.meniscus {
  opacity: 0.6;
}

.shine {
  fill: none;
  stroke: #fff;
  stroke-width: 1.7;
  stroke-linecap: round;
  opacity: 0.45;
}
</style>
