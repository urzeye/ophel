import { deflateRawSync } from "node:zlib"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"

const rootDir = process.cwd()
const sourceDir = path.join(rootDir, "build", "firefox-mv3-prod")
const outputZip = path.join(rootDir, "build", "firefox-mv3-prod.zip")

if (!existsSync(sourceDir)) {
  console.error(`Firefox build output not found: ${sourceDir}`)
  console.error("Run `pnpm build:firefox` before packaging.")
  process.exit(1)
}

rmSync(outputZip, { force: true })
mkdirSync(path.dirname(outputZip), { recursive: true })

const crcTable = new Uint32Array(256)
for (let index = 0; index < crcTable.length; index += 1) {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  crcTable[index] = value >>> 0
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function toDosTime(date) {
  const year = Math.max(1980, date.getFullYear())
  const dosTime =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { dosTime, dosDate }
}

function writeUInt16(value) {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16LE(value)
  return buffer
}

function writeUInt32(value) {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32LE(value)
  return buffer
}

function listFiles(dir, baseDir = dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const absolutePath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        return listFiles(absolutePath, baseDir)
      }
      if (!entry.isFile()) {
        return []
      }
      return [
        {
          absolutePath,
          relativePath: path.relative(baseDir, absolutePath).replaceAll(path.sep, "/"),
        },
      ]
    })
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}

const localParts = []
const centralParts = []
let offset = 0

for (const file of listFiles(sourceDir)) {
  const source = readFileSync(file.absolutePath)
  const compressed = deflateRawSync(source, { level: 9 })
  const fileName = Buffer.from(file.relativePath, "utf8")
  const stats = statSync(file.absolutePath)
  const { dosTime, dosDate } = toDosTime(stats.mtime)
  const checksum = crc32(source)

  const localHeader = Buffer.concat([
    writeUInt32(0x04034b50),
    writeUInt16(20),
    writeUInt16(0),
    writeUInt16(8),
    writeUInt16(dosTime),
    writeUInt16(dosDate),
    writeUInt32(checksum),
    writeUInt32(compressed.length),
    writeUInt32(source.length),
    writeUInt16(fileName.length),
    writeUInt16(0),
    fileName,
  ])

  localParts.push(localHeader, compressed)

  const centralHeader = Buffer.concat([
    writeUInt32(0x02014b50),
    writeUInt16(20),
    writeUInt16(20),
    writeUInt16(0),
    writeUInt16(8),
    writeUInt16(dosTime),
    writeUInt16(dosDate),
    writeUInt32(checksum),
    writeUInt32(compressed.length),
    writeUInt32(source.length),
    writeUInt16(fileName.length),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt32(0),
    writeUInt32(offset),
    fileName,
  ])
  centralParts.push(centralHeader)

  offset += localHeader.length + compressed.length
}

const centralDirectory = Buffer.concat(centralParts)
const endOfCentralDirectory = Buffer.concat([
  writeUInt32(0x06054b50),
  writeUInt16(0),
  writeUInt16(0),
  writeUInt16(centralParts.length),
  writeUInt16(centralParts.length),
  writeUInt32(centralDirectory.length),
  writeUInt32(offset),
  writeUInt16(0),
])

writeFileSync(outputZip, Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory]))

const sizeInMb = (statSync(outputZip).size / 1024 / 1024).toFixed(2)
console.log(`Created ${path.relative(rootDir, outputZip)} (${sizeInMb} MB)`)
