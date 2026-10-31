// Panel ↔ uygulama köprüsünün (App Bridge) mesaj sözleşmesi.
// Panel tarafındaki tek doğru kaynak: t-panel `pages/apps/open/[prefix].vue`.

export const BRIDGE_VERSION = 1;
export const APP_SOURCE = 'tsoft-app';
export const PANEL_SOURCE = 'tsoft-panel';

/** Uygulamadan panele giden istek zarfı. */
export interface BridgeRequest<T extends RequestType = RequestType> {
  source: typeof APP_SOURCE;
  version: typeof BRIDGE_VERSION;
  /** İsteğe özgü kimlik; panel en fazla 64 karakterini kullanır. */
  id: string;
  type: T;
  payload: RequestPayloads[T];
}

/** Panelden uygulamaya dönen yanıt zarfı. */
export type BridgeResponse =
  | { source: typeof PANEL_SOURCE; version: typeof BRIDGE_VERSION; id: string; ok: true; payload: unknown }
  | { source: typeof PANEL_SOURCE; version: typeof BRIDGE_VERSION; id: string; ok: false; error: BridgeErrorCode };

export type ToastVariant = 'success' | 'error';

/** Kimlik istemeyen panel sayfaları. */
export type PanelListResource = 'orders' | 'products' | 'apps';
/** Kimlikle açılan panel sayfaları; kimlik `^[A-Za-z0-9_-]{1,64}$` olmalı. */
export type PanelDetailResource = 'order' | 'product';
export type PanelResource = PanelListResource | PanelDetailResource;

/** Seçici türü ve istediği kapsam: `product` → `read_products`. */
export type PickableResource = 'product';

export interface RequestPayloads {
  'session-token.get': Record<string, never>;
  'toast.show': { message: string; variant?: ToastVariant };
  'confirm.open': { message: string; title?: string; confirmText?: string };
  'navigate.app': { path: string };
  'navigate.panel': { resource: PanelResource; id?: string };
  'resource.pick': { type: PickableResource; multiple?: boolean };
  'size.set': { height: number };
}

export interface ResponsePayloads {
  'session-token.get': { token: string; expires_in: number; scopes: string[] };
  'toast.show': Record<string, never>;
  'confirm.open': { confirmed: boolean };
  'navigate.app': Record<string, never>;
  'navigate.panel': Record<string, never>;
  'resource.pick': { ids: Array<string | number>; cancelled?: boolean };
  'size.set': Record<string, never>;
}

export type RequestType = keyof RequestPayloads;

/**
 * Panelin döndürdüğü hata kodları ile istemcinin kendi ürettikleri.
 * Bilinmeyen kodlar da string olarak geçer.
 */
export type BridgeErrorCode =
  // panel
  | 'invalid_payload'
  | 'invalid_path'
  | 'invalid_route'
  | 'missing_scope'
  | 'unsupported_resource'
  | 'unsupported_type'
  | 'internal_error'
  // istemci
  | 'timeout'
  | 'not_embedded'
  | 'destroyed'
  | (string & {});
