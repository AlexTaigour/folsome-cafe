import http from 'http';

const port = Number(process.env.PORT || 10000);
const host = process.env.BACKEND_HOST || '127.0.0.1';
const timeoutMs = Number(process.env.WAIT_TIMEOUT_MS || 30000);
const retryMs = 500;

function checkBackend() {
  const req = http.get(`http://${host}:${port}/api/health`, { timeout: 2000 }, (res) => {
    res.resume();
    if (res.statusCode >= 200 && res.statusCode < 500) {
      process.exit(0);
    }
    setTimeout(checkBackend, retryMs);
  });

  req.on('error', () => {
    setTimeout(checkBackend, retryMs);
  });

  req.on('timeout', () => {
    req.destroy(new Error('timeout'));
  });
}

const startedAt = Date.now();

function tick() {
  if (Date.now() - startedAt >= timeoutMs) {
    console.error(`Timed out waiting for backend on http://${host}:${port}/api/health`);
    process.exit(1);
  }

  checkBackend();
}

tick();
