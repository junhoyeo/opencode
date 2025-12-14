import { useSync } from "@tui/context/sync"
import { createMemo, For, Show, Switch, Match } from "solid-js"
import { createStore } from "solid-js/store"
import { useTheme } from "../../context/theme"
import type { Sidebar as SidebarModule } from "@/sidebar"
import { Locale } from "@/util/locale"
import path from "path"
import type { AssistantMessage } from "@opencode-ai/sdk/v2"
import { Global } from "@/global"
import { Installation } from "@/installation"
import { useKeybind } from "../../context/keybind"
import { useDirectory } from "../../context/directory"

function PluginRow(props: { row: SidebarModule.Row }) {
  const { theme } = useTheme()

  return (
    <Switch>
      <Match when={props.row.type === "text" && props.row}>
        {(row) => <text fg={row().dim ? theme.textMuted : theme.text}>{row().text}</text>}
      </Match>
      <Match when={props.row.type === "kv" && props.row}>
        {(row) => (
          <box flexDirection="row" gap={1}>
            <text fg={row().dimKey !== false ? theme.textMuted : theme.text}>{row().key}</text>
            <text fg={row().dimValue ? theme.textMuted : theme.text}>{row().value}</text>
          </box>
        )}
      </Match>
      <Match when={props.row.type === "status" && props.row}>
        {(row) => (
          <box flexDirection="row" gap={1}>
            <text
              flexShrink={0}
              fg={
                {
                  success: theme.success,
                  error: theme.error,
                  warning: theme.warning,
                  info: theme.textMuted,
                  muted: theme.textMuted,
                }[row().status]
              }
            >
              •
            </text>
            <text fg={theme.text}>{row().label}</text>
          </box>
        )}
      </Match>
      <Match when={props.row.type === "list" && props.row}>
        {(row) => (
          <For each={row().items}>
            {(item) => <text fg={item.dim ? theme.textMuted : theme.text}>{item.text}</text>}
          </For>
        )}
      </Match>
      <Match when={props.row.type === "badge" && props.row}>
        {(row) => (
          <box flexDirection="row" gap={1}>
            <text fg={theme.textMuted}>{row().label}</text>
            <text
              fg={
                {
                  default: theme.text,
                  success: theme.success,
                  warning: theme.warning,
                  error: theme.error,
                }[row().variant ?? "default"]
              }
            >
              {row().value}
            </text>
          </box>
        )}
      </Match>
    </Switch>
  )
}

function PluginSection(props: {
  section: SidebarModule.Section & { plugin: string }
  expanded: boolean
  onToggle: () => void
}) {
  const { theme } = useTheme()
  const hasContent = () => props.section.rows.length > 0

  return (
    <Show when={hasContent()}>
      <box>
        <box flexDirection="row" gap={1} onMouseDown={() => props.section.rows.length > 2 && props.onToggle()}>
          <Show when={props.section.rows.length > 2}>
            <text fg={theme.text}>{props.expanded ? "▼" : "▶"}</text>
          </Show>
          <text fg={theme.text}>
            <b>{props.section.title}</b>
          </text>
          <Show when={props.section.status}>
            <text
              fg={
                {
                  info: theme.textMuted,
                  warning: theme.warning,
                  error: theme.error,
                }[props.section.status!]
              }
            >
              •
            </text>
          </Show>
        </box>
        <Show when={props.section.rows.length <= 2 || props.expanded}>
          <For each={props.section.rows}>{(row) => <PluginRow row={row} />}</For>
        </Show>
      </box>
    </Show>
  )
}

