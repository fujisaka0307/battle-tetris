import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import TopPage from '../TopPage';
import { signalRClient } from '../../network/SignalRClient';
import { usePlayerStore } from '../../stores/usePlayerStore';

// Mock useAuth
vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    enterpriseId: 'test@dxc.com',
    login: vi.fn(),
    logout: vi.fn(),
    getToken: vi.fn().mockResolvedValue('test-token'),
  }),
}));

// Mock SignalR client
let capturedHandlers: Record<string, (...args: unknown[]) => unknown> = {};
vi.mock('../../network/SignalRClient', () => ({
  signalRClient: {
    state: 'disconnected',
    connect: vi.fn().mockResolvedValue(undefined),
    setHandlers: vi.fn((handlers: Record<string, (...args: unknown[]) => unknown>) => {
      capturedHandlers = { ...capturedHandlers, ...handlers };
    }),
    sendCreateRoom: vi.fn(),
    sendJoinRoom: vi.fn(),
    sendJoinRandomMatch: vi.fn(),
    sendSubscribeRoomList: vi.fn(),
    sendUnsubscribeRoomList: vi.fn(),
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

function renderTopPage() {
  return render(
    <MemoryRouter>
      <TopPage />
    </MemoryRouter>,
  );
}

describe('TopPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedHandlers = {};
    usePlayerStore.getState().reset();
    (signalRClient as any).state = 'disconnected';
  });

  it('タイトルが表示されること', () => {
    renderTopPage();
    expect(screen.getByText('Battle Tetris')).toBeInTheDocument();
  });

  it('Enterprise ID が表示されること', () => {
    renderTopPage();
    expect(screen.getByTestId('enterprise-id')).toHaveTextContent('test@dxc.com');
  });

  it('ルーム作成ボタンが表示されること', () => {
    renderTopPage();
    expect(screen.getByTestId('create-room-btn')).toBeInTheDocument();
  });

  it('ランダムマッチボタンが表示されること', () => {
    renderTopPage();
    expect(screen.getByTestId('random-match-btn')).toBeInTheDocument();
  });

  it('ルーム作成ボタンクリックで SignalR の CreateRoom が呼ばれること', async () => {
    (signalRClient as any).state = 'connected';
    renderTopPage();

    await userEvent.click(screen.getByTestId('create-room-btn'));

    expect(signalRClient.sendCreateRoom).toHaveBeenCalledWith();
  });

  it('ルームID入力 + 参加ボタンで JoinRoom が呼ばれること', async () => {
    (signalRClient as any).state = 'connected';
    renderTopPage();

    await userEvent.type(screen.getByTestId('room-id-input'), 'ABC123');
    await userEvent.click(screen.getByTestId('join-room-btn'));

    expect(signalRClient.sendJoinRoom).toHaveBeenCalledWith('ABC123');
  });

  it('ランダムマッチボタンで JoinRandomMatch が呼ばれること', async () => {
    (signalRClient as any).state = 'connected';
    renderTopPage();

    await userEvent.click(screen.getByTestId('random-match-btn'));

    expect(signalRClient.sendJoinRandomMatch).toHaveBeenCalledWith();
  });

  // === C1 カバレッジ追加テスト ===

  it('未接続時にルーム作成で connect() が呼ばれること', async () => {
    (signalRClient as any).state = 'disconnected';
    renderTopPage();

    await userEvent.click(screen.getByTestId('create-room-btn'));

    expect(signalRClient.connect).toHaveBeenCalled();
  });

  it('接続済みの場合 connect() が呼ばれないこと (ensureConnected early return)', async () => {
    (signalRClient as any).state = 'connected';
    renderTopPage();

    await userEvent.click(screen.getByTestId('create-room-btn'));

    expect(signalRClient.connect).not.toHaveBeenCalled();
  });

  it('connect() 失敗でエラーメッセージが表示されること', async () => {
    (signalRClient as any).state = 'disconnected';
    (signalRClient.connect as any).mockRejectedValue(new Error('fail'));
    renderTopPage();

    await userEvent.click(screen.getByTestId('create-room-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeInTheDocument();
    });
    (signalRClient.connect as any).mockResolvedValue(undefined);
  });

  it('onRoomCreated ハンドラでロビーにナビゲートされること', async () => {
    (signalRClient as any).state = 'connected';
    renderTopPage();

    await userEvent.click(screen.getByTestId('create-room-btn'));

    act(() => {
      capturedHandlers.onRoomCreated?.({ roomId: 'XYZ789' });
    });

    expect(mockNavigate).toHaveBeenCalledWith('/lobby/XYZ789');
  });

  it('onError ハンドラでエラーメッセージが表示されること', async () => {
    (signalRClient as any).state = 'connected';
    renderTopPage();

    await userEvent.click(screen.getByTestId('create-room-btn'));

    act(() => {
      capturedHandlers.onError?.({ message: 'ルームが見つかりません' });
    });

    expect(screen.getByTestId('error-message')).toHaveTextContent('ルームが見つかりません');
  });

  it('JoinRoom の onOpponentJoined ハンドラでロビーにナビゲートされること', async () => {
    (signalRClient as any).state = 'connected';
    renderTopPage();

    await userEvent.type(screen.getByTestId('room-id-input'), 'ABC123');
    await userEvent.click(screen.getByTestId('join-room-btn'));

    act(() => {
      capturedHandlers.onOpponentJoined?.({ enterpriseId: 'alice@dxc.com' });
    });

    expect(mockNavigate).toHaveBeenCalledWith('/lobby/ABC123');
  });

  it('onMatchFound ハンドラでロビーにナビゲートされること', async () => {
    (signalRClient as any).state = 'connected';
    renderTopPage();

    await userEvent.click(screen.getByTestId('random-match-btn'));

    act(() => {
      capturedHandlers.onMatchFound?.({
        roomId: 'MATCH1',
        opponentEnterpriseId: 'dave@dxc.com',
      });
    });

    expect(mockNavigate).toHaveBeenCalledWith('/lobby/MATCH1');
    expect(usePlayerStore.getState().opponentEnterpriseId).toBe('dave@dxc.com');
  });

  it('ランダムマッチの onError でエラーが表示されること', async () => {
    (signalRClient as any).state = 'connected';
    renderTopPage();

    await userEvent.click(screen.getByTestId('random-match-btn'));

    act(() => {
      capturedHandlers.onError?.({ message: 'マッチングに失敗しました' });
    });

    expect(screen.getByTestId('error-message')).toHaveTextContent('マッチングに失敗しました');
  });

  it('JoinRoom 接続失敗でエラーメッセージが表示されること', async () => {
    (signalRClient as any).state = 'disconnected';
    (signalRClient.connect as any).mockRejectedValue(new Error('fail'));
    renderTopPage();

    await userEvent.type(screen.getByTestId('room-id-input'), 'ABC123');
    await userEvent.click(screen.getByTestId('join-room-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeInTheDocument();
    });
    (signalRClient.connect as any).mockResolvedValue(undefined);
  });

  it('ランダムマッチ接続失敗でエラーメッセージが表示されること', async () => {
    (signalRClient as any).state = 'disconnected';
    (signalRClient.connect as any).mockRejectedValue(new Error('fail'));
    renderTopPage();

    await userEvent.click(screen.getByTestId('random-match-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeInTheDocument();
    });
    (signalRClient.connect as any).mockResolvedValue(undefined);
  });

  it('ルームID入力が大文字に変換されること', async () => {
    renderTopPage();
    await userEvent.type(screen.getByTestId('room-id-input'), 'abc123');
    expect(screen.getByTestId('room-id-input')).toHaveValue('ABC123');
  });

  it('JoinRoom の onError でエラーが表示されること', async () => {
    (signalRClient as any).state = 'connected';
    renderTopPage();

    await userEvent.type(screen.getByTestId('room-id-input'), 'ABC123');
    await userEvent.click(screen.getByTestId('join-room-btn'));

    act(() => {
      capturedHandlers.onError?.({ message: 'ルームが見つかりません' });
    });

    expect(screen.getByTestId('error-message')).toHaveTextContent('ルームが見つかりません');
  });

  it('handleJoinRoom で roomIdValid が false の場合ボタンが無効のこと', async () => {
    (signalRClient as any).state = 'connected';
    renderTopPage();

    // Only 2 chars - not valid (needs 6 alphanumeric)
    await userEvent.type(screen.getByTestId('room-id-input'), 'AB');

    expect(screen.getByTestId('join-room-btn')).toBeDisabled();
  });
});
