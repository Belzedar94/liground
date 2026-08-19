/**
 * The two colour palettes, and the one function that applies them.
 *
 * These used to live inline in DarkModeSwitch's watcher, which meant the theme
 * was only ever applied when the switch itself re-rendered — so a dark-mode
 * preference restored at startup did nothing until the user opened the settings
 * tab and toggled it. Keeping the palettes here lets the store apply the saved
 * theme directly on boot, and gives every component one place to read the
 * tokens from.
 */

export const LIGHT_THEME = {
  '--main-bg-color': 'white',
  '--second-bg-color': '#f1f1f1',
  '--main-text-color': '#131310',
  '--second-text-color': '#131310',
  '--light-text-color': '#fff',
  '--main-border-color': '#131310',
  '--scroll-track-color': 'lightgrey',
  '--scroll-thumb-color': 'grey',
  '--variation-color': 'lightgrey',
  '--tooltip-color': 'lightgrey',
  '--button-color': '#4f6a8e',
  '--hover-color': '#7287a4',
  '--highlight-color': '#7289da',
  '--hover-highlight-color': '#7289da',
  '--dark-highlight-color': '#7289da',
  '--coord-color': '#000',
  '--menubar-activetab-color': '#7ec8ba',
  '--save-btn-color': '#7ec8ba',
  '--cancel-btn-color': '#c72634',
  '--save-btn-hover': '#3c8577',
  '--cancel-btn-hover': '#8b1919',
  '--quicktour-highlight': '#F47174',
  '--tab-header-color': '#7ec8ba',

  /* Spell Chess */
  '--spell-panel-bg': '#eef1f6',
  '--spell-slot-bg': '#ffffff',
  '--spell-slot-border': '#c3ccdb',
  '--spell-slot-shadow': 'rgba(19, 19, 16, 0.12)',
  '--spell-muted-text': '#6a7280',
  '--spell-freeze': '#1f8dbe',
  '--spell-freeze-ink': '#0d5c80',
  '--spell-freeze-soft': '#d3ecf8',
  '--spell-freeze-glow': 'rgba(31, 141, 190, 0.38)',
  '--spell-jump': '#7c4ddb',
  '--spell-jump-ink': '#54309b',
  '--spell-jump-soft': '#e5dcfb',
  '--spell-jump-glow': 'rgba(124, 77, 219, 0.38)'
}

export const DARK_THEME = {
  '--main-bg-color': '#35383d',
  '--second-bg-color': '#40434a',
  '--main-text-color': '#99aab5',
  '--second-text-color': '#dfe6ea',
  '--light-text-color': '#fff',
  '--main-border-color': '#99aab5',
  '--scroll-track-color': '#32363b',
  '--scroll-thumb-color': '#23272a',
  '--variation-color': '#99aab5',
  '--tooltip-color': '#40434a',
  '--button-color': '#535a6e',
  '--hover-color': '#99aab5',
  '--highlight-color': '#7289da',
  '--hover-highlight-color': '#7289da',
  '--dark-highlight-color': '#4362ce',
  '--coord-color': '#f5f5f5',
  '--menubar-activetab-color': '#99aab5',
  '--save-btn-color': '#7289da',
  '--cancel-btn-color': '#8f3f43',
  '--save-btn-hover': '#9aabe5',
  '--cancel-btn-hover': '#9a5255',
  '--quicktour-highlight': '#99ccff',
  '--tab-header-color': '#7289da',

  /* Spell Chess */
  '--spell-panel-bg': '#2d3036',
  '--spell-slot-bg': '#3c4048',
  '--spell-slot-border': '#565b66',
  '--spell-slot-shadow': 'rgba(0, 0, 0, 0.45)',
  '--spell-muted-text': '#8d97a3',
  '--spell-freeze': '#5cc4ee',
  '--spell-freeze-ink': '#bfe9fa',
  '--spell-freeze-soft': '#1d3d4e',
  '--spell-freeze-glow': 'rgba(92, 196, 238, 0.42)',
  '--spell-jump': '#a78bfa',
  '--spell-jump-ink': '#ded0ff',
  '--spell-jump-soft': '#332a52',
  '--spell-jump-glow': 'rgba(167, 139, 250, 0.42)'
}

/** Write one palette onto the document root. */
export function applyTheme (dark) {
  if (typeof document === 'undefined') return
  const theme = dark ? DARK_THEME : LIGHT_THEME
  for (const name of Object.keys(theme)) {
    document.documentElement.style.setProperty(name, theme[name])
  }
}
