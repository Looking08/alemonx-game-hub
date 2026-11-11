#!/usr/bin/env node
/**
 * 打发布包：为 alx.json 里声明的每个平台生成 <id>/ 单层目录的 zip，并输出 SHA256SUMS。
 *
 *   node scripts/package.mjs            # 全部平台
 *   node scripts/package.mjs darwin-arm64 linux-amd64
 *
 * 产物在 dist/：<id>-<os>-<arch>.zip + SHA256SUMS
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, cpSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(ROOT, 'alx.json'), 'utf8'))

const { id, version } = manifest
if (!/^[a-z][a-z0-9-]{1,63}$/.test(id)) throw new Error(`alx.json 的 id 不合法：${id}`)
if (!version) throw new Error('alx.json 缺少 version')

// 只带运行期需要的文件，源码、文档截图与构建产物不进包
const INCLUDE = ['alx.json', 'web', 'runner', 'LICENSE', 'THIRD-PARTY-NOTICES.md', 'README.md']
const EXCLUDE_NAMES = new Set(['node_modules', '.DS_Store', 'dist', '.git', '.alx-install.json'])

const staging = join(ROOT, '.pkg-staging')
const outDir = join(ROOT, 'dist')

function copyInto(target) {
  for (const name of INCLUDE) {
    const from = join(ROOT, name)
    if (!existsSync(from)) throw new Error(`缺少必需文件：${name}`)
    cpSync(from, join(target, name), {
      recursive: true,
      filter: src => !EXCLUDE_NAMES.has(src.split('/').pop())
    })
  }
}

function zipDir(sourceDir, outFile) {
  // -r 递归 -X 去掉额外时间/权限属性，保证跨平台可复现
  execFileSync('zip', ['-r', '-X', '-q', outFile, `${id}/`], { cwd: sourceDir, stdio: 'inherit' })
}

const platforms = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(manifest.entry || {})
if (!platforms.length) throw new Error('alx.json 的 entry 为空，无法确定平台')

rmSync(outDir, { recursive: true, force: true })
rmSync(staging, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const sums = []
for (const platform of platforms) {
  if (!manifest.entry?.[platform]) throw new Error(`entry 里没有平台：${platform}`)

  const platformDir = join(staging, platform)
  mkdirSync(join(platformDir, id), { recursive: true })
  copyInto(join(platformDir, id))

  const asset = `${id}-${platform}.zip`
  const assetPath = join(outDir, asset)
  zipDir(platformDir, assetPath)

  const digest = createHash('sha256').update(readFileSync(assetPath)).digest('hex')
  sums.push(`${digest}  ${asset}`)
  console.log(`✓ ${asset}  ${(statSync(assetPath).size / 1024).toFixed(1)} KB  ${digest.slice(0, 12)}…`)
}

writeFileSync(join(outDir, 'SHA256SUMS'), sums.join('\n') + '\n')
rmSync(staging, { recursive: true, force: true })

console.log(`\n打包完成：${id} v${version} · ${platforms.length} 个平台 → dist/`)
console.log('发布：gh release create v' + version + ' dist/* --title v' + version + ' --notes "<变更说明>"')
