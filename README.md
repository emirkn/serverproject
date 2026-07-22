# Türk Teknik Su Arıtma — Müşteri Takip

50.000+ müşteri gibi ciddi bir veri hacmi için bu sürüm **buluta** taşınacak
şekilde hazırlandı:

- **Sunucu:** Render (ücretsiz web servisi)
- **Veritabanı:** MongoDB Atlas (ücretsiz M0 katmanı — 512 MB, süresiz)

## Neden bu ikili?

Render'ın ücretsiz servislerinde disk **kalıcı değildir** — servis 15 dakika
işlem görmeyince uyur, tekrar uyandığında veya her yeniden dağıtımda
(redeploy) sunucudaki dosyalar sıfırlanır. Yani veriyi düz bir dosyada
(`customers.json` gibi) tutarsak, sunucu her uyandığında **50 bin müşteri
kaydı silinmiş olurdu**. Bu yüzden veriyi Render'ın dışında, kalıcı ve
ücretsiz bir veritabanında (MongoDB Atlas M0) tutuyoruz. Atlas M0 süresiz
ücretsizdir, kredi kartı istemez ve 512 MB'lık depolama 50 bin müşteri kaydı
için fazlasıyla yeterlidir.

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
