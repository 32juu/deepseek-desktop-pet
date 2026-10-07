/**
 * 桌宠状态与表情定义。
 *
 * 唯一依据：docs/character-spec.md（由 assets/蓝色鱼尾女仆桌宠状态图鉴.png 提取）。
 * 本文件只描述**状态标识与元数据**，不含任何业务语义，也不做数据请求。
 */

/** 13 个核心状态标识，与 character-spec.md 第 2 节表格一一对应 */
export const PetState = {
  Idle: 'idle',
  Blink: 'blink',
  Sleep: 'sleep',
  Happy: 'happy',
  Thinking: 'thinking',
  Talking: 'talking',
  Loading: 'loading',
  Learning: 'learning',
  ThinkingHard: 'thinking_hard',
  Success: 'success',
  Concern: 'concern',
  Angry: 'angry',
  Celebration: 'celebration',
} as const;

export type PetStateId = (typeof PetState)[keyof typeof PetState];

/** 8 种表情，可与状态叠加（如 learning + confused） */
export const PetExpression = {
  Happy: 'happy',
  Shy: 'shy',
  Angry: 'angry',
  Surprised: 'surprised',
  Sad: 'sad',
  Confused: 'confused',
  Proud: 'proud',
  Helpless: 'helpless',
} as const;

export type PetExpressionId = (typeof PetExpression)[keyof typeof PetExpression];

/**
 * 状态层级，决定优先级（character-spec.md 第 6 节）：
 *   system > event > ambient
 * 高优先级状态会覆盖低优先级状态；同层内后发生的覆盖先发生的。
 */
export type PetStateTier = 'system' | 'event' | 'ambient';

export interface PetStateMeta {
  readonly id: PetStateId;
  readonly tier: PetStateTier;
  /** true = 单次播放后自动回落到基础状态（如眨眼）；false = 持续停留直到被替换 */
  readonly oneShot: boolean;
  /** 单次播放的默认时长（毫秒），仅 oneShot 有效 */
  readonly durationMs?: number;
  /** 中文名，用于设置页与调试面板 */
  readonly label: string;
}

export const PET_STATES: Readonly<Record<PetStateId, PetStateMeta>> = {
  [PetState.Idle]: { id: PetState.Idle, tier: 'ambient', oneShot: false, label: '待机' },
  [PetState.Blink]: { id: PetState.Blink, tier: 'ambient', oneShot: true, durationMs: 200, label: '眨眼' },
  [PetState.Sleep]: { id: PetState.Sleep, tier: 'ambient', oneShot: false, label: '睡眠' },
  [PetState.Learning]: { id: PetState.Learning, tier: 'ambient', oneShot: false, label: '学习中' },
  [PetState.Happy]: { id: PetState.Happy, tier: 'event', oneShot: true, durationMs: 1200, label: '开心' },
  [PetState.Thinking]: { id: PetState.Thinking, tier: 'event', oneShot: false, label: '思考' },
  [PetState.ThinkingHard]: { id: PetState.ThinkingHard, tier: 'event', oneShot: false, label: '深度学习' },
  [PetState.Success]: { id: PetState.Success, tier: 'event', oneShot: true, durationMs: 2000, label: '完成' },
  [PetState.Celebration]: { id: PetState.Celebration, tier: 'event', oneShot: true, durationMs: 3000, label: '庆祝' },
  [PetState.Concern]: { id: PetState.Concern, tier: 'event', oneShot: false, label: '关心提醒' },
  [PetState.Angry]: { id: PetState.Angry, tier: 'event', oneShot: true, durationMs: 1500, label: '小生气' },
  [PetState.Talking]: { id: PetState.Talking, tier: 'system', oneShot: false, label: '对话' },
  [PetState.Loading]: { id: PetState.Loading, tier: 'system', oneShot: false, label: '加载' },
};

const TIER_WEIGHT: Readonly<Record<PetStateTier, number>> = {
  ambient: 0,
  event: 1,
  system: 2,
};

export function tierWeight(state: PetStateId): number {
  return TIER_WEIGHT[PET_STATES[state].tier];
}

/**
 * 动作触发规则（character-spec.md 第 5 节）。
 * 键为业务事件名，值为应触发的状态。业务侧只发事件名，不直接指定状态 id，
 * 避免业务代码与视觉状态耦合。
 */
export const PET_ACTION_MAP = {
  LEARNING_STARTED: PetState.Learning,
  LEARNING_FINISHED: PetState.Success,
  QUESTION_CORRECT: PetState.Happy,
  QUESTION_WRONG: PetState.Angry,
  AI_THINKING: PetState.Loading,
  AI_REPLYING: PetState.Talking,
  LONG_IDLE_WARNING: PetState.Concern,
  STREAK_ACHIEVED: PetState.Celebration,
} as const;

export type PetAction = keyof typeof PET_ACTION_MAP;
