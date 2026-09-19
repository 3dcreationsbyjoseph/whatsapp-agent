// Ejecuta un turno del agente con AI SDK 6 + tools para inmobiliaria de lujo.

import { generateText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { ANTHROPIC_MODEL, AGENT_MAX_STEPS, AGENT_TEMPERATURE } from "@/lib/constants";
import { buildSystemPrompt, type AgentConfig } from "./system-prompt";
import { makeGetAvailableSlotsTool } from "./tools/get-available-slots";
import { makeCheckSlotAvailabilityTool } from "./tools/check-slot-availability";
import { makeSaveContactInfoTool } from "./tools/save-contact-info";
import { makeListUpcomingAppointmentsTool } from "./tools/list-upcoming-appointments";
import { makeCancelAppointmentTool } from "./tools/cancel-appointment";
import { makeSearchPropertiesTool } from "./tools/search-properties";
import { makeSendPropertyToClientTool } from "./tools/send-property-to-client";
import { makeSendPropertyVideoTool } from "./tools/send-property-video";
import { makeSaveLeadTool } from "./tools/save-lead";
import { makeBookVisitTool } from "./tools/book-visit";
import type { GCalConfig } from "@/lib/google/calendar";

export type AgentInput = {
  organization_id: string;
  organization_name: string;
  timezone: string;
  conversation_id: string;
  contact_id: string;
  contact_phone: string;
  phone_number_id: string;
  access_token: string;
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
    search_properties: makeSearchPropertiesTool({
      organization_id: input.organization_id,
    }),
    send_property_to_client: makeSendPropertyToClientTool({
      organization_id: input.organization_id,
      contact_phone: input.contact_phone,
      conversation_id: input.conversation_id,
      phone_number_id: input.phone_number_id,
      access_token: input.access_token,
    }),
    send_property_video: makeSendPropertyVideoTool({
      organization_id: input.organization_id,
      contact_phone: input.contact_phone,
      conversation_id: input.conversation_id,
      phone_number_id: input.phone_number_id,
      access_token: input.access_token,
    }),
    save_lead: makeSaveLeadTool({
      organization_id: input.organization_id,
      contact_id: input.contact_id,
    }),
    get_available_slots: makeGetAvailableSlotsTool({
      gcal: input.gcal_config,
      timezone: input.timezone,
      services,
      business_hours: businessHours,
    }),
    check_slot_availability: makeCheckSlotAvailabilityTool({
      gcal: input.gcal_config,
      timezone: input.timezone,
      services,
      business_hours: businessHours,
    }),
    book_visit: makeBookVisitTool({
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
    list_upcoming_appointments: makeListUpcomingAppointmentsTool({
      organization_id: input.organization_id,
      contact_id: input.contact_id,
    }),
    cancel_appointment: makeCancelAppointmentTool({
      organization_id: input.organization_id,
      contact_id: input.contact_id,
      gcal: input.gcal_config,
    }),
  };

  const result = await generateText({
    model: anthropic(ANTHROPIC_MODEL),
    system: buildSystemPrompt(input.agent_config, input.timezone, input.organization_name),
    messages: input.chat_history.map((m) => ({ role: m.role, content: m.content })),
    temperature: AGENT_TEMPERATURE,
    stopWhen: stepCountIs(AGENT_MAX_STEPS),
    tools,
  });

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
