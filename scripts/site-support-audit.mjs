import fs from "node:fs"
import path from "node:path"
import ts from "typescript"

const rootDir = process.cwd()
const registryFile = path.join(rootDir, "src", "constants", "supported-sites.json")
const fullCoverageEntries = [
  "src/contents/main.ts",
  "src/contents/ui-entry.tsx",
  "src/contents/monitor-entry.ts",
  "src/contents/scroll-lock-main.ts",
]
const mainWorldEntries = [
  {
    source: "src/contents/gemini-canvas-main.ts",
    id: "srcContentsGeminiCanvasMain",
    artifactPattern: /^gemini-canvas-main\.[^.]+\.js$/,
  },
  {
    source: "src/contents/gemini-watermark-main.ts",
    id: "srcContentsGeminiWatermarkMain",
    artifactPattern: /^gemini-watermark-main\.[^.]+\.js$/,
  },
  {
    source: "src/contents/iframe-scroll-main.ts",
    id: "srcContentsIframeScrollMain",
    artifactPattern: /^iframe-scroll-main\.[^.]+\.js$/,
  },
  {
    source: "src/contents/monitor-entry.ts",
    id: "srcContentsMonitorEntry",
    artifactPattern: /^monitor-entry\.[^.]+\.js$/,
  },
  {
    source: "src/contents/scroll-lock-main.ts",
    id: "srcContentsScrollLockMain",
    artifactPattern: /^scroll-lock-main\.[^.]+\.js$/,
  },
  {
    source: "src/contents/yuanbao-monaco-main.ts",
    id: "srcContentsYuanbaoMonacoMain",
    artifactPattern: /^yuanbao-monaco-main\.[^.]+\.js$/,
  },
]
const auxiliaryHostPermissions = new Set([
  "https://*.googleusercontent.com/*",
  "https://*.oaiusercontent.com/*",
])

function sorted(values) {
  return [...values].sort()
}

function assertUnique(values, label) {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index)
  if (duplicates.length > 0) {
    throw new Error(`${label} contains duplicates: ${sorted(new Set(duplicates)).join(", ")}`)
  }
}

function assertSameSet(actual, expected, label) {
  const actualSet = new Set(actual)
  const expectedSet = new Set(expected)
  const missing = expected.filter((value) => !actualSet.has(value))
  const unexpected = actual.filter((value) => !expectedSet.has(value))

  if (missing.length > 0 || unexpected.length > 0 || actual.length !== expected.length) {
    const details = [
      missing.length > 0 ? `missing ${sorted(missing).join(", ")}` : null,
      unexpected.length > 0 ? `unexpected ${sorted(unexpected).join(", ")}` : null,
      actual.length !== actualSet.size ? "contains duplicate matches" : null,
    ].filter(Boolean)
    throw new Error(`${label} does not match the supported-site registry: ${details.join("; ")}`)
  }
}

function readRegistry() {
  const sites = JSON.parse(fs.readFileSync(registryFile, "utf8"))
  if (!Array.isArray(sites) || sites.length === 0) {
    throw new Error("Supported-site registry must be a non-empty array")
  }

  const entries = []
  const modules = []
  const matches = []
  const hostnames = []

  for (const site of sites) {
    if (
      !site ||
      typeof site.entry !== "string" ||
      typeof site.module !== "string" ||
      !Array.isArray(site.matches) ||
      site.matches.length === 0
    ) {
      throw new Error("Each supported site requires entry, module, and at least one match")
    }
    if (site.entry !== site.module) {
      throw new Error(
        `Supported-site entry and adapter module must match: ${site.entry} != ${site.module}`,
      )
    }

    entries.push(site.entry)
    modules.push(site.module)
    for (const match of site.matches) {
      if (typeof match !== "string" || !/^https:\/\/[^/]+\/\*$/.test(match)) {
        throw new Error(`Invalid supported-site match for ${site.entry}: ${String(match)}`)
      }
      matches.push(match)
      hostnames.push(new URL(match.replace(/\*$/, "")).hostname)
    }
  }

  assertUnique(entries, "Supported-site entries")
  assertUnique(modules, "Supported-site adapter modules")
  assertUnique(matches, "Supported-site matches")
  assertUnique(hostnames, "Supported-site hostnames")

  return { sites, modules, matches, hostnames }
}

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text
  return null
}

function evaluateLiteral(node, variables) {
  if (!node) return undefined
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
    return !evaluateLiteral(node.operand, variables)
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((element) => evaluateLiteral(element, variables))
  }
  if (ts.isIdentifier(node)) return evaluateLiteral(variables.get(node.text), variables)
  if (ts.isObjectLiteralExpression(node)) {
    return Object.fromEntries(
      node.properties
        .filter(ts.isPropertyAssignment)
        .map((property) => [
          propertyName(property.name),
          evaluateLiteral(property.initializer, variables),
        ])
        .filter(([name]) => name !== null),
    )
  }
  return undefined
}

