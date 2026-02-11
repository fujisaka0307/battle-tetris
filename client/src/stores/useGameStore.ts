import { create } from 'zustand';
import { GameState } from '@battle-tetris/shared';

interface GameStoreState {
  gameState: GameState;
  score: number;
  level: number;
  lines: number;
  seed: number | null;

  setGameState: (state: GameState) => void;
  setScore: (score: number) => void;
  setLevel: (level: number) => void;
  setLines: (lines: number) => void;
  setSeed: (seed: number) => void;
  updateStats: (score: number, level: number, lines: number) => void;
  reset: () => void;
}

const initialState = {
  gameState: GameState.Idle,
  score: 0,
  level: 0,
  lines: 0,
  seed: null as number | null,
};

export const useGameStore = create<GameStoreState>((set) => ({
  ...initialState,

  setGameState: (gameState) => set({ gameState }),
  setScore: (score) => set({ score }),
  setLevel: (level) => set({ level }),
  setLines: (lines) => set({ lines }),
  setSeed: (seed) => set({ seed }),
  updateStats: (score, level, lines) => set({ score, level, lines }),
  reset: () => set({ ...initialState }),
}));
