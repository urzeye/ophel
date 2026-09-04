import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { inflateRawSync } from "node:zlib"

import { afterEach, describe, expect, it } from "vitest"

import { zipDirectory } from "../../scripts/zip-directory.mjs"

const tempDirs: string[] = []

function createTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ophel-zip-"))
  tempDirs.push(dir)
  return dir
}

function readZipEntries(buffer: Buffer): Map<string, Buffer> {
  let eocdOffset = -1
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i
      break
    }
  }

  if (eocdOffset < 0) {
    throw new Error("ZIP end of central directory not found")
  }

  const entryCount = buffer.readUInt16LE(eocdOffset + 10)
  let offset = buffer.readUInt32LE(eocdOffset + 16)
  const entries = new Map<string, Buffer>()

  for (let i = 0; i < entryCount; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("ZIP central directory header is invalid")
    }

    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8")

    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`ZIP local header is invalid for ${name}`)
    }

    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize)

    let data: Buffer
    if (method === 0) {
      data = Buffer.from(compressed)
    } else if (method === 8) {
      data = Buffer.from(inflateRawSync(compressed))
    } else {
      throw new Error(`Unsupported ZIP compression method ${method} for ${name}`)
    }

    entries.set(name, data)
    offset += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe("zipDirectory", () => {
  it("creates a readable zip of nested files without using a system zip command", () => {
    const sourceDir = createTempDir()
    const nestedDir = path.join(sourceDir, "nested", "deep")
    mkdirSync(nestedDir, { recursive: true })
    writeFileSync(path.join(sourceDir, "readme.txt"), "hello zip")
    writeFileSync(path.join(nestedDir, "data.bin"), Buffer.from([0, 1, 2, 255]))

    const outputZip = path.join(createTempDir(), "archive.zip")
    zipDirectory(sourceDir, outputZip)

    const zipBuffer = readFileSync(outputZip)
    expect(zipBuffer.length).toBeGreaterThan(0)
    expect(zipBuffer.subarray(0, 4).toString("binary")).toBe("PK\u0003\u0004")

    const entries = readZipEntries(zipBuffer)
    expect([...entries.keys()].sort()).toEqual(["nested/deep/data.bin", "readme.txt"])
    expect(entries.get("readme.txt")?.toString("utf8")).toBe("hello zip")
    expect(entries.get("nested/deep/data.bin")).toEqual(Buffer.from([0, 1, 2, 255]))
  })

  it("fails explicitly when the source directory does not exist", () => {
    const missingDir = path.join(createTempDir(), "missing")
    const outputZip = path.join(createTempDir(), "archive.zip")

    expect(() => zipDirectory(missingDir, outputZip)).toThrow(/Zip source directory not found/)
  })

  it("creates destination directory recursively if it does not exist", () => {
    const sourceDir = createTempDir()
    writeFileSync(path.join(sourceDir, "file.txt"), "nested zip content")

    const outputZip = path.join(createTempDir(), "deep", "nested", "archive.zip")
    zipDirectory(sourceDir, outputZip)

    expect(existsSync(outputZip)).toBe(true)
    const zipBuffer = readFileSync(outputZip)
    const entries = readZipEntries(zipBuffer)
    expect(entries.get("file.txt")?.toString("utf8")).toBe("nested zip content")
  })
})