function parseContentScriptConfig(relativePath) {
  const filePath = path.join(rootDir, relativePath)
  const source = fs.readFileSync(filePath, "utf8")
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const variables = new Map()

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) {
        variables.set(declaration.name.text, declaration.initializer)
      }
    }
  }

  const config = evaluateLiteral(variables.get("config"), variables)
  if (!config || !Array.isArray(config.matches)) {
    throw new Error(`Unable to read config.matches from ${relativePath}`)
  }
  return config
}

function unwrapExpression(node) {
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    return unwrapExpression(node.expression)
  }
  return node
}

function parseAdapterLoaderKeys() {
  const relativePath = "src/adapters/index.ts"
  const filePath = path.join(rootDir, relativePath)
  const sourceFile = ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== "adapterLoaders") {
        continue
      }

      const initializer = declaration.initializer
        ? unwrapExpression(declaration.initializer)
        : undefined
      if (!initializer || !ts.isObjectLiteralExpression(initializer)) break

      return initializer.properties
        .filter(ts.isPropertyAssignment)
        .map((property) => propertyName(property.name))
        .filter((name) => name !== null)
    }
  }

  throw new Error(`Unable to read adapterLoaders from ${relativePath}`)
}

function parseRuntimeMainWorldRegistrations() {
  const relativePath = "src/constants/main-world-scripts.ts"
  const filePath = path.join(rootDir, relativePath)
  const sourceFile = ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        declaration.name.text !== "MAIN_WORLD_CONTENT_SCRIPTS"
      ) {
        continue
      }

      const initializer = declaration.initializer
        ? unwrapExpression(declaration.initializer)
        : undefined
      if (!initializer || !ts.isArrayLiteralExpression(initializer)) break
      return initializer.elements.map((element) => evaluateLiteral(element, new Map()))
    }
  }

  throw new Error(`Unable to read MAIN_WORLD_CONTENT_SCRIPTS from ${relativePath}`)
}

function parseUserscriptMatches() {
  const relativePath = "vite.userscript.config.ts"
  const source = fs.readFileSync(path.join(rootDir, relativePath), "utf8")
  const match = source.match(/\bmatch:\s*\[([\s\S]*?)\],\s*grant:/)
  if (!match) {
    throw new Error(`Unable to read userscript match metadata from ${relativePath}`)
  }
  return [...match[1].matchAll(/["'](https:\/\/[^"']+)["']/g)].map((item) => item[1])
}

function contentScriptLabel(entry) {
  return (entry.js || []).join(", ") || "content script without JS"
}

function findManifestEntry(manifest, pattern) {
  const entries = (manifest.content_scripts || []).filter((entry) =>
    (entry.js || []).some((fileName) => pattern.test(fileName)),
  )
  if (entries.length !== 1) {
    throw new Error(
      `Expected one production manifest entry matching ${pattern}, found ${entries.length}`,
    )
  }
  return entries[0]
}

