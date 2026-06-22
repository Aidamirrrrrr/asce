import type { FlowNodeData, FlowNodeTransientData } from "@/lib/flow/flow-schema";
import { dragLiftSpring, duration, gentleEase, nodeEnterSpring } from "@/lib/motion";

export function getNodeRevealMotionProps(data: FlowNodeData & FlowNodeTransientData) {
  const isExiting = data.isExiting === true;
  const isEntering = data.isEntering === true;
  const streamReveal = data.streamReveal === true;
  const isDragging = data.isDragging === true;
  const revealIndex = typeof data.revealIndex === "number" ? data.revealIndex : 0;

  // Нода перетаскивается: поднять. Когда isDragging станет false, framer-motion
  // автоматически вернёт ноду на место с transition из базового кейса ниже.
  if (isDragging) {
    return {
      initial: false as const,
      animate: { scale: 1.04, y: -6 },
      transition: dragLiftSpring,
    };
  }

  // Удаление: сжать и скрыть.
  if (isExiting) {
    return {
      initial: false as const,
      animate: { opacity: 0, scale: 0.92, y: -6 },
      transition: { duration: duration.normal, ease: gentleEase },
    };
  }

  // AI-стриминг: нода появляется снизу вверх с пружиной.
  if (streamReveal) {
    return {
      initial: { opacity: 0, scale: 0.88, y: 10 },
      animate: { opacity: 1, scale: 1, y: 0 },
      transition: nodeEnterSpring,
    };
  }

  // Базовый кейс (ручное добавление + snap-back после drag).
  return {
    initial: false as const,
    animate: {
      opacity: isEntering ? 0 : 1,
      scale: isEntering ? 0.92 : 1,
      y: isEntering ? 8 : 0,
    },
    transition: {
      ...nodeEnterSpring,
      delay: isEntering ? 0 : revealIndex * 0.06,
    },
  };
}
