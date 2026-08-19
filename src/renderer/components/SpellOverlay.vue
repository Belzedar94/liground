<template>
  <svg
    class="spell-overlay"
    :class="{ 'spell-overlay--picking': picking }"
    viewBox="0 0 800 800"
    preserveAspectRatio="none"
    @mousemove="onMove"
    @mouseleave="hover = -1"
    @click="onClick"
    @contextmenu.prevent="$emit('cancel')"
  >
    <defs>
      <radialGradient
        id="spell-portal"
        cx="0.5"
        cy="0.5"
        r="0.5"
      >
        <stop
          offset="0.15"
          stop-color="var(--spell-jump)"
          stop-opacity="0.05"
        />
        <stop
          offset="0.62"
          stop-color="var(--spell-jump)"
          stop-opacity="0.34"
        />
        <stop
          offset="1"
          stop-color="var(--spell-jump)"
          stop-opacity="0"
        />
      </radialGradient>
      <linearGradient
        id="spell-frost"
        x1="0"
        y1="0"
        x2="0.35"
        y2="1"
      >
        <stop
          offset="0"
          stop-color="var(--spell-freeze)"
          stop-opacity="0.34"
        />
        <stop
          offset="1"
          stop-color="var(--spell-freeze)"
          stop-opacity="0.17"
        />
      </linearGradient>
    </defs>

    <!-- Squares the armed potion may legally target. Freeze can go anywhere, so
         marking all 64 would be noise; only a narrowed set is worth drawing. -->
    <g
      v-if="showTargets"
      class="targets"
      :class="'targets--' + (armed === 'F' ? 'freeze' : 'jump')"
    >
      <circle
        v-for="sq in targets"
        :key="'t' + sq"
        :cx="cx(sq)"
        :cy="cy(sq)"
        r="41"
      />
    </g>

    <!-- Live zones, plus the provisional one under the cursor. -->
    <g
      v-for="shape in shapes"
      :key="shape.key"
      :class="['zone', 'zone--' + shape.kind, { 'zone--preview': shape.preview }]"
    >
      <template v-if="shape.kind === 'freeze'">
        <rect
          :x="shape.x"
          :y="shape.y"
          :width="shape.w"
          :height="shape.h"
          rx="10"
          class="frost"
        />
        <rect
          :x="shape.x + 2"
          :y="shape.y + 2"
          :width="shape.w - 4"
          :height="shape.h - 4"
          rx="9"
          class="frost-edge"
        />
        <!-- crystal spurs along the rim: reads as ice, not as a plain box -->
        <path
          :d="spurs(shape)"
          class="frost-spurs"
        />
        <g
          class="frost-mark"
          :transform="'translate(' + shape.gx + ',' + shape.gy + ')'"
        >
          <path d="M0-22V22M-19-11L19 11M19-11L-19 11" />
          <path d="M0-22l-6 6M0-22l6 6M0 22l-6-6M0 22l6-6" />
        </g>
      </template>

      <template v-else>
        <circle
          :cx="shape.gx"
          :cy="shape.gy"
          r="47"
          fill="url(#spell-portal)"
          class="portal-fill"
        />
        <circle
          :cx="shape.gx"
          :cy="shape.gy"
          r="40"
          class="portal-ring"
        />
        <circle
          :cx="shape.gx"
          :cy="shape.gy"
          r="27"
          class="portal-ring portal-ring--inner"
        />
        <!-- broken outer arc so the ring looks like it is spinning open -->
        <circle
          :cx="shape.gx"
          :cy="shape.gy"
          r="47"
          class="portal-arc"
        />
      </template>
    </g>
  </svg>
</template>

<script>
import { SPELL_FREEZE, fileOf, freezeArea, rankOf } from '../spell/rules'

const SQ = 100

