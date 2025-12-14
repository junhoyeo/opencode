import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { Storage } from "../storage/storage"
import z from "zod"

export namespace Sidebar {
  export const Row = z.discriminatedUnion("type", [
    z.object({
      type: z.literal("text"),
      text: z.string().max(256),
      dim: z.boolean().optional(),
    }),
    z.object({
      type: z.literal("kv"),
      key: z.string().max(64),
      value: z.string().max(256),
      dimKey: z.boolean().optional(),
      dimValue: z.boolean().optional(),
    }),
    z.object({
      type: z.literal("status"),
      label: z.string().max(128),
      status: z.enum(["success", "error", "warning", "info", "muted"]),
    }),
    z.object({
      type: z.literal("list"),
      items: z
        .array(
          z.object({
            id: z.string(),
            text: z.string().max(256),
            dim: z.boolean().optional(),
          }),
        )
        .max(20),
    }),
    z.object({
      type: z.literal("badge"),
      label: z.string().max(32),
      value: z.union([z.string().max(32), z.number()]),
      variant: z.enum(["default", "success", "warning", "error"]).optional(),
    }),
  ])
  export type Row = z.infer<typeof Row>

  export const Section = z.object({
    id: z.string().max(64),
    title: z.string().max(64),
    order: z.number().optional(),
    status: z.enum(["info", "warning", "error"]).optional(),
    rows: z.array(Row).max(50),
  })
  export type Section = z.infer<typeof Section>

  export const Event = {
    Updated: BusEvent.define(
      "sidebar.updated",
      z.object({
        sessionID: z.string(),
        plugin: z.string(),
        sections: z.array(Section).max(10),
      }),
    ),
    SectionUpdated: BusEvent.define(
      "sidebar.section.updated",
      z.object({
        sessionID: z.string(),
        plugin: z.string(),
        section: Section,
      }),
    ),
    SectionRemoved: BusEvent.define(
      "sidebar.section.removed",
      z.object({
        sessionID: z.string(),
        plugin: z.string(),
        sectionID: z.string(),
      }),
    ),
    Cleared: BusEvent.define(
      "sidebar.cleared",
      z.object({
        sessionID: z.string(),
        plugin: z.string(),
      }),
    ),
  }

  export type State = Record<string, Section[]>

  export async function get(sessionID: string): Promise<State> {
    return Storage.read<State>(["sidebar", sessionID])
      .then((x) => x || {})
      .catch(() => ({}))
  }

  export async function update(input: { sessionID: string; plugin: string; sections: Section[] }) {
    const state = await get(input.sessionID)
    state[input.plugin] = input.sections
    await Storage.write(["sidebar", input.sessionID], state)
    Bus.publish(Event.Updated, input)
  }

  export async function updateSection(input: { sessionID: string; plugin: string; section: Section }) {
    const state = await get(input.sessionID)
    if (!state[input.plugin]) state[input.plugin] = []
    const idx = state[input.plugin].findIndex((s) => s.id === input.section.id)
    if (idx >= 0) {
      state[input.plugin][idx] = input.section
    } else {
      state[input.plugin].push(input.section)
    }
    await Storage.write(["sidebar", input.sessionID], state)
    Bus.publish(Event.SectionUpdated, input)
  }

  export async function removeSection(input: { sessionID: string; plugin: string; sectionID: string }) {
    const state = await get(input.sessionID)
    if (state[input.plugin]) {
      state[input.plugin] = state[input.plugin].filter((s) => s.id !== input.sectionID)
      await Storage.write(["sidebar", input.sessionID], state)
    }
    Bus.publish(Event.SectionRemoved, input)
  }

  export async function clear(input: { sessionID: string; plugin: string }) {
    const state = await get(input.sessionID)
    state[input.plugin] = []
    await Storage.write(["sidebar", input.sessionID], state)
    Bus.publish(Event.Cleared, input)
  }
}
