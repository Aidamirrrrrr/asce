import { generateAiReply } from "@/lib/ai/ai-client";
import { runQueued } from "@/lib/ai/ai-queue";
import { runWithAiUsage } from "@/lib/billing/ai-usage-context";
import { getProjectOwnerId } from "@/lib/billing/project-owner";
import type { ExecutionContext } from "@/lib/bot/execution-context";
import { executeHttpRequestNode } from "@/lib/bot/http-request-executor";
import type { InputWaitSession } from "@/lib/bot/input-wait-session";
import { setUserVar } from "@/lib/bot/user-variables";
import { normalizeAdminNotifyNodeData } from "@/lib/flow/admin-notify-node-utils";
import { normalizeConditionNodeData } from "@/lib/flow/condition-node-utils";
import type {
  AdminNotifyNodeData,
  AiReplyNodeData,
  BotFlowDocument,
  ConditionNodeData,
  FlowNode,
  HttpRequestNodeData,
  JsonExtractNodeData,
  MessageNodeData,
  SaveRecordNodeData,
  SetVariableNodeData,
  TriggerNodeData,
  WaitInputNodeData,
} from "@/lib/flow/flow-schema";
import { normalizeHttpRequestNodeData } from "@/lib/flow/http-request-node-utils";
import { extractJsonValue, normalizeJsonExtractNodeData } from "@/lib/flow/json-extract-node-utils";
import { findReplyButtonByText, normalizeMessageNodeData } from "@/lib/flow/message-node-utils";
import { normalizeSaveRecordNodeData } from "@/lib/flow/save-record-node-utils";
import {
  normalizeSetVariableNodeData,
  resolveSetVariableValue,
} from "@/lib/flow/set-variable-node-utils";
import { interpolateTemplate } from "@/lib/flow/template-vars";
import { normalizeTriggerNodeData } from "@/lib/flow/trigger-node-utils";
import { normalizeWaitInputNodeData } from "@/lib/flow/wait-input-node-utils";
import { stripTextEmojisOptional } from "@/lib/text/strip-emojis";

import type { OutboundMessagePayload, SendOutboundResult } from "./send-message";

export type FlowWalkResult = {
  replyKeyboardSession?: SendOutboundResult["replyKeyboardSession"];
  inputWaitSession?: InputWaitSession;
};

function mergeWalkResults(
  current: FlowWalkResult | undefined,
  next: FlowWalkResult | undefined,
): FlowWalkResult | undefined {
  if (!next) {
    return current;
  }

  if (!current) {
    return next;
  }

  return {
    replyKeyboardSession: next.replyKeyboardSession ?? current.replyKeyboardSession,
    inputWaitSession: next.inputWaitSession ?? current.inputWaitSession,
  };
}

function outboundToWalkResult(
  sendResult: SendOutboundResult | undefined,
): FlowWalkResult | undefined {
  if (!sendResult?.replyKeyboardSession) {
    return;
  }

  return { replyKeyboardSession: sendResult.replyKeyboardSession };
}

export type FlowOutboundPort = {
  executionContext: ExecutionContext;
  flowJson?: string | null;
  sendText: (text: string) => Promise<void>;
  sendChatAction?: (action: "typing") => Promise<void>;
  sendMessage: (
    payload: OutboundMessagePayload,
    context: { nodeId: string },
  ) => Promise<SendOutboundResult>;
  scheduleMessage?: (input: {
    nodeId: string;
    delaySeconds: number;
    userMessage: string;
  }) => Promise<void>;
  evaluateCondition?: (data: ConditionNodeData) => Promise<boolean>;
  onNodeExecuted?: (node: { id: string; type: string }) => void;
  /** Отправить текст в произвольный чат (для admin_notify). */
  sendToChat?: (chatId: string, text: string) => Promise<void>;
  /** Сохранить запись во встроенное хранилище (для save_record). */
  saveRecord?: (input: { collection: string; data: Record<string, string> }) => Promise<void>;
};

function isTriggerNode(node: FlowNode): node is FlowNode & { data: TriggerNodeData } {
  return node.type === "trigger";
}

function isMessageNode(node: FlowNode): node is FlowNode & { data: MessageNodeData } {
  return node.type === "message";
}

function isAiReplyNode(node: FlowNode): node is FlowNode & { data: AiReplyNodeData } {
  return node.type === "ai_reply";
}

function isConditionNode(node: FlowNode): node is FlowNode & { data: ConditionNodeData } {
  return node.type === "condition";
}

