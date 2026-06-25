import type { ChatCompletionTool } from "openai/resources/chat/completions";

export const STRUCTURE_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_nodes",
      description: "Список всех узлов и связей схемы.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "find_nodes",
      description: "Найти узлы по подстроке в id/label/summary.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_node",
      description: "Добавить узел в схему (без связей в фазе структуры).",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", description: "Тип узла" },
          data: { type: "object", additionalProperties: true },
        },
        required: ["type", "data"],
      },
    },
  },
];

export const WIRING_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_nodes",
      description: "Список всех узлов и связей.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_node",
      description: "Удалить узел.",
      parameters: {
        type: "object",
        properties: { nodeId: { type: "string" } },
        required: ["nodeId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "connect_nodes",
      description: "Связать два узла.",
      parameters: {
        type: "object",
        properties: {
          source: { type: "string" },
          target: { type: "string" },
          buttonText: { type: "string" },
          branch: {
            type: "string",
            enum: ["yes", "no", "success", "error", "next"],
          },
        },
        required: ["source", "target"],
      },
    },
  },
];

export const CONTENT_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_nodes",
      description: "Список всех узлов.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "update_node",
      description: "Обновить данные узла (тексты, keyboard, options и т.д.).",
      parameters: {
        type: "object",
        properties: {
          nodeId: { type: "string" },
          data: { type: "object", additionalProperties: true },
        },
        required: ["nodeId", "data"],
      },
    },
  },
];

export const REFINE_EDIT_TOOLS: ChatCompletionTool[] = [
  ...STRUCTURE_TOOLS,
  {
    type: "function",
    function: {
      name: "delete_node",
      description: "Удалить узел.",
      parameters: {
        type: "object",
        properties: { nodeId: { type: "string" } },
        required: ["nodeId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "connect_nodes",
      description: "Связать два узла.",
      parameters: {
        type: "object",
        properties: {
          source: { type: "string" },
          target: { type: "string" },
          buttonText: { type: "string" },
          branch: {
            type: "string",
            enum: ["yes", "no", "success", "error", "next"],
          },
        },
        required: ["source", "target"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_node",
      description: "Обновить данные узла.",
      parameters: {
        type: "object",
        properties: {
          nodeId: { type: "string" },
          data: { type: "object", additionalProperties: true },
        },
        required: ["nodeId", "data"],
      },
    },
  },
];
