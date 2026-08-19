/**
 * QA scenario for the settings-persistence fix.
 *
 * Run it once to change settings and capture the state, restart the app, then
 * run it with QA_VERIFY=1 to capture what came back.
 *
 *   node tools/qa-shot.mjs tools/qa/settings-persistence.mjs
 *   # close and reopen the app
 *   QA_VERIFY=1 node tools/qa-shot.mjs tools/qa/settings-persistence.mjs
 */

const VERIFY = !!process.env.QA_VERIFY

async function readState (page) {
  return page.eval(`
    const s = document.querySelector('#app').__vue__.$store
    window.__store = s
    return {
      state: {
        darkMode: s.getters.darkMode,
        muteButton: s.state.muteButton,
        variant: s.getters.variant,
        evalPlotDepth: s.state.evalPlotDepth,
        evalPlotDepthType: typeof s.state.evalPlotDepth
      },
      appliedBackground: getComputedStyle(document.documentElement).getPropertyValue('--main-bg-color').trim(),
      storage: {
        darkMode: localStorage.darkMode,
        muteButton: localStorage.muteButton,
        variant: localStorage.variant,
        evalPlotDepth: localStorage.evalPlotDepth
      }
    }
  `)
}

/** Open the settings tab, which is where these preferences are edited. */
async function showSettings (page) {
  await page.eval(`return window.__store.dispatch('viewAnalysis', false)`)
  await page.wait(500)
}

export default async function (page) {
  if (VERIFY) {
    console.log('AFTER RESTART:', JSON.stringify(await readState(page), null, 2))
    await showSettings(page)
    await page.shot('14-settings-after-restart', { selector: '#settingstab', pad: 8 })
    await page.shot('14b-app-after-restart')
    return
  }

  console.log('BEFORE:', JSON.stringify(await readState(page), null, 2))
  await showSettings(page)
  await page.shot('13-settings-tab-before', { selector: '#settingstab', pad: 8 })

  await page.eval(`
    const s = window.__store
    return s.dispatch('switchDarkMode')
      .then(() => s.dispatch('switchMuteButton'))
      .then(() => s.dispatch('evalPlotDepth', 27))
      .then(() => s.dispatch('variant', 'spell-chess'))
  `)
  await page.wait(2200)

  console.log('AFTER CHANGES:', JSON.stringify(await readState(page), null, 2))
  await page.shot('13b-settings-tab-changed', { selector: '#settingstab', pad: 8 })
  console.log('now restart the app and rerun with QA_VERIFY=1')
}
