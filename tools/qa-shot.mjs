/**
 * QA driver: talks to the running LiGround window over the Chrome DevTools
 * Protocol so a screenshot of any UI state can be scripted.
 *
 * Start the app with remote debugging enabled, then:
 *   node tools/qa-shot.mjs <script.mjs>
 *
 * The script file default-exports `async (page) => {}` where `page` offers
 * `eval(js)`, `shot(name)`, `wait(ms)`, `click(selector)` and `hover(selector)`.
 */

import WsPkg from 'ws'

const WebSocket = WsPkg.WebSocket || WsPkg
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const QA_DIR = path.join(here, '..', 'qa')
const PORT = process.env.QA_PORT || 9222

async function targets () {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
  return res.json()
}

class Page {
  constructor (ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    ws.on('message', raw => {
      const msg = JSON.parse(raw.toString())
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(JSON.stringify(msg.error)))
        else resolve(msg.result)
      }
    })
  }

  send (method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`timeout: ${method}`))
        }
      }, 30000)
    })
  }

  /** Evaluate in the page and return the JSON value. */
  async eval (expression) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(() => { ${expression} })()`,
      awaitPromise: true,
      returnByValue: true
    })
    if (r.exceptionDetails) {
      throw new Error('page error: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
    }
    return r.result.value
  }

  wait (ms) { return new Promise(r => setTimeout(r, ms)) }

  async box (selector) {
    return this.eval(`
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    `)
  }

  async click (selector) {
    const at = await this.box(selector)
    if (!at) throw new Error('no such element: ' + selector)
    for (const type of ['mousePressed', 'mouseReleased']) {
      await this.send('Input.dispatchMouseEvent', {
        type, x: at.x, y: at.y, button: 'left', clickCount: 1
      })
    }
  }

  /** Move the pointer to the centre of an element, or to explicit coordinates. */
  async hover (target) {
    const at = typeof target === 'string' ? await this.box(target) : target
    if (!at) throw new Error('no such element: ' + target)
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: at.x, y: at.y, button: 'none', buttons: 0, clickCount: 0
    })
  }

  /** Rect of an element, padded, for clipped captures. */
  async rect (selector, pad = 0) {
    const r = await this.eval(`
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!el) return null
      const b = el.getBoundingClientRect()
      return { x: b.x, y: b.y, width: b.width, height: b.height }
    `)
    if (!r) return null
    return {
      x: Math.max(0, r.x - pad),
      y: Math.max(0, r.y - pad),
      width: r.width + pad * 2,
      height: r.height + pad * 2,
      scale: 1
    }
  }

  /**
   * Capture the viewport, or just one element when `selector` is given.
   * `scale` renders at higher resolution, which is how small UI is judged.
   */
  async shot (name, { selector, pad = 12, scale = 1 } = {}) {
    const params = { format: 'png', captureBeyondViewport: false }
    if (selector) {
      const clip = await this.rect(selector, pad)
      if (!clip) throw new Error('no such element: ' + selector)
      if (!(clip.width > 0 && clip.height > 0)) {
        throw new Error(`element has no size: ${selector} (${clip.width}x${clip.height})`)
      }
      clip.scale = scale
      params.clip = clip
    }
    let r
    for (let attempt = 0; ; attempt++) {
      try {
        r = await this.send('Page.captureScreenshot', params)
        break
      } catch (err) {
        if (attempt >= 2) throw err
        await this.send('Page.bringToFront').catch(() => {})
        await new Promise(res => setTimeout(res, 700))
      }
    }
    const file = path.join(QA_DIR, `${name}.png`)
    await writeFile(file, Buffer.from(r.data, 'base64'))
    console.log('  saved', path.relative(path.join(here, '..'), file))
    return file
  }
}

const list = await targets()
// Skip the DevTools window Electron opens in dev mode; we want the app itself.
const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl &&
  !t.url.startsWith('devtools://'))
if (!page) {
  console.error('no page target on port ' + PORT + '. Is the app running with remote-debugging-port?')
  process.exit(1)
}

await mkdir(QA_DIR, { recursive: true })
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 })
await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject) })

const driver = new Page(ws)
await driver.send('Page.enable')
await driver.send('Runtime.enable')

// A window that is not compositing never produces a frame, and the capture just
// hangs; fronting it first is what makes the run reliable.
await driver.send('Emulation.clearDeviceMetricsOverride').catch(() => {})
await driver.send('Page.bringToFront').catch(() => {})
await new Promise(r => setTimeout(r, 600))

const scriptPath = process.argv[2]
if (!scriptPath) {
  console.error('usage: node tools/qa-shot.mjs <script.mjs>')
  process.exit(2)
}
const mod = await import(pathToFileURL(path.resolve(scriptPath)).href)
await mod.default(driver)

ws.close()
console.log('done')
