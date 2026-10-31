// Renders public/icon.svg to the PNG sizes the PWA manifest and iOS need.
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'public/icon.svg'), 'utf8')
const maskable = svg.replace('rx="112"', 'rx="0"').replace(/<g fill="none"/, '<g transform="translate(256 256) scale(0.78) translate(-256 -256)" fill="none"').replace('<circle cx="256" cy="256" r="12"', '<circle transform="translate(256 256) scale(0.78) translate(-256 -256)" cx="256" cy="256" r="12"')
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const page = await browser.newPage()
for (const [name, size, source] of [['icon-192.png', 192, svg], ['icon-512.png', 512, svg], ['icon-512-maskable.png', 512, maskable], ['apple-touch-icon.png', 180, svg.replace('rx="112"', 'rx="0"')]]) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${source}`)
  writeFileSync(join(root, 'public', name), await page.screenshot({ omitBackground: true, type: 'png' }))
}
await browser.close()
console.log('icons written')
