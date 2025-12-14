import type { Plugin } from "@opencode-ai/plugin"

type SidebarRow =
  | { type: "text"; text: string; dim?: boolean }
  | { type: "kv"; key: string; value: string; dimKey?: boolean; dimValue?: boolean }
  | { type: "status"; label: string; status: "success" | "error" | "warning" | "info" | "muted" }
  | { type: "list"; items: Array<{ id: string; text: string; dim?: boolean }> }
  | { type: "badge"; label: string; value: string | number; variant?: "default" | "success" | "warning" | "error" }

type SidebarSection = {
  id: string
  title: string
  order?: number
  status?: "info" | "warning" | "error"
  rows: SidebarRow[]
}

type SidebarAPI = {
  update(sessionID: string, sections: SidebarSection[]): void
  updateSection(sessionID: string, section: SidebarSection): void
  removeSection(sessionID: string, sectionID: string): void
  clear(sessionID: string): void
}

export const TestSidebarPlugin: Plugin = async (input) => {
  const sidebar = (input as any).sidebar as SidebarAPI
  const commandCounts = new Map<string, number>()

  return {
    event: async ({ event }) => {
      if (event.type === "session.created") {
        const sessionID = event.properties.info.id
        commandCounts.set(sessionID, 0)

        setTimeout(() => {
          sidebar.updateSection(sessionID, {
            id: "test-sidebar:main",
            title: "Test Section",
            order: 50,
            rows: [
              { type: "status", label: "Plugin loaded", status: "success" },
              { type: "kv", key: "Session", value: sessionID.slice(0, 8) },
              { type: "text", text: "Waiting for commands...", dim: true },
            ],
          })
        }, 100)
      }
    },

    "tool.execute.after": async ({ tool, sessionID }, output) => {
      if (tool === "bash") {
        const count = (commandCounts.get(sessionID) ?? 0) + 1
        commandCounts.set(sessionID, count)

        sidebar.updateSection(sessionID, {
          id: "test-sidebar:main",
          title: "Test Section",
          order: 50,
          status: "info",
          rows: [
            { type: "status", label: "Command executed", status: "success" },
            { type: "kv", key: "Tool", value: tool },
            { type: "kv", key: "Output length", value: String(output.output.length) },
            { type: "badge", label: "Commands", value: count, variant: "success" },
          ],
        })

        sidebar.updateSection(sessionID, {
          id: "test-sidebar:stats",
          title: "Session Stats",
          order: 51,
          rows: [
            { type: "badge", label: "Total bash calls", value: count, variant: "default" },
            { type: "kv", key: "Last output size", value: `${output.output.length} chars` },
          ],
        })
      }
    },
  }
}
