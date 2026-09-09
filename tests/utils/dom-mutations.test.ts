import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { collectChangedElements, isIgnoredMutation } from "~utils/dom-mutations"
import { MutationElement, mutationRecord } from "../helpers/mutation-dom"

beforeEach(() => vi.stubGlobal("Element", MutationElement))
afterEach(() => vi.unstubAllGlobals())

const selectors = ".response, .query"
const ignored = ".ophel-control"

describe("collectChangedElements", () => {
  it("deduplicates streamed text and node changes in the affected response", () => {
    const response = new MutationElement(".response")
    const paragraph = new MutationElement("p")
    response.append(paragraph)
    const text = { parentElement: paragraph }
    const records = [
      mutationRecord(text, { type: "characterData" }),
      mutationRecord(paragraph, { added: [text] }),
      mutationRecord(response, { type: "attributes" }),
    ]
    const changed = collectChangedElements(records, selectors)
    expect(changed.size).toBe(1)
    expect(changed.has(response as unknown as Element)).toBe(true)
  })

  it("discovers nested messages in newly mounted containers without scanning the document", () => {
    const root = new MutationElement("main")
    const turn = new MutationElement("section")
    const query = new MutationElement(".query")
    const response = new MutationElement(".response")
    turn.append(query)
    turn.append(response)
    root.append(turn)
    const changed = collectChangedElements([mutationRecord(root, { added: [turn] })], selectors)
    expect(changed.size).toBe(2)
    expect(changed.has(query as unknown as Element)).toBe(true)
    expect(changed.has(response as unknown as Element)).toBe(true)
  })

  it("ignores assistant tokens when only user queries are relevant", () => {
    const response = new MutationElement(".response")
    const token = new MutationElement("span")
    response.append(token)
    expect(
      collectChangedElements([mutationRecord(response, { added: [token] })], ".query").size,
    ).toBe(0)
  })

  it("ignores inserted, removed, and internally updated extension controls", () => {
    const response = new MutationElement(".response")
    const control = new MutationElement(ignored)
    const text = { parentElement: control }
    const records = [
      mutationRecord(response, { added: [control] }),
      mutationRecord(response, { removed: [control] }),
      mutationRecord(text, { type: "characterData" }),
    ]
    expect(records.every((record) => isIgnoredMutation(record, ignored))).toBe(true)
    expect(collectChangedElements(records, selectors, ignored).size).toBe(0)
  })

  it("does not lose real content bundled with ignored controls", () => {
    const response = new MutationElement(".response")
    const record = mutationRecord(response, {
      added: [new MutationElement(ignored), new MutationElement("p")],
    })
    expect(isIgnoredMutation(record, ignored)).toBe(false)
    expect(collectChangedElements([record], selectors, ignored).size).toBe(1)
  })
})