export function Sidebar(props: { sessionID: string }) {
  const sync = useSync()
  const { theme } = useTheme()
  const session = createMemo(() => sync.session.get(props.sessionID)!)
  const diff = createMemo(() => sync.data.session_diff[props.sessionID] ?? [])
  const todo = createMemo(() => sync.data.todo[props.sessionID] ?? [])
  const messages = createMemo(() => sync.data.message[props.sessionID] ?? [])

  const pluginSidebar = createMemo(() => sync.data.sidebar[props.sessionID] ?? {})
  const pluginSections = createMemo(() => {
    const all: Array<SidebarModule.Section & { plugin: string }> = []
    for (const [plugin, sections] of Object.entries(pluginSidebar())) {
      for (const section of sections) {
        all.push({ ...section, plugin })
      }
    }
    return all.sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
  })

  const [expanded, setExpanded] = createStore({
    mcp: true,
    diff: true,
    todo: true,
    lsp: true,
  })

  const [pluginExpanded, setPluginExpanded] = createStore<Record<string, boolean>>({})

  // Sort MCP servers alphabetically for consistent display order
  const mcpEntries = createMemo(() => Object.entries(sync.data.mcp ?? {}).sort(([a], [b]) => a.localeCompare(b)))

  const cost = createMemo(() => {
    const total = messages().reduce((sum, x) => sum + (x.role === "assistant" ? x.cost : 0), 0)
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(total)
  })

  const context = createMemo(() => {
    const last = messages().findLast((x) => x.role === "assistant" && x.tokens.output > 0) as AssistantMessage
    if (!last) return
    const total =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    const model = sync.data.provider.find((x) => x.id === last.providerID)?.models[last.modelID]
    return {
      tokens: total.toLocaleString(),
      percentage: model?.limit.context ? Math.round((total / model.limit.context) * 100) : null,
    }
  })

  const keybind = useKeybind()
  const directory = useDirectory()

  const hasProviders = createMemo(() =>
    sync.data.provider.some((x) => x.id !== "opencode" || Object.values(x.models).some((y) => y.cost?.input !== 0)),
  )

  return (
    <Show when={session()}>
      <box
        backgroundColor={theme.backgroundPanel}
        width={42}
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={2}
      >
        <scrollbox flexGrow={1}>
          <box flexShrink={0} gap={1} paddingRight={1}>
            <box>
              <text fg={theme.text}>
                <b>{session().title}</b>
              </text>
              <Show when={session().share?.url}>
                <text fg={theme.textMuted}>{session().share!.url}</text>
              </Show>
            </box>
            <box>
              <text fg={theme.text}>
                <b>Context</b>
              </text>
              <text fg={theme.textMuted}>{context()?.tokens ?? 0} tokens</text>
              <text fg={theme.textMuted}>{context()?.percentage ?? 0}% used</text>
              <text fg={theme.textMuted}>{cost()} spent</text>
            </box>
            <Show when={mcpEntries().length > 0}>
              <box>
                <box
                  flexDirection="row"
                  gap={1}
                  onMouseDown={() => mcpEntries().length > 2 && setExpanded("mcp", !expanded.mcp)}
                >
                  <Show when={mcpEntries().length > 2}>
                    <text fg={theme.text}>{expanded.mcp ? "▼" : "▶"}</text>
                  </Show>
                  <text fg={theme.text}>
                    <b>MCP</b>
                  </text>
                </box>
                <Show when={mcpEntries().length <= 2 || expanded.mcp}>
                  <For each={mcpEntries()}>
                    {([key, item]) => (
                      <box flexDirection="row" gap={1}>
                        <text
                          flexShrink={0}
                          style={{
                            fg: (
                              {
                                connected: theme.success,
                                failed: theme.error,
                                disabled: theme.textMuted,
                                needs_auth: theme.warning,
                                needs_client_registration: theme.error,
                              } as Record<string, typeof theme.success>
                            )[item.status],
                          }}
                        >
                          •
                        </text>
                        <text fg={theme.text} wrapMode="word">
                          {key}{" "}
                          <span style={{ fg: theme.textMuted }}>
                            <Switch fallback={item.status}>
                              <Match when={item.status === "connected"}>Connected</Match>
                              <Match when={item.status === "failed" && item}>{(val) => <i>{val().error}</i>}</Match>
                              <Match when={item.status === "disabled"}>Disabled</Match>
                              <Match when={(item.status as string) === "needs_auth"}>Needs auth</Match>
                              <Match when={(item.status as string) === "needs_client_registration"}>
                                Needs client ID
                              </Match>
                            </Switch>
                          </span>
                        </text>
                      </box>
                    )}
                  </For>
                </Show>
              </box>
            </Show>
            <box>
              <box
                flexDirection="row"
                gap={1}
                onMouseDown={() => sync.data.lsp.length > 2 && setExpanded("lsp", !expanded.lsp)}
              >
                <Show when={sync.data.lsp.length > 2}>
                  <text fg={theme.text}>{expanded.lsp ? "▼" : "▶"}</text>
                </Show>
                <text fg={theme.text}>
                  <b>LSP</b>
                </text>
              </box>
              <Show when={sync.data.lsp.length <= 2 || expanded.lsp}>
                <Show when={sync.data.lsp.length === 0}>
                  <text fg={theme.textMuted}>LSPs will activate as files are read</text>
                </Show>
                <For each={sync.data.lsp}>
                  {(item) => (
                    <box flexDirection="row" gap={1}>
                      <text
                        flexShrink={0}
                        style={{
                          fg: {
                            connected: theme.success,
                            error: theme.error,
                          }[item.status],
                        }}
                      >
                        •
                      </text>
                      <text fg={theme.textMuted}>
                        {item.id} {item.root}
                      </text>
                    </box>
                  )}
                </For>
              </Show>
            </box>
            <Show when={todo().length > 0 && todo().some((t) => t.status !== "completed")}>
              <box>
                <box
                  flexDirection="row"
                  gap={1}
                  onMouseDown={() => todo().length > 2 && setExpanded("todo", !expanded.todo)}
                >
                  <Show when={todo().length > 2}>
                    <text fg={theme.text}>{expanded.todo ? "▼" : "▶"}</text>
                  </Show>
                  <text fg={theme.text}>
                    <b>Todo</b>
                  </text>
                </box>
                <Show when={todo().length <= 2 || expanded.todo}>
                  <For each={todo()}>
                    {(todo) => (
                      <text style={{ fg: todo.status === "in_progress" ? theme.success : theme.textMuted }}>
                        [{todo.status === "completed" ? "✓" : " "}] {todo.content}
                      </text>
                    )}
                  </For>
                </Show>
              </box>
            </Show>
            <Show when={diff().length > 0}>
              <box>
                <box
                  flexDirection="row"
                  gap={1}
                  onMouseDown={() => diff().length > 2 && setExpanded("diff", !expanded.diff)}
                >
                  <Show when={diff().length > 2}>
                    <text fg={theme.text}>{expanded.diff ? "▼" : "▶"}</text>
                  </Show>
                  <text fg={theme.text}>
                    <b>Modified Files</b>
                  </text>
                </box>
                <Show when={diff().length <= 2 || expanded.diff}>
                  <For each={diff() || []}>
                    {(item) => {
                      const file = createMemo(() => {
                        const splits = item.file.split(path.sep).filter(Boolean)
                        const last = splits.at(-1)!
                        const rest = splits.slice(0, -1).join(path.sep)
                        if (!rest) return last
                        return Locale.truncateMiddle(rest, 30 - last.length) + "/" + last
                      })
                      return (
                        <box flexDirection="row" gap={1} justifyContent="space-between">
                          <text fg={theme.textMuted} wrapMode="char">
                            {file()}
                          </text>
                          <box flexDirection="row" gap={1} flexShrink={0}>
                            <Show when={item.additions}>
                              <text fg={theme.diffAdded}>+{item.additions}</text>
                            </Show>
                            <Show when={item.deletions}>
                              <text fg={theme.diffRemoved}>-{item.deletions}</text>
                            </Show>
                          </box>
                        </box>
                      )
                    }}
                  </For>
                </Show>
              </box>
            </Show>
            <For each={pluginSections()}>
              {(section) => {
                const key = `${section.plugin}:${section.id}`
                const isExpanded = () => pluginExpanded[key] ?? true
                return (
                  <PluginSection
                    section={section}
                    expanded={isExpanded()}
                    onToggle={() => setPluginExpanded(key, !isExpanded())}
                  />
                )
              }}
            </For>
          </box>
        </scrollbox>

        <box flexShrink={0} gap={1} paddingTop={1}>
          <Show when={!hasProviders()}>
            <box
              backgroundColor={theme.backgroundElement}
              paddingTop={1}
              paddingBottom={1}
              paddingLeft={2}
              paddingRight={2}
              flexDirection="row"
              gap={1}
            >
              <text flexShrink={0} fg={theme.text}>
                ⬖
              </text>
              <box flexGrow={1} gap={1}>
                <text fg={theme.text}>
                  <b>Getting started</b>
                </text>
                <text fg={theme.textMuted}>OpenCode includes free models so you can start immediately.</text>
                <text fg={theme.textMuted}>
                  Connect from 75+ providers to use other models, including Claude, GPT, Gemini etc
                </text>
                <box flexDirection="row" gap={1} justifyContent="space-between">
                  <text fg={theme.text}>Connect provider</text>
                  <text fg={theme.textMuted}>/connect</text>
                </box>
              </box>
            </box>
          </Show>
          <text>
            <span style={{ fg: theme.textMuted }}>{directory().split("/").slice(0, -1).join("/")}/</span>
            <span style={{ fg: theme.text }}>{directory().split("/").at(-1)}</span>
          </text>
          <text fg={theme.textMuted}>
            <span style={{ fg: theme.success }}>•</span> <b>Open</b>
            <span style={{ fg: theme.text }}>
              <b>Code</b>
            </span>{" "}
            <span>{Installation.VERSION}</span>
          </text>
        </box>
      </box>
    </Show>
  )
}