function isSetVariableNode(node: FlowNode): node is FlowNode & { data: SetVariableNodeData } {
  return node.type === "set_variable";
}

function isWaitInputNode(node: FlowNode): node is FlowNode & { data: WaitInputNodeData } {
  return node.type === "wait_input";
}

function isHttpRequestNode(node: FlowNode): node is FlowNode & { data: HttpRequestNodeData } {
  return node.type === "http_request";
}

function isAdminNotifyNode(node: FlowNode): node is FlowNode & { data: AdminNotifyNodeData } {
  return node.type === "admin_notify";
}

function isJsonExtractNode(node: FlowNode): node is FlowNode & { data: JsonExtractNodeData } {
  return node.type === "json_extract";
}

function isSaveRecordNode(node: FlowNode): node is FlowNode & { data: SaveRecordNodeData } {
  return node.type === "save_record";
}

function matchesTrigger(data: TriggerNodeData, messageText: string): boolean {
  if (data.triggerType === "inactivity" || data.triggerType === "payment_succeeded") {
    return false;
  }

  if (data.triggerType === "any_message") {
    return messageText.length > 0;
  }

  const command = data.command.trim();
  if (!command) {
    return false;
  }

  const normalized = messageText.split(/\s+/)[0] ?? "";
  return normalized === command || normalized.startsWith(`${command}@`);
}

function findMatchingTrigger(flow: BotFlowDocument, messageText: string): FlowNode | null {
  for (const node of flow.nodes) {
    if (isTriggerNode(node) && matchesTrigger(node.data, messageText)) {
      return node;
    }
  }

  return null;
}

function getMessageNode(flow: BotFlowDocument, nodeId: string) {
  const node = flow.nodes.find((item) => item.id === nodeId);
  if (!(node && isMessageNode(node))) {
    return null;
  }

  return {
    node,
    data: normalizeMessageNodeData(node.data),
  };
}

export function buildMessageOutboundPayload(
  data: MessageNodeData,
  executionContext: ExecutionContext,
): OutboundMessagePayload {
  const parseMode = data.parseMode ?? "HTML";
  const interpolated = data.text?.trim()
    ? interpolateTemplate(data.text, executionContext.vars, parseMode)
    : undefined;
  const text = interpolated ? stripTextEmojisOptional(interpolated) : undefined;

  return {
    text,
    parseMode: data.parseMode,
    linkPreview: data.linkPreview,
    attachments: data.attachments,
    keyboard: data.keyboard,
    silent: data.silent,
    protectContent: data.protectContent,
    replyToUser: data.replyToUser,
    showCaptionAboveMedia: data.showCaptionAboveMedia,
    userMessageId: data.replyToUser ? executionContext.userMessageId : undefined,
  };
}

async function persistVariable(port: FlowOutboundPort, key: string, value: string): Promise<void> {
  const { projectId, userId } = port.executionContext;
  await setUserVar({ projectId, userId, key, value });
  port.executionContext.vars[`var.${key.replace(/^var\./, "")}`] = value;
}

async function executeSetVariableNode(
  data: SetVariableNodeData,
  userMessage: string,
  port: FlowOutboundPort,
): Promise<void> {
  const normalized = normalizeSetVariableNodeData(data);
  const value = resolveSetVariableValue(
    normalized,
    userMessage,
    port.executionContext.vars,
    (text) => interpolateTemplate(text, port.executionContext.vars, null),
  );

  await persistVariable(port, normalized.variableKey, value);
}

async function executeAdminNotifyNode(
  data: AdminNotifyNodeData,
  port: FlowOutboundPort,
): Promise<void> {
  const normalized = normalizeAdminNotifyNodeData(data);
  const chatId = interpolateTemplate(normalized.chatId, port.executionContext.vars, null).trim();
  const text = interpolateTemplate(normalized.text, port.executionContext.vars, null).trim();

  if (!(chatId && text)) {
    return;
  }

  await port.sendToChat?.(chatId, stripTextEmojisOptional(text) ?? text);
}

async function executeJsonExtractNode(
  data: JsonExtractNodeData,
  port: FlowOutboundPort,
): Promise<void> {
  const normalized = normalizeJsonExtractNodeData(data);
  const sourceKey = `var.${normalized.sourceVariable}`;
  const rawJson = port.executionContext.vars[sourceKey] ?? "";
  const value = extractJsonValue(rawJson, normalized.path);

  await persistVariable(port, normalized.targetVariable, value ?? "");
}

