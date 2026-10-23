# MCP tools pinned in OpenCode V2 Code Mode

This OpenCode V2 plugin includes every tool from selected MCP servers in the
initial Code Mode catalog. The tools remain callable through `execute`, not as
separate model-facing tools. Tested against OpenCode v2.1.3.

## Configure

Add the plugin to your existing `opencode.json(c)`. This example installs it
from GitHub; pin a commit instead of `main` if you need a fixed version:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "company-tools": {
        "type": "remote",
        "url": "https://mcp.example.com/mcp",
        "codemode": true
      }
    }
  },
  "plugins": [
    {
      "package": "github:VasyaYovbak/opencode-mcp-pinned#main",
      "options": {
        "servers": {
          "company-tools": { "pinned": true }
        },
        "waitMs": 10000
      }
    }
  ]
}
```

For local development, clone this repository, run `npm install`, and replace
`package` with its absolute directory path. Keep your other configuration and
plugin entries when adding the example above.

`pinned: false` leaves a server unchanged; omit servers you do not want pinned.
The `waitMs` option (0–60000, default 10000) bounds the wait at prompt admission
for MCP's initial tool registration. Unavailable servers have no tools to pin;
they may become available on a later prompt. The plugin also pins refreshed or
new tools from selected servers after its transform has been installed.

The MCP server configuration **cannot** accept a new `pinned` key: OpenCode
decodes `mcp.servers` with a fixed schema and ignores unknown fields. The flag
therefore belongs in `plugins[].options.servers`.

The plugin uses OpenCode's normalized MCP server namespace to identify tools.
Avoid giving unrelated custom tools the same namespace. Pinning a server also
sets its tools to Code Mode even if the server was configured with
`codemode: false`; set `codemode: true` in the server configuration for clarity.
Pinning many large schemas can consume substantial model context.

Run tests with `npm install && npm test`.
