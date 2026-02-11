/**
 * プレイヤー情報。
 * SignalR connectionId で一意に識別される。
 */
export class Player {
  connectionId: string;
  nickname: string;
  isReady: boolean;
  isConnected: boolean;

  constructor(connectionId: string, nickname: string) {
    this.connectionId = connectionId;
    this.nickname = nickname;
    this.isReady = false;
    this.isConnected = true;
  }

  setReady(): void {
    this.isReady = true;
  }

  disconnect(): void {
    this.isConnected = false;
  }

  reconnect(newConnectionId: string): void {
    this.connectionId = newConnectionId;
    this.isConnected = true;
  }

  reset(): void {
    this.isReady = false;
  }
}
