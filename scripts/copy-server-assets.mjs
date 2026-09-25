import { cpSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
const output = resolve(process.argv[2] || 'server/dist')
mkdirSync(join(output, 'db/data'), { recursive: true })
cpSync('server/src/db/data/suiteGenSeed.json', join(output, 'db/data/suiteGenSeed.json'))
console.log('后端运行时数据文件已复制')
