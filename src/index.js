"use strict";
// src/index.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
exports.setNavigationMenu = setNavigationMenu;
exports.showToast = showToast;
function createApp(config) {
    const app = {
        config,
        post(action, payload) {
            window.parent.postMessage({
                namespace: 'T_SOFT_APP_BRIDGE',
                action,
                payload,
                appId: config.apiKey, // veya başka id
            }, config.host);
        },
    };
    return app;
}
function setNavigationMenu(app, items) {
    app.post('NAVIGATION_MENU.SET', { items });
}
function showToast(app, options) {
    app.post('TOAST.SHOW', options);
}
//# sourceMappingURL=index.js.map