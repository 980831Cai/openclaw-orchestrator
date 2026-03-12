type EventHandler = (data: unknown) => void;

/** Exponential backoff configuration */
const RECONNECT_BASE_MS = 1000;   // Initial reconnect delay: 1s
const RECONNECT_MAX_MS = 30000;   // Max reconnect delay: 30s
const RECONNECT_MULTIPLIER = 2;   // Backoff multiplier

class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay: number = RECONNECT_BASE_MS;
  private url: string;
  private intentionallyClosed = false;

  constructor(url: string) {
    this.url = url;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.intentionallyClosed = false;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      // Reset backoff on successful connection
      this.reconnectDelay = RECONNECT_BASE_MS;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    };

    this.ws.onmessage = (event) => {
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

    this.ws.onclose = () => {
      if (this.intentionallyClosed) {
        console.log('WebSocket closed intentionally');
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

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  disconnect() {
    this.intentionallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.reconnectDelay = RECONNECT_BASE_MS;
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

const wsUrl = `ws://${window.location.hostname}:3721/ws`;
export const wsClient = new WebSocketClient(wsUrl);
