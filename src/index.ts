// src/index.ts

export type BridgeConfig = {
  apiKey: string;
  shopId: string;
  host: string; // admin host'un (origin)
};

export function createApp(config: BridgeConfig) {
  const app = {
    config,
    post(action: string, payload: any) {
      window.parent.postMessage(
        {
          namespace: 'T_SOFT_APP_BRIDGE',
          action,
          payload,
          appId: config.apiKey, // veya başka id
        },
        config.host
      );
    },
  };

  return app;
}

export function setNavigationMenu(
  app: ReturnType<typeof createApp>,
  items: Array<{ label: string; path: string }>
) {
  app.post('NAVIGATION_MENU.SET', { items });
}

export function showToast(
  app: ReturnType<typeof createApp>,
  options: { message: string; variant?: 'success' | 'error' }
) {
  app.post('TOAST.SHOW', options);
}
