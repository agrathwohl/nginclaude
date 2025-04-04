const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to log requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Middleware to parse JSON body
app.use(express.json());

// Simple proxy routing without LLM
app.use((req, res, next) => {
  try {
    // Extract the URL path from the request
    const path = req.url;
    let targetUrl;

    // Simple routing logic
    if (path.startsWith('/api')) {
      targetUrl = 'http://localhost:8001';
    } else if (path.startsWith('/admin')) {
      targetUrl = 'http://localhost:8003';
    } else if (path.startsWith('/static')) {
      targetUrl = 'http://localhost:8004';
    } else {
      targetUrl = 'http://localhost:8002';
    }

    console.log(`Routing to: ${targetUrl}${path}`);
    
    // Create a proxy middleware for this route
    const proxy = createProxyMiddleware({
      target: targetUrl,
      changeOrigin: true
    });
    
    // Apply the proxy to this request
    proxy(req, res, next);
    
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).send('Proxy error');
  }
});

// Status endpoint
app.get('/proxy-status', (req, res) => {
  res.json({
    status: 'running',
    backends: [
      'http://localhost:8001 - API Service',
      'http://localhost:8002 - Web Service',
      'http://localhost:8003 - Admin Service',
      'http://localhost:8004 - Static Service'
    ]
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Simple proxy server running on port ${PORT}`);
  
  console.log('\nIMPORTANT: Make sure to run the mock backends first with:');
  console.log('node mock-backends.js');
  console.log('\nThen run the test requests:');
  console.log('node test-requests.js');
});