import assert from "node:assert/strict"
import { test } from "node:test"
import plugin from "../index.js"

function harness(options) {
  const transforms = []
  const hooks = new Map()
  const tool = (name, namespace, codemode = true) => ({
    id: `${namespace}_${name}`,
    name,
    options: { namespace, codemode },
  })
  const editor = (entries) => ({
    list: () => [...entries.values()],
    add: (entry) => entries.set(entry.id, { ...entry, options: { ...entry.options } }),
    update: (id, callback) => {
      const current = entries.get(id)
      if (!current) return
      const draft = { ...current, options: { ...current.options } }
      callback(draft)
      entries.set(id, draft)
    },
  })
  const read = () => {
    const entries = new Map()
    for (const transform of transforms) transform(editor(entries))
    return [...entries.values()]
  }
  const ctx = {
    options,
    tool: {
      list: async () => read(),
      transform: async (callback) => {
        transforms.push(callback)
        return { dispose: async () => {} }
      },
    },
    session: { hook: async (name, callback) => hooks.set(name, callback) },
  }
  return {
    ctx,
    tool,
    read,
    prompt: async () => hooks.get("prompt")(),
    register: (getTools) => transforms.push((editor) => getTools().forEach(editor.add)),
  }
}

test("pins existing MCP tools, forces Code Mode, and leaves other servers alone", async () => {
  const h = harness({ servers: { "company.tools": { pinned: true }, other: { pinned: false } } })
  h.register(() => [h.tool("lookup", "company_tools", false), h.tool("search", "other")])
  await plugin.setup(h.ctx)

  assert.deepEqual(h.read().map(({ id, options }) => [id, options]), [
    ["company_tools_lookup", { namespace: "company_tools", codemode: true, pinned: true }],
    ["other_search", { namespace: "other", codemode: true }],
  ])
})

test("waits for MCP registration before the first prompt and pins tools added on refresh", async () => {
  const h = harness({ servers: { company: { pinned: true } }, waitMs: 500 })
  await plugin.setup(h.ctx)
  const prompt = h.prompt()
  await new Promise((resolve) => setTimeout(resolve, 10))
  let tools = [h.tool("first", "company")]
  h.register(() => tools)
  await prompt
  assert.equal(h.read()[0]?.options.pinned, true)

  tools = [h.tool("first", "company"), h.tool("second", "company")]
  assert.equal(h.read()[1]?.options.pinned, true)
})

test("does not block a prompt indefinitely when the MCP server is absent", async () => {
  const h = harness({ servers: { company: { pinned: true } }, waitMs: 0 })
  await plugin.setup(h.ctx)
  await h.prompt()
  h.register(() => [h.tool("available_later", "company")])
  await h.prompt()
  assert.equal(h.read()[0]?.options.pinned, true)
})

test("rejects ambiguous server names and invalid flags", async () => {
  const duplicate = harness({ servers: { "company.tools": { pinned: true }, company_tools: { pinned: true } } })
  await assert.rejects(plugin.setup(duplicate.ctx), /same normalized namespace/)
  const invalid = harness({ servers: { company: { pinned: "yes" } } })
  await assert.rejects(plugin.setup(invalid.ctx), /must be a boolean/)
})
