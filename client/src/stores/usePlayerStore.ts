import { create } from 'zustand';
import type { ConnectionState } from '../network/SignalRClient';

interface PlayerState {
  enterpriseId: string;
  roomId: string | null;
  connectionState: ConnectionState;
  opponentEnterpriseId: string | null;

  setEnterpriseId: (enterpriseId: string) => void;
  setRoomId: (roomId: string | null) => void;
  setConnectionState: (state: ConnectionState) => void;
  setOpponentEnterpriseId: (enterpriseId: string | null) => void;
  reset: () => void;
}

const initialState = {
  enterpriseId: '',
  roomId: null as string | null,
  connectionState: 'disconnected' as ConnectionState,
  opponentEnterpriseId: null as string | null,
};

export const usePlayerStore = create<PlayerState>((set) => ({
  ...initialState,

  setEnterpriseId: (enterpriseId) => set({ enterpriseId }),
  setRoomId: (roomId) => set({ roomId }),
  setConnectionState: (connectionState) => set({ connectionState }),
  setOpponentEnterpriseId: (enterpriseId) => set({ opponentEnterpriseId: enterpriseId }),
  reset: () => set({ ...initialState }),
}));
