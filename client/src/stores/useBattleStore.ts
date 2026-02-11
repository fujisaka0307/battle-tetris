import { create } from 'zustand';
import type { Field, LoserReason } from '@battle-tetris/shared';

interface GameResultInfo {
  winner: string;
  loserReason: LoserReason;
}

interface BattleState {
  opponentField: Field | null;
  opponentScore: number;
  opponentLines: number;
  opponentLevel: number;
  pendingGarbage: number;
  result: GameResultInfo | null;
  opponentRematchRequested: boolean;

  setOpponentField: (field: Field, score: number, lines: number, level: number) => void;
  addPendingGarbage: (lines: number) => void;
  clearPendingGarbage: () => void;
  setResult: (result: GameResultInfo) => void;
  setOpponentRematchRequested: (requested: boolean) => void;
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
  reset: () => set({ ...initialState }),
}));
