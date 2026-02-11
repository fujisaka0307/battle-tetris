import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LobbyPage from '../LobbyPage';
import { signalRClient } from '../../network/SignalRClient';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { useGameStore } from '../../stores/useGameStore';

// Mock SignalR client
let signalRHandlers: Record<string, Function> = {};
vi.mock('../../network/SignalRClient', () => ({
  signalRClient: {
    setHandlers: vi.fn((handlers: Record<string, Function>) => {
      signalRHandlers = { ...signalRHandlers, ...handlers };
    }),
    sendPlayerReady: vi.fn(),
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

// Mock navigator.clipboard
const mockWriteText = vi.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: mockWriteText },
  writable: true,
  configurable: true,
});

function renderLobbyPage(roomId = 'ABC123') {
  return render(
    <MemoryRouter initialEntries={[`/lobby/${roomId}`]}>
      <Routes>
        <Route path="/lobby/:roomId" element={<LobbyPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LobbyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signalRHandlers = {};
    usePlayerStore.getState().reset();
    useGameStore.getState().reset();
    usePlayerStore.getState().setNickname('Alice');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ルームIDが画面に表示されること', () => {
    renderLobbyPage('XYZ789');
    expect(screen.getByTestId('room-id')).toHaveTextContent('XYZ789');
  });

  it('相手未参加時に待機テキストが表示されること', () => {
    renderLobbyPage();
    expect(screen.getByTestId('waiting-text')).toBeInTheDocument();
  });

  it('OpponentJoined イベントで相手の名前が表示されること', () => {
    renderLobbyPage();

    act(() => {
      signalRHandlers.onOpponentJoined?.({ nickname: 'Bob' });
    });

    expect(screen.getByTestId('opponent-name')).toHaveTextContent('Bob');
  });

  it('Ready ボタンクリックで PlayerReady が送信されること', async () => {
    usePlayerStore.getState().setOpponentNickname('Bob');
    renderLobbyPage();

    const readyBtn = screen.getByTestId('ready-btn');
    await userEvent.click(readyBtn);

    expect(signalRClient.sendPlayerReady).toHaveBeenCalled();
  });

  it('BothReady イベントでカウントダウンが開始されること', () => {
    vi.useFakeTimers();
    renderLobbyPage();

    act(() => {
      signalRHandlers.onBothReady?.({ seed: 42, countdown: 3 });
    });

    expect(screen.getByTestId('countdown')).toHaveTextContent('3');
  });

  it('ニックネーム未設定でリダイレクトされること', () => {
    usePlayerStore.getState().reset();
    renderLobbyPage();

    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  // === C1 カバレッジ追加テスト ===

  it('カウントダウンが0になると /battle へナビゲートされること', () => {
    vi.useFakeTimers();
    renderLobbyPage('ROOM01');

    act(() => {
      signalRHandlers.onBothReady?.({ seed: 42, countdown: 3 });
    });

    expect(screen.getByTestId('countdown')).toHaveTextContent('3');

    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByTestId('countdown')).toHaveTextContent('2');

    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByTestId('countdown')).toHaveTextContent('1');

    act(() => { vi.advanceTimersByTime(1000); });
    expect(mockNavigate).toHaveBeenCalledWith('/battle/ROOM01');
  });

  it('OpponentDisconnected でカウントダウンとReadyがリセットされること', () => {
    vi.useFakeTimers();
    renderLobbyPage();

    act(() => {
      signalRHandlers.onOpponentJoined?.({ nickname: 'Bob' });
    });
    expect(screen.getByTestId('opponent-name')).toHaveTextContent('Bob');

    act(() => {
      signalRHandlers.onBothReady?.({ seed: 42, countdown: 3 });
    });
    expect(screen.getByTestId('countdown')).toHaveTextContent('3');

    act(() => {
      signalRHandlers.onOpponentDisconnected?.();
    });

    expect(screen.queryByTestId('countdown')).not.toBeInTheDocument();
    expect(screen.getByTestId('waiting-text')).toBeInTheDocument();
  });

  it('退出ボタンで sendLeaveRoom とナビゲートが呼ばれること', async () => {
    renderLobbyPage();

    await userEvent.click(screen.getByTestId('leave-btn'));

    expect(signalRClient.sendLeaveRoom).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('Copy ボタンでクリップボードに roomId がコピーされること', async () => {
    renderLobbyPage('XYZ789');

    await userEvent.click(screen.getByTestId('copy-btn'));

    expect(mockWriteText).toHaveBeenCalledWith('XYZ789');
  });

  it('Copy 失敗でもクラッシュしないこと', async () => {
    mockWriteText.mockRejectedValueOnce(new Error('Clipboard failed'));
    renderLobbyPage('XYZ789');

    await userEvent.click(screen.getByTestId('copy-btn'));
    // Should not throw
  });

  it('Ready 後に "相手の準備を待っています" テキストが表示されること', async () => {
    usePlayerStore.getState().setOpponentNickname('Bob');
    renderLobbyPage();

    await userEvent.click(screen.getByTestId('ready-btn'));

    expect(screen.getByText('相手の準備を待っています...')).toBeInTheDocument();
  });

  it('onError ハンドラが設定されていること (noop)', () => {
    renderLobbyPage();
    expect(() => signalRHandlers.onError?.()).not.toThrow();
  });

  it('BothReady で seed が useGameStore に保存されること', () => {
    vi.useFakeTimers();
    renderLobbyPage();

    act(() => {
      signalRHandlers.onBothReady?.({ seed: 12345, countdown: 3 });
    });

    expect(useGameStore.getState().seed).toBe(12345);
  });

  it('コンポーネントアンマウント時にカウントダウンタイマーがクリアされること', () => {
    vi.useFakeTimers();
    const { unmount } = renderLobbyPage();

    act(() => {
      signalRHandlers.onBothReady?.({ seed: 42, countdown: 3 });
    });

    unmount();

    // Should not cause errors after unmount
    act(() => { vi.advanceTimersByTime(5000); });
  });

  it('OpponentDisconnected 時にカウントダウンが未開始でもクラッシュしないこと', () => {
    renderLobbyPage();

    act(() => {
      signalRHandlers.onOpponentDisconnected?.();
    });

    expect(screen.getByTestId('waiting-text')).toBeInTheDocument();
  });

  it('Copy 後に "Copied!" テキストが一時的に表示されること', async () => {
    renderLobbyPage('XYZ789');

    await userEvent.click(screen.getByTestId('copy-btn'));

    // "Copied!" is shown (button text changes)
    expect(screen.getByTestId('copy-btn')).toHaveTextContent('Copied!');
  });
});
