# T-Soft App Gate

T-Soft App Gate, T-Soft paneli ile panel üzerinde geliştirilen uygulamalar arasında güvenli bir köprü kurmak için hazırlanmış hafif bir SDK'dır. Amaç; uygulama geliştiricilerinin menü, bildirim, toast gibi arayüz bileşenlerine standart mesajlar üzerinden erişebilmesini sağlamaktır.

## Özellikler
- `createApp` ile API anahtarınıza ve mağaza bilgilerinize bağlı bir köprü kurar.
- `setNavigationMenu` çağrısı ile T-Soft yönetim menüsünü uygulamanıza göre güncellemenizi sağlar.
- `showToast` sayesinde panel üzerindeki kullanıcıya başarı/başarısızlık bildirimleri gönderebilirsiniz.
- Tarayıcı `postMessage` altyapısını kullanır, böylece uygulamanız iframe içinde güvenle çalışabilir.

## Kurulum
```bash
npm install @tekrom/tsoft-app-gate
```

## Hızlı Başlangıç
TypeScript örneği:

```ts
import { createApp, setNavigationMenu, showToast } from '@tekrom/tsoft-app-gate';

const app = createApp({
  apiKey: 'TSOFT_API_KEY',
  shopId: '12345',
  host: 'tsoftpanel.com',
});

setNavigationMenu(app, [
  { label: 'Siparişler', path: '/orders' },
  { label: 'Kampanyalar', path: '/campaigns' },
]);

showToast(app, { message: 'Kayıt başarıyla tamamlandı', variant: 'success' });
```

## Geliştirme
Projeyi kaynak koddan çalıştırmak için:

```bash
npm install
npm run build
```

`dist` klasörü TypeScript derlemesinden sonra npm paketine eklenecek çıktıları içerir. Yayın öncesi `npm run build` otomatik olarak çalışır (`prepublishOnly` scripti).

## Katkı ve Destek
- Yeni aksiyonlar (ör. bildirim, modal, navigation) eklenmesini istiyorsanız issue açabilirsiniz.
- Hatalar veya iyileştirme önerileri için PR göndermekten çekinmeyin.

Tüm sorularınız için T-Soft ekibi ile iletişime geçebilirsiniz.
