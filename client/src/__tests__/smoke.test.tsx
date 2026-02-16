import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

// Mock useAuth
vi.mock('../auth/useAuth', () => ({
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
vi.mock('../network/SignalRClient', () => ({
  signalRClient: {
    state: 'disconnected',
    connect: vi.fn().mockResolvedValue(undefined),
    setHandlers: vi.fn(),
    sendCreateRoom: vi.fn(),
    sendSubscribeRoomList: vi.fn(),
    sendUnsubscribeRoomList: vi.fn(),
  },
}));

describe('Client smoke test', () => {
  it('renders the app title', () => {
    render(<App />);
    expect(screen.getByText('Battle Tetris')).toBeInTheDocument();
  });
});
