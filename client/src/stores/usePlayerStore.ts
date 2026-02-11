import { create } from 'zustand';
import type { ConnectionState } from '../network/SignalRClient';

interface PlayerState {
  nickname: string;
  roomId: string | null;
  connectionState: ConnectionState;
  opponentNickname: string | null;

  setNickname: (nickname: string) => void;
  setRoomId: (roomId: string | null) => void;
  setConnectionState: (state: ConnectionState) => void;
  setOpponentNickname: (nickname: string | null) => void;
  reset: () => void;
}

const initialState = {
  nickname: '',
  roomId: null as string | null,
  connectionState: 'disconnected' as ConnectionState,
  opponentNickname: null as string | null,
};

export const usePlayerStore = create<PlayerState>((set) => ({
  ...initialState,

  setNickname: (nickname) => set({ nickname }),
  setRoomId: (roomId) => set({ roomId }),
  setConnectionState: (connectionState) => set({ connectionState }),
  setOpponentNickname: (nickname) => set({ opponentNickname: nickname }),
  reset: () => set({ ...initialState }),
}));
