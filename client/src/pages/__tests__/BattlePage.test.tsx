import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import BattlePage from '../BattlePage';
import { signalRClient } from '../../network/SignalRClient';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { useGameStore } from '../../stores/useGameStore';
import { useBattleStore } from '../../stores/useBattleStore';
import { GameState } from '@battle-tetris/shared';

// Mock SignalR client
let signalRHandlers: Record<string, (...args: unknown[]) => unknown> = {};
vi.mock('../../network/SignalRClient', () => ({
  signalRClient: {
    setHandlers: vi.fn((handlers: Record<string, (...args: unknown[]) => unknown>) => {
      signalRHandlers = { ...signalRHandlers, ...handlers };
    }),
    sendLinesCleared: vi.fn(),
    sendGameOver: vi.fn(),
    sendFieldUpdate: vi.fn(),
  },
}));

// Mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Capture GameEngine callbacks
let capturedCallbacks: Record<string, (...args: unknown[]) => unknown> = {};
const mockEngineInstance = {
  start: vi.fn(),
  setCallbacks: vi.fn((cbs: Record<string, (...args: unknown[]) => unknown>) => {
    capturedCallbacks = { ...cbs };
  }),
  update: vi.fn(),
  currentPiece: { type: 0, rotation: 0, row: 1, col: 4 },
  bag: { peek: vi.fn().mockReturnValue([]) },
  board: { grid: [], getVisibleGrid: vi.fn().mockReturnValue([]) },
  getGhostRow: vi.fn().mockReturnValue(18),
  holdPiece: null,
  score: 0,
  level: 0,
  lines: 0,
  state: GameState.Playing,
  garbage: { add: vi.fn() },
  input: { attach: vi.fn(), detach: vi.fn() },
};

vi.mock('../../game/GameEngine', () => {
  return {
    GameEngine: class {
      constructor() {
        return mockEngineInstance;
      }
    },
  };
});

vi.mock('../../game/Renderer', () => {
  class MockRenderer {
    static fieldWidth = 300;
    static fieldHeight = 600;
    static miniFieldWidth = 140;
    static miniFieldHeight = 280;
    static nextQueueWidth = 96;
    static nextQueueHeight = 312;
    static holdWidth = 96;
    static holdHeight = 96;
    drawField = vi.fn();
    drawNextQueue = vi.fn();
    drawHold = vi.fn();
    drawOpponentField = vi.fn();
  }
  return { Renderer: MockRenderer };
});

// Mock canvas getContext
const mockGradient = { addColorStop: vi.fn() };
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 0,
  globalAlpha: 1,
  shadowColor: '',
  shadowBlur: 0,
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  createLinearGradient: vi.fn().mockReturnValue(mockGradient),
  createRadialGradient: vi.fn().mockReturnValue(mockGradient),
});

// Capture requestAnimationFrame callbacks
let rafCallbacks: ((time: number) => void)[] = [];
vi.stubGlobal('requestAnimationFrame', vi.fn((cb: (time: number) => void) => {
  rafCallbacks.push(cb);
  return rafCallbacks.length;
}));
vi.stubGlobal('cancelAnimationFrame', vi.fn());

