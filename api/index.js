require('dotenv').config();
if (process.env.VERCEL !== '1') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Supabase Setup ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- Database Connection (PostgreSQL) ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const isVercel = process.env.VERCEL === '1';
const UPLOADS_DIR = isVercel ? path.join('/tmp', 'uploads') : path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// Local parity with vercel.json rewrites
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../public/population.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../public/admin.html')));

// --- Multer Setup (Memory Storage for direct upload to Supabase) ---
const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Database Initialization
async function initDb() {
    if (!process.env.DATABASE_URL) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS reports (
                id SERIAL PRIMARY KEY,
                nom TEXT NOT NULL,
                telephone TEXT NOT NULL,
                lat DOUBLE PRECISION NOT NULL,
                lng DOUBLE PRECISION NOT NULL,
                quartier TEXT NOT NULL,
                type TEXT NOT NULL,
                photo TEXT,
                date TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                dispatch_start TEXT,
                dispatch_eta INTEGER,
                return_start TEXT
            );
            CREATE TABLE IF NOT EXISTS schedules (
                id SERIAL PRIMARY KEY,
                quartier TEXT NOT NULL,
                time TEXT NOT NULL,
                lat DOUBLE PRECISION,
                lng DOUBLE PRECISION,
                dispatch_start TEXT,
                return_start TEXT,
                status TEXT DEFAULT 'dispatched'
            );
            CREATE TABLE IF NOT EXISTS fixed_points (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                lat DOUBLE PRECISION NOT NULL,
                lng DOUBLE PRECISION NOT NULL,
                created_at TEXT
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            INSERT INTO settings (key, value) VALUES ('admin_password', 'CUD2024') ON CONFLICT DO NOTHING;
        `);
        console.log('✅ Supabase Database ready.');
    } catch (err) {
        console.error('❌ DB Init Error:', err);
    }
}
initDb();

// --- Auth & Settings ---

app.post('/api/auth/login', async (req, res) => {
    try {
        const { password } = req.body;
        const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'admin_password'");
        if (rows[0].value === password) {
            res.json({ success: true, token: 'authenticated' });
        } else {
            res.status(401).json({ success: false, error: 'Mot de passe incorrect' });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/change-password', async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'admin_password'");
        if (rows[0].value === oldPassword) {
            await pool.query("UPDATE settings SET value = $1 WHERE key = 'admin_password'", [newPassword]);
            res.json({ success: true });
        } else {
            res.status(401).json({ success: false, error: 'Ancien mot de passe incorrect' });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- API Routes ---

app.get('/api/reports', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM reports ORDER BY id DESC');
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/reports', upload.single('photo'), async (req, res) => {
    try {
        const { nom, telephone, lat, lng, quartier, type } = req.body;
        let photoUrl = null;

        // If there's a photo, upload it to Supabase Storage
        if (req.file) {
            const fileName = `photo_${Date.now()}${path.extname(req.file.originalname)}`;
            const { data, error } = await supabase.storage
                .from('photos')
                .upload(fileName, req.file.buffer, {
                    contentType: req.file.mimetype,
                    upsert: false
                });

            if (error) throw error;

            // Get Public URL
            const { data: publicData } = supabase.storage
                .from('photos')
                .getPublicUrl(fileName);
            
            photoUrl = publicData.publicUrl;
        }

        const date = new Date().toLocaleString('fr-FR');
        const { rows } = await pool.query(
            `INSERT INTO reports (nom, telephone, lat, lng, quartier, type, photo, date, status) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending') RETURNING *`,
            [nom, telephone, parseFloat(lat), parseFloat(lng), quartier, type, photoUrl, date]
        );
        res.status(201).json(rows[0]);
    } catch (e) { 
        console.error('Upload error:', e);
        res.status(500).json({ error: e.message }); 
    }
});

app.put('/api/reports/:id/resolve', async (req, res) => {
    try {
        await pool.query('UPDATE reports SET status = $1 WHERE id = $2', ['resolved', req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/reports/:id', async (req, res) => {
    try {
        // Optional: Delete from storage too if you want
        await pool.query('DELETE FROM reports WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/schedules', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM schedules ORDER BY id ASC');
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/schedules', async (req, res) => {
    try {
        const { quartier, time, lat, lng } = req.body;
        const { rows } = await pool.query(
            'INSERT INTO schedules (quartier, time, lat, lng, dispatch_start, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [quartier, time, parseFloat(lat), parseFloat(lng), new Date().toISOString(), 'dispatched']
        );
        res.status(201).json(rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/schedules/:id/resolve', async (req, res) => {
    try {
        await pool.query('UPDATE schedules SET status = $1, return_start = $2 WHERE id = $3', 
            ['returning', new Date().toISOString(), req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/schedules/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM schedules WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/fixed-points', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM fixed_points ORDER BY id ASC');
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/fixed-points', async (req, res) => {
    try {
        const { name, lat, lng } = req.body;
        const now = new Date().toISOString();
        const { rows } = await pool.query(
            'INSERT INTO fixed_points (name, lat, lng, created_at) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, parseFloat(lat), parseFloat(lng), now]
        );
        res.status(201).json(rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/fixed-points/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM fixed_points WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = app;

if (process.env.VERCEL !== '1') {
    app.listen(PORT, () => console.log(`Server ready on http://localhost:${PORT}`));
}
