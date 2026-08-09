try { require('dotenv').config(); } catch (_) { /* .env yoksa sorun değil */ }

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const Database = require('better-sqlite3');
const ExcelJS = require('exceljs');
const cron = require('node-cron');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DB_FILE = path.join(__dirname, 'data', 'database.sqlite');

let db;
try {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
} catch (_) {}

db = new Database(DB_FILE);

db.prepare(`
  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    province TEXT,
    district TEXT,
    phone2 TEXT,
    note TEXT,
    records TEXT DEFAULT '[]'
  )
`).run();

function connectDB() {
  console.log('SQLite database hazır:', DB_FILE);
  return Promise.resolve();
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
    const content = await fsp.readFile(fullPath);
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
  const rows = [];
  const customers = db.prepare('SELECT id,name,address,phone,province,district,phone2,note,records FROM customers').all();
  for (const c of customers || []) {
    let recs = [];
    try {
      recs = c.records ? JSON.parse(c.records) : [];
    } catch (err) {
      console.error('Geçersiz kayıt verisi:', err, c.records);
      recs = [];
    }
    const displayRecs = recs.length ? recs : [{ id:'', date:'', work:'', note:'', nextDate:'', periodMonths:'', amount:'' }];
    for (const r of displayRecs) {
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
  await fsp.mkdir(backupsDir, { recursive: true });

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
      const customers = db.prepare('SELECT id,name,address,phone,province,district,phone2,note,records FROM customers').all();
      const normalized = customers.map(c => ({
        ...c,
        records: c.records ? JSON.parse(c.records) : []
      }));
      sendJSON(res, 200, normalized);
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

      const stmt = db.prepare(`
        INSERT OR REPLACE INTO customers (id,name,address,phone,province,district,phone2,note,records)
        VALUES (@id,@name,@address,@phone,@province,@district,@phone2,@note,@records)
      `);
      stmt.run({
        id: customer.id,
        name: customer.name,
        address: customer.address || '',
        phone: customer.phone || '',
        province: customer.province || '',
        district: customer.district || '',
        phone2: customer.phone2 || '',
        note: customer.note || '',
        records: JSON.stringify(customer.records || [])
      });

      sendJSON(res, 200, customer);
      return;
    }

    // POST /api/customers/:id/records -> mevcut müşteriye yeni işlem ekle
    if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'customers' && parts[3] === 'records' && req.method === 'POST') {
      const custId = parts[2];
      const body = await readBody(req);
      const { name, address, province, district, phone, phone2, note, record } = JSON.parse(body);
      const update = {};
      if (name !== undefined) update.name = name;
      if (address !== undefined) update.address = address;
      if (phone !== undefined) update.phone = phone;
      if (province !== undefined && province !== '') update.province = province;
      if (district !== undefined && district !== '') update.district = district;
      if (phone2 !== undefined && phone2 !== '') update.phone2 = phone2;
      if (note !== undefined) update.note = note;

      const existing = db.prepare('SELECT records FROM customers WHERE id = ?').get(custId);
      if (!existing) {
        sendJSON(res, 404, { error: 'Müşteri bulunamadı' });
        return;
      }

      const existingRecords = existing.records ? JSON.parse(existing.records) : [];
      const updatedRecords = [...existingRecords, record];
      const stmt = db.prepare(`
        UPDATE customers SET name = COALESCE(@name, name), address = COALESCE(@address, address), phone = COALESCE(@phone, phone), province = COALESCE(@province, province), district = COALESCE(@district, district), phone2 = COALESCE(@phone2, phone2), note = COALESCE(@note, note), records = @records WHERE id = @id
      `);
      stmt.run({
        id: custId,
        name: update.name,
        address: update.address,
        phone: update.phone,
        province: update.province,
        district: update.district,
        phone2: update.phone2,
        note: update.note,
        records: JSON.stringify(updatedRecords)
      });

      const updated = db.prepare('SELECT id,name,address,phone,province,district,phone2,note,records FROM customers WHERE id = ?').get(custId);
      updated.records = updated.records ? JSON.parse(updated.records) : [];
      sendJSON(res, 200, updated);
      return;
    }

    // DELETE /api/customers/:id/records/:recId -> tek bir işlem kaydını sil
    if (parts.length === 5 && parts[0] === 'api' && parts[1] === 'customers' && parts[3] === 'records' && req.method === 'DELETE') {
      const custId = parts[2];
      const recId = parts[4];
      const existing = db.prepare('SELECT records FROM customers WHERE id = ?').get(custId);

      if (!existing) {
        sendJSON(res, 404, { error: 'Müşteri bulunamadı' });
        return;
      }

      const records = existing.records ? JSON.parse(existing.records) : [];
      const filtered = records.filter(r => r.id !== recId);
      db.prepare('UPDATE customers SET records = ? WHERE id = ?').run(JSON.stringify(filtered), custId);

      sendJSON(res, 200, { ok: true });
      return;
    }

    // PUT /api/customers/:id -> müşteri bilgilerini güncelle (kayıt eklemeden)
    if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'customers' && req.method === 'PUT') {
      const custId = parts[2];
      const body = await readBody(req);
      const { name, address, province, district, phone, phone2, note } = JSON.parse(body);
      const update = { name, address, phone };
      if (province !== undefined && province !== '') update.province = province;
      if (district !== undefined && district !== '') update.district = district;
      if (phone2 !== undefined) update.phone2 = phone2;
      if (note !== undefined) update.note = note;

      const stmt = db.prepare(`
        UPDATE customers
        SET name = COALESCE(@name, name),
            address = COALESCE(@address, address),
            phone = COALESCE(@phone, phone),
            province = COALESCE(@province, province),
            district = COALESCE(@district, district),
            phone2 = COALESCE(@phone2, phone2),
            note = COALESCE(@note, note)
        WHERE id = @id
      `);
      stmt.run({
        id: custId,
        name: update.name,
        address: update.address,
        phone: update.phone,
        province: update.province,
        district: update.district,
        phone2: update.phone2,
        note: update.note
      });

      const updated = db.prepare('SELECT id,name,address,phone,province,district,phone2,note,records FROM customers WHERE id = ?').get(custId);
      if (!updated) {
        sendJSON(res, 404, { error: 'Müşteri bulunamadı' });
        return;
      }
      updated.records = updated.records ? JSON.parse(updated.records) : [];
      sendJSON(res, 200, updated);
      return;
    }

    // DELETE /api/customers/:id -> müşteriyi sil
    if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'customers' && req.method === 'DELETE') {
      const custId = parts[2];
      db.prepare('DELETE FROM customers WHERE id = ?').run(custId);
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
        const stat = await fsp.stat(fullPath);
        const data = await fsp.readFile(fullPath);
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
    console.log(`E-Su Arıtma - Müşteri Takip sunucusu http://localhost:${PORT} adresinde çalışıyor`);
  });
}).catch(err => {
  console.error('SQLite başlatma hatası:', err);
  process.exit(1);
});