async function executeSaveRecordNode(
  data: SaveRecordNodeData,
  port: FlowOutboundPort,
): Promise<void> {
  const normalized = normalizeSaveRecordNodeData(data);
  const record: Record<string, string> = {};
  for (const field of normalized.fields) {
    record[field.key] = interpolateTemplate(field.value, port.executionContext.vars, null);
  }

  try {
    await port.saveRecord?.({ collection: normalized.collection, data: record });
  } catch {
    // Не роняем сценарий из-за сбоя записи — пользователь должен продолжить путь.
  }
}

async function executeHttpRequestNodeStep(
  data: HttpRequestNodeData,
  port: FlowOutboundPort,
): Promise<"success" | "error"> {
  const normalized = normalizeHttpRequestNodeData(data);
  const result = await executeHttpRequestNode(normalized, port.executionContext.vars);

  if (normalized.responseVariable) {
    await persistVariable(port, normalized.responseVariable, result.body);
  }

  if (normalized.responseStatusVariable) {
    await persistVariable(port, normalized.responseStatusVariable, String(result.status));
  }

  return result.ok ? "success" : "error";
}

async function executeNode(
  node: FlowNode,
  userMessage: string,
  port: FlowOutboundPort,
): Promise<SendOutboundResult | undefined> {
  if (isMessageNode(node)) {
    const data = normalizeMessageNodeData(node.data);

    if (data.delaySeconds && data.delaySeconds > 0) {
      await port.scheduleMessage?.({
        nodeId: node.id,
        delaySeconds: data.delaySeconds,
        userMessage,
      });
      return;
    }

    if (data.showTyping) {
      await port.sendChatAction?.("typing");
    }

    return port.sendMessage(buildMessageOutboundPayload(data, port.executionContext), {
      nodeId: node.id,
    });
  }

  if (isSetVariableNode(node)) {
    await executeSetVariableNode(node.data, userMessage, port);
    return;
  }

  if (isAdminNotifyNode(node)) {
    await executeAdminNotifyNode(node.data, port);
    return;
  }

  if (isJsonExtractNode(node)) {
    await executeJsonExtractNode(node.data, port);
    return;
  }

  if (isSaveRecordNode(node)) {
    await executeSaveRecordNode(node.data, port);
    return;
  }

  if (isHttpRequestNode(node)) {
    return;
  }

  if (isAiReplyNode(node)) {
    try {
      const ownerUserId = await getProjectOwnerId(port.executionContext.projectId);
      const reply = ownerUserId
        ? await runWithAiUsage({ userId: ownerUserId, kind: "bot_ai_reply" }, () =>
            runQueued(() => generateAiReply(node.data.systemPrompt, userMessage)),
          )
        : await runQueued(() => generateAiReply(node.data.systemPrompt, userMessage));
      await port.sendText(reply);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка AI";
      if (message.includes("AI_API_KEY")) {
        await port.sendText("AI-ответ недоступен: не задан ключ AI_API_KEY в .env");
        return;
      }
      throw error;
    }
  }

  if (isConditionNode(node)) {
    return;
  }
}

function getOutgoingEdges(flow: BotFlowDocument, nodeId: string, sourceHandle?: string) {
  return flow.edges.filter((edge) => {
    if (edge.source !== nodeId) {
      return false;
    }

    if (sourceHandle === undefined) {
      return true;
    }

    return (edge.sourceHandle ?? "next") === sourceHandle;
  });
}

