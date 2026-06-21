/** Максимум итераций tool-calling в одном запуске агента. */
export const FLOW_AGENT_MAX_STEPS = 50;

/** Скрытая инструкция для кнопки «Продолжить» (не показывается в чате). */
export const FLOW_AGENT_CONTINUE_INSTRUCTION =
  "Продолжи сборку сценария с текущего состояния на холсте. " +
  "Сначала вызови list_nodes, проверь недостающие связи и узлы, доделай сценарий и вызови finish.";

export function buildStepLimitNotice(): string {
  return `Достигнут лимит шагов агента (${FLOW_AGENT_MAX_STEPS}). Схема собрана частично — можно продолжить генерацию.`;
}
