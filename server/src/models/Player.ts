/**
 * プレイヤー情報。
 * SignalR connectionId で一意に識別される。
 */
export class Player {
  connectionId: string;
  enterpriseId: string;
  isReady: boolean;
  isConnected: boolean;

  constructor(connectionId: string, enterpriseId: string) {
    this.connectionId = connectionId;
    this.enterpriseId = enterpriseId;
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
