// app.js - Cau hinh Express app: middleware, cors, routes, xu ly loi
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const apiRoutes = require('./routes/index');
const errorMiddleware = require('./middlewares/error.middleware');
const { fail } = require('./utils/response');

const app = express();

// ─── MIDDLEWARES ─────────────────────────────────────────────────────────────

// Cho phep CORS tu moi origin (moi truong dev - co the thu hep trong production)
app.use(cors());

// Parse JSON body cho tat ca request
app.use(express.json());

// Log request HTTP ra console (dev format: method, url, status, time)
app.use(morgan('dev'));

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// Route kiem tra server dang hoat dong
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'QLSucKhoeNguoiCaoTuoi API Server dang chay',
    version: '1.0.0',
    docs: 'POST /api/auth/login | GET /api/elderly | ...',
  });
});

// Mount tat ca API route duoi tien to /api
app.use('/api', apiRoutes);

// ─── XU LY 404 ───────────────────────────────────────────────────────────────
// Bat cac request khong khop voi bat ky route nao
app.use((req, res) => {
  return fail(res, `Khong tim thay endpoint: ${req.method} ${req.originalUrl}`, 'NOT_FOUND', 404);
});

// ─── XU LY LOI TAP TRUNG ─────────────────────────────────────────────────────
// Phai dat cuoi cung sau tat ca route
app.use(errorMiddleware);

module.exports = app;
