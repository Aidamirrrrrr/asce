import { repairMessageButtonEdges } from "@/lib/flow/flow-button-wiring";
import { type BotFlowDocument, parseFlowJson } from "@/lib/flow/flow-schema";

export function loadFlowDocument(
  raw: string | null | undefined,
  fallback: BotFlowDocument,
): BotFlowDocument {
  const document = parseFlowJson(raw, fallback);

  if (document.nodes.length === 0) {
    return document;
  }

  return {
    ...document,
    edges: repairMessageButtonEdges(document.nodes, document.edges),
  };
}
