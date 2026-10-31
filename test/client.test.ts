import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createApp, AppBridgeError } from '../dist/index.js';

const PANEL = 'https://magaza.tsoftpanel.com';

type Handler = (message: any) => { ok: boolean; payload?: unknown; error?: string } | undefined;

function setup({ search = '', origin = PANEL, handler = (() => ({ ok: true, payload: {} })) as Handler } = {}) {
  const sent: any[] = [];
  const win = new EventTarget() as any;
  const parent = {
    postMessage(message: any, targetOrigin: string) {
      sent.push({ message, targetOrigin });
      const answer = handler(message);
      if (answer) queueMicrotask(() => reply({ source: 'tsoft-panel', version: 1, id: message.id, ...answer }));
    },
  };
  const reply = (data: unknown, origin = PANEL, source: unknown = parent) =>
    win.dispatchEvent(Object.assign(new Event('message'), { data, origin, source }));
  win.parent = parent;
  win.location = { search, ancestorOrigins: [origin] };
  (globalThis as any).window = win;
  (globalThis as any).document = { referrer: '' };
  return { sent, reply };
}

const jwt = (exp: number, extra: object = {}) => `x.${Buffer.from(JSON.stringify({ exp, ...extra })).toString('base64url')}.y`;

test('panel dışında açılınca not_embedded fırlatır', () => {
  const win = new EventTarget() as any;
  win.parent = win;
  (globalThis as any).window = win;
  assert.throws(() => createApp(), (e: any) => e instanceof AppBridgeError && e.code === 'not_embedded');
});

test('zarf sözleşmeye uyar ve panel origin\'ine gider', async () => {
  const { sent } = setup();
  const app = createApp();
  await app.toast('Kaydedildi', { variant: 'error' });
  assert.equal(sent[0].targetOrigin, PANEL);
  assert.deepEqual({ ...sent[0].message, id: undefined }, {
    source: 'tsoft-app', version: 1, id: undefined, type: 'toast.show', payload: { message: 'Kaydedildi', variant: 'error' },
  });
  assert.ok(sent[0].message.id.length <= 64);
  app.destroy();
});

test('panel hata kodu AppBridgeError olarak döner', async () => {
  setup({ handler: () => ({ ok: false, error: 'missing_scope' }) });
  const app = createApp();
  await assert.rejects(app.pickResource({ type: 'product' }), (e: any) => e.code === 'missing_scope');
  app.destroy();
});

test('yanıt gelmezse timeout ile reddedilir', async () => {
  setup({ handler: () => undefined });
  const app = createApp({ timeout: 20 });
  await assert.rejects(app.setHeight(400), (e: any) => e.code === 'timeout');
  app.destroy();
});

test('başka origin ya da pencereden gelen yanıt yok sayılır', async () => {
  const { sent, reply } = setup({ handler: () => undefined });
  const app = createApp({ timeout: 30 });
  const pending = app.navigate.panel('orders');
  const id = sent[0].message.id;
  reply({ source: 'tsoft-panel', version: 1, id, ok: true, payload: {} }, 'https://evil.example.com');
  reply({ source: 'tsoft-panel', version: 1, id, ok: true, payload: {} }, PANEL, {});
  await assert.rejects(pending, (e: any) => e.code === 'timeout');
  app.destroy();
});

test('URL\'deki geçerli token önbellekten döner, süresi yakınsa yenilenir', async () => {
  const fresh = jwt(Math.floor(Date.now() / 1000) + 600);
  const { sent } = setup({ search: `?session=${fresh}&code=abc`, handler: () => ({ ok: true, payload: { token: 'yeni', expires_in: 600, scopes: ['read_products'] } }) });
  const app = createApp();
  assert.equal(app.installCode, 'abc');
  assert.equal(await app.getSessionToken(), fresh);
  assert.equal(sent.length, 0);
  const [a, b] = await Promise.all([app.getSession({ forceRefresh: true }), app.getSession({ forceRefresh: true })]);
  assert.equal(sent.length, 1, 'eşzamanlı yenilemeler tek istekte birleşir');
  assert.deepEqual(a.scopes, ['read_products']);
  assert.equal(b.token, 'yeni');
  app.destroy();

  setup({ search: `?session=${jwt(Math.floor(Date.now() / 1000) + 5)}`, handler: () => ({ ok: true, payload: { token: 'yeni', expires_in: 600, scopes: [] } }) });
  const expiring = createApp();
  assert.equal(await expiring.getSessionToken(), 'yeni');
  expiring.destroy();
});

