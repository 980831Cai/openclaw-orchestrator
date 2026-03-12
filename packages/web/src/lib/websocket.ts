type EventHandler = (data: unknown) => void;

/** Exponential backoff configuration */
const RECONNECT_BASE_MS = 1000;   // Initial reconnect delay: 1s
const RECONNECT_MAX_MS = 30000;   // Max reconnect delay: 30s
const RECONNECT_MULTIPLIER = 2;   // Backoff multiplier

class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay: number = RECONNECT_BASE_MS;
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
      // Reset backoff on successful connection
      this.reconnectDelay = RECONNECT_BASE_MS;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    };

    socket.onmessage = (event) => {
      if (socket !== this.ws) {
        return;
      }
      try {
        const data = JSON.parse(event.data);

        // Respond to server ping with pong
        if (data.type === 'ping') {
          this.send({ type: 'pong', timestamp: new Date().toISOString() });
          return;
        }

        const handlers = this.handlers.get(data.type);
        if (handlers) {
          handlers.forEach((handler) => handler(data.payload));
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
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
      console.log(
        `WebSocket disconnected, reconnecting in ${this.reconnectDelay}ms...`
      );
      this.reconnectTimer = setTimeout(() => {
        this.connect();
      }, this.reconnectDelay);

      // Exponential backoff with cap
      this.reconnectDelay = Math.min(
        this.reconnectDelay * RECONNECT_MULTIPLIER,
        RECONNECT_MAX_MS
      );
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
      this.reconnectDelay = RECONNECT_BASE_MS;
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
