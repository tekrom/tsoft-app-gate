# T-Soft App Gate

T-Soft paneli içinde (iframe) açılan uygulamalar için **App Bridge** istemcisi. Uygulama, panelden oturum token'ı alır; panelin bildirim, onay penceresi, ürün seçici ve gezinme bileşenlerini kullanır; iframe yüksekliğini ayarlar. Tüm çağrılar promise döner, zaman aşımına ve hata kodlarına sahiptir.

```bash
npm install @tekrom/tsoft-app-gate
```

Paketleyici kullanmıyorsanız tarayıcı derlemesini `<script>` ile yükleyin; aynı API `TSoftAppGate` global'i altında gelir:

```html
<script src="https://cdn.jsdelivr.net/npm/@tekrom/tsoft-app-gate@0.3/dist/tsoft-app-gate.min.js"></script>
<script>
  const app = TSoftAppGate.createApp();
</script>
```

Sürümü sabitleyin (`@0.3` ya da tam sürüm); üretimde dosyayı kendi sunucunuzdan sunmak da mümkündür.

## Hızlı başlangıç

```ts
import { createApp, isEmbedded, AppBridgeError } from '@tekrom/tsoft-app-gate';

if (!isEmbedded()) {
  // Panel dışında açıldı: kendi giriş akışınızı gösterin.
}

const app = createApp();

app.claims?.store_id; // hangi mağaza (doğrulamayı sunucuda yapın)

// Arka uca giden her istekte taze token kullanın.
const token = await app.getSessionToken();
await fetch('/api/settings', { headers: { Authorization: `Bearer ${token}` } });

await app.toast('Ayarlar kaydedildi');

if (await app.confirm({ title: 'Kampanyayı sil', message: 'Bu işlem geri alınamaz.', confirmText: 'Sil' })) {
  // ...
}

try {
  const { ids, cancelled } = await app.pickResource({ type: 'product', multiple: true });
} catch (error) {
  if (error instanceof AppBridgeError && error.code === 'missing_scope') {
    // Uygulamanın read_products kapsamı yok.
  }
}

await app.navigate.panel('order', 1042);

const stop = app.autoResize();
```

## API

### `createApp(options?)`

| Seçenek | Varsayılan | Açıklama |
|---|---|---|
| `panelOrigin` | otomatik | Panelin origin'i. Verilmezse `location.ancestorOrigins`, yoksa `document.referrer` kullanılır (panel iframe'i `referrerpolicy="strict-origin"` ile açar) ve T-Soft panel alan adlarından biri olmalıdır. Elle verilen değer denetlenmez; yalnız yerel geliştirmede kullanın. |
| `timeout` | `10000` | Kullanıcı etkileşimi beklemeyen isteklerin zaman aşımı (ms). |

Panel alan adları `PANEL_ORIGIN_PATTERN` ile denetlenir: `tsoftpanel.com`, `tsoftpanel.net`, `paneltsoft.com` ve bunların alt alan adları, yalnız `https`. Böylece uygulamanızı başka bir siteye gömen biri panel gibi yanıt veremez.

Uygulama bir iframe içinde değilse ya da üst pencere bir T-Soft paneli değilse `AppBridgeError('not_embedded')` fırlatır. Önceden bakmak için `isEmbedded()` kullanın.

Dönen nesnede ayrıca şunlar vardır:

- `panelOrigin`: Mesajların gönderildiği ve yanıtların kabul edildiği origin.
- `claims`: Elimizdeki son oturum token'ının içeriği (`store_id`, `dest`, `sub`, `aud`, `exp`…); token yoksa `null`. Token yenilendikçe güncellenir.
- `installCode`: Panelin kurulumdan hemen sonra eklediği `?code=` değeri; yoksa `null`.

### Oturum token'ı

```ts
app.getSessionToken(options?): Promise<string>
app.getSession(options?): Promise<{ token, claims, expiresAt, scopes }>
decodeSessionToken(token): SessionClaims | null
```

