import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { NICKNAME_MIN_LENGTH, NICKNAME_MAX_LENGTH, ROOM_ID_LENGTH } from '@battle-tetris/shared';
import type { WaitingRoomInfo } from '@battle-tetris/shared';
import { signalRClient } from '../network/SignalRClient';
import { usePlayerStore } from '../stores/usePlayerStore';

export default function TopPage() {
  const navigate = useNavigate();
  const { setNickname: storeNickname, setRoomId } = usePlayerStore();

  const [nickname, setNickname] = useState('');
  const [roomId, setRoomId_] = useState('');
  const [error, setError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [waitingRooms, setWaitingRooms] = useState<WaitingRoomInfo[]>([]);
  const subscribedRef = useRef(false);
  const connectingPromiseRef = useRef<Promise<boolean> | null>(null);

  const nicknameValid =
    nickname.trim().length >= NICKNAME_MIN_LENGTH &&
    nickname.trim().length <= NICKNAME_MAX_LENGTH;

  const roomIdValid = /^[A-Za-z0-9]{6}$/.test(roomId);

  const nicknameError =
    nickname.length > NICKNAME_MAX_LENGTH
      ? `ニックネームは${NICKNAME_MAX_LENGTH}文字以内で入力してください`
      : '';

  const ensureConnected = useCallback(async () => {
    if (signalRClient.state === 'connected') return true;
    if (connectingPromiseRef.current) return connectingPromiseRef.current;
    setIsConnecting(true);
    const promise = (async () => {
      try {
        const url = import.meta.env.VITE_SIGNALR_URL || '/hub';
        await signalRClient.connect(url);
        return true;
      } catch {
        setError('サーバーに接続できませんでした');
        return false;
      } finally {
        setIsConnecting(false);
        connectingPromiseRef.current = null;
      }
    })();
    connectingPromiseRef.current = promise;
    return promise;
  }, []);

  // Early connection and room list subscription
  useEffect(() => {
    let cancelled = false;
    const connectAndSubscribe = async () => {
      const connected = await ensureConnected();
      if (!cancelled && connected && signalRClient.state === 'connected') {
        signalRClient.setHandlers({
          onWaitingRoomListUpdated: (payload) => {
            if (!cancelled) setWaitingRooms(payload.rooms);
          },
        });
        signalRClient.sendSubscribeRoomList();
        subscribedRef.current = true;
      }
    };
    connectAndSubscribe();
    return () => {
      cancelled = true;
      if (subscribedRef.current) {
        signalRClient.sendUnsubscribeRoomList();
        subscribedRef.current = false;
      }
    };
  }, [ensureConnected]);

  const subscribeIfNeeded = useCallback(() => {
    if (!subscribedRef.current && signalRClient.state === 'connected') {
      signalRClient.sendSubscribeRoomList();
      subscribedRef.current = true;
    }
  }, []);

  const handleCreateRoom = useCallback(async () => {
    if (!nicknameValid) return;
    setError('');
    const trimmed = nickname.trim();
    storeNickname(trimmed);

    if (!(await ensureConnected())) return;

    signalRClient.setHandlers({
      onRoomCreated: (payload) => {
        setRoomId(payload.roomId);
        navigate(`/lobby/${payload.roomId}`);
      },
      onWaitingRoomListUpdated: (payload) => setWaitingRooms(payload.rooms),
      onError: (payload) => setError(payload.message),
    });

    subscribeIfNeeded();
    signalRClient.sendCreateRoom(trimmed);
  }, [nickname, nicknameValid, storeNickname, ensureConnected, setRoomId, navigate, subscribeIfNeeded]);

  const handleJoinRoom = useCallback(async () => {
    if (!nicknameValid || !roomIdValid) return;
    setError('');
    const trimmed = nickname.trim();
    storeNickname(trimmed);

    if (!(await ensureConnected())) return;

    signalRClient.setHandlers({
      onOpponentJoined: (payload) => {
        setRoomId(roomId.toUpperCase());
        usePlayerStore.getState().setOpponentNickname(payload.nickname);
        navigate(`/lobby/${roomId.toUpperCase()}`);
      },
      onWaitingRoomListUpdated: (payload) => setWaitingRooms(payload.rooms),
      onError: (payload) => setError(payload.message),
    });

    subscribeIfNeeded();
    signalRClient.sendJoinRoom(trimmed, roomId.toUpperCase());
  }, [nickname, nicknameValid, roomId, roomIdValid, storeNickname, ensureConnected, setRoomId, navigate, subscribeIfNeeded]);

  const handleRandomMatch = useCallback(async () => {
    if (!nicknameValid) return;
    setError('');
    const trimmed = nickname.trim();
    storeNickname(trimmed);

    if (!(await ensureConnected())) return;

    signalRClient.setHandlers({
      onMatchFound: (payload) => {
        setRoomId(payload.roomId);
        usePlayerStore.getState().setOpponentNickname(payload.opponentNickname);
        navigate(`/lobby/${payload.roomId}`);
      },
      onWaitingRoomListUpdated: (payload) => setWaitingRooms(payload.rooms),
      onError: (payload) => setError(payload.message),
    });

    subscribeIfNeeded();
    signalRClient.sendJoinRandomMatch(trimmed);
  }, [nickname, nicknameValid, storeNickname, ensureConnected, setRoomId, navigate, subscribeIfNeeded]);

  const handleJoinFromList = useCallback(async (targetRoomId: string) => {
    if (!nicknameValid) {
      setError('ニックネームを入力してください');
      return;
    }
    setError('');
    const trimmed = nickname.trim();
    storeNickname(trimmed);

    if (!(await ensureConnected())) return;

    signalRClient.setHandlers({
      onOpponentJoined: (payload) => {
        setRoomId(targetRoomId);
        usePlayerStore.getState().setOpponentNickname(payload.nickname);
        navigate(`/lobby/${targetRoomId}`);
      },
      onWaitingRoomListUpdated: (payload) => setWaitingRooms(payload.rooms),
      onError: (payload) => setError(payload.message),
    });

    subscribeIfNeeded();
    signalRClient.sendJoinRoom(trimmed, targetRoomId);
  }, [nickname, nicknameValid, storeNickname, ensureConnected, setRoomId, navigate, subscribeIfNeeded]);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-5xl font-bold mb-2 text-cyan-400">Battle Tetris</h1>
      <p className="text-gray-400 mb-8">Online</p>

      {/* Nickname input */}
      <div className="w-full max-w-sm mb-6">
        <label htmlFor="nickname" className="block text-sm text-gray-300 mb-1">
          ニックネーム
        </label>
        <input
          id="nickname"
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={NICKNAME_MAX_LENGTH + 1}
          placeholder="1〜16文字"
          className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400"
          data-testid="nickname-input"
        />
        {nicknameError && (
          <p className="text-red-400 text-sm mt-1" data-testid="nickname-error">
            {nicknameError}
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div className="w-full max-w-sm space-y-3">
        <button
          onClick={handleCreateRoom}
          disabled={!nicknameValid || isConnecting}
          className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 rounded font-bold transition-colors"
          data-testid="create-room-btn"
        >
          ルームを作成
        </button>

        <div className="flex gap-2">
          <input
            type="text"
            value={roomId}
            onChange={(e) => setRoomId_(e.target.value.toUpperCase())}
            maxLength={ROOM_ID_LENGTH}
            placeholder="ルームID (6桁)"
            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 uppercase"
            data-testid="room-id-input"
          />
          <button
            onClick={handleJoinRoom}
            disabled={!nicknameValid || !roomIdValid || isConnecting}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 rounded font-bold transition-colors"
            data-testid="join-room-btn"
          >
            参加
          </button>
        </div>

        <button
          onClick={handleRandomMatch}
          disabled={!nicknameValid || isConnecting}
          className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 rounded font-bold transition-colors"
          data-testid="random-match-btn"
        >
          ランダムマッチ
        </button>
      </div>

      {/* Waiting Room List */}
      {waitingRooms.length > 0 && (
        <div className="w-full max-w-sm mt-6" data-testid="waiting-room-list">
          <h2 className="text-sm text-gray-300 mb-2">待機中のルーム</h2>
          <div className="space-y-2">
            {waitingRooms.map((room) => (
              <div
                key={room.roomId}
                className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded px-3 py-2"
                data-testid="waiting-room-item"
              >
                <div className="flex gap-3 items-center">
                  <span className="text-cyan-400 font-mono text-sm" data-testid="waiting-room-id">
                    {room.roomId}
                  </span>
                  <span className="text-gray-300 text-sm" data-testid="waiting-room-creator">
                    {room.creatorNickname}
                  </span>
                </div>
                <button
                  onClick={() => handleJoinFromList(room.roomId)}
                  disabled={!nicknameValid || isConnecting}
                  className="px-3 py-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm font-bold transition-colors"
                  data-testid="waiting-room-join-btn"
                >
                  参加
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-red-400 mt-4" data-testid="error-message">
          {error}
        </p>
      )}

      {isConnecting && (
        <p className="text-gray-400 mt-4">接続中...</p>
      )}
    </div>
  );
}
