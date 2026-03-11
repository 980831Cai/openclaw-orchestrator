type EventHandler = (data: unknown) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string;
  private subscriberCount = 0;
  private shouldReconnect = false;
  private intentionalClose = false;

  constructor(url: string) {
    this.url = url;
  }

  connect() {
    this.subscriberCount += 1;
    this.shouldReconnect = true;

    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }

    if (
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    this.intentionalClose = false;
    const socket = new WebSocket(this.url);
    this.ws = socket;

    socket.onopen = () => {
      if (socket !== this.ws) {
        return;
      }
      console.log('WebSocket connected');
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    };

    socket.onmessage = (event) => {
      if (socket !== this.ws) {
        return;
      }
      const data = JSON.parse(event.data);
      const handlers = this.handlers.get(data.type);
      if (handlers) {
        handlers.forEach((handler) => handler(data.payload));
      }
    };

    socket.onclose = () => {
      if (socket !== this.ws) {
        return;
      }
      this.ws = null;
      if (!this.shouldReconnect || this.intentionalClose) {
        return;
      }
      console.log('WebSocket disconnected, reconnecting...');
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    };

    socket.onerror = (error) => {
      if (socket !== this.ws || this.intentionalClose) {
        return;
      }
      console.error('WebSocket error:', error);
    };
  }

  disconnect() {
    this.subscriberCount = Math.max(0, this.subscriberCount - 1);
    if (this.subscriberCount > 0) {
      return;
    }

    this.shouldReconnect = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }

    const closeSocket = () => {
      if (this.subscriberCount > 0) {
        return;
      }
      this.intentionalClose = true;
      this.ws?.close();
      this.ws = null;
    };

    if (this.ws?.readyState === WebSocket.CONNECTING) {
      this.disconnectTimer = setTimeout(() => {
        this.disconnectTimer = null;
        closeSocket();
      }, 150);
      return;
    }

    closeSocket();
  }

  on(event: string, handler: EventHandler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  send(data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
}

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
export const wsClient = new WebSocketClient(wsUrl);
