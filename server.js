// Türk Teknik Su Arıtma - Müşteri Takip sunucusu
// Render gibi platformlarda dosya sistemi kalıcı olmadığı için veriler
// MongoDB Atlas (ücretsiz M0 katmanı) üzerinde tutulur.

try { require('dotenv').config(); } catch (_) { /* .env yoksa sorun değil, Render ortam değişkenini kendi panelinden verir */ }

const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const { MongoClient } = require('mongodb');
const ExcelJS = require('exceljs');
const cron = require('node-cron');

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

// Export customers + records to Excel (.xlsx)
async function exportToExcel() {
  if (!customersCollection) throw new Error('DB not connected');
  const rows = [];
  const customers = await customersCollection.find({}, { projection: { _id: 0 } }).toArray();
  for (const c of customers) {
    const recs = Array.isArray(c.records) && c.records.length ? c.records : [{ id:'', date:'', work:'', note:'', nextDate:'', periodMonths:'', amount:'' }];
    for (const r of recs) {
      rows.push({
        customerId: c.id || '',
        name: c.name || '',
        address: c.address || '',
        phone: c.phone || '',
        recordId: r.id || '',
        recordDate: r.date || '',
        recordWork: r.work || '',
        recordNote: r.note || '',
        recordNextDate: r.nextDate || '',
        recordPeriodMonths: r.periodMonths || '',
        recordAmount: r.amount || ''
      });
    }
  }

  const backupsDir = path.join(__dirname, 'backups');
  await fs.mkdir(backupsDir, { recursive: true });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Customers');
  sheet.columns = [
    { header: 'Customer ID', key: 'customerId', width: 20 },
    { header: 'Name', key: 'name', width: 30 },
    { header: 'Address', key: 'address', width: 40 },
    { header: 'Phone', key: 'phone', width: 18 },
    { header: 'Warranty Start', key: 'warrantyStart', width: 15 },
    { header: 'Warranty End', key: 'warrantyEnd', width: 15 },
    { header: 'Record ID', key: 'recordId', width: 20 },
    { header: 'Record Date', key: 'recordDate', width: 15 },
    { header: 'Work', key: 'recordWork', width: 30 },
    { header: 'Note', key: 'recordNote', width: 40 },
    { header: 'Next Date', key: 'recordNextDate', width: 15 },
    { header: 'Period (months)', key: 'recordPeriodMonths', width: 14 },
    { header: 'Amount', key: 'recordAmount', width: 12 }
  ];
  rows.forEach(r => {
    sheet.addRow({
      customerId: r.customerId,
      name: r.name,
      address: r.address,
      phone: r.phone,
      warrantyStart: r.warrantyStart || '',
      warrantyEnd: r.warrantyEnd || '',
      recordId: r.recordId,
      recordDate: r.recordDate,
      recordWork: r.recordWork,
      recordNote: r.recordNote,
      recordNextDate: r.recordNextDate,
      recordPeriodMonths: r.recordPeriodMonths,
      recordAmount: r.recordAmount
    });
  });

  const filename = `backup_${new Date().toISOString().slice(0,10)}.xlsx`;
  const fullPath = path.join(backupsDir, filename);
  await workbook.xlsx.writeFile(fullPath);
  console.log('Excel yedeği oluşturuldu:', fullPath);
  return fullPath;
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
      const { name, address, province, district, phone, phone2, note, record } = JSON.parse(body);
      const update = { name, address, phone };
      if (province !== undefined && province !== '') update.province = province;
      if (district !== undefined && district !== '') update.district = district;
      if (phone2 !== undefined && phone2 !== '') update.phone2 = phone2;
      if (note !== undefined) update.note = note;
      const result = await customersCollection.findOneAndUpdate(
        { id: custId },
        { $set: update, $push: { records: record } },
        { returnDocument: 'after', projection: { _id: 0 } }
      );
      if (!result || !result.value) {
        sendJSON(res, 404, { error: 'Müşteri bulunamadı' });
        return;
      }
      sendJSON(res, 200, result.value);
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
      const { name, address, district, phone, phone2, note } = JSON.parse(body);
      const update = { name, address, phone };
      if (district !== undefined && district !== '') update.district = district;
      if (phone2 !== undefined) update.phone2 = phone2;
      if (note !== undefined) update.note = note;
      const result = await customersCollection.findOneAndUpdate(
        { id: custId },
        { $set: update },
        { returnDocument: 'after', projection: { _id: 0 } }
      );
      if (!result || !result.value) {
        sendJSON(res, 404, { error: 'Müşteri bulunamadı' });
        return;
      }
      sendJSON(res, 200, result.value);
      return;
    }

    // DELETE /api/customers/:id -> müşteriyi sil
    if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'customers' && req.method === 'DELETE') {
      const custId = parts[2];
      await customersCollection.deleteOne({ id: custId });
      sendJSON(res, 200, { ok: true });
      return;
    }

    // GET /admin/export-backup -> manual Excel backup trigger (requires token)
    if (url === '/admin/export-backup' && req.method === 'GET') {
      const token = req.headers['x-backup-token'] || (req.url.split('?')[1] && new URLSearchParams(req.url.split('?')[1]).get('token'));
      const expected = process.env.BACKUP_TOKEN;
      if (!expected) {
        console.error('BACKUP_TOKEN ortam değişkeni tanımlı değil; manuel yedek endpointi erişime kapalı.');
        sendJSON(res, 500, { error: 'Sunucu yapılandırma hatası: BACKUP_TOKEN yok' });
        return;
      }
      if (!token || token !== expected) {
        sendJSON(res, 403, { error: 'Yetkisiz' });
        return;
      }
      try {
        const pathSaved = await exportToExcel();
        sendJSON(res, 200, { ok: true, path: pathSaved });
      } catch (err) {
        console.error('Yedekleme hatası:', err);
        sendJSON(res, 500, { error: 'Yedekleme başarısız: ' + err.message });
      }
      return;
    }

    // GET /admin/download-backup?file=backup_YYYY-MM-DD.xlsx&token=...
    if (url === '/admin/download-backup' && req.method === 'GET') {
      const qp = req.url.split('?')[1] || '';
      const params = new URLSearchParams(qp);
      const token = req.headers['x-backup-token'] || params.get('token');
      const expected = process.env.BACKUP_TOKEN;
      if (!expected) { sendJSON(res, 500, { error: 'Sunucu yapılandırma hatası: BACKUP_TOKEN yok' }); return; }
      if (!token || token !== expected) { sendJSON(res, 403, { error: 'Yetkisiz' }); return; }
      const file = params.get('file');
      if (!file || !file.startsWith('backup_') || file.includes('..')) { sendJSON(res, 400, { error: 'Geçersiz dosya' }); return; }
      const fullPath = path.join(__dirname, 'backups', file);
      try{
        const stat = await fs.stat(fullPath);
        const data = await fs.readFile(fullPath);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${file}"`,
          'Content-Length': stat.size
        });
        res.end(data);
      }catch(err){
        console.error('Dosya okunamadı', err);
        sendJSON(res, 404, { error: 'Dosya bulunamadı' });
      }
      return;
    }

    await serveStatic(req, res);
  } catch (err) {
    console.error('Sunucu hatası:', err);
    sendJSON(res, 500, { error: 'Sunucu hatası' });
  }
});

connectDB().then(() => {
  // Schedule weekly backup: Sunday 03:00 server time (Europe/Istanbul timezone)
  try{
    cron.schedule('0 3 * * 0', () => {
      exportToExcel().catch(err => console.error('Planlı yedekleme hatası:', err));
    }, { timezone: 'Europe/Istanbul' });
    console.log('Haftalık yedekleme planlandı: Pazar 03:00 (Europe/Istanbul)');
  }catch(e){
    console.error('Cron schedule kurulamadı:', e);
  }

  server.listen(PORT, () => {
    console.log(`Türk Teknik Su Arıtma - Müşteri Takip sunucusu http://localhost:${PORT} adresinde çalışıyor`);
  });
}).catch(err => {
  console.error('MongoDB bağlantı hatası:', err);
  process.exit(1);
});
