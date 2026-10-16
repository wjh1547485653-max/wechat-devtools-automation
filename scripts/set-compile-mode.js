#!/usr/bin/env node
/**
 * 往项目里写一个「编译模式」，让工具启动时直接跳到指定页面。
 *
 * 用法:
 *   node scripts/set-compile-mode.js --project "D:\my-miniapp" \
 *        --name 登录页 --page pages/login/login
 *
 *   node scripts/set-compile-mode.js --project . --list    # 看现有的
 *
 * 为什么有用：调试深层页面时，不用每次都手动点一串入口点进去。
 * 编个"直接打开详情页"的模式，点一下就到。
 *
 * 写在 project.private.config.json 的 condition.miniprogram.list 里。
 * 这个文件是**私有配置**（别人的机器上不需要有），所以加进去不会影响同事。
 *
 * 生效方式：改完**得让工具重新读一次**——重启工具，或者在下拉里选一下那个模式。
 * 光改文件，已经在跑的工具是看不到的。
 */
const fs = require('fs')
const path = require('path')

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt
}

function readJson(file) {
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    console.error('读不了 ' + file + '：' + e.message)
    console.error('（JSON 里有多余逗号或者注释的话，手工修一下再来）')
    process.exit(1)
  }
}

function main() {
  const project = arg('project', '.')
  const configFile = path.join(project, 'project.private.config.json')

  const existing = readJson(configFile)
  if (existing === null) {
    console.error('找不到 ' + configFile)
    console.error('这个文件是工具生成的——先用工具打开一次项目，它就有了。')
    return 1
  }

  const list =
    (existing.condition && existing.condition.miniprogram &&
      existing.condition.miniprogram.list) || []

  if (process.argv.includes('--list')) {
    console.log('当前项目里的编译模式：')
    if (!list.length) console.log('  （还没有）')
    list.forEach((m, i) => {
      console.log('  [' + i + '] ' + (m.name || '(无名)') + '  ->  ' + (m.pathName || ''))
    })
    return 0
  }

  const name = arg('name', '')
  const page = arg('page', '')
  if (!name || !page) {
    console.error('用法: --project <项目目录> --name <模式名> --page <页面路径>')
    console.error('例如: --name 登录页 --page pages/login/login')
    return 1
  }

  // 同一个名字就覆盖，不重复加
  const mode = { name, pathName: page, query: arg('query', ''), scene: null }
  const idx = list.findIndex((m) => m.name === name)
  if (idx >= 0) {
    list[idx] = mode
    console.log('覆盖已有的模式「' + name + '」')
  } else {
    list.push(mode)
    console.log('新增模式「' + name + '」')
  }

  existing.condition = existing.condition || {}
  existing.condition.miniprogram = existing.condition.miniprogram || {}
  existing.condition.miniprogram.list = list

  fs.writeFileSync(configFile, JSON.stringify(existing, null, 2) + '\n', 'utf8')
  console.log('已写入:', configFile)
  console.log('  ' + name + '  ->  ' + page)
  console.log('\n生效方式：重启工具，或在编译模式下拉框里选一下这个模式。')
  return 0
}

process.exit(main())
