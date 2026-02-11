import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

// Mock SignalR client
vi.mock('../network/SignalRClient', () => ({
  signalRClient: {
    state: 'disconnected',
    connect: vi.fn().mockResolvedValue(undefined),
    setHandlers: vi.fn(),
    sendCreateRoom: vi.fn(),
  },
}));

describe('Client smoke test', () => {
  it('renders the app title', () => {
    render(<App />);
    expect(screen.getByText('Battle Tetris')).toBeInTheDocument();
  });
});
