const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/authRoutes');
const assetRoutes = require('./routes/assetRoutes');
const assignmentRoutes = require('./routes/assignmentRoutes');
const maintenanceRoutes = require('./routes/maintenanceRoutes');
const auditRoutes = require('./routes/auditRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const accessoryRoutes = require('./routes/accessoryRoutes');
const consumableRoutes = require('./routes/consumableRoutes');
const licenseRoutes = require('./routes/licenseRoutes');
const documentListRoutes = require('./routes/documentListRoutes');
const reportRoutes = require('./routes/reportRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use('/uploads', express.static(require('path').resolve(__dirname, 'uploads')));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/accessories', accessoryRoutes);
app.use('/api/consumables', consumableRoutes);
app.use('/api/licenses', licenseRoutes);
app.use('/api/documents', documentListRoutes);
app.use('/api/reports', reportRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
