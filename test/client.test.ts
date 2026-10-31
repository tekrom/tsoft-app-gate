import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, AppBridgeError } from '../dist/index.js';

const PANEL = 'https://panel.example.com';

type Handler = (message: any) => { ok: boolean; payload?: unknown; error?: string } | undefined;

function setup({ search = '', handler = (() => ({ ok: true, payload: {} })) as Handler } = {}) {
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
  win.location = { search, ancestorOrigins: [PANEL] };
  (globalThis as any).window = win;
  (globalThis as any).document = { referrer: '' };
  return { sent, reply };
}

const jwt = (exp: number) => `x.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.y`;

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
