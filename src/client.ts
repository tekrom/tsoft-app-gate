import {
  APP_SOURCE,
  BRIDGE_VERSION,
  PANEL_SOURCE,
  type BridgeErrorCode,
  type PanelDetailResource,
  type PanelListResource,
  type PickableResource,
  type RequestPayloads,
  type RequestType,
  type ResponsePayloads,
  type ToastVariant,
} from './protocol.js';

export class AppBridgeError extends Error {
  readonly code: BridgeErrorCode;

  constructor(code: BridgeErrorCode, message?: string) {
    super(message ?? `T-Soft App Bridge: ${code}`);
    this.name = 'AppBridgeError';
    this.code = code;
  }
}

export interface AppOptions {
  /**
   * Panelin origin'i (ör. `https://magaza.tsoft360.com`). Verilmezse
   * `location.ancestorOrigins` ya da `document.referrer` üzerinden bulunur.
   */
  panelOrigin?: string;
  /** Kullanıcı etkileşimi beklemeyen isteklerin zaman aşımı (ms). Varsayılan 10000. */
  timeout?: number;
}

export interface RequestOptions {
  /** Bu isteğin zaman aşımı (ms). `0` zaman aşımını kapatır. */
  timeout?: number;
}

export interface SessionToken {
  token: string;
  /** Token'ın geçerliliğini yitirdiği an (epoch ms). */
  expiresAt: number;
  /** Panelden alınmışsa uygulamanın kapsamları; URL'deki token için `null`. */
  scopes: string[] | null;
}

export interface ToastOptions extends RequestOptions {
  variant?: ToastVariant;
}

export interface ConfirmOptions extends RequestOptions {
  message: string;
  title?: string;
  confirmText?: string;
}

export interface PickOptions extends RequestOptions {
  type: PickableResource;
  multiple?: boolean;
}

export interface PickResult {
  ids: Array<string | number>;
  cancelled: boolean;
}

export interface AutoResizeOptions {
  /** Yüksekliği ölçülecek öğe. Varsayılan `document.body`. */
  target?: Element;
}

export interface App {
  readonly panelOrigin: string;
  /** Panelin kurulumdan hemen sonra URL'e eklediği `?code=` değeri. */
  readonly installCode: string | null;

  getSessionToken(options?: { forceRefresh?: boolean } & RequestOptions): Promise<string>;
  getSession(options?: { forceRefresh?: boolean } & RequestOptions): Promise<SessionToken>;
  toast(message: string, options?: ToastOptions): Promise<void>;
  /** Kullanıcı onaylarsa `true`, vazgeçerse `false`. Varsayılan olarak zaman aşımı yoktur. */
  confirm(options: ConfirmOptions | string): Promise<boolean>;
  navigate: {
    /** Panel adres çubuğunu uygulama içi yola eşitler; iframe'i yeniden yüklemez. */
    app(path: string, options?: RequestOptions): Promise<void>;
    panel(resource: PanelListResource, options?: RequestOptions): Promise<void>;
    panel(resource: PanelDetailResource, id: string | number, options?: RequestOptions): Promise<void>;
  };
  /** Panelin seçicisini açar. Varsayılan olarak zaman aşımı yoktur. */
  pickResource(options: PickOptions): Promise<PickResult>;
  /** iframe yüksekliğini ayarlar; panel 300–5000 px aralığına sıkıştırır. */
  setHeight(height: number, options?: RequestOptions): Promise<void>;
  /** İçerik boyu değiştikçe yüksekliği bildirir; durdurmak için dönen fonksiyonu çağırın. */
  autoResize(options?: AutoResizeOptions): () => void;
  /** Ham istek; yeni mesaj tipleri için kaçış kapısı. */
  request<T extends RequestType>(type: T, payload: RequestPayloads[T], options?: RequestOptions): Promise<ResponsePayloads[T]>;
  /** Dinleyicileri kaldırır, bekleyen istekleri `destroyed` ile reddeder. */
  destroy(): void;
}

const DEFAULT_TIMEOUT = 10_000;
const REFRESH_MARGIN = 30_000;

interface Pending {
  resolve: (payload: any) => void;
  reject: (error: AppBridgeError) => void;
  timer?: ReturnType<typeof setTimeout>;
}