async function walkFromNode(
  flow: BotFlowDocument,
  nodeId: string,
  userMessage: string,
  port: FlowOutboundPort,
  visited: Set<string>,
): Promise<FlowWalkResult | undefined> {
  if (visited.has(nodeId)) {
    return;
  }

  visited.add(nodeId);

  const node = flow.nodes.find((item) => item.id === nodeId);
  if (!node || node.type === "trigger") {
    return;
  }

  port.onNodeExecuted?.({ id: node.id, type: node.type });

  if (isConditionNode(node)) {
    const data = normalizeConditionNodeData(node.data);
    const passed = (await port.evaluateCondition?.(data)) ?? false;
    const handle = passed ? "yes" : "no";
    const branchEdges = getOutgoingEdges(flow, nodeId, handle);

    for (const edge of branchEdges) {
      const paused = await walkFromNode(flow, edge.target, userMessage, port, visited);
      if (paused?.inputWaitSession || paused?.replyKeyboardSession) {
        return paused;
      }
    }

    return;
  }

  if (isHttpRequestNode(node)) {
    const handle = await executeHttpRequestNodeStep(node.data, port);
    const branchEdges = getOutgoingEdges(flow, nodeId, handle);

    for (const edge of branchEdges) {
      const paused = await walkFromNode(flow, edge.target, userMessage, port, visited);
      if (paused?.inputWaitSession || paused?.replyKeyboardSession) {
        return paused;
      }
    }

    return;
  }

  if (isWaitInputNode(node)) {
    const normalized = normalizeWaitInputNodeData(node.data);
    return {
      inputWaitSession: {
        nodeId: node.id,
        variableKey: normalized.variableKey,
      },
    };
  }

  const sendResult = await executeNode(node, userMessage, port);

  if (isMessageNode(node)) {
    const data = normalizeMessageNodeData(node.data);
    if (data.delaySeconds && data.delaySeconds > 0) {
      return outboundToWalkResult(sendResult);
    }

    const nextEdges = getOutgoingEdges(flow, nodeId, "next");
    for (const edge of nextEdges) {
      const paused = await walkFromNode(flow, edge.target, userMessage, port, visited);
      if (paused?.inputWaitSession || paused?.replyKeyboardSession) {
        return mergeWalkResults(outboundToWalkResult(sendResult), paused);
      }
    }

    return outboundToWalkResult(sendResult);
  }

  if (isSetVariableNode(node) || isAiReplyNode(node)) {
    const nextEdges = getOutgoingEdges(flow, nodeId, "next");
    for (const edge of nextEdges) {
      const paused = await walkFromNode(flow, edge.target, userMessage, port, visited);
      if (paused?.inputWaitSession || paused?.replyKeyboardSession) {
        return paused;
      }
    }

    return outboundToWalkResult(sendResult);
  }

  const outgoing = getOutgoingEdges(flow, nodeId);
  let lastResult: FlowWalkResult | undefined = outboundToWalkResult(sendResult);

  for (const edge of outgoing) {
    const nestedResult = await walkFromNode(flow, edge.target, userMessage, port, visited);
    lastResult = mergeWalkResults(lastResult, nestedResult);
    if (lastResult?.inputWaitSession || lastResult?.replyKeyboardSession) {
      return lastResult;
    }
  }

  return lastResult;
}

export async function executeFlow(
  flow: BotFlowDocument,
  messageText: string,
  port: FlowOutboundPort,
): Promise<{
  handled: boolean;
  replyKeyboardSession?: SendOutboundResult["replyKeyboardSession"];
  inputWaitSession?: InputWaitSession;
}> {
  const trigger = findMatchingTrigger(flow, messageText);
  if (!trigger) {
    return { handled: false };
  }

  const visited = new Set<string>([trigger.id]);
  const outgoing = getOutgoingEdges(flow, trigger.id);
  let replyKeyboardSession: SendOutboundResult["replyKeyboardSession"];
  let inputWaitSession: InputWaitSession | undefined;

  for (const edge of outgoing) {
    const result = await walkFromNode(flow, edge.target, messageText, port, visited);
    if (result?.replyKeyboardSession) {
      replyKeyboardSession = result.replyKeyboardSession;
    }
    if (result?.inputWaitSession) {
      inputWaitSession = result.inputWaitSession;
    }
  }

  return { handled: true, replyKeyboardSession, inputWaitSession };
}

export async function executeFlowFromInactivityTrigger(
  flow: BotFlowDocument,
  triggerNodeId: string,
  port: FlowOutboundPort,
): Promise<FlowWalkResult | undefined> {
  const trigger = flow.nodes.find((node) => node.id === triggerNodeId && node.type === "trigger");
  if (!trigger) {
    return;
  }

  const triggerData = normalizeTriggerNodeData(trigger.data as TriggerNodeData);
  if (triggerData.triggerType !== "inactivity") {
    return;
  }

  const visited = new Set<string>([triggerNodeId]);
  const outgoing = getOutgoingEdges(flow, triggerNodeId);
  let merged: FlowWalkResult | undefined;

  for (const edge of outgoing) {
    const result = await walkFromNode(flow, edge.target, "", port, visited);
    merged = mergeWalkResults(merged, result);

    if (merged?.inputWaitSession || merged?.replyKeyboardSession) {
      return merged;
    }
  }

  return merged;
}

