import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PET_ACTION_MAP,
  PET_STATES,
  PetExpression,
  PetState,
  type PetAction,
  type PetExpressionId,
  type PetStateId,
  tierWeight,
} from './petStates';

interface PetMachineState {
  /** 当前生效状态 */
  state: PetStateId;
  /** 叠加表情，null 表示无 */
  expression: PetExpressionId | null;
}

/**
 * 桌宠状态机。
 *
 * 规则来源 docs/character-spec.md 第 6 节：
 *   1. 状态分层 system > event > ambient；
 *   2. oneShot 状态播放完自动回落到 ambient 基础态；
 *   3. 低优先级状态不能覆盖高优先级状态。
 *
 * 设计取舍：动画帧资源尚未接入，这里先把**状态流转**做对、可测试；
 * 表现层（Lottie/序列帧）只需根据 state 渲染即可，不需要改本文件。
 */
export function usePetMachine(initial: PetStateId = PetState.Idle) {
  const [machine, setMachine] = useState<PetMachineState>({ state: initial, expression: null });
  /** 主动设置的基础态（ambient），oneShot 结束后回落目标 */
  const baseStateRef = useRef<PetStateId>(initial);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  /**
   * 设置基础状态（常驻），如 idle / learning / sleep。
   * 若当前有更高优先级的临时状态在播放，则不抢占，只记录为回落目标。
   */
  const setBaseState = useCallback(
    (next: PetStateId) => {
      const meta = PET_STATES[next];
      if (meta.oneShot) {
        throw new Error(`setBaseState 不接受单次状态: ${next}，请用 trigger()`);
      }
      baseStateRef.current = next;
      setMachine((cur) => {
        if (tierWeight(cur.state) > tierWeight(next)) return cur;
        return { ...cur, state: next };
      });
    },
    [],
  );

  /** 触发事件动作，如 LEARNING_FINISHED（业务侧只发事件名） */
  const dispatchAction = useCallback(
    (action: PetAction) => {
      const next = PET_ACTION_MAP[action] as PetStateId;
      const meta = PET_STATES[next];

      if (!meta.oneShot) {
        // 持续型事件态：直接进入，直到被替换或调用 resetToBase
        clearTimer();
        setMachine((cur) => {
          if (tierWeight(cur.state) > tierWeight(next)) return cur;
          return { ...cur, state: next };
        });
        return;
      }

      // 单次型：播放 durationMs 后回落到基础态
      clearTimer();
      setMachine((cur) => {
        if (tierWeight(cur.state) > tierWeight(next)) return cur;
        return { ...cur, state: next };
      });
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setMachine({ state: baseStateRef.current, expression: null });
      }, meta.durationMs ?? 1000);
    },
    [clearTimer],
  );

  /** 主动回落到基础态（如对话结束后回到 idle） */
  const resetToBase = useCallback(() => {
    clearTimer();
    setMachine({ state: baseStateRef.current, expression: null });
  }, [clearTimer]);

  /** 叠加 / 清除表情 */
  const setExpression = useCallback((expr: PetExpressionId | null) => {
    setMachine((cur) => ({ ...cur, expression: expr }));
  }, []);

  return useMemo(
    () => ({
      state: machine.state,
      expression: machine.expression,
      meta: PET_STATES[machine.state],
      baseState: baseStateRef.current,
      setBaseState,
      dispatchAction,
      resetToBase,
      setExpression,
    }),
    [machine, setBaseState, dispatchAction, resetToBase, setExpression],
  );
}

export { PetState, PetExpression };
export type { PetAction, PetStateId, PetExpressionId };