- Panel uygulamayı `?session=<jwt>` ile açar. Bu token süresi dolmamışsa ilk çağrıda panele gidilmeden kullanılır; bu durumda `scopes` `null` olur.
- Token 60 saniye yaşar. Bitmesine 15 saniyeden az kaldıysa panelden yenisi istenir; aynı anda gelen yenileme çağrıları tek isteğe bağlanır. Her sunucu isteğinden önce `getSessionToken()` çağırmanız yeterlidir.
- `forceRefresh: true` önbelleği atlar; `scopes` her zaman panelden gelen güncel listeyi içerir.
- Token ES256 imzalı bir JWT'dir (`iss`, `aud` = uygulama prefix'i, `sub` = panel kullanıcısı, `store_id`, `dest` = mağaza alan adı, `iat`, `nbf`, `exp`, `jti`). İstemci içeriği imza doğrulamadan okur; **imzayı sunucunuzda JWKS ile doğrulayın** (`https://api.tsoftapps.com/api/integration/v3/apps/jwks.json`, ayrıntı: [Panele Gömülü Uygulamalar](https://developer.tsoft.com.tr/uygulama-gelistirme/embedded-uygulamalar)).
- Oturum token'ı Admin API için değildir; uygulamanın kendi sunucusuyla konuşması içindir.

### `toast(message, { variant? })`

Panelde bildirim gösterir. `variant`: `'success'` (varsayılan) ya da `'error'`. Mesaj panel tarafında 200 karaktere kesilir; boş mesaj `invalid_payload` döner.

### `confirm(message | { message, title?, confirmText? })`

Panelin onay penceresini açar. Kullanıcı onaylarsa `true`, vazgeçerse `false` döner. Sınırlar: `message` 500, `title` 100, `confirmText` 40 karakter. Mesaj düz metindir, HTML yorumlanmaz. Kullanıcıyı beklediği için **varsayılan olarak zaman aşımı yoktur**; istenirse `timeout` verilebilir.

### `navigate.app(path)`

Panel adres çubuğundaki `?path=` değerini uygulama içi yola eşitler. Sayfa yenilendiğinde ya da bağlantı paylaşıldığında uygulama bu yoldan açılır. **iframe'i yeniden yüklemez;** uygulama içindeki gezinmeyi uygulamanın kendi yönlendiricisi yapar, bu çağrı yalnız panel URL'ini güncel tutar.

`path` `/` ile başlamalı, `//` ile başlamamalı ve uygulamanın origin'inde kalmalı; aksi halde `invalid_path`.

```ts
router.afterEach((to) => app.navigate.app(to.fullPath).catch(() => {}));
```

### `navigate.panel(resource, id?)`

Panelde başka bir sayfaya geçer (uygulama kapanır).

| `resource` | Kimlik | Panel sayfası |
|---|---|---|
| `orders` | — | Sipariş listesi |
| `order` | gerekli | Sipariş detayı |
| `products` | — | Ürün listesi |
| `product` | gerekli | Ürün düzenleme |
| `apps` | — | Uygulamalarım |

Kimlik `^[A-Za-z0-9_-]{1,64}$` kalıbına uymalı; bilinmeyen kaynak ya da geçersiz kimlik `invalid_route` döner.

### `pickResource({ type, multiple? })`

Panelin seçicisini açar, seçilen kayıtların kimliklerini döner: `{ ids, cancelled }`. Kullanıcı pencereyi kapatırsa `{ ids: [], cancelled: true }`. Varsayılan olarak zaman aşımı yoktur.

| `type` | Gerekli kapsam |
|---|---|
| `product` | `read_products` |

Kapsam yoksa `missing_scope`, bilinmeyen tür `unsupported_resource` döner. Seçici açıkken yeni bir seçim istenirse önceki istek `cancelled: true` ile kapanır.

### `setHeight(height)` ve `autoResize({ target? })`

`setHeight` iframe yüksekliğini piksel olarak ayarlar; panel değeri 300–5000 aralığına sıkıştırır. Yükseklik hiç bildirilmezse iframe görünür alanı doldurur.

`autoResize` `ResizeObserver` ile `target` öğesini (varsayılan `document.body`) izler, boy değiştikçe kare başına en fazla bir kez bildirir. Dönen fonksiyon izlemeyi durdurur. `html, body { height: 100% }` gibi kurallar ölçümü görünür alana kilitler; otomatik yükseklik kullanırken bunlardan kaçının.

### `request(type, payload, { timeout? })`

Ham istek. Pakette henüz sarmalayıcısı olmayan bir mesaj tipini göndermek için kullanılır.

### `destroy()`

Dinleyiciyi kaldırır, bekleyen istekleri `destroyed` hatasıyla reddeder.

## Hatalar

Tüm reddedilen promise'ler `AppBridgeError` taşır; `code` alanı aşağıdakilerden biridir.

| Kod | Kaynak | Anlamı |
|---|---|---|
| `invalid_payload` | panel | Zorunlu alan boş ya da tipi yanlış. |
| `invalid_path` | panel | `navigate.app` yolu geçersiz ya da uygulama origin'i dışında. |
| `invalid_route` | panel | `navigate.panel` kaynağı bilinmiyor ya da kimlik geçersiz. |
| `missing_scope` | panel | Uygulamanın bu iş için gereken kapsamı yok. |
| `unsupported_resource` | panel | `pickResource` türü desteklenmiyor. |
| `unsupported_type` | panel | Panel bu mesaj tipini tanımıyor (eski panel sürümü). |
| `internal_error` | panel | Panel isteği işlerken hata aldı (ör. token alınamadı). |
| `timeout` | istemci | Süre içinde yanıt gelmedi. |
| `not_embedded` | istemci | Uygulama panel iframe'i içinde değil ya da üst pencere bir T-Soft paneli değil. |
| `destroyed` | istemci | `destroy()` çağrıldıktan sonra istek yapıldı. |

## Protokol

Paket kullanmadan köprüye bağlanmak isteyenler için sözleşme. Panel tarafındaki referans uygulama t-panel'de `pages/apps/open/[prefix].vue` dosyasıdır.

### Açılış

Panel uygulamanın `app_url` adresini (yalnız `https`, panel origin'inden farklı) şu parametrelerle iframe'de açar:

- `session`: Oturum JWT'si.
- `code`: Yalnız kurulumdan hemen sonraki ilk açılışta, kurulum kodu.
- Panel URL'inde `?path=/x` varsa uygulama `app_url` origin'i altındaki `/x` yolundan açılır.

iframe `sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"`, `allow="clipboard-write"` ve `referrerpolicy="strict-origin"` ile açılır. Üst pencereye yönlendirme (`allow-top-navigation`) yoktur; panelde gezinmek için `navigate.panel` kullanılır.

### Zarf

Uygulama → panel (`window.parent.postMessage(message, panelOrigin)`):

```json
{ "source": "tsoft-app", "version": 1, "id": "app-1", "type": "toast.show", "payload": { "message": "Kaydedildi" } }
```

Panel → uygulama (`targetOrigin` = uygulama origin'i):

```json
{ "source": "tsoft-panel", "version": 1, "id": "app-1", "ok": true, "payload": {} }
{ "source": "tsoft-panel", "version": 1, "id": "app-1", "ok": false, "error": "invalid_payload" }
```

Kurallar:

- Panel yalnız `event.origin` uygulama origin'ine eşit ve `event.source` kendi iframe'i olan mesajları işler.
- `source`, `version` (1), `type` (string) ve `id` (string) zorunludur; uymayan mesaj sessizce yok sayılır, yanıt dönmez.
- `id` panel tarafında 64 karaktere kesilir; yanıt bu kesilmiş kimlikle döner. 64 karakteri aşmayın.
- Uygulama da mesajı `targetOrigin` olarak panel origin'iyle göndermeli, yanıtları yalnız `event.source === window.parent` ve `event.origin` panel alan adlarından biriyse kabul etmelidir.

### Mesaj tipleri

| `type` | `payload` | Başarılı yanıt `payload` | Hatalar |
|---|---|---|---|
| `session-token.get` | `{}` | `{ token, expires_in, scopes }` | `internal_error` |
| `toast.show` | `{ message, variant? }` | `{}` | `invalid_payload` |
| `confirm.open` | `{ message, title?, confirmText? }` | `{ confirmed }` | `invalid_payload` |
| `navigate.app` | `{ path }` | `{}` | `invalid_path` |
| `navigate.panel` | `{ resource, id? }` | `{}` | `invalid_route` |
| `resource.pick` | `{ type, multiple? }` | `{ ids, cancelled? }` | `unsupported_resource`, `missing_scope` |
| `size.set` | `{ height }` | `{}` | `invalid_payload` |
| diğer | — | — | `unsupported_type` |

`confirm.open` ve `resource.pick` yanıtı kullanıcı işlem yapınca gelir.

### Eski token mesajı

Geriye dönük uyumluluk için panel zarfsız eski mesajı da yanıtlar. Yeni uygulamalarda kullanmayın.

```js
window.parent.postMessage({ type: 'tsoft:session-token:request' }, panelOrigin);
// başarı: { type: 'tsoft:session-token', token, expires_in }
// hata:   { type: 'tsoft:session-token:error' }
```

## Geçiş

### `developer.tsoft.com.tr/app-bridge/v1` script'inden

| `TSoftBridge` | `TSoftAppGate` / npm |
|---|---|
| `TSoftBridge.create()` | `createApp()` |
| `bridge.claims` | `app.claims` |
| `bridge.sessionToken()` | `app.getSessionToken()` |
| `bridge.toast(message, 'error')` | `app.toast(message, { variant: 'error' })` |
| `bridge.confirm(opts)` | `app.confirm(opts)` |
| `bridge.pickProducts({ multiple })` | `app.pickResource({ type: 'product', multiple })` |
| `bridge.navigate(path)` | `app.navigate.app(path)` |
| `bridge.openPanel(resource, id)` | `app.navigate.panel(resource, id)` |
| `bridge.setHeight(h)` / `bridge.autoResize()` | `app.setHeight(h)` / `app.autoResize()` |
| `Error.message` | `AppBridgeError.code` |

Script panel dışında açılınca ilk istekte hata veriyordu; `createApp()` ise hemen `not_embedded` fırlatır.

### 0.1.x'ten

0.1.x'teki `createApp({ apiKey, shopId, host })`, `setNavigationMenu` ve `showToast` panelin tanımadığı bir mesaj biçimi (`T_SOFT_APP_BRIDGE`) gönderiyordu; kaldırıldı. `showToast(app, opts)` yerine `app.toast(message, opts)` kullanın; uygulama menüsünün karşılığı yok.

## Geliştirme

```bash
npm install
npm test      # derler ve node --test ile testleri koşar (Node 23.6+)
npm run build
```

Derleme iki çıktı üretir: `tsc` ile ESM + tipler (`dist/index.js`) ve `esbuild` ile tarayıcı derlemesi (`dist/tsoft-app-gate.min.js`). `dist/` yalnız npm paketine girer, repoya eklenmez. `prepublishOnly` yayın öncesi derlemeyi çalıştırır.