export async function executeFlowFromPaymentSucceeded(
  flow: BotFlowDocument,
  port: FlowOutboundPort,
): Promise<FlowWalkResult | undefined> {
  const triggers = flow.nodes.filter((node) => {
    if (!isTriggerNode(node)) {
      return false;
    }

    return normalizeTriggerNodeData(node.data).triggerType === "payment_succeeded";
  });

  if (triggers.length === 0) {
    return;
  }

  let merged: FlowWalkResult | undefined;

  for (const trigger of triggers) {
    const visited = new Set<string>([trigger.id]);
    const outgoing = getOutgoingEdges(flow, trigger.id);

    for (const edge of outgoing) {
      const result = await walkFromNode(flow, edge.target, "", port, visited);
      merged = mergeWalkResults(merged, result);

      if (merged?.inputWaitSession || merged?.replyKeyboardSession) {
        return merged;
      }
    }
  }

  return merged;
}

export async function executeFlowFromCallback(
  flow: BotFlowDocument,
  nodeId: string,
  buttonId: string,
  userMessage: string,
  port: FlowOutboundPort,
): Promise<FlowWalkResult | undefined> {
  const messageNode = getMessageNode(flow, nodeId);
  if (!messageNode) {
    return;
  }

  const edge = flow.edges.find(
    (item) => item.source === nodeId && (item.sourceHandle ?? "") === `btn-${buttonId}`,
  );

  if (!edge) {
    return;
  }

  return walkFromNode(flow, edge.target, userMessage, port, new Set([nodeId]));
}

export async function executeFlowFromReply(
  flow: BotFlowDocument,
  nodeId: string,
  buttonId: string,
  userMessage: string,
  port: FlowOutboundPort,
): Promise<FlowWalkResult | undefined> {
  const messageNode = getMessageNode(flow, nodeId);
  if (!messageNode) {
    return;
  }

  const edge = flow.edges.find(
    (item) => item.source === nodeId && (item.sourceHandle ?? "") === `reply-${buttonId}`,
  );

  if (!edge) {
    return;
  }

  return walkFromNode(flow, edge.target, userMessage, port, new Set([nodeId]));
}

export async function executeFlowFromMessageNext(
  flow: BotFlowDocument,
  nodeId: string,
  userMessage: string,
  port: FlowOutboundPort,
): Promise<FlowWalkResult | undefined> {
  const nextEdges = flow.edges.filter(
    (edge) => edge.source === nodeId && (edge.sourceHandle ?? "next") === "next",
  );

  if (nextEdges.length === 0) {
    return;
  }

  const visited = new Set<string>([nodeId]);
  let lastResult: FlowWalkResult | undefined;

  for (const edge of nextEdges) {
    const result = await walkFromNode(flow, edge.target, userMessage, port, visited);
    lastResult = mergeWalkResults(lastResult, result);
    if (lastResult?.inputWaitSession || lastResult?.replyKeyboardSession) {
      return lastResult;
    }
  }

  return lastResult;
}

export async function executeFlowFromInputWait(
  flow: BotFlowDocument,
  session: InputWaitSession,
  userMessage: string,
  port: FlowOutboundPort,
): Promise<FlowWalkResult | undefined> {
  await persistVariable(port, session.variableKey, userMessage);
  return executeFlowFromMessageNext(flow, session.nodeId, userMessage, port);
}

export function findReplyButtonMatch(
  flow: BotFlowDocument,
  nodeId: string,
  messageText: string,
): { nodeId: string; buttonId: string } | null {
  const messageNode = getMessageNode(flow, nodeId);
  if (!messageNode) {
    return null;
  }

  const button = findReplyButtonByText(messageNode.data, messageText);
  if (!button) {
    return null;
  }

  return { nodeId, buttonId: button.id };
}

export function flowHasTrigger(flow: BotFlowDocument): boolean {
  return flow.nodes.some((node) => node.type === "trigger");
}

export function collectRequiredSecretKeys(flow: BotFlowDocument): string[] {
  const keys = new Set<string>();

  for (const secret of flow.secrets ?? []) {
    if (secret.key.trim()) {
      keys.add(secret.key.trim());
    }
  }

  const scan = JSON.stringify(flow);
  const pattern = /\{\{secret\.([\w.]+)\}\}/g;
  let match = pattern.exec(scan);
  while (match) {
    if (match[1]) {
      keys.add(match[1]);
    }
    match = pattern.exec(scan);
  }

  return [...keys];
}