function detectPanelOrigin(): string | null {
  const ancestors = (window.location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
  if (ancestors && ancestors.length > 0) {
    return ancestors[0];
  }
  try {
    return document.referrer ? new URL(document.referrer).origin : null;
  } catch {
    return null;
  }
}

/** JWT `exp` alanını imza doğrulamadan okur; yalnız önbellek süresi için. */
function tokenExpiry(token: string): number | null {
  try {
    const part = token.split('.')[1];
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = JSON.parse(json).exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

function isFresh(session: SessionToken | null): session is SessionToken {
  return session !== null && session.expiresAt - REFRESH_MARGIN > Date.now();
}

export function createApp(options: AppOptions = {}): App {
  if (typeof window === 'undefined' || window.parent === window) {
    throw new AppBridgeError('not_embedded', 'T-Soft App Bridge: uygulama panel iframe\'i içinde açılmamış');
  }

  const panelOrigin = options.panelOrigin ?? detectPanelOrigin();
  if (!panelOrigin) {
    throw new AppBridgeError('not_embedded', 'T-Soft App Bridge: panel origin\'i bulunamadı; panelOrigin seçeneğini verin');
  }

  const defaultTimeout = options.timeout ?? DEFAULT_TIMEOUT;
  const pending = new Map<string, Pending>();
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('session');
  let counter = 0;
  let destroyed = false;
  let session: SessionToken | null = null;
  let refreshing: Promise<SessionToken> | null = null;

  if (urlToken) {
    const expiresAt = tokenExpiry(urlToken);
    if (expiresAt !== null) {
      session = { token: urlToken, expiresAt, scopes: null };
    }
  }

  function onMessage(event: MessageEvent) {
    if (event.source !== window.parent || event.origin !== panelOrigin) {
      return;
    }
    const data = event.data;
    if (data?.source !== PANEL_SOURCE || data?.version !== BRIDGE_VERSION || typeof data?.id !== 'string') {
      return;
    }
    const entry = pending.get(data.id);
    if (!entry) {
      return;
    }
    pending.delete(data.id);
    clearTimeout(entry.timer);
    if (data.ok === true) {
      entry.resolve(data.payload ?? {});
    } else {
      entry.reject(new AppBridgeError(typeof data.error === 'string' ? data.error : 'internal_error'));
    }
  }

  window.addEventListener('message', onMessage);

  function request<T extends RequestType>(type: T, payload: RequestPayloads[T], requestOptions: RequestOptions = {}, fallbackTimeout = defaultTimeout): Promise<ResponsePayloads[T]> {
    if (destroyed) {
      return Promise.reject(new AppBridgeError('destroyed'));
    }
    const id = `app-${Date.now().toString(36)}-${(counter++).toString(36)}`;
    const timeout = requestOptions.timeout ?? fallbackTimeout;

    return new Promise((resolve, reject) => {
      const entry: Pending = { resolve, reject };
      if (timeout > 0) {
        entry.timer = setTimeout(() => {
          pending.delete(id);
          reject(new AppBridgeError('timeout'));
        }, timeout);
      }
      pending.set(id, entry);
      window.parent.postMessage({ source: APP_SOURCE, version: BRIDGE_VERSION, id, type, payload }, panelOrigin!);
    });
  }

  async function getSession(sessionOptions: { forceRefresh?: boolean } & RequestOptions = {}): Promise<SessionToken> {
    if (!sessionOptions.forceRefresh && isFresh(session)) {
      return session;
    }
    refreshing ??= request('session-token.get', {}, sessionOptions)
      .then((response): SessionToken => {
        session = {
          token: response.token,
          expiresAt: Date.now() + response.expires_in * 1000,
          scopes: Array.isArray(response.scopes) ? response.scopes : [],
        };
        return session;
      })
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  }

  async function empty<T extends RequestType>(type: T, payload: RequestPayloads[T], requestOptions?: RequestOptions): Promise<void> {
    await request(type, payload, requestOptions);
  }

  return {
    panelOrigin,
    installCode: params.get('code'),

    getSession,

    async getSessionToken(sessionOptions) {
      return (await getSession(sessionOptions)).token;
    },

    toast(message, { variant, ...rest } = {}) {
      return empty('toast.show', variant ? { message, variant } : { message }, rest);
    },

    async confirm(input) {
      const { message, title, confirmText, ...rest } = typeof input === 'string' ? { message: input } : input;
      const response = await request('confirm.open', { message, title, confirmText }, rest, 0);
      return response.confirmed === true;
    },

    navigate: {
      app(path, requestOptions) {
        return empty('navigate.app', { path }, requestOptions);
      },
      panel(resource: PanelListResource | PanelDetailResource, idOrOptions?: string | number | RequestOptions, maybeOptions?: RequestOptions) {
        if (typeof idOrOptions === 'string' || typeof idOrOptions === 'number') {
          return empty('navigate.panel', { resource, id: String(idOrOptions) }, maybeOptions);
        }
        return empty('navigate.panel', { resource }, idOrOptions);
      },
    },

    async pickResource({ type, multiple, ...rest }) {
      const response = await request('resource.pick', { type, multiple: multiple === true }, rest, 0);
      return { ids: Array.isArray(response.ids) ? response.ids : [], cancelled: response.cancelled === true };
    },

    setHeight(height, requestOptions) {
      return empty('size.set', { height: Math.ceil(height) }, requestOptions);
    },

    autoResize({ target } = {}) {
      const element = target ?? document.body;
      let last = 0;
      let frame = 0;
      const measure = () => {
        frame = 0;
        const style = getComputedStyle(element);
        const height = Math.ceil(element.getBoundingClientRect().height + parseFloat(style.marginTop) + parseFloat(style.marginBottom));
        if (height !== last) {
          last = height;
          request('size.set', { height }).catch(() => {});
        }
      };
      const observer = new ResizeObserver(() => {
        if (!frame) frame = requestAnimationFrame(measure);
      });
      observer.observe(element);
      return () => {
        observer.disconnect();
        if (frame) cancelAnimationFrame(frame);
      };
    },

    request,

    destroy() {
      destroyed = true;
      window.removeEventListener('message', onMessage);
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new AppBridgeError('destroyed'));
      }
      pending.clear();
    },
  };
}
