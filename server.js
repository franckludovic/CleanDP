const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

// ─── App Setup ───────────────────────────────────────────────────────────────
const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'database.db');

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use('/uploads', express.static(UPLOADS_DIR));

// ─── Multer (File Upload) ─────────────────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `photo_${Date.now()}${ext}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ok = /jpeg|jpg|png|gif|webp/.test(path.extname(file.originalname).toLowerCase());
        ok ? cb(null, true) : cb(new Error('Seules les images sont acceptées.'));
    }
});

// ─── SQLite (sql.js — pure JS, no compilation needed) ────────────────────────
let db;

function saveDb() {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
}

async function initDb() {
    const SQL = await initSqlJs();
    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
        console.log('✅ Base de données chargée depuis le disque.');
    } else {
        db = new SQL.Database();
        console.log('✅ Nouvelle base de données créée.');
    }

    db.run(`
        CREATE TABLE IF NOT EXISTS reports (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            nom       TEXT    NOT NULL,
            telephone TEXT    NOT NULL,
            lat       REAL    NOT NULL,
            lng       REAL    NOT NULL,
            quartier  TEXT    NOT NULL,
            type      TEXT    NOT NULL,
            photo     TEXT    DEFAULT NULL,
            date      TEXT    NOT NULL,
            status    TEXT    NOT NULL DEFAULT 'pending'
        );
        CREATE TABLE IF NOT EXISTS schedules (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            quartier  TEXT    NOT NULL,
            time      TEXT    NOT NULL
        );
        CREATE TABLE IF NOT EXISTS fixed_points (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            name      TEXT    NOT NULL,
            lat       REAL    NOT NULL,
            lng       REAL    NOT NULL
        );
    `);
    saveDb();
}

// Helper: run a query and return all rows as objects
function dbAll(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
}

// Helper: run an INSERT/UPDATE/DELETE and save to disk
function dbRun(sql, params = []) {
    db.run(sql, params);
    saveDb();
}

// Helper: get last inserted id
function lastInsertId() {
    return dbAll('SELECT last_insert_rowid() as id')[0].id;
}

// ─── API Routes ───────────────────────────────────────────────────────────────

// --- Reports ---

app.get('/api/reports', (req, res) => {
    try {
        const rows = dbAll('SELECT * FROM reports ORDER BY id DESC');
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/reports', upload.single('photo'), (req, res) => {
    try {
        const { nom, telephone, lat, lng, quartier, type } = req.body;
        if (!nom || !telephone || !lat || !lng || !quartier || !type)
            return res.status(400).json({ error: 'Tous les champs obligatoires doivent être remplis.' });

        const photo = req.file ? req.file.filename : null;
        const date = new Date().toLocaleString('fr-FR');
        dbRun(
            `INSERT INTO reports (nom, telephone, lat, lng, quartier, type, photo, date, status) VALUES (?,?,?,?,?,?,?,?,'pending')`,
            [nom, telephone, parseFloat(lat), parseFloat(lng), quartier, type, photo, date]
        );
        const id = lastInsertId();
        res.status(201).json({ id, nom, telephone, lat: parseFloat(lat), lng: parseFloat(lng), quartier, type, photo, date, status: 'pending' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/reports/:id/resolve', (req, res) => {
    try {
        dbRun('UPDATE reports SET status=? WHERE id=?', ['resolved', parseInt(req.params.id)]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/reports/:id', (req, res) => {
    try {
        const rows = dbAll('SELECT photo FROM reports WHERE id=?', [parseInt(req.params.id)]);
        if (rows[0]?.photo) {
            const p = path.join(UPLOADS_DIR, rows[0].photo);
            if (fs.existsSync(p)) fs.unlinkSync(p);
        }
        dbRun('DELETE FROM reports WHERE id=?', [parseInt(req.params.id)]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Schedules ---

app.get('/api/schedules', (req, res) => {
    try { res.json(dbAll('SELECT * FROM schedules ORDER BY id ASC')); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/schedules', (req, res) => {
    try {
        const { quartier, time } = req.body;
        if (!quartier || !time) return res.status(400).json({ error: 'Quartier et heure requis.' });
        dbRun('INSERT INTO schedules (quartier, time) VALUES (?,?)', [quartier, time]);
        const id = lastInsertId();
        res.status(201).json({ id, quartier, time });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/schedules/:id', (req, res) => {
    try {
        dbRun('DELETE FROM schedules WHERE id=?', [parseInt(req.params.id)]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Fixed Points ---

app.get('/api/fixed-points', (req, res) => {
    try { res.json(dbAll('SELECT * FROM fixed_points ORDER BY id ASC')); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/fixed-points', (req, res) => {
    try {
        const { name, lat, lng } = req.body;
        if (!name || lat === undefined || lng === undefined)
            return res.status(400).json({ error: 'Nom, lat, lng requis.' });
        dbRun('INSERT INTO fixed_points (name, lat, lng) VALUES (?,?,?)', [name, parseFloat(lat), parseFloat(lng)]);
        const id = lastInsertId();
        res.status(201).json({ id, name, lat: parseFloat(lat), lng: parseFloat(lng) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/fixed-points/:id', (req, res) => {
    try {
        dbRun('DELETE FROM fixed_points WHERE id=?', [parseInt(req.params.id)]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Start 
initDb().then(() => {
    app.listen(PORT, () => {
        console.log(`\n🚀 Serveur CUD démarré sur http://localhost:${PORT}`);
        console.log(`📋 Citoyen  : http://localhost:${PORT}/population.html`);
        console.log(`🛡️  Admin    : http://localhost:${PORT}/admin.html`);
        console.log(`📦 Images   : ${UPLOADS_DIR}\n`);
    });
}).catch(err => {
    console.error('Erreur initialisation DB:', err);
    process.exit(1);
});
