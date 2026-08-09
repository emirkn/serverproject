# Türk Teknik Su Arıtma — Müşteri Takip

Bu proje artık yerel SQLite veritabanı (`data/database.sqlite`) kullanan bir
Node.js uygulamasıdır.

- **Sunucu:** Node.js
- **Veritabanı:** SQLite

> Dikkat: SQLite, dosya tabanlı bir veritabanıdır. Render gibi geçici disk
> kullanan hostlarda veya her deploy sonrası sıfırlanan ortamlarda veri kalıcı
> olmayabilir. Lokal kullanım için uygundur.

## Başlatma

1. `npm install`
2. `npm start`
3. `http://localhost:3000` adresini açın.

## Yerel geliştirme

- Veriler `data/database.sqlite` dosyasında saklanır.
- `server.js` uygulamanın tüm API ve statik içerik sunucusudur.

## 1) MongoDB Atlas kurulumu (veritabanı)

1. https://www.mongodb.com/cloud/atlas/register adresinden ücretsiz hesap açın.
2. "Build a Database" → **M0 (Free)** seçin, bir bölge seçip cluster'ı oluşturun.
3. **Database Access** → yeni bir kullanıcı adı/şifre oluşturun (bu bilgileri not alın).
4. **Network Access** → "Allow Access from Anywhere" (0.0.0.0/0) ekleyin
   (Render'ın hangi IP'den bağlanacağı sabit olmadığı için gereklidir).
5. Cluster'ınızın **Connect** düğümesinden "Drivers" seçip bağlantı adresini
   (connection string) kopyalayın. Şöyle görünür:
   ```
   mongodb+srv://kullanici:sifre@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
   `<password>` yazan yeri gerçek şifrenizle değiştirmeyi unutmayın.

## 2) Render kurulumu (sunucu)

1. Bu proje klasörünü bir GitHub deposuna yükleyin (VS Code'dan kolayca yapılır).
2. https://render.com adresinde ücretsiz hesap açın, "New +" → **Web Service**.
3. GitHub deponuzu seçin.
4. Ayarlar:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. **Environment** sekmesinden bir ortam değişkeni ekleyin:
   - Key: `MONGODB_URI`
   - Value: (Atlas'tan kopyaladığınız bağlantı adresi)
6. "Create Web Service" ile dağıtımı başlatın. Birkaç dakika içinde
   `https://xxxxx.onrender.com` adresi üzerinden uygulamanıza erişebilirsiniz.

## Bilinmesi gerekenler (ücretsiz katmanların sınırları)

- **Render Free:** 15 dakika işlem yapılmazsa servis uyur; sonraki istek
  geldiğinde tekrar ayağa kalkması 30-60 saniye sürebilir. Yoğun/aralıksız
  kullanımda can sıkabilir ama veri kaybı olmaz (veri Atlas'ta, Render'da değil).
- **MongoDB Atlas M0:** 512 MB depolama, paylaşımlı kaynak. 50 bin müşteri
  kaydı için yeterli, ama iş büyüdükçe (birkaç yüz bin kayıt gibi) ücretli
  bir katmana geçmeniz gerekebilir.
- **Güvenlik:** Şu an bir giriş ekranı (kullanıcı adı/şifre) yok — bu adresi
  bilen herkes veriyi görüp değiştirebilir. İsterseniz basit bir giriş ekranı
  eklenebilir.

## Yerel bilgisayarda test etmek için

```bash
cd server-proje
npm install
MONGODB_URI="mongodb+srv://..." npm start
```

Sonra tarayıcıdan `http://localhost:3000` adresine gidin.
