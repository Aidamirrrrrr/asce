import { generateAiReply, streamGenerateAiReply } from "@/lib/ai/ai-client";
import { type ComposerIntent, classifyComposerIntent } from "@/lib/ai/composer-intent";
import type { FlowStreamCallbacks } from "@/lib/ai/flow-generator";
import { generateFlowFromPrompt, refineFlowFromInstruction } from "@/lib/ai/flow-generator";
import { answerProjectDataQuestion } from "@/lib/analytics/qa-agent";
import {
  type ChatBuildPlanState,
  createBuildPlanChatMessage,
  createBuildPlanCollectingCallbacks,
} from "@/lib/chat/build-plan-message";
import { createEmptyFlow } from "@/lib/flow/default-flow";
import { buildFlowCompletionReport } from "@/lib/flow/flow-completion-report";
import type { BotFlowDocument } from "@/lib/flow/flow-schema";
import { enrichFlowWithInferredSecrets } from "@/lib/flow/secret-recipes";
import {
  formatFlowValidationSummary,
  validateFlowDocument,
} from "@/lib/flow/validate-flow-document";
import {
  clearStepLimitMeta,
  createChatMessage,
  type ProjectChatMessage,
  type ProjectChatMessageMeta,
} from "@/lib/projects";

type ResolveComposerTurnInput = {
  projectId: string;
  userMessage: string;
  chatHistory: ProjectChatMessage[];
  currentFlow: BotFlowDocument;
  callbacks?: FlowStreamCallbacks & {
    onAssistantDelta?: (delta: string) => void;
    onAssistantReset?: () => void;
    onToolStatus?: (message: string) => void;
  };
  /** Не добавлять сообщение пользователя в историю (кнопка «Продолжить»). */
  recordUserMessage?: boolean;
  /** Пропустить классификацию (продолжение агента сценария). */
  forceFlow?: boolean;
  /** Уже известное намерение (из API-роута). */
  intent?: ComposerIntent;
};

export type ComposerTurnResult =
  | {
      kind: "flow";
      assistantMessage: string;
      messages: ProjectChatMessage[];
      flow: BotFlowDocument;
      name?: string;
      validationSummary: string | null;
      stepLimitReached?: boolean;
    }
  | {
      kind: "data";
      assistantMessage: string;
      messages: ProjectChatMessage[];
    };

function finalizeFlowAssistantMessage(
  assistantMessage: string,
  flow: BotFlowDocument,
  ...contextParts: Array<string | null | undefined>
): { message: string; validationSummary: string | null } {
  const message = buildFlowCompletionReport(flow, assistantMessage, ...contextParts);
  const validationSummary = formatFlowValidationSummary(validateFlowDocument(flow));
  return { message, validationSummary };
}

function enrichGeneratedFlow(
  flow: BotFlowDocument,
  ...contextParts: Array<string | null | undefined>
): BotFlowDocument {
  return {
    ...flow,
    secrets: enrichFlowWithInferredSecrets(flow, ...contextParts),
  };
}

function buildTurnMessages(
  chatHistory: ProjectChatMessage[],
  userMessage: string,
  assistantContent: string,
  options: {
    recordUserMessage: boolean;
    assistantMeta?: ProjectChatMessageMeta;
    buildPlan?: ChatBuildPlanState | null;
    flowSnapshot?: BotFlowDocument;
    flowBefore?: BotFlowDocument;
  },
): ProjectChatMessage[] {
  const clearedHistory = chatHistory.map(clearStepLimitMeta);
  const messages: ProjectChatMessage[] = [...clearedHistory];

  if (options.recordUserMessage) {
    messages.push(
      createChatMessage("user", userMessage, undefined, {
        ...(options.flowBefore ? { flowSnapshot: options.flowBefore } : {}),
      }),
    );
  }

  if (options.buildPlan) {
    messages.push(createBuildPlanChatMessage(options.buildPlan));
  }

  messages.push(
    createChatMessage("assistant", assistantContent, undefined, {
      ...options.assistantMeta,
      ...(options.flowSnapshot ? { flowSnapshot: options.flowSnapshot } : {}),
    }),
  );

  return messages;
}

export async function resolveDataComposerTurn(input: {
  projectId: string;
  userMessage: string;
  chatHistory: ProjectChatMessage[];
  recordUserMessage?: boolean;
  callbacks?: {
    onAssistantDelta?: (delta: string) => void;
    onAssistantReset?: () => void;
    onToolStatus?: (message: string) => void;
  };
}): Promise<Extract<ComposerTurnResult, { kind: "data" }>> {
  const { projectId, userMessage, chatHistory, recordUserMessage = true, callbacks } = input;
  const { answer, actionCard } = await answerProjectDataQuestion(
    projectId,
    userMessage,
    chatHistory,
    callbacks,
  );

  const assistantMeta = actionCard ? { actionCard } : undefined;

  return {
    kind: "data",
    assistantMessage: answer,
    messages: buildTurnMessages(chatHistory, userMessage, answer, {
      recordUserMessage,
      assistantMeta,
    }),
  };
}

