import type { TemplateVars } from "@/lib/flow/template-vars";

export type ExecutionContext = {
  projectId: string;
  chatId: number;
  userId: number;
  userMessageId?: number;
  vars: TemplateVars;
  isPremium?: boolean;
  hasUsername?: boolean;
  startParam?: string;
};
