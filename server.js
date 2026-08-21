require('dotenv').config();
const crypto = require('crypto');
const app = require('./app');
const connectDB = require('./config/db');

if (!process.env.MONGO_URI) {
  process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/asset-manager';
}

const ensureSecret = (key) => {
  if (process.env[key]) return process.env[key];
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required env var: ${key}`);
  }
  const generated = crypto.randomBytes(32).toString('hex');
  process.env[key] = generated;
  return generated;
};

ensureSecret('JWT_ACCESS_SECRET');
ensureSecret('JWT_REFRESH_SECRET');

const requestedPort = Number(process.env.PORT || 5000);
const candidatePorts = process.env.PORT ? [requestedPort] : [requestedPort, requestedPort + 1, requestedPort + 2, requestedPort + 3, requestedPort + 4];

function listenOn(port, ports) {
  const server = app.listen(port, () => {
    console.log(`[server] listening on http://localhost:${port}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      if (ports.length > 0) {
        const nextPort = ports.shift();
        console.warn(`[server] Port ${port} is already in use. Retrying on http://localhost:${nextPort}`);
        listenOn(nextPort, ports);
        return;
      }

      console.error(`[server] Unable to start on port ${port}. Please stop the process using it or set a different PORT value.`);
      process.exit(1);
    }

    console.error('[server] unexpected startup error:', err.message);
    process.exit(1);
  });
}

connectDB()
  .then(() => {
    listenOn(candidatePorts[0], candidatePorts.slice(1));
  })
  .catch((err) => {
    console.error('[startup] failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