test('confirm, navigate ve pickResource yükleri', async () => {
  const { sent } = setup({
    handler: (m) => ({ ok: true, payload: m.type === 'confirm.open' ? { confirmed: true } : m.type === 'resource.pick' ? { ids: [7, 9] } : {} }),
  });
  const app = createApp();
  assert.equal(await app.confirm('Silinsin mi?'), true);
  await app.navigate.panel('order', 42);
  await app.navigate.app('/ayarlar?sekme=2');
  assert.deepEqual(await app.pickResource({ type: 'product', multiple: true }), { ids: [7, 9], cancelled: false });
  assert.deepEqual(sent.map((s) => [s.message.type, s.message.payload]), [
    ['confirm.open', { message: 'Silinsin mi?', title: undefined, confirmText: undefined }],
    ['navigate.panel', { resource: 'order', id: '42' }],
    ['navigate.app', { path: '/ayarlar?sekme=2' }],
    ['resource.pick', { type: 'product', multiple: true }],
  ]);
  app.destroy();
});

test('destroy bekleyen istekleri reddeder', async () => {
  setup({ handler: () => undefined });
  const app = createApp();
  const pending = app.confirm('?');
  app.destroy();
  await assert.rejects(pending, (e: any) => e.code === 'destroyed');
  await assert.rejects(app.toast('x'), (e: any) => e.code === 'destroyed');
});

test('üst pencere T-Soft paneli değilse not_embedded; panelOrigin elle verilirse denetlenmez', () => {
  setup({ origin: 'https://evil.example.com' });
  assert.throws(() => createApp(), (e: any) => e.code === 'not_embedded');
  setup({ origin: 'https://tsoftpanel.com.evil.com' });
  assert.throws(() => createApp(), (e: any) => e.code === 'not_embedded');
  for (const origin of ['https://tsoftpanel.com', 'https://v5--13150.paneltsoft.com', 'https://a.tsoftpanel.net']) {
    setup({ origin });
    createApp().destroy();
  }
  setup({ origin: 'http://localhost:3000' });
  assert.equal(createApp({ panelOrigin: 'http://localhost:3000' }).panelOrigin, 'http://localhost:3000');
});

test('claims URL token\'ından okunur, yenilemede güncellenir', async () => {
  const exp = Math.floor(Date.now() / 1000) + 600;
  setup({
    search: `?session=${jwt(exp, { store_id: 's1', dest: 'magaza.com', aud: 'app.ornek' })}`,
    handler: () => ({ ok: true, payload: { token: jwt(exp, { store_id: 's1', dest: 'çiçek.com' }), expires_in: 60, scopes: [] } }),
  });
  const app = createApp();
  assert.equal(app.claims?.dest, 'magaza.com');
  assert.equal(app.claims?.aud, 'app.ornek');
  await app.getSession({ forceRefresh: true });
  assert.equal(app.claims?.dest, 'çiçek.com', 'UTF-8 çözülür');
  app.destroy();
});

test('tarayıcı derlemesi TSoftAppGate global\'ini tanımlar', () => {
  const source = readFileSync(new URL('../dist/tsoft-app-gate.min.js', import.meta.url), 'utf8');
  const context: any = { window: {}, TextDecoder, atob, URLSearchParams };
  vm.runInNewContext(source + ';window.TSoftAppGate = TSoftAppGate;', context);
  assert.equal(typeof context.window.TSoftAppGate.createApp, 'function');
  assert.equal(typeof context.window.TSoftAppGate.isEmbedded, 'function');
  assert.equal(context.window.TSoftAppGate.BRIDGE_VERSION, 1);
});
