// Ejecuta un turno del agente con AI SDK 6 + tools.
// Devuelve el texto de respuesta (posiblemente vacío si sólo hizo tool calls).

import { generateText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { ANTHROPIC_MODEL, AGENT_MAX_STEPS, AGENT_TEMPERATURE } from "@/lib/constants";
import { buildSystemPrompt, type AgentConfig } from "./system-prompt";
import { makeGetAvailableSlotsTool } from "./tools/get-available-slots";
import { makeBookAppointmentTool } from "./tools/book-appointment";
import { makeSaveContactInfoTool } from "./tools/save-contact-info";
import { makeHandoffTool } from "./tools/request-human-handoff";
import type { GCalConfig } from "@/lib/google/calendar";

export type AgentInput = {
  organization_id: string;
  timezone: string;
  conversation_id: string;
  contact_id: string;
  contact_phone: string;
  agent_config: AgentConfig;
  gcal_config: GCalConfig | null;
  chat_history: Array<{ role: "user" | "assistant"; content: string }>;
};

export async function runAgent(input: AgentInput): Promise<{ text: string }> {
  const services = Array.isArray(input.agent_config.services)
    ? (input.agent_config.services as Array<{ name: string; duration_minutes: number; description?: string }>)
    : [];
  const businessHours =
    typeof input.agent_config.business_hours === "object" && input.agent_config.business_hours
      ? (input.agent_config.business_hours as Record<string, Array<{ start: string; end: string }>>)
      : {};

  const tools = {
    get_available_slots: makeGetAvailableSlotsTool({
      gcal: input.gcal_config,
      timezone: input.timezone,
      services,
      business_hours: businessHours,
    }),
    book_appointment: makeBookAppointmentTool({
      organization_id: input.organization_id,
      contact_id: input.contact_id,
      contact_phone: input.contact_phone,
      gcal: input.gcal_config,
      timezone: input.timezone,
      services,
    }),
    save_contact_info: makeSaveContactInfoTool({
      contact_id: input.contact_id,
      organization_id: input.organization_id,
    }),
    request_human_handoff: makeHandoffTool({
      conversation_id: input.conversation_id,
      organization_id: input.organization_id,
      handoff_message: input.agent_config.handoff_message ?? "Te paso con un humano en un momento.",
    }),
  };

  const result = await generateText({
    model: anthropic(ANTHROPIC_MODEL),
    system: buildSystemPrompt(input.agent_config, input.timezone),
    messages: input.chat_history.map((m) => ({ role: m.role, content: m.content })),
    temperature: AGENT_TEMPERATURE,
    stopWhen: stepCountIs(AGENT_MAX_STEPS),
    tools,
  });

  // Log de tools llamadas y sus resultados para debugging.
  try {
    const toolCalls: Array<{ name: string; input: unknown; output: unknown }> = [];
    for (const step of result.steps ?? []) {
      for (const call of step.toolCalls ?? []) {
        const match = (step.toolResults ?? []).find(
          (r: { toolCallId: string }) => r.toolCallId === call.toolCallId,
        );
        toolCalls.push({
          name: call.toolName,
          input: call.input,
          output: (match as { output?: unknown } | undefined)?.output,
        });
      }
    }
    console.log(
      JSON.stringify({
        level: "info",
        msg: "agent step trace",
        organization_id: input.organization_id,
        conversation_id: input.conversation_id,
        steps: result.steps?.length ?? 0,
        tool_calls: toolCalls,
        text_length: result.text?.length ?? 0,
      }),
    );
  } catch (err) {
    console.warn(
      JSON.stringify({ level: "warn", msg: "trace log failed", err: (err as Error).message }),
    );
  }

  return { text: result.text };
}
