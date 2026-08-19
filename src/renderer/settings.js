/**
 * Persisted user settings.
 *
 * The app used to write these ten keys from a single `saveSettings` mutation
 * that nothing called except the "Save as standard" button, so every setting a
 * user changed through the normal UI was gone at the next start. Reading them
 * back was incomplete too: the board-size keys were never restored into the
 * store, and evalPlotDepth came back as a string.
 *
 * One descriptor list now drives both directions, and the store subscribes to
 * itself so a change is saved when it happens rather than when someone
 * remembers to press a button.
 */

export const PERSISTED_SETTINGS = [
  { key: 'darkMode', type: 'boolean' },
  { key: 'muteButton', type: 'boolean' },
  { key: 'evalPlotDepth', type: 'number' },
  { key: 'variant', type: 'string' },
  { key: 'orientation', type: 'string' },
  { key: 'resized', type: 'number' },
  { key: 'resized9x9width', type: 'number' },
  { key: 'resized9x9height', type: 'number' },
  { key: 'resized9x10width', type: 'number' },
  { key: 'resized9x10height', type: 'number' },
  { key: 'dimNumber', type: 'number' }
]

function decode (raw, type) {
  if (raw === null || raw === undefined || raw === '') return undefined
  if (type === 'boolean') return raw === 'true' || raw === true
  if (type === 'number') {
    const n = Number(raw)
    return Number.isFinite(n) ? n : undefined
  }
  return String(raw)
}

/** Read every persisted setting, typed. Missing or corrupt values are omitted. */
export function loadSettings () {
  const out = {}
  if (typeof localStorage === 'undefined') return out
  for (const { key, type } of PERSISTED_SETTINGS) {
    const value = decode(localStorage.getItem(key), type)
    if (value !== undefined) out[key] = value
  }
  return out
}

/** Write the current values of every persisted setting. */
export function saveSettings (state) {
  if (typeof localStorage === 'undefined') return
  for (const { key } of PERSISTED_SETTINGS) {
    const value = state[key]
    if (value === undefined || value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, String(value))
  }
}

export function clearSettings () {
  if (typeof localStorage === 'undefined') return
  for (const { key } of PERSISTED_SETTINGS) localStorage.removeItem(key)
}

/**
 * Save whenever one of the persisted values actually changes.
 *
 * Every move commits mutations, so writing on each one would mean touching
 * localStorage constantly for nothing; comparing against the last written
 * snapshot keeps it to the changes that matter.
 */
export function installAutoSave (store) {
  let last = ''
  const snapshot = state => PERSISTED_SETTINGS.map(({ key }) => `${key}=${state[key]}`).join('|')
  last = snapshot(store.state)
  store.subscribe((mutation, state) => {
    const current = snapshot(state)
    if (current === last) return
    last = current
    saveSettings(state)
  })
}
