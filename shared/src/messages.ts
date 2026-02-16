import type { Field, LoserReason } from './types.js';

// =============================================================================
// SignalR Event Names
// =============================================================================

/** クライアント → サーバー イベント名 */
export const ClientEvents = {
  CreateRoom: 'CreateRoom',
  JoinRoom: 'JoinRoom',
  PlayerReady: 'PlayerReady',
  FieldUpdate: 'FieldUpdate',
  LinesCleared: 'LinesCleared',
  GameOver: 'GameOver',
  RequestRematch: 'RequestRematch',
  LeaveRoom: 'LeaveRoom',
  SubscribeRoomList: 'SubscribeRoomList',
  UnsubscribeRoomList: 'UnsubscribeRoomList',
} as const;

/** サーバー → クライアント イベント名 */
export const ServerEvents = {
  RoomCreated: 'RoomCreated',
  OpponentJoined: 'OpponentJoined',
  BothReady: 'BothReady',
  GameStart: 'GameStart',
  OpponentFieldUpdate: 'OpponentFieldUpdate',
  ReceiveGarbage: 'ReceiveGarbage',
  GameResult: 'GameResult',
  OpponentRematch: 'OpponentRematch',
  RematchAccepted: 'RematchAccepted',
  OpponentDisconnected: 'OpponentDisconnected',
  OpponentReconnected: 'OpponentReconnected',
  WaitingRoomListUpdated: 'WaitingRoomListUpdated',
  Error: 'Error',
} as const;

// =============================================================================
// Client → Server Payloads
// =============================================================================

// CreateRoom: no payload (enterprise ID from JWT)

export interface JoinRoomPayload {
  roomId: string;
}

// PlayerReady: no payload

export interface FieldUpdatePayload {
  field: Field;
  score: number;
  lines: number;
  level: number;
}

export interface LinesClearedPayload {
  count: number;
}

// GameOver: no payload
// RequestRematch: no payload
// LeaveRoom: no payload
// SubscribeRoomList: no payload
// UnsubscribeRoomList: no payload

// =============================================================================
// Server → Client Payloads
// =============================================================================

export interface RoomCreatedPayload {
  roomId: string;
}

export interface OpponentJoinedPayload {
  enterpriseId: string;
}

export interface BothReadyPayload {
  seed: number;
  countdown: number;
}

export interface GameStartPayload {
  startTime: number;
}

export interface OpponentFieldUpdatePayload {
  field: Field;
  score: number;
  lines: number;
  level: number;
}

export interface ReceiveGarbagePayload {
  lines: number;
}

export interface GameResultPayload {
  winner: string;
  loserReason: LoserReason;
}

// OpponentRematch: no payload

export interface RematchAcceptedPayload {
  roomId: string;
}

export interface OpponentDisconnectedPayload {
  timeout: number;
}

// OpponentReconnected: no payload

export interface WaitingRoomInfo {
  roomId: string;
  creatorEnterpriseId: string;
}

export interface WaitingRoomListUpdatedPayload {
  rooms: WaitingRoomInfo[];
}

export interface ErrorPayload {
  code: number;
  message: string;
}

// =============================================================================
// Error Codes
// =============================================================================

export const ErrorCodes = {
  ROOM_NOT_FOUND: 10021,
  ROOM_FULL: 10030,
  INVALID_PAYLOAD: 10031,
  ALREADY_IN_ROOM: 10032,
  NOT_IN_ROOM: 10033,
  GAME_NOT_STARTED: 10034,
  UNAUTHORIZED: 10040,
} as const;
