/**
 * network/messages.ts — shared パッケージからの re-export
 */
export {
  ClientEvents,
  ServerEvents,
  ErrorCodes,
} from '@battle-tetris/shared';

export type {
  JoinRoomPayload,
  FieldUpdatePayload,
  LinesClearedPayload,
  RoomCreatedPayload,
  OpponentJoinedPayload,
  BothReadyPayload,
  GameStartPayload,
  OpponentFieldUpdatePayload,
  ReceiveGarbagePayload,
  GameResultPayload,
  OpponentDisconnectedPayload,
  ErrorPayload,
} from '@battle-tetris/shared';
