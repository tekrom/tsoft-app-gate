export type BridgeConfig = {
    apiKey: string;
    shopId: string;
    host: string;
};
export declare function createApp(config: BridgeConfig): {
    config: BridgeConfig;
    post(action: string, payload: any): void;
};
export declare function setNavigationMenu(app: ReturnType<typeof createApp>, items: Array<{
    label: string;
    path: string;
}>): void;
export declare function showToast(app: ReturnType<typeof createApp>, options: {
    message: string;
    variant?: 'success' | 'error';
}): void;
//# sourceMappingURL=index.d.ts.map