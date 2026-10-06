// Ejecuta un turno del agente con AI SDK 6 + tools para inmobiliaria de lujo.
// El plan de la agencia decide el modelo, si hay Google Calendar y los idiomas.

import { generateText, hasToolCall, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import {
  ADVANCED_MODEL_EFFORT,
  ANTHROPIC_MODEL,
  AGENT_MAX_STEPS,
  AGENT_TEMPERATURE,
} from "@/lib/constants";
import type { PlanFeatures } from "@/lib/billing/plans";
import { buildSystemPrompt, buildTemporalContext, type AgentConfig } from "./system-prompt";
import { makeGetAvailableSlotsTool } from "./tools/get-available-slots";
import { makeCheckSlotAvailabilityTool } from "./tools/check-slot-availability";
import { makeSaveContactInfoTool } from "./tools/save-contact-info";
import { makeListUpcomingAppointmentsTool } from "./tools/list-upcoming-appointments";
import { makeCancelAppointmentTool } from "./tools/cancel-appointment";
import { makeRescheduleAppointmentTool } from "./tools/reschedule-appointment";
import { makeSearchPropertiesTool } from "./tools/search-properties";
import { makeSendPropertyToClientTool } from "./tools/send-property-to-client";
import { makeSendMorePropertyPhotosTool } from "./tools/send-more-property-photos";
import { makeSendPropertyVideoTool } from "./tools/send-property-video";
import { makeSaveLeadTool } from "./tools/save-lead";
import { makeBookVisitTool } from "./tools/book-visit";
import { DEFAULT_HANDOFF_MESSAGE, makeHandoffTool } from "./tools/request-human-handoff";
import { makeSendRequestEmailTool } from "./tools/send-request-email";
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
  plan: PlanFeatures;
  chat_history: Array<{ role: "user" | "assistant"; content: string }>;
  // Lo que ya sabemos del cliente (nombre/teléfono). Va después del cache breakpoint.
  contact_context: string;
};

export async function runAgent(input: AgentInput): Promise<{ text: string }> {
  const services = Array.isArray(input.agent_config.services)
    ? (input.agent_config.services as Array<{ name: string; duration_minutes: number; description?: string }>)
    : [];
  const businessHours =
    typeof input.agent_config.business_hours === "object" && input.agent_config.business_hours
      ? (input.agent_config.business_hours as Record<string, Array<{ start: string; end: string }>>)
      : {};

  const plan = input.plan;
  // La conexión de Google sirve para dos cosas: Calendar (según plan) y enviar
  // emails con Gmail (todos los planes). Sin Calendar las visitas se reservan
  // solo en la app; si la agencia sube de plan, se pasan a Google al reconectar.
  const calendar = plan.calendar ? input.gcal_config : null;
  const mail = input.gcal_config;

  const tools = {
    search_properties: makeSearchPropertiesTool({
      organization_id: input.organization_id,
      contact_id: input.contact_id,
    }),
    send_property_to_client: makeSendPropertyToClientTool({
      organization_id: input.organization_id,
      contact_phone: input.contact_phone,
      conversation_id: input.conversation_id,
      phone_number_id: input.phone_number_id,
      access_token: input.access_token,
      plan,
    }),
    send_property_video: makeSendPropertyVideoTool({
      organization_id: input.organization_id,
      contact_phone: input.contact_phone,
      conversation_id: input.conversation_id,
      phone_number_id: input.phone_number_id,
      access_token: input.access_token,
      plan,
    }),
    send_more_property_photos: makeSendMorePropertyPhotosTool({
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
      organization_id: input.organization_id,
      gcal: calendar,
      timezone: input.timezone,
      services,
      business_hours: businessHours,
    }),
    check_slot_availability: makeCheckSlotAvailabilityTool({
      organization_id: input.organization_id,
      gcal: calendar,
      timezone: input.timezone,
      services,
      business_hours: businessHours,
    }),
    book_visit: makeBookVisitTool({
      organization_id: input.organization_id,
      conversation_id: input.conversation_id,
      contact_id: input.contact_id,
      contact_phone: input.contact_phone,
      gcal: calendar,
      mail,
      timezone: input.timezone,
      services,
    }),
    save_contact_info: makeSaveContactInfoTool({
      contact_id: input.contact_id,
      organization_id: input.organization_id,
      conversation_id: input.conversation_id,
      wa_phone: input.contact_phone,
      timezone: input.timezone,
      gcal: mail,
    }),
    list_upcoming_appointments: makeListUpcomingAppointmentsTool({
      organization_id: input.organization_id,
      contact_id: input.contact_id,
      timezone: input.timezone,
    }),
    cancel_appointment: makeCancelAppointmentTool({
      organization_id: input.organization_id,
      contact_id: input.contact_id,
      conversation_id: input.conversation_id,
      timezone: input.timezone,
      gcal: calendar,
      mail,
    }),
    reschedule_appointment: makeRescheduleAppointmentTool({
      organization_id: input.organization_id,
      contact_id: input.contact_id,
      conversation_id: input.conversation_id,
      contact_phone: input.contact_phone,
      gcal: calendar,
      mail,
      timezone: input.timezone,
      services,
    }),
    send_request_email: makeSendRequestEmailTool({
      organization_id: input.organization_id,
      contact_id: input.contact_id,
      conversation_id: input.conversation_id,
      gcal: mail,
    }),
    request_human_handoff: makeHandoffTool({
      conversation_id: input.conversation_id,
      organization_id: input.organization_id,
      contact_id: input.contact_id,
      gcal: mail,
      handoff_message: input.agent_config.handoff_message?.trim() || DEFAULT_HANDOFF_MESSAGE,
    }),
  };

  const run = (modelId: string) => {
    const advanced = modelId !== ANTHROPIC_MODEL;
    return generateText({
      model: anthropic(modelId),
      // Prompt caching: el breakpoint en el primer bloque cachea tools + prompt estable.
      // La fecha/hora va en un segundo bloque, después del breakpoint.
      system: [
        {
          role: "system",
          content: buildSystemPrompt(input.agent_config, input.organization_name, plan),
          providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
        },
        { role: "system", content: [buildTemporalContext(input.timezone), input.contact_context].join("\n\n") },
      ],
      // 2º breakpoint al final del historial: en un turno con varias tools, cada paso
      // reutiliza la caché del historial (si el total supera el mínimo del modelo).
      messages: input.chat_history.map((m, i, all) => ({
        role: m.role,
        content: m.content,
        ...(i === all.length - 1
          ? { providerOptions: { anthropic: { cacheControl: { type: "ephemeral" as const } } } }
          : {}),
      })),
      // El modelo avanzado (Max) no admite temperature y razona por defecto; su
      // profundidad se fija con effort ("medium": buen equilibrio para chat).
      ...(advanced
        ? { providerOptions: { anthropic: { effort: ADVANCED_MODEL_EFFORT } } }
        : { temperature: AGENT_TEMPERATURE }),
      // Tras un handoff no damos más pasos: el mensaje al cliente lo envía el processor.
      stopWhen: [stepCountIs(AGENT_MAX_STEPS), hasToolCall("request_human_handoff")],
      tools,
    });
  };

  let modelUsed = plan.model;
  let result = await run(modelUsed);
  // Si el modelo avanzado rechaza responder (filtro de seguridad), se repite el
  // turno con el modelo estándar para que el cliente no se quede sin respuesta.
  // Solo si aún no ejecutó ninguna tool (repetirlas duplicaría envíos o reservas).
  const ranTools = (result.steps ?? []).some((s) => (s.toolCalls ?? []).length > 0);
  if (result.finishReason === "content-filter" && modelUsed !== ANTHROPIC_MODEL && !ranTools) {
    console.warn(
      JSON.stringify({ level: "warn", msg: "advanced model refused; retrying with standard model", organization_id: input.organization_id }),
    );
    modelUsed = ANTHROPIC_MODEL;
    result = await run(modelUsed);
  }

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
        plan: plan.id,
        model: modelUsed,
        steps: result.steps?.length ?? 0,
        tool_calls: toolCalls,
        text_length: result.text?.length ?? 0,
        // Si ambos son 0/undefined el prefijo no llega al mínimo cacheable del modelo.
        cache_read_tokens: result.totalUsage?.inputTokenDetails?.cacheReadTokens ?? null,
        cache_write_tokens: result.totalUsage?.inputTokenDetails?.cacheWriteTokens ?? null,
      }),
    );
  } catch (err) {
    console.warn(
      JSON.stringify({ level: "warn", msg: "trace log failed", err: (err as Error).message }),
    );
  }

  return { text: result.text };
}
