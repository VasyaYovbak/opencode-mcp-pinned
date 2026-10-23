import { Plugin } from "@opencode/plugin"

const normalize = (name) => name.replace(/[^a-zA-Z0-9_-]/g, "_")

function options(input) {
  const servers = input?.servers
  if (!servers || typeof servers !== "object" || Array.isArray(servers))
    throw new Error("mcp-pinned: options.servers must be an object keyed by MCP server name")

  const pinned = new Map()
  for (const [name, setting] of Object.entries(servers)) {
    if (!setting || typeof setting !== "object" || Array.isArray(setting) || typeof setting.pinned !== "boolean")
      throw new Error(`mcp-pinned: options.servers.${name}.pinned must be a boolean`)
    if (!setting.pinned) continue
    const namespace = normalize(name)
    if (pinned.has(namespace))
      throw new Error(`mcp-pinned: ${name} and ${pinned.get(namespace)} have the same normalized namespace`)
    pinned.set(namespace, name)
  }

  const waitMs = input.waitMs ?? 10_000
  if (!Number.isSafeInteger(waitMs) || waitMs < 0 || waitMs > 60_000)
    throw new Error("mcp-pinned: options.waitMs must be an integer between 0 and 60000")
  return { pinned, waitMs }
}

export default Plugin.define({
  id: "mcp-pinned",
  async setup(ctx) {
    const { pinned, waitMs } = options(ctx.options)
    if (pinned.size === 0) return

    const selected = (tool) => pinned.has(tool.options?.namespace)
    let installed = false
    let installing

    async function install() {
      if (installed) return true
      if (installing) return installing
      // MCP registers its transform asynchronously. Register ours only after its
      // tools are visible, so our updates replay AFTER MCP adds them on refresh.
      installing = (async () => {
        if (!(await ctx.tool.list()).some(selected)) return false
        await ctx.tool.transform((editor) => {
          for (const tool of editor.list()) {
            if (!selected(tool)) continue
            editor.update(tool.id, (draft) => {
              draft.options = { ...draft.options, codemode: true, pinned: true }
            })
          }
        })
        installed = true
        return true
      })()
      try {
        return await installing
      } finally {
        installing = undefined
      }
    }

    // Prompt admission precedes the tool snapshot. Wait briefly for MCP's
    // initial registration so even the first model request sees pinned tools.
    await ctx.session.hook("prompt", async () => {
      const deadline = Date.now() + waitMs
      while (!(await install())) {
        const remaining = deadline - Date.now()
        if (remaining <= 0) return // A disconnected server has no tools to pin.
        await new Promise((resolve) => setTimeout(resolve, Math.min(100, remaining)))
      }
    })
    await install() // Also handle servers that registered before the plugin loaded.
  },
})