function parseRegisteredContentScripts(source) {
  const sourceFile = ts.createSourceFile(
    "background.js",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  )
  const registrations = []

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "registerContentScripts" &&
      ts.isArrayLiteralExpression(node.arguments[0])
    ) {
      for (const element of node.arguments[0].elements) {
        if (!ts.isObjectLiteralExpression(element)) continue
        const registration = evaluateLiteral(element, new Map())
        if (registration) registrations.push(registration)
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return registrations
}

function findDynamicRegistration(registrations, id) {
  const matches = registrations.filter((entry) => entry.id === id)
  if (matches.length !== 1) {
    throw new Error(`Expected one production dynamic registration ${id}, found ${matches.length}`)
  }
  return matches[0]
}

function findArtifact(artifactNames, pattern, label) {
  const matches = artifactNames.filter((fileName) => pattern.test(fileName))
  if (matches.length !== 1) {
    throw new Error(`Expected one production ${label} artifact, found ${matches.length}`)
  }
  return matches[0]
}

export function validateSiteSupport({ chromeManifest, chromeBuildDir } = {}) {
  const registry = readRegistry()
  const adapterLoaderKeys = parseAdapterLoaderKeys()
  assertUnique(adapterLoaderKeys, "Adapter loader keys")
  assertSameSet(adapterLoaderKeys, registry.modules, "src/adapters/index.ts adapter loaders")
  const runtimeRegistrations = parseRuntimeMainWorldRegistrations()
  assertSameSet(
    runtimeRegistrations.map((registration) => registration.id),
    mainWorldEntries.map((entry) => entry.id),
    "MAIN-world registration diagnostics",
  )

  for (const relativePath of fullCoverageEntries) {
    const config = parseContentScriptConfig(relativePath)
    assertSameSet(config.matches, registry.matches, relativePath)
  }

  const mainWorldConfigs = new Map()
  for (const expected of mainWorldEntries) {
    const config = parseContentScriptConfig(expected.source)
    if (config.world !== "MAIN") {
      throw new Error(`${expected.source} must run in the MAIN world`)
    }
    if (config.persist_across_sessions !== false) {
      throw new Error(`${expected.source} must set persist_across_sessions to false`)
    }
    mainWorldConfigs.set(expected.id, config)
  }

  for (const expected of mainWorldEntries) {
    const sourceConfig = mainWorldConfigs.get(expected.id)
    const registration = runtimeRegistrations.find(({ id }) => id === expected.id)
    if (!registration) {
      throw new Error(`Missing runtime registration diagnostic for ${expected.id}`)
    }
    assertSameSet(
      registration.matches || [],
      sourceConfig.matches,
      `${expected.id} runtime matches`,
    )
    if (registration.world !== sourceConfig.world) {
      throw new Error(`${expected.id} runtime world does not match ${expected.source}`)
    }
    if ((registration.runAt || "document_idle") !== (sourceConfig.run_at || "document_idle")) {
      throw new Error(`${expected.id} runtime runAt does not match ${expected.source}`)
    }
    if (registration.persistAcrossSessions !== sourceConfig.persist_across_sessions) {
      throw new Error(`${expected.id} runtime persistence does not match ${expected.source}`)
    }
  }

  for (const site of registry.sites) {
    const relativePath = `src/contents/site-${site.entry}.ts`
    if (!fs.existsSync(path.join(rootDir, relativePath))) {
      throw new Error(`Missing adapter registration entry: ${relativePath}`)
    }
    assertSameSet(parseContentScriptConfig(relativePath).matches, site.matches, relativePath)
  }

  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"))
  const hostPermissions = packageJson.manifest?.host_permissions || []
  const publicHostPermissions = hostPermissions.filter(
    (match) => !auxiliaryHostPermissions.has(match),
  )
  assertSameSet(publicHostPermissions, registry.matches, "package.json host_permissions")

  assertSameSet(parseUserscriptMatches(), registry.matches, "userscript @match metadata")

  if (chromeManifest) {
    const manifestHostPermissions = (chromeManifest.host_permissions || []).filter(
      (match) => !auxiliaryHostPermissions.has(match),
    )
    assertSameSet(manifestHostPermissions, registry.matches, "production manifest host_permissions")

    for (const pattern of [/^main\.[^.]+\.js$/, /^ui-entry\.[^.]+\.js$/]) {
      const entry = findManifestEntry(chromeManifest, pattern)
      assertSameSet(entry.matches || [], registry.matches, contentScriptLabel(entry))
    }

    for (const site of registry.sites) {
      const entry = findManifestEntry(
        chromeManifest,
        new RegExp(`^site-${site.entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.[^.]+\\.js$`),
      )
      assertSameSet(entry.matches || [], site.matches, contentScriptLabel(entry))
    }

    if (!chromeBuildDir) {
      throw new Error("Production site-support validation requires chromeBuildDir")
    }

    const backgroundRelativePath = chromeManifest.background?.service_worker
    if (typeof backgroundRelativePath !== "string") {
      throw new Error("Production manifest is missing a background service worker")
    }
    const backgroundSource = fs.readFileSync(
      path.join(chromeBuildDir, backgroundRelativePath),
      "utf8",
    )
    const artifactNames = fs.readdirSync(chromeBuildDir)
    const registrations = parseRegisteredContentScripts(backgroundSource)
    const mainWorldRegistrations = registrations.filter((entry) => entry.world === "MAIN")
    assertSameSet(
      mainWorldRegistrations.map((entry) => entry.id),
      mainWorldEntries.map((entry) => entry.id),
      "production MAIN-world registration IDs",
    )

    for (const expected of mainWorldEntries) {
      const sourceConfig = mainWorldConfigs.get(expected.id)
      const registration = findDynamicRegistration(registrations, expected.id)
      const artifactName = findArtifact(artifactNames, expected.artifactPattern, expected.source)
      if (!backgroundSource.includes(artifactName)) {
        throw new Error(`Background service worker does not reference ${artifactName}`)
      }
      assertSameSet(registration.matches || [], sourceConfig.matches, expected.id)
      if (registration.world !== "MAIN") {
        throw new Error(`${expected.id} must run in the MAIN world`)
      }
      if (registration.runAt !== sourceConfig.run_at) {
        throw new Error(
          `${expected.id} has runAt ${String(registration.runAt)}, expected ${String(sourceConfig.run_at)}`,
        )
      }
      if (registration.persistAcrossSessions !== false) {
        throw new Error(`${expected.id} must not persist across sessions`)
      }
    }
  }

  return registry
}
