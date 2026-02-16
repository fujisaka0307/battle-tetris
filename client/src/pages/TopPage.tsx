import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROOM_ID_LENGTH } from '@battle-tetris/shared';
import type { WaitingRoomInfo } from '@battle-tetris/shared';
import { signalRClient } from '../network/SignalRClient';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useAuth } from '../auth/useAuth';

export default function TopPage() {
  const navigate = useNavigate();
  const { setEnterpriseId: storeEnterpriseId, setRoomId } = usePlayerStore();
  const { enterpriseId, logout, getToken } = useAuth();

  const [roomId, setRoomId_] = useState('');
  const [error, setError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [waitingRooms, setWaitingRooms] = useState<WaitingRoomInfo[]>([]);
  const subscribedRef = useRef(false);
  const connectingPromiseRef = useRef<Promise<boolean> | null>(null);

  const roomIdValid = /^[A-Za-z0-9]{6}$/.test(roomId);

  const ensureConnected = useCallback(async () => {
    if (signalRClient.state === 'connected') return true;
    if (connectingPromiseRef.current) return connectingPromiseRef.current;
    setIsConnecting(true);
    const promise = (async () => {
      try {
        const url = import.meta.env.VITE_SIGNALR_URL || '/hub';
        const token = await getToken();
        if (token) {
          await signalRClient.connect(url, async () => token);
        } else {
          await signalRClient.connect(url);
        }
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
  }, [getToken]);

  // Enterprise ID をストアに保存
  useEffect(() => {
    if (enterpriseId) {
      storeEnterpriseId(enterpriseId);
    }
  }, [enterpriseId, storeEnterpriseId]);

  // 早期接続とルームリスト購読
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
    setError('');

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
    signalRClient.sendCreateRoom();
  }, [ensureConnected, setRoomId, navigate, subscribeIfNeeded]);

  const handleJoinRoom = useCallback(async () => {
    if (!roomIdValid) return;
    setError('');

    if (!(await ensureConnected())) return;

    signalRClient.setHandlers({
      onOpponentJoined: (payload) => {
        setRoomId(roomId.toUpperCase());
        usePlayerStore.getState().setOpponentEnterpriseId(payload.enterpriseId);
        navigate(`/lobby/${roomId.toUpperCase()}`);
      },
      onWaitingRoomListUpdated: (payload) => setWaitingRooms(payload.rooms),
      onError: (payload) => setError(payload.message),
    });

    subscribeIfNeeded();
    signalRClient.sendJoinRoom(roomId.toUpperCase());
  }, [roomId, roomIdValid, ensureConnected, setRoomId, navigate, subscribeIfNeeded]);

  const handleRandomMatch = useCallback(async () => {
    setError('');

    if (!(await ensureConnected())) return;

    signalRClient.setHandlers({
      onMatchFound: (payload) => {
        setRoomId(payload.roomId);
        usePlayerStore.getState().setOpponentEnterpriseId(payload.opponentEnterpriseId);
        navigate(`/lobby/${payload.roomId}`);
      },
      onWaitingRoomListUpdated: (payload) => setWaitingRooms(payload.rooms),
      onError: (payload) => setError(payload.message),
    });

    subscribeIfNeeded();
    signalRClient.sendJoinRandomMatch();
  }, [ensureConnected, setRoomId, navigate, subscribeIfNeeded]);

  const handleJoinFromList = useCallback(async (targetRoomId: string) => {
    setError('');

    if (!(await ensureConnected())) return;

    signalRClient.setHandlers({
      onOpponentJoined: (payload) => {
        setRoomId(targetRoomId);
        usePlayerStore.getState().setOpponentEnterpriseId(payload.enterpriseId);
        navigate(`/lobby/${targetRoomId}`);
      },
      onWaitingRoomListUpdated: (payload) => setWaitingRooms(payload.rooms),
      onError: (payload) => setError(payload.message),
    });

    subscribeIfNeeded();
    signalRClient.sendJoinRoom(targetRoomId);
  }, [ensureConnected, setRoomId, navigate, subscribeIfNeeded]);

  return (
    <div className="top-page">
      {/* ---- ヘッダー ---- */}
      <div className="top-header">
        <span className="top-logo-icon" aria-hidden="true">🎮</span>
        <h1 className="top-title">Battle Tetris</h1>
        <p className="top-subtitle">オンライン たいせん</p>
      </div>

      {/* ---- Enterprise ID バッジ + ログアウト ---- */}
      <div className="top-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="top-enterprise-badge" data-testid="enterprise-id">
          {enterpriseId}
        </span>
        <button
          onClick={logout}
          className="top-logout-btn"
          data-testid="logout-btn"
        >
          ログアウト
        </button>
      </div>

      {/* ---- モードカード ---- */}
      <div className="top-cards">
        {/* カード1 — ルーム作成 */}
        <div className="mode-card mode-card--cyan">
          <span className="mode-card-icon" aria-hidden="true">🏠</span>
          <div className="mode-card-body">
            <p className="mode-card-title">へやを つくる</p>
            <p className="mode-card-desc">あたらしい へやを つくって ともだちを まとう</p>
          </div>
          <button
            onClick={handleCreateRoom}
            disabled={isConnecting}
            className="mode-btn mode-btn--cyan"
            data-testid="create-room-btn"
          >
            つくる
          </button>
        </div>

        {/* カード2 — ルーム参加 */}
        <div className="mode-card mode-card--green">
          <span className="mode-card-icon" aria-hidden="true">🔑</span>
          <div className="mode-card-body">
            <p className="mode-card-title">へやに はいる</p>
            <p className="mode-card-desc">ともだちの へやIDを いれて さんかしよう</p>
            <div className="mode-card-join-row">
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId_(e.target.value.toUpperCase())}
                maxLength={ROOM_ID_LENGTH}
                placeholder="へやID (6もじ)"
                className="top-room-input"
                data-testid="room-id-input"
                aria-label="へやID"
              />
              <button
                onClick={handleJoinRoom}
                disabled={!roomIdValid || isConnecting}
                className="mode-btn mode-btn--green mode-btn--small"
                data-testid="join-room-btn"
              >
                はいる
              </button>
            </div>
          </div>
        </div>

        {/* カード3 — ランダムマッチ */}
        <div className="mode-card mode-card--purple">
          <span className="mode-card-icon" aria-hidden="true">🎲</span>
          <div className="mode-card-body">
            <p className="mode-card-title">すぐ あそぶ！</p>
            <p className="mode-card-desc">だれかと すぐ たいせんできるよ</p>
          </div>
          <button
            onClick={handleRandomMatch}
            disabled={isConnecting}
            className="mode-btn mode-btn--purple"
            data-testid="random-match-btn"
          >
            さがす
          </button>
        </div>
      </div>

      {/* ---- 待機中ルームリスト ---- */}
      {waitingRooms.length > 0 && (
        <div className="top-section top-waiting" data-testid="waiting-room-list">
          <h2 className="top-label">まっている へや</h2>
          <div className="top-waiting-list">
            {waitingRooms.map((room) => (
              <div
                key={room.roomId}
                className="waiting-card"
                data-testid="waiting-room-item"
              >
                <div className="waiting-card-info">
                  <span className="waiting-card-id" data-testid="waiting-room-id">
                    {room.roomId}
                  </span>
                  <span className="waiting-card-creator" data-testid="waiting-room-creator">
                    {room.creatorEnterpriseId}
                  </span>
                </div>
                <button
                  onClick={() => handleJoinFromList(room.roomId)}
                  disabled={isConnecting}
                  className="mode-btn mode-btn--green mode-btn--small"
                  data-testid="waiting-room-join-btn"
                >
                  はいる
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- エラー / 接続中 ---- */}
      {error && (
        <p className="top-error" data-testid="error-message">
          {error}
        </p>
      )}

      {isConnecting && (
        <div className="top-connecting">
          <span className="top-connecting-dot" />
          <span>せつぞくちゅう...</span>
        </div>
      )}
    </div>
  );
}
