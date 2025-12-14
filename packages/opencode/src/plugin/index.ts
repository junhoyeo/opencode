import type { Hooks, PluginInput, Plugin as PluginInstance, SidebarSection, SidebarAPI } from "@opencode-ai/plugin"
import { Config } from "../config/config"
import { Bus } from "../bus"
import { Log } from "../util/log"
import { createOpencodeClient } from "@opencode-ai/sdk"
import { Server } from "../server/server"
import { BunProc } from "../bun"
import { Instance } from "../project/instance"
import { Flag } from "../flag/flag"
import { Sidebar } from "../sidebar"

export namespace Plugin {
  const log = Log.create({ service: "plugin" })

  function extractPluginName(plugin: string): string {
    if (plugin.startsWith("file://")) {
      return (
        plugin
          .split("/")
          .pop()
          ?.replace(/\.(ts|js)$/, "") ?? "local-plugin"
      )
    }
    const lastAtIndex = plugin.lastIndexOf("@")
    return lastAtIndex > 0 ? plugin.substring(0, lastAtIndex) : plugin
  }

  function createSidebarAPI(pluginName: string): SidebarAPI {
    return {
      update(sessionID: string, sections: SidebarSection[]) {
        Sidebar.update({ sessionID, plugin: pluginName, sections })
      },
      updateSection(sessionID: string, section: SidebarSection) {
        Sidebar.updateSection({ sessionID, plugin: pluginName, section })
      },
      removeSection(sessionID: string, sectionID: string) {
        Sidebar.removeSection({ sessionID, plugin: pluginName, sectionID })
      },
      clear(sessionID: string) {
        Sidebar.clear({ sessionID, plugin: pluginName })
      },
    }
  }

  const state = Instance.state(async () => {
    const client = createOpencodeClient({
      baseUrl: "http://localhost:4096",
      // @ts-ignore - fetch type incompatibility
      fetch: async (...args) => Server.App().fetch(...args),
    })
    const config = await Config.get()
    const hooks = []
    const baseInput = {
      client,
      project: Instance.project,
      worktree: Instance.worktree,
      directory: Instance.directory,
      $: Bun.$,
    }
    const plugins = [...(config.plugin ?? [])]
    if (!Flag.OPENCODE_DISABLE_DEFAULT_PLUGINS) {
      plugins.push("opencode-copilot-auth@0.0.9")
      plugins.push("opencode-anthropic-auth@0.0.5")
    }
    for (let plugin of plugins) {
      log.info("loading plugin", { path: plugin })
      const originalPlugin = plugin
      if (!plugin.startsWith("file://")) {
        const lastAtIndex = plugin.lastIndexOf("@")
        const pkg = lastAtIndex > 0 ? plugin.substring(0, lastAtIndex) : plugin
        const version = lastAtIndex > 0 ? plugin.substring(lastAtIndex + 1) : "latest"
        plugin = await BunProc.install(pkg, version)
      }
      const pluginName = extractPluginName(originalPlugin)
      const input: PluginInput = {
        ...baseInput,
        sidebar: createSidebarAPI(pluginName),
      }
      const mod = await import(plugin)
      for (const [_name, fn] of Object.entries<PluginInstance>(mod)) {
        const init = await fn(input)
        hooks.push(init)
      }
    }

    return {
      hooks,
      input: baseInput,
    }
  })

  export async function trigger<
    Name extends Exclude<keyof Required<Hooks>, "auth" | "event" | "tool">,
    Input = Parameters<Required<Hooks>[Name]>[0],
    Output = Parameters<Required<Hooks>[Name]>[1],
  >(name: Name, input: Input, output: Output): Promise<Output> {
    if (!name) return output
    for (const hook of await state().then((x) => x.hooks)) {
      const fn = hook[name]
      if (!fn) continue
      // @ts-expect-error if you feel adventurous, please fix the typing, make sure to bump the try-counter if you
      // give up.
      // try-counter: 2
      await fn(input, output)
    }
    return output
  }

  export async function list() {
    return state().then((x) => x.hooks)
  }

  export async function init() {
    const hooks = await state().then((x) => x.hooks)
    const config = await Config.get()
    for (const hook of hooks) {
      await hook.config?.(config)
    }
    Bus.subscribeAll(async (input) => {
      const hooks = await state().then((x) => x.hooks)
      for (const hook of hooks) {
        hook["event"]?.({
          event: input,
        })
      }
    })
  }
}
