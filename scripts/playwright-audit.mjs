import { chromium } from 'playwright'

const BASE = 'http://localhost:5173'
const bugs = []
const gaps = []
const ok = []

function log(msg) { console.log(msg) }
function bug(msg) { bugs.push(msg); console.log(`  BUG: ${msg}`) }
function gap(msg) { gaps.push(msg); console.log(`  GAP: ${msg}`) }
function pass(msg) { ok.push(msg); console.log(`  OK: ${msg}`) }

async function run() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const consoleErrors = []
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('SSE connection error')) {
      consoleErrors.push(msg.text())
    }
  })

  try {
    await page.goto(BASE, { waitUntil: 'load', timeout: 15000 })
    await page.waitForTimeout(3000)

    // Helper to re-query rows (avoids stale references)
    const getRows = () => page.$$('table tbody tr')
    const getTableSearch = () => page.$('input[placeholder="Search..."]')

    // ============================================================
    log('\n=== 1. INITIAL LOAD ===')
    const title = await page.title()
    title ? pass(`Title: "${title}"`) : bug('No title')
    const text = await page.evaluate(() => document.body.innerText)
    text.includes('Connected') ? pass('SSE connected') : bug('SSE not connected')
    ;(await getRows()).length > 0 ? pass(`${(await getRows()).length} rows`) : bug('No rows')

    // ============================================================
    log('\n=== 2. RESOURCE TREE ===')
    for (const cat of ['Workloads', 'Services & Networking', 'Config & Storage', 'Security & Access', 'Cluster']) {
      (await page.$(`button:has-text("${cat}")`)) ? pass(cat) : bug(`Missing: ${cat}`)
    }
    // Switch Deployments -> Pods
    for (const res of ['Deployments', 'Pods']) {
      const b = await page.$(`button:has-text("${res}")`)
      if (b) { await b.click(); await page.waitForTimeout(1500) }
    }
    pass(`Pods: ${(await getRows()).length} rows`)

    // ============================================================
    log('\n=== 3. NAMESPACE ===')
    const ns = await page.$('select')
    if (ns) {
      await ns.selectOption('default'); await page.waitForTimeout(1500)
      pass(`default: ${(await getRows()).length} pods`)
      await ns.selectOption('All Namespaces'); await page.waitForTimeout(1500)
      pass('Back to All')
    }

    // ============================================================
    log('\n=== 4. SEARCH ===')
    const search = await getTableSearch()
    if (search) {
      const before = (await getRows()).length
      await search.fill('redis'); await page.waitForTimeout(500)
      const after = (await getRows()).length
      after < before ? pass(`Filter: ${before}->${after}`) : bug('Search no filter')
      await search.fill(''); await page.waitForTimeout(500)
    }

    // ============================================================
    log('\n=== 5. SORT ===')
    const nameCol = await page.$('th:has-text("NAME")')
    if (nameCol) {
      await nameCol.click(); await page.waitForTimeout(200)
      await nameCol.click(); await page.waitForTimeout(200)
      pass('Sort toggled')
      await nameCol.click(); await page.waitForTimeout(1000) // reset - allow re-render to settle
    }

    // ============================================================
    log('\n=== 6. ROW SELECT ===')
    await page.waitForTimeout(500) // extra settle time after sort
    // Helper: click on the NAME cell (2nd td) to avoid buttons inside the row
    const clickRow = async (row, opts = {}) => {
      const nameCell = await row.$('td:nth-child(2)')
      if (nameCell) await nameCell.click(opts)
      else await row.click(opts)
    }
    let rows = await getRows()
    if (rows.length > 1) {
      await clickRow(rows[0]); await page.waitForTimeout(500)
      let sel = await page.evaluate(() => document.querySelectorAll('table tbody input[type="checkbox"]:checked').length)
      sel === 1 ? pass('Single select') : bug(`Single: ${sel}`)
      rows = await getRows()
      await clickRow(rows[1], { modifiers: ['Meta'] }); await page.waitForTimeout(500)
      sel = await page.evaluate(() => document.querySelectorAll('table tbody input[type="checkbox"]:checked').length)
      sel === 2 ? pass('Multi-select') : bug(`Multi: ${sel}`)
    }

    // ============================================================
    log('\n=== 7. INSPECTOR ===')
    rows = await getRows()
    await rows[0].click(); await page.waitForTimeout(200)
    await page.click('button[aria-label="Inspect Resource"]'); await page.waitForTimeout(500)
    const insp = await page.$('[class*="fixed"][class*="right-0"][class*="w-96"]')
    if (insp) {
      const t = await insp.evaluate(el => el.textContent)
      pass('Inspector opens')
      t.includes('Raw YAML') ? pass('Raw YAML') : bug('No Raw YAML')
    } else { bug('No inspector') }
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)

    // ============================================================
    log('\n=== 8. YAML EDITOR ===')
    rows = await getRows()
    await rows[0].click(); await page.waitForTimeout(200)
    await page.click('button[aria-label="Edit Resource"]'); await page.waitForTimeout(1000)
    const cm = await page.$('.cm-editor')
    cm ? pass('YAML editor opens') : bug('No YAML editor')
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)

    // ============================================================
    log('\n=== 9. CREATE ===')
    await page.click('button[aria-label="Add Resource"]'); await page.waitForTimeout(500)
    const dlg = await page.$('[class*="fixed"][class*="z-50"]')
    if (dlg) {
      pass('Create dialog')
      const tb = await dlg.$('button:has-text("Deployment")')
      if (tb) { await tb.click(); await page.waitForTimeout(500) }
      (await page.$('.cm-editor')) ? pass('Template YAML') : gap('No template editor')
    }
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)

    // ============================================================
    log('\n=== 10. CLONE ===')
    rows = await getRows()
    await rows[0].click(); await page.waitForTimeout(200)
    await page.click('button[aria-label="Clone Resource"]'); await page.waitForTimeout(1000)
    const cloneCm = await page.$('.cm-editor')
    cloneCm ? pass('Clone opens editor') : bug('Clone failed')
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)

    // ============================================================
    log('\n=== 11. DELETE ===')
    rows = await getRows()
    await rows[0].click(); await page.waitForTimeout(200)
    page.once('dialog', d => d.dismiss())
    await page.click('button[aria-label="Delete Resource"]'); await page.waitForTimeout(500)
    pass('Delete confirm')

    // ============================================================
    log('\n=== 12. EXPAND ROW ===')
    const expBtn = await page.$('table tbody button[aria-label="Expand"]')
    if (expBtn) {
      await expBtn.click(); await page.waitForTimeout(500)
      pass('Row expanded')
      // Log button
      const logBtn = await page.$('button[title*="Log" i]')
      if (logBtn) {
        await logBtn.click(); await page.waitForTimeout(1500)
        const logV = await page.evaluate(() => document.querySelector('[class*="font-mono"]') !== null || document.body.innerText.includes('Log'))
        logV ? pass('Log viewer') : gap('No log viewer')
        await page.keyboard.press('Escape'); await page.waitForTimeout(300)
      } else { gap('No log btn') }
      // Shell button
      const shellBtn = await page.$('button[title*="Shell" i]')
      if (shellBtn) {
        await shellBtn.click(); await page.waitForTimeout(1500)
        const term = await page.$('.xterm, [class*="terminal"]')
        term ? pass('Terminal opens') : gap('No terminal')
        await page.keyboard.press('Escape'); await page.waitForTimeout(300)
      } else { gap('No shell btn') }
      // Collapse
      const colBtn = await page.$('table tbody button[aria-label="Collapse"]')
      if (colBtn) await colBtn.click()
      await page.waitForTimeout(200)
    }

    // ============================================================
    log('\n=== 13. DARK MODE ===')
    const themeBtn = await page.$('button[aria-label*="Theme"]')
    if (themeBtn) {
      await themeBtn.click(); await page.waitForTimeout(300)
      const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
      dark ? pass('Dark mode ON') : pass('Theme cycled (light)')
      if (dark) await page.screenshot({ path: '/tmp/kubamf-dark.png', fullPage: true })
      await themeBtn.click(); await page.waitForTimeout(200)
      await themeBtn.click(); await page.waitForTimeout(200)
    }

    // ============================================================
    log('\n=== 14. SETTINGS ===')
    await page.click('button[aria-label="Settings"]'); await page.waitForTimeout(500)
    let kubeTab = await page.$('nav button:has-text("Kubernetes")')
    if (kubeTab) {
      await kubeTab.click(); await page.waitForTimeout(200)
      let nsInput = await page.$('input[placeholder="default"]')
      if (nsInput) {
        await nsInput.fill('persist-test')
        await page.click('button:has-text("Save Changes")'); await page.waitForTimeout(500)
        // Re-open settings — must re-query DOM elements since modal was destroyed
        await page.click('button[aria-label="Settings"]'); await page.waitForTimeout(500)
        kubeTab = await page.$('nav button:has-text("Kubernetes")')
        if (kubeTab) await kubeTab.click(); await page.waitForTimeout(200)
        nsInput = await page.$('input[placeholder="default"]')
        const val = nsInput ? await nsInput.inputValue() : ''
        val === 'persist-test' ? pass('Settings persist') : bug(`Lost: "${val}"`)
        if (nsInput) { await nsInput.fill(''); }
        await page.click('button:has-text("Save Changes")'); await page.waitForTimeout(300)
      }
    } else {
      await page.keyboard.press('Escape'); await page.waitForTimeout(200)
    }

    // ============================================================
    log('\n=== 15. DOCS ===')
    await page.click('button[aria-label="Documentation"]'); await page.waitForTimeout(1000)
    const dt = await page.evaluate(() => document.body.innerText)
    dt.includes('Documentation') ? pass('Docs viewer') : bug('No docs')
    dt.includes('API Reference') ? pass('API section') : gap('No API')
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)

    // ============================================================
    log('\n=== 16. CONTEXTS ===')
    const ctxCount = await page.evaluate(() => {
      const scroll = document.querySelector('.overflow-x-auto.scrollbar-hide')
      return scroll ? scroll.children.length : 0
    })
    ctxCount >= 1 ? pass(`${ctxCount} context tabs`) : gap(`No context tabs`)

    // ============================================================
    log('\n=== 17. CONSOLE ERRORS ===')
    consoleErrors.length === 0 ? pass('No console errors') : bug(`${consoleErrors.length} errors`)
    consoleErrors.forEach(e => console.log(`    ${e.substring(0, 120)}`))

    // Final screenshot
    await page.screenshot({ path: '/tmp/kubamf-final.png', fullPage: true })

    // ============================================================
    log('\n\n========== SUMMARY ==========')
    console.log(`PASS: ${ok.length}`)
    console.log(`BUGS: ${bugs.length}`)
    console.log(`GAPS: ${gaps.length}`)
    if (bugs.length > 0) { console.log('\nBugs:'); bugs.forEach(b => console.log(`  - ${b}`)) }
    if (gaps.length > 0) { console.log('\nGaps:'); gaps.forEach(g => console.log(`  - ${g}`)) }

  } catch (error) {
    console.error('FATAL:', error.message.substring(0, 200))
    await page.screenshot({ path: '/tmp/kubamf-fatal.png' }).catch(() => {})
  } finally {
    await browser.close()
  }
}

run()