const CHAT_SYSTEM_PROMPT = `Ты — дружелюбный ассистент конструктора Telegram-ботов asce.
Отвечай кратко и по-человечески на обычные вопросы: приветствия, «как дела», что умеет сервис, как им пользоваться.
Коротко поясни, что здесь же в чате можно: описать бота словами и собрать сценарий, попросить правки, спросить статистику и заявки бота.
Не выдумывай конкретные цифры о боте пользователя. Без markdown-заголовков, 1–3 коротких абзаца.`;

async function resolveChatComposerTurn(input: {
  userMessage: string;
  chatHistory: ProjectChatMessage[];
  recordUserMessage?: boolean;
  callbacks?: {
    onAssistantDelta?: (delta: string) => void;
  };
}): Promise<Extract<ComposerTurnResult, { kind: "data" }>> {
  const { userMessage, chatHistory, recordUserMessage = true, callbacks } = input;
  const context = chatHistory
    .slice(-4)
    .map(
      (message) => `${message.role === "user" ? "Пользователь" : "Ассистент"}: ${message.content}`,
    )
    .join("\n");
  const systemPrompt = context
    ? `${CHAT_SYSTEM_PROMPT}\n\nКонтекст:\n${context}`
    : CHAT_SYSTEM_PROMPT;

  const answer = callbacks?.onAssistantDelta
    ? await streamGenerateAiReply(systemPrompt, userMessage, callbacks.onAssistantDelta)
    : await generateAiReply(systemPrompt, userMessage);

  return {
    kind: "data",
    assistantMessage: answer,
    messages: buildTurnMessages(chatHistory, userMessage, answer, { recordUserMessage }),
  };
}

async function resolveFlowComposerTurn(
  input: ResolveComposerTurnInput,
): Promise<Extract<ComposerTurnResult, { kind: "flow" }>> {
  const { userMessage, chatHistory, currentFlow, callbacks, recordUserMessage = true } = input;
  const { callbacks: wrappedCallbacks, getCollectedBuildPlan } =
    createBuildPlanCollectingCallbacks(callbacks);

  const generation = await refineFlowFromInstruction({
    currentFlow,
    instruction: userMessage,
    chatHistory,
    callbacks: wrappedCallbacks,
  });

  const flow = enrichGeneratedFlow(
    generation.flow,
    userMessage,
    ...chatHistory.map((message) => message.content),
  );
  const withValidation = finalizeFlowAssistantMessage(
    generation.assistantMessage,
    flow,
    userMessage,
    ...chatHistory.map((message) => message.content),
  );

  const stepLimitReached = generation.stepLimitReached ?? false;
  const assistantMeta = stepLimitReached ? { stepLimitReached: true as const } : undefined;

  return {
    kind: "flow",
    assistantMessage: withValidation.message,
    messages: buildTurnMessages(chatHistory, userMessage, withValidation.message, {
      recordUserMessage,
      assistantMeta,
      buildPlan: getCollectedBuildPlan(),
      flowBefore: currentFlow,
      flowSnapshot: flow,
    }),
    flow,
    validationSummary: withValidation.validationSummary,
    stepLimitReached,
  };
}

export async function resolveComposerTurn(
  input: ResolveComposerTurnInput,
): Promise<ComposerTurnResult> {
  const { projectId, userMessage, chatHistory, forceFlow, intent: presetIntent } = input;

  const intent =
    presetIntent ?? (forceFlow ? "flow" : await classifyComposerIntent(userMessage, chatHistory));

  if (intent === "data") {
    return resolveDataComposerTurn({
      projectId,
      userMessage,
      chatHistory,
      recordUserMessage: input.recordUserMessage,
      callbacks: input.callbacks,
    });
  }

  if (intent === "chat") {
    return resolveChatComposerTurn({
      userMessage,
      chatHistory,
      recordUserMessage: input.recordUserMessage,
      callbacks: input.callbacks,
    });
  }

  return resolveFlowComposerTurn(input);
}

export async function resolveCreateComposerTurn(input: {
  prompt: string;
  callbacks?: FlowStreamCallbacks;
}): Promise<Extract<ComposerTurnResult, { kind: "flow" }>> {
  const { prompt, callbacks } = input;
  const { callbacks: wrappedCallbacks, getCollectedBuildPlan } =
    createBuildPlanCollectingCallbacks(callbacks);

  const generation = await generateFlowFromPrompt(prompt, wrappedCallbacks);
  const flow = enrichGeneratedFlow(generation.flow, prompt);
  const withValidation = finalizeFlowAssistantMessage(generation.assistantMessage, flow, prompt);

  const stepLimitReached = generation.stepLimitReached ?? false;
  const assistantMeta = stepLimitReached ? { stepLimitReached: true as const } : undefined;
  const buildPlan = getCollectedBuildPlan();
  const messages: ProjectChatMessage[] = [
    createChatMessage("user", prompt, undefined, { flowSnapshot: createEmptyFlow() }),
  ];

  if (buildPlan) {
    messages.push(createBuildPlanChatMessage(buildPlan));
  }

  messages.push(
    createChatMessage("assistant", withValidation.message, undefined, {
      ...assistantMeta,
      flowSnapshot: flow,
    }),
  );

  return {
    kind: "flow",
    assistantMessage: withValidation.message,
    messages,
    flow,
    name: generation.name,
    validationSummary: withValidation.validationSummary,
    stepLimitReached,
  };
}