function renderBattlePage(roomId = 'ABC123') {
  return render(
    <MemoryRouter initialEntries={[`/battle/${roomId}`]}>
      <Routes>
        <Route path="/battle/:roomId" element={<BattlePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BattlePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signalRHandlers = {};
    capturedCallbacks = {};
    rafCallbacks = [];
    usePlayerStore.getState().reset();
    useGameStore.getState().reset();
    useBattleStore.getState().reset();
    usePlayerStore.getState().setEnterpriseId('alice@dxc.com');
    useGameStore.getState().setSeed(42);
    mockEngineInstance.state = GameState.Playing;
    mockEngineInstance.score = 0;
    mockEngineInstance.level = 0;
    mockEngineInstance.lines = 0;
  });

  it('Canvas 要素がマウントされること', () => {
    renderBattlePage();
    expect(screen.getByTestId('game-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('opponent-canvas')).toBeInTheDocument();
  });

  it('スコアボードに初期値が表示されること', () => {
    renderBattlePage();
    expect(screen.getByTestId('score')).toHaveTextContent('0');
    expect(screen.getByTestId('level')).toHaveTextContent('0');
    expect(screen.getByTestId('lines')).toHaveTextContent('0');
  });

  it('スコアボードが表示されること', () => {
    renderBattlePage();
    expect(screen.getByTestId('scoreboard')).toBeInTheDocument();
  });

  it('enterpriseId 未設定でリダイレクトされること', () => {
    usePlayerStore.getState().reset();
    renderBattlePage();
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  // === C1 カバレッジ追加テスト ===

  it('onOpponentFieldUpdate ハンドラで相手フィールドが更新されること', () => {
    renderBattlePage();

    const field = [[1, 0], [0, 1]];
    act(() => {
      signalRHandlers.onOpponentFieldUpdate?.({
        field,
        score: 500,
        lines: 5,
        level: 2,
      });
    });

    const store = useBattleStore.getState();
    expect(store.opponentField).toEqual(field);
    expect(store.opponentScore).toBe(500);
    expect(store.opponentLines).toBe(5);
    expect(store.opponentLevel).toBe(2);
  });

  it('onReceiveGarbage ハンドラで pendingGarbage が増加すること', () => {
    renderBattlePage();

    act(() => {
      signalRHandlers.onReceiveGarbage?.({ lines: 3 });
    });

    expect(useBattleStore.getState().pendingGarbage).toBe(3);
  });

  it('onGameResult ハンドラで結果が保存され /result にナビゲートされること', () => {
    renderBattlePage();

    act(() => {
      signalRHandlers.onGameResult?.({
        winner: 'opponent-id',
        loserReason: 'gameover',
      });
    });

    expect(useBattleStore.getState().result).toEqual({
      winner: 'opponent-id',
      loserReason: 'gameover',
    });
    expect(mockNavigate).toHaveBeenCalledWith('/result');
  });

  it('onOpponentDisconnected ハンドラが呼び出し可能であること', () => {
    renderBattlePage();
    expect(() => signalRHandlers.onOpponentDisconnected?.()).not.toThrow();
  });

  it('onOpponentReconnected ハンドラが呼び出し可能であること', () => {
    renderBattlePage();
    expect(() => signalRHandlers.onOpponentReconnected?.()).not.toThrow();
  });

  it('pendingGarbage > 0 の場合にガーベジバーのフィルが表示されること', () => {
    useBattleStore.getState().addPendingGarbage(2);
    renderBattlePage();

    // Garbage bar should always exist, fill should be visible when > 0
    const bar = screen.getByTestId('garbage-bar');
    expect(bar).toBeInTheDocument();
    expect(bar.querySelector('.garbage-bar-fill')).toBeInTheDocument();
  });

  it('pendingGarbage = 0 の場合にガーベジバーのフィルが表示されないこと', () => {
    renderBattlePage();
    // Garbage bar element exists but has no fill child
    const bar = screen.getByTestId('garbage-bar');
    expect(bar).toBeInTheDocument();
    expect(bar.querySelector('.garbage-bar-fill')).not.toBeInTheDocument();
  });

  it('opponentEnterpriseId が null の場合に "Opponent" が表示されること', () => {
    usePlayerStore.getState().setOpponentEnterpriseId(null);
    renderBattlePage();

    expect(screen.getByText('Opponent')).toBeInTheDocument();
  });

  it('opponentEnterpriseId が設定されている場合にその名前が表示されること', () => {
    usePlayerStore.getState().setOpponentEnterpriseId('bob@dxc.com');
    renderBattlePage();

    expect(screen.getByText('bob@dxc.com')).toBeInTheDocument();
  });

  it('アンマウント時に cancelAnimationFrame が呼ばれること', () => {
    const { unmount } = renderBattlePage();
    unmount();

    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  // === Engine callback tests (lines 87-91) ===

  it('engine の onLinesCleared コールバックで sendLinesCleared が呼ばれること', () => {
    renderBattlePage();

    expect(mockEngineInstance.setCallbacks).toHaveBeenCalled();
    expect(capturedCallbacks.onLinesCleared).toBeDefined();

    act(() => {
      capturedCallbacks.onLinesCleared(2);
    });

    expect(signalRClient.sendLinesCleared).toHaveBeenCalledWith(2);
  });

  it('engine の onGameOver コールバックで GameOver 状態になり sendGameOver が呼ばれること', () => {
    renderBattlePage();

    expect(capturedCallbacks.onGameOver).toBeDefined();

    act(() => {
      capturedCallbacks.onGameOver();
    });

    expect(useGameStore.getState().gameState).toBe(GameState.GameOver);
    expect(signalRClient.sendGameOver).toHaveBeenCalled();
  });

  it('engine の onFieldUpdate コールバックでストアとSignalRが更新されること', () => {
    mockEngineInstance.score = 500;
    mockEngineInstance.level = 2;
    mockEngineInstance.lines = 10;
    renderBattlePage();

    expect(capturedCallbacks.onFieldUpdate).toBeDefined();

    act(() => {
      capturedCallbacks.onFieldUpdate();
    });

    expect(signalRClient.sendFieldUpdate).toHaveBeenCalled();
  });

  // === Game loop test (lines 116-141) ===

  it('requestAnimationFrame コールバックでエンジン更新と描画が行われること', () => {
    renderBattlePage();

    expect(rafCallbacks.length).toBeGreaterThan(0);

    const loopFn = rafCallbacks[rafCallbacks.length - 1];
    act(() => {
      loopFn(100); // first frame
    });

    act(() => {
      loopFn(116); // 16ms later
    });

    expect(mockEngineInstance.update).toHaveBeenCalled();
  });

  it('ゲームループでエンジン状態がPlaying以外の場合にrafが停止すること', () => {
    renderBattlePage();

    const loopFn = rafCallbacks[rafCallbacks.length - 1];
    mockEngineInstance.state = GameState.GameOver;

    const rafCountBefore = (requestAnimationFrame as any).mock.calls.length;
    act(() => {
      loopFn(100);
    });
    const rafCountAfter = (requestAnimationFrame as any).mock.calls.length;

    // raf should NOT have been called again since state is GameOver
    expect(rafCountAfter).toBe(rafCountBefore);
  });

  it('onReceiveGarbage で engineRef.current にもガーベジが追加されること', () => {
    renderBattlePage();

    act(() => {
      signalRHandlers.onReceiveGarbage?.({ lines: 4 });
    });

    expect(mockEngineInstance.garbage.add).toHaveBeenCalledWith(4);
  });

  it('seed が null の場合でもエンジンが初期化されること', () => {
    useGameStore.getState().reset(); // seed = null
    renderBattlePage();

    expect(mockEngineInstance.start).toHaveBeenCalled();
  });

  // === AiThinking テスト ===

  it('onAiThinking ハンドラが signalRClient.setHandlers に登録されること', () => {
    renderBattlePage();
    expect(signalRHandlers.onAiThinking).toBeDefined();
  });

  it('onAiThinking ハンドラで aiThinkingLog にエントリが追加されること', () => {
    renderBattlePage();

    act(() => {
      signalRHandlers.onAiThinking?.({
        prompt: 'Board:\n...........',
        response: '{"col": 3, "rotation": 0}',
        model: 'heuristic (Lv.5)',
        modelTier: 'Heuristic',
        temperature: 1.0,
        seq: 1,
      });
    });

    const store = useBattleStore.getState();
    expect(store.aiThinkingLog).toHaveLength(1);
    expect(store.aiThinkingLog[0].model).toBe('heuristic (Lv.5)');
    expect(store.aiThinkingLog[0].response).toBe('{"col": 3, "rotation": 0}');
    expect(store.aiThinkingLog[0].timestamp).toBeGreaterThan(0);
  });

  it('onAiThinking 後に AI 思考パネルが表示されること', () => {
    renderBattlePage();

    act(() => {
      signalRHandlers.onAiThinking?.({
        prompt: 'Board:\n...........',
        response: '{"col": 3, "rotation": 0}',
        model: 'heuristic (Lv.5)',
        modelTier: 'Heuristic',
        temperature: 1.0,
        seq: 1,
      });
    });

    expect(screen.getByTestId('ai-thinking-panel')).toBeInTheDocument();
    expect(screen.getByText('Prompt')).toBeInTheDocument();
    expect(screen.getByText('{"col": 3, "rotation": 0}')).toBeInTheDocument();
  });

  it('aiThinkingLog が空の場合に AI 思考パネルが表示されないこと', () => {
    renderBattlePage();
    expect(screen.queryByTestId('ai-thinking-panel')).not.toBeInTheDocument();
  });

  it('複数の AiThinking イベントで最新5件のみ保持されること', () => {
    renderBattlePage();

    act(() => {
      for (let i = 0; i < 7; i++) {
        signalRHandlers.onAiThinking?.({
          prompt: `prompt-${i}`,
          response: `response-${i}`,
          model: `model-${i}`,
          modelTier: 'Haiku',
          temperature: 0.5,
          seq: i + 1,
        });
      }
    });

    const store = useBattleStore.getState();
    expect(store.aiThinkingLog).toHaveLength(5);
    expect(store.aiThinkingLog[0].prompt).toBe('prompt-2');
    expect(store.aiThinkingLog[4].prompt).toBe('prompt-6');
  });
});