export default {
  name: 'SpellOverlay',
  props: {
    /** Zones currently on the board, from the rules module. */
    zones: {
      type: Array,
      default: () => []
    },
    orientation: {
      type: String,
      default: 'white'
    },
    /** Spell being aimed right now ('F' / 'J'), or '' when nothing is armed. */
    armed: {
      type: String,
      default: ''
    },
    /** Square indices the armed spell may target. */
    targets: {
      type: Array,
      default: () => []
    }
  },
  data () {
    return { hover: -1 }
  },
  computed: {
    picking () {
      return !!this.armed
    },
    showTargets () {
      return this.picking && this.targets.length > 0 && this.targets.length < 64
    },
    shapes () {
      const out = this.zones.map(zone => this.shapeFor(zone.spell, zone.gate, false))
      if (this.picking && this.hover >= 0 && this.targets.indexOf(this.hover) >= 0) {
        out.push(this.shapeFor(this.armed, this.hover, true))
      }
      return out
    }
  },
  watch: {
    armed () { this.hover = -1 }
  },
  methods: {
    /** Board index -> overlay coordinates, honouring the flipped view. */
    ox (index) {
      const file = fileOf(index)
      return (this.orientation === 'black' ? 7 - file : file) * SQ
    },
    oy (index) {
      const rank = rankOf(index)
      return (this.orientation === 'black' ? rank : 7 - rank) * SQ
    },
    cx (index) { return this.ox(index) + SQ / 2 },
    cy (index) { return this.oy(index) + SQ / 2 },

    shapeFor (spell, gate, preview) {
      const gx = this.cx(gate)
      const gy = this.cy(gate)
      if (spell !== SPELL_FREEZE) {
        return { key: `j${gate}${preview ? 'p' : ''}`, kind: 'jump', gx, gy, preview }
      }
      // The clipped 3x3 is always a rectangle, so one rect draws the whole zone
      // and the outline stays a single unbroken edge.
      const area = freezeArea(gate)
      const xs = area.map(sq => this.ox(sq))
      const ys = area.map(sq => this.oy(sq))
      const x = Math.min(...xs)
      const y = Math.min(...ys)
      return {
        key: `f${gate}${preview ? 'p' : ''}`,
        kind: 'freeze',
        x,
        y,
        w: Math.max(...xs) + SQ - x,
        h: Math.max(...ys) + SQ - y,
        gx,
        gy,
        preview
      }
    },

    /** Small triangular spikes hanging off the zone edge. */
    spurs (shape) {
      const d = []
      const step = SQ / 2
      for (let x = shape.x + step; x < shape.x + shape.w; x += step) {
        d.push(`M${x - 9} ${shape.y}l9 13 9-13`)
        d.push(`M${x - 9} ${shape.y + shape.h}l9-13 9 13`)
      }
      for (let y = shape.y + step; y < shape.y + shape.h; y += step) {
        d.push(`M${shape.x} ${y - 9}l13 9-13 9`)
        d.push(`M${shape.x + shape.w} ${y - 9}l-13 9 13 9`)
      }
      return d.join('')
    },

    squareAt (event) {
      const rect = event.currentTarget.getBoundingClientRect()
      if (!rect.width || !rect.height) return -1
      const col = Math.floor(((event.clientX - rect.left) / rect.width) * 8)
      const row = Math.floor(((event.clientY - rect.top) / rect.height) * 8)
      if (col < 0 || col > 7 || row < 0 || row > 7) return -1
      const file = this.orientation === 'black' ? 7 - col : col
      const rank = this.orientation === 'black' ? row : 7 - row
      return rank * 8 + file
    },

    onMove (event) {
      if (!this.picking) return
      this.hover = this.squareAt(event)
    },

    onClick (event) {
      if (!this.picking) return
      const square = this.squareAt(event)
      // Clicking anywhere that cannot hold the potion puts it back down, which
      // makes "get me out of this mode" the same gesture as "never mind".
      if (square < 0 || this.targets.indexOf(square) < 0) {
        this.$emit('cancel')
        return
      }
      this.$emit('pick', square)
    }
  }
}
</script>

<style scoped>
.spell-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 3;
}

/* Only while aiming does the overlay take the mouse; the rest of the time the
   board underneath must stay fully draggable. */
.spell-overlay--picking {
  pointer-events: auto;
  cursor: crosshair;
}

.targets circle {
  fill: none;
  stroke-width: 3;
  stroke-dasharray: 5 7;
  opacity: 0.55;
}

.targets--freeze circle { stroke: var(--spell-freeze); }
.targets--jump circle { stroke: var(--spell-jump); }

.zone {
  animation: spell-zone-in 180ms ease-out both;
}

.zone--preview {
  opacity: 0.75;
}

@keyframes spell-zone-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ---- freeze ---- */

.frost {
  fill: url(#spell-frost);
  stroke: var(--spell-freeze);
  stroke-width: 3;
}

.frost-edge {
  fill: none;
  stroke: #fff;
  stroke-width: 1.5;
  opacity: 0.35;
}

.frost-spurs {
  fill: var(--spell-freeze);
  opacity: 0.45;
}

.frost-mark {
  fill: none;
  stroke: var(--spell-freeze);
  stroke-width: 5;
  stroke-linecap: round;
  opacity: 0.75;
}

.zone--preview .frost {
  stroke-dasharray: 12 9;
}

.zone--preview .frost-spurs {
  opacity: 0.28;
}

/* ---- jump ---- */

.portal-ring {
  fill: none;
  stroke: var(--spell-jump);
  stroke-width: 4;
  opacity: 0.85;
}

.portal-ring--inner {
  stroke-width: 2.5;
  opacity: 0.5;
}

.portal-arc {
  fill: none;
  stroke: var(--spell-jump);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-dasharray: 46 30;
  opacity: 0.9;
  /* fill-box is what keeps the spin centred on the ring itself; without it the
     rotation happens about the SVG origin and throws the arc across the board. */
  transform-box: fill-box;
  transform-origin: center;
  animation: spell-portal-spin 5.5s linear infinite;
}

/* The spin is what separates "a hole in the board" from "a circle drawn on it",
   but it must never be loud enough to compete with the pieces. */
@keyframes spell-portal-spin {
  to { transform: rotate(360deg); }
}

.zone--preview .portal-ring,
.zone--preview .portal-arc {
  stroke-dasharray: 10 8;
}

@media (prefers-reduced-motion: reduce) {
  .zone { animation: none; }
  .portal-arc { animation: none; }
}
</style>
