// Türk Teknik Su Arıtma - Müşteri Takip sunucusu
// Render gibi platformlarda dosya sistemi kalıcı olmadığı için veriler
// MongoDB Atlas (ücretsiz M0 katmanı) üzerinde tutulur.

try { require('dotenv').config(); } catch (_) { /* .env yoksa sorun değil, Render ortam değişkenini kendi panelinden verir */ }

const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const { MongoClient } = require('mongodb');

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const PUBLIC_DIR = path.join(__dirname, 'public');

if (!MONGODB_URI) {
  console.error('HATA: MONGODB_URI ortam değişkeni tanımlı değil. Render panelinden Environment Variables kısmına eklemeniz gerekiyor.');
  process.exit(1);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

let customersCollection;

async function connectDB() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db('musteri_takip');
  customersCollection = db.collection('customers');
  await customersCollection.createIndex({ id: 1 }, { unique: true });
  console.log('MongoDB Atlas bağlantısı kuruldu.');
}

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 5 * 1024 * 1024) { // 5MB güvenlik sınırı
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function serveStatic(req, res) {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = filePath.split('?')[0];
  const fullPath = path.join(PUBLIC_DIR, filePath);

  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Yasak');
    return;
  }

  try {
    const content = await fs.readFile(fullPath);
    const ext = path.extname(fullPath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Sayfa bulunamadı');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = req.url.split('?')[0];
    const parts = url.split('/').filter(Boolean); // ['api','customers', ':id', 'records', ':recId']

    // GET /api/customers  -> tüm müşterileri getir
    if (url === '/api/customers' && req.method === 'GET') {
      const customers = await customersCollection.find({}, { projection: { _id: 0 } }).toArray();
      sendJSON(res, 200, customers);
      return;
    }

    // POST /api/customers -> yeni müşteri oluştur
    if (url === '/api/customers' && req.method === 'POST') {
      const body = await readBody(req);
      const customer = JSON.parse(body);
      if (!customer || !customer.id || !customer.name) {
        sendJSON(res, 400, { error: 'Geçersiz müşteri verisi' });
        return;
      }
      await customersCollection.insertOne(customer);
      const { _id, ...clean } = customer;
      sendJSON(res, 200, clean);
      return;
    }

    // POST /api/customers/:id/records -> mevcut müşteriye yeni işlem ekle
    if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'customers' && parts[3] === 'records' && req.method === 'POST') {
      const custId = parts[2];
      const body = await readBody(req);
      const { name, address, phone, record } = JSON.parse(body);
      const result = await customersCollection.findOneAndUpdate(
        { id: custId },
        { $set: { name, address, phone }, $push: { records: record } },
        { returnDocument: 'after', projection: { _id: 0 } }
      );
      if (!result) {
        sendJSON(res, 404, { error: 'Müşteri bulunamadı' });
        return;
      }
      sendJSON(res, 200, result);
      return;
    }

    // DELETE /api/customers/:id/records/:recId -> tek bir işlem kaydını sil
    if (parts.length === 5 && parts[0] === 'api' && parts[1] === 'customers' && parts[3] === 'records' && req.method === 'DELETE') {
      const custId = parts[2];
      const recId = parts[4];
      await customersCollection.updateOne({ id: custId }, { $pull: { records: { id: recId } } });
      sendJSON(res, 200, { ok: true });
      return;
    }

    // PUT /api/customers/:id -> müşteri bilgilerini güncelle (kayıt eklemeden)
    if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'customers' && req.method === 'PUT') {
      const custId = parts[2];
      const body = await readBody(req);
      const { name, address, phone } = JSON.parse(body);
      const result = await customersCollection.findOneAndUpdate(
        { id: custId },
        { $set: { name, address, phone } },
        { returnDocument: 'after', projection: { _id: 0 } }
      );
      if (!result) {
        sendJSON(res, 404, { error: 'Müşteri bulunamadı' });
        return;
      }
      sendJSON(res, 200, result);
      return;
    }

    // DELETE /api/customers/:id -> müşteriyi sil
    if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'customers' && req.method === 'DELETE') {
      const custId = parts[2];
      await customersCollection.deleteOne({ id: custId });
      sendJSON(res, 200, { ok: true });
      return;
    }

    await serveStatic(req, res);
  } catch (err) {
    console.error('Sunucu hatası:', err);
    sendJSON(res, 500, { error: 'Sunucu hatası' });
  }
});

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Türk Teknik Su Arıtma - Müşteri Takip sunucusu http://localhost:${PORT} adresinde çalışıyor`);
  });
}).catch(err => {
  console.error('MongoDB bağlantı hatası:', err);
  process.exit(1);
});
