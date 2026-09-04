import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { deflateRawSync } from "node:zlib"

const CRC_TABLE = new Uint32Array(256)
for (let i = 0; i < 256; i += 1) {
  let crc = i
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  }
  CRC_TABLE[i] = crc >>> 0
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function toZipPath(rootDir, filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join("/")
}

function collectFiles(rootDir) {
  const files = []

  function walk(currentDir) {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
        continue
      }
      if (entry.isFile()) {
        files.push(fullPath)
      }
    }
  }

  walk(rootDir)
  files.sort((left, right) => toZipPath(rootDir, left).localeCompare(toZipPath(rootDir, right)))
  return files
}

/**
 * Zip a directory's files into `outputZip` using Node zlib.
 * Paths inside the archive are relative to `sourceDir` with POSIX separators.
 */
export function zipDirectory(sourceDir, outputZip) {
  if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
    throw new Error(`Zip source directory not found: ${sourceDir}`)
  }

  const resolvedSource = path.resolve(sourceDir)
  const resolvedOutput = path.resolve(outputZip)
  const files = collectFiles(resolvedSource).filter(
    (filePath) => path.resolve(filePath) !== resolvedOutput,
  )

  if (files.length === 0) {
    throw new Error(`No files to zip in ${sourceDir}`)
  }

  const localParts = []
  const centralParts = []
  let offset = 0

  for (const filePath of files) {
    const data = readFileSync(filePath)
    const compressed = deflateRawSync(data)
    const name = toZipPath(resolvedSource, filePath)
    if (!name) {
      throw new Error(`Unable to compute zip path for ${filePath}`)
    }
    const nameBuffer = Buffer.from(name, "utf8")
    const crc = crc32(data)

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0x0800, 6)
    localHeader.writeUInt16LE(8, 8)
    // DOS 时间戳：time=00:00:00，date=1980-01-01（0x21，避免非法的 0 值）
    localHeader.writeUInt16LE(0, 10)
    localHeader.writeUInt16LE(0x21, 12)
    localHeader.writeUInt32LE(crc, 14)
    localHeader.writeUInt32LE(compressed.length, 18)
    localHeader.writeUInt32LE(data.length, 22)
    localHeader.writeUInt16LE(nameBuffer.length, 26)
    localHeader.writeUInt16LE(0, 28)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0x0800, 8)
    centralHeader.writeUInt16LE(8, 10)
    centralHeader.writeUInt16LE(0, 12)
    centralHeader.writeUInt16LE(0x21, 14)
    centralHeader.writeUInt32LE(crc, 16)
    centralHeader.writeUInt32LE(compressed.length, 20)
    centralHeader.writeUInt32LE(data.length, 24)
    centralHeader.writeUInt16LE(nameBuffer.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)

    localParts.push(localHeader, nameBuffer, compressed)
    centralParts.push(centralHeader, nameBuffer)
    offset += localHeader.length + nameBuffer.length + compressed.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(centralDirectory.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)

  const outputDir = path.dirname(resolvedOutput)
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  writeFileSync(resolvedOutput, Buffer.concat([...localParts, centralDirectory, eocd]))
}
