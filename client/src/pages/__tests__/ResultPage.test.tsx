import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GameState, LoserReason } from '@battle-tetris/shared';
import ResultPage from '../ResultPage';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { useGameStore } from '../../stores/useGameStore';
import { useBattleStore } from '../../stores/useBattleStore';

// Mock SignalR client
let signalRHandlers: Record<string, (...args: unknown[]) => unknown> = {};
vi.mock('../../network/SignalRClient', () => ({
  signalRClient: {
    setHandlers: vi.fn((handlers: Record<string, (...args: unknown[]) => unknown>) => {
      signalRHandlers = { ...signalRHandlers, ...handlers };
    }),
    sendRequestRematch: vi.fn(),
    sendLeaveRoom: vi.fn(),
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

function renderResultPage() {
  return render(
    <MemoryRouter initialEntries={['/result']}>
      <Routes>
        <Route path="/result" element={<ResultPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ResultPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signalRHandlers = {};
    usePlayerStore.getState().reset();
    useGameStore.getState().reset();
    useBattleStore.getState().reset();
    usePlayerStore.getState().setEnterpriseId('alice@dxc.com');
  });

  it('敗北時に「LOSE」が表示されること', () => {
    useGameStore.getState().setGameState(GameState.GameOver);
    useBattleStore.getState().setResult({
      winner: 'opponent-id',
      loserReason: LoserReason.GameOver,
    });

    renderResultPage();
    expect(screen.getByTestId('result-text')).toHaveTextContent('LOSE');
  });

  it('勝利時に「WIN」が表示されること', () => {
    useGameStore.getState().setGameState(GameState.Playing);
    useBattleStore.getState().setResult({
      winner: 'my-id',
      loserReason: LoserReason.GameOver,
    });

    renderResultPage();
    expect(screen.getByTestId('result-text')).toHaveTextContent('WIN');
  });

  it('スコアが正しく表示されること', () => {
    useGameStore.getState().updateStats(1500, 3, 25);
    renderResultPage();

    expect(screen.getByTestId('result-score')).toHaveTextContent('1500');
    expect(screen.getByTestId('result-lines')).toHaveTextContent('25');
    expect(screen.getByTestId('result-level')).toHaveTextContent('3');
  });

  it('再戦ボタンクリックで RequestRematch が送信されること', async () => {
    const { signalRClient } = await import('../../network/SignalRClient');
    renderResultPage();

    await userEvent.click(screen.getByTestId('rematch-btn'));

    expect(signalRClient.sendRequestRematch).toHaveBeenCalled();
  });

  it('トップへ戻るボタンでナビゲートされること', async () => {
    renderResultPage();

    await userEvent.click(screen.getByTestId('go-top-btn'));

    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('相手の再戦要求が表示されること', () => {
    useBattleStore.getState().setOpponentRematchRequested(true);
    renderResultPage();

    expect(screen.getByTestId('opponent-rematch')).toBeInTheDocument();
  });

  // === C1 カバレッジ追加テスト ===

  it('相手の再戦要求がない場合はテキストが表示されないこと', () => {
    renderResultPage();
    expect(screen.queryByTestId('opponent-rematch')).not.toBeInTheDocument();
  });

  it('トップへ戻るボタンで全ストアがリセットされること', async () => {
    useGameStore.getState().setGameState(GameState.GameOver);
    useGameStore.getState().updateStats(1000, 5, 50);
    useBattleStore.getState().setResult({
      winner: 'x',
      loserReason: LoserReason.GameOver,
    });

    renderResultPage();
    await userEvent.click(screen.getByTestId('go-top-btn'));

    expect(usePlayerStore.getState().enterpriseId).toBe('');
    expect(useGameStore.getState().gameState).toBe(GameState.Idle);
    expect(useBattleStore.getState().result).toBeNull();
  });

  it('トップへ戻るボタンで sendLeaveRoom が呼ばれること', async () => {
    const { signalRClient } = await import('../../network/SignalRClient');
    renderResultPage();

    await userEvent.click(screen.getByTestId('go-top-btn'));

    expect(signalRClient.sendLeaveRoom).toHaveBeenCalled();
  });

  it('再戦ボタンで opponentRematchRequested が false にリセットされること', async () => {
    useBattleStore.getState().setOpponentRematchRequested(true);
    renderResultPage();

    await userEvent.click(screen.getByTestId('rematch-btn'));

    expect(useBattleStore.getState().opponentRematchRequested).toBe(false);
  });

  it('onOpponentRematch ハンドラで opponentRematchRequested が true になること', async () => {
    renderResultPage();

    // Trigger the onOpponentRematch handler registered by the component
    const { act } = await import('@testing-library/react');
    act(() => {
      signalRHandlers.onOpponentRematch?.();
    });

    expect(useBattleStore.getState().opponentRematchRequested).toBe(true);
  });

  it('Disconnect による敗北でも LOSE が表示されること', () => {
    useGameStore.getState().setGameState(GameState.GameOver);
    useBattleStore.getState().setResult({
      winner: 'opponent-id',
      loserReason: LoserReason.Disconnect,
    });

    renderResultPage();
    expect(screen.getByTestId('result-text')).toHaveTextContent('LOSE');
  });

  it('Idle 状態の場合は WIN と判定されること', () => {
    useGameStore.getState().setGameState(GameState.Idle);
    renderResultPage();
    expect(screen.getByTestId('result-text')).toHaveTextContent('WIN');
  });

  it('スコア0, ライン0, レベル0 が正しく表示されること', () => {
    renderResultPage();

    expect(screen.getByTestId('result-score')).toHaveTextContent('0');
    expect(screen.getByTestId('result-lines')).toHaveTextContent('0');
    expect(screen.getByTestId('result-level')).toHaveTextContent('0');
  });
});
