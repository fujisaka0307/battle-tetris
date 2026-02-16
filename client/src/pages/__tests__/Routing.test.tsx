import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../../App';
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
vi.mock('../../network/SignalRClient', () => ({
  signalRClient: {
    state: 'disconnected',
    connect: vi.fn().mockResolvedValue(undefined),
    setHandlers: vi.fn(),
    sendCreateRoom: vi.fn(),
    sendJoinRoom: vi.fn(),
    sendJoinRandomMatch: vi.fn(),
    sendPlayerReady: vi.fn(),
    sendLeaveRoom: vi.fn(),
    sendRequestRematch: vi.fn(),
    sendLinesCleared: vi.fn(),
    sendGameOver: vi.fn(),
    sendFieldUpdate: vi.fn(),
    sendSubscribeRoomList: vi.fn(),
    sendUnsubscribeRoomList: vi.fn(),
  },
}));

// Mock canvas for BattlePage
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 0,
  globalAlpha: 1,
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  clearRect: vi.fn(),
});

vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
vi.stubGlobal('cancelAnimationFrame', vi.fn());

describe('Routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePlayerStore.getState().reset();
    // Reset URL to root
    window.history.pushState({}, '', '/');
  });

  it('/ でトップ画面が表示されること', () => {
    render(<App />);
    expect(screen.getByText('Battle Tetris')).toBeInTheDocument();
  });

  it('存在しないパスで 404 が表示されること', () => {
    window.history.pushState({}, '', '/nonexistent-page');
    render(<App />);
    expect(screen.getByText('404')).toBeInTheDocument();
  });
});
