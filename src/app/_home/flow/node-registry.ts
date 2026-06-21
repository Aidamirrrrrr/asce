import type { NodeTypes } from "@xyflow/react";

import { AdminNotifyNode } from "@/app/_home/flow/nodes/admin-notify-node";
import { AiReplyNode } from "@/app/_home/flow/nodes/ai-reply-node";
import { ConditionNode } from "@/app/_home/flow/nodes/condition-node";
import { HttpRequestNode } from "@/app/_home/flow/nodes/http-request-node";
import { JsonExtractNode } from "@/app/_home/flow/nodes/json-extract-node";
import { MessageNode } from "@/app/_home/flow/nodes/message-node";
import { SaveRecordNode } from "@/app/_home/flow/nodes/save-record-node";
import { SetVariableNode } from "@/app/_home/flow/nodes/set-variable-node";
import { TriggerNode } from "@/app/_home/flow/nodes/trigger-node";
import { WaitInputNode } from "@/app/_home/flow/nodes/wait-input-node";

export const flowNodeTypes: NodeTypes = {
  trigger: TriggerNode,
  message: MessageNode,
  condition: ConditionNode,
  set_variable: SetVariableNode,
  wait_input: WaitInputNode,
  http_request: HttpRequestNode,
  ai_reply: AiReplyNode,
  admin_notify: AdminNotifyNode,
  json_extract: JsonExtractNode,
  save_record: SaveRecordNode,
};
