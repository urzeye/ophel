# Registry Ed25519 Signing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Authenticate the SitePack registry root with an Ed25519 signature while retaining SHA-256 artifact integrity checks and last-known-good availability.

**Architecture:** CI serializes `index.json` once, signs those exact bytes, and publishes a strict detached `index.sig.json`. Runtime code verifies the detached signature with an embedded revision-bounded keyring before parsing the index, then reuses the existing artifact hash, schema, compatibility, and atomic snapshot pipeline.

**Tech Stack:** TypeScript 5.3, Node 20 crypto, `@noble/ed25519`, Vitest 3.2.4, GitHub Actions, extension and userscript registry transports.

---

### Task 1: Lock the signature contract with failing tests

**Files:**

- Create: `src/core/remote-config-signature.test.ts`
- Create: `registry/scripts/build-dist.test.mjs`
- Modify: `src/core/remote-config-manager.test.ts`

**Step 1: Test strict signature-envelope validation**

Cover the accepted schema plus unknown keys, incorrect algorithm, malformed key IDs, non-hex signatures, and incorrect signature length.

**Step 2: Test real Ed25519 verification**

Generate an in-memory test key pair, sign exact index bytes with Node crypto, and prove the runtime verifier accepts the original bytes but rejects a one-byte change, an unknown key, and a key outside its allowed revision range.

**Step 3: Test publisher output and key mismatch failures**

Build a temporary registry with an in-memory Ed25519 key. Assert `index.sig.json` verifies against the emitted `index.json`, then assert the build rejects a mismatched expected public key and missing signing configuration.

**Step 4: Test manager source behavior**

Update the byte-routed manager harness so every accepted index has a same-source signature route. Add explicit cases for invalid-primary/valid-secondary fallback and total signature failure preserving the active snapshot.

**Step 5: Run focused tests and confirm failure**

Run: `pnpm test -- src/core/remote-config-signature.test.ts src/core/remote-config-manager.test.ts registry/scripts/build-dist.test.mjs`

Expected: FAIL because the signature module, publisher output, and manager verification step do not exist yet.

### Task 2: Add the runtime verifier and trusted keyring

**Files:**

- Create: `src/core/remote-config-signature.ts`
- Modify: `src/core/remote-config-constants.ts`
- Modify: `src/core/remote-config-manager.ts`
- Modify: `src/core/remote-config-types.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Step 1: Add the reviewed Ed25519 verifier dependency**

Run: `pnpm add @noble/ed25519`

Expected: dependency and lockfile update without unrelated package upgrades.

**Step 2: Implement strict parsing and verification**

Define the detached envelope, bounded trusted-key type, initial production keyring, hexadecimal decoding, unknown-key rejection, Ed25519 verification, and post-parse revision-range assertion. Keep all failures explicit and avoid any unsigned fallback.

**Step 3: Verify before parsing**

Change `RemoteConfigManager.checkSource()` to fetch index bytes and the same-source signature, verify the raw bytes, parse and validate the index, enforce the selected key's revision range, then continue through existing monotonic revision and artifact validation.

**Step 4: Run focused runtime tests**

Run: `pnpm test -- src/core/remote-config-signature.test.ts src/core/remote-config-manager.test.ts`

Expected: PASS, including source fallback and last-known-good assertions.

### Task 3: Sign registry publications in CI

**Files:**

- Modify: `registry/scripts/build-dist.mjs`
- Modify: `.github/workflows/registry-dist.yml`
- Test: `registry/scripts/build-dist.test.mjs`

**Step 1: Sign the serialized index bytes**

Resolve a base64 PKCS#8 private key and key ID without accepting command-line secret values. Validate the key type and derived public key, write `index.json`, sign those exact bytes, and write `index.sig.json` with the strict envelope.

**Step 2: Make official publication fail closed**

Pass `REGISTRY_SIGNING_PRIVATE_KEY` from the repository secret and a fixed `REGISTRY_SIGNING_KEY_ID` in the publish workflow. Missing or mismatched signing configuration must stop the job before `registry-dist` is updated.

**Step 3: Run publisher tests**

Run: `pnpm test -- registry/scripts/build-dist.test.mjs`

Expected: PASS for valid output and all key-configuration failure cases.

### Task 4: Provision and document the signing root

**Files:**

- Modify: `registry/README.md`
- Modify: `docs/developer/site-adapter-pluginization-plan.md`
- Modify: `docs/developer/site-adapter-pluginization-tasks.csv`
- Modify remotely: GitHub Actions secret `REGISTRY_SIGNING_PRIVATE_KEY`

**Step 1: Provision without exposing the private key**

Generate an Ed25519 key pair entirely in process memory, send the base64 PKCS#8 private key directly to `gh secret set`, and retain only the raw public key for the source keyring. Do not print or persist the private key.

**Step 2: Document build and rotation operations**

Explain the signature files, required secret format, local build setup, fail-closed behavior, and staged key-rotation procedure. Update the architecture threat table to state that the signed index authenticates all artifact hashes.

**Step 3: Mark P4-03 complete**

Change only the P4-03 CSV status after publisher and client tests prove the complete chain.

### Task 5: Verify and deliver the isolated batch

**Files:**

- Review all P4-03 files above.
- Do not stage or modify the user's `.gitignore` changes.

**Step 1: Run repository checks**

Run, in order:

1. `pnpm test`
2. `pnpm format:check`
3. `pnpm exec eslint . --quiet --ignore-pattern 'output/**' --ignore-pattern '.playwright-cli/**' --ignore-pattern 'test-results/**'`
4. `pnpm typecheck`
5. `pnpm registry:validate`
6. `pnpm registry:build` with its ephemeral local signing key
7. `pnpm build`
8. `pnpm build:userscript`
9. `git diff --check`

Expected: all checks pass. Builds prove the verifier is bundled for both platforms; they do not claim live CDN acceptance before the signed registry is published from `main`.

**Step 2: Review security properties and diff scope**

Confirm the index is verified before JSON parsing or artifact downloads, unsigned data is never accepted by new clients, a failed check cannot replace active state, the private key is absent from files and logs, and no second signature or hash implementation was introduced.

**Step 3: Commit and push**

Stage only the P4-03 implementation, tests, dependency files, documentation, workflow, and task CSV. Commit with `feat(registry): verify signed registry index` and push `feat/site-adapter-pluginization`.
