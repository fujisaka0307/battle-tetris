import { create } from 'zustand';
import type { Field, LoserReason } from '@battle-tetris/shared';

interface GameResultInfo {
  winner: string;
  loserReason: LoserReason;
}

export interface AiThinkingEntry {
  prompt: string;
  response: string;
  model: string;
  modelTier: string;
  temperature: number;
  seq: number;
  timestamp: number;
}

interface BattleState {
  opponentField: Field | null;
  opponentScore: number;
  opponentLines: number;
  opponentLevel: number;
  pendingGarbage: number;
  result: GameResultInfo | null;
  opponentRematchRequested: boolean;
  aiThinkingLog: AiThinkingEntry[];

  setOpponentField: (field: Field, score: number, lines: number, level: number) => void;
  addPendingGarbage: (lines: number) => void;
  clearPendingGarbage: () => void;
  setResult: (result: GameResultInfo) => void;
  setOpponentRematchRequested: (requested: boolean) => void;
  addAiThinking: (entry: AiThinkingEntry) => void;
  reset: () => void;
}

const initialState = {
  opponentField: null as Field | null,
  opponentScore: 0,
  opponentLines: 0,
  opponentLevel: 0,
  pendingGarbage: 0,
  result: null as GameResultInfo | null,
  opponentRematchRequested: false,
  aiThinkingLog: [] as AiThinkingEntry[],
};

export const useBattleStore = create<BattleState>((set) => ({
  ...initialState,

  setOpponentField: (field, score, lines, level) =>
    set({ opponentField: field, opponentScore: score, opponentLines: lines, opponentLevel: level }),
  addPendingGarbage: (lines) =>
    set((s) => ({ pendingGarbage: s.pendingGarbage + lines })),
  clearPendingGarbage: () => set({ pendingGarbage: 0 }),
  setResult: (result) => set({ result }),
  setOpponentRematchRequested: (requested) => set({ opponentRematchRequested: requested }),
  addAiThinking: (entry) =>
    set((s) => ({ aiThinkingLog: [...s.aiThinkingLog, entry].slice(-5) })),
  reset: () => set({ ...initialState }),
}));
