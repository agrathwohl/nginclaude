const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to log requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Middleware to parse JSON body
app.use(express.json());

// Proxy middleware with LLM decision making
app.use(async (req, res, next) => {
  try {
    // Extract relevant information from the request
    const method = req.method;
    const url = req.url;
    const headers = req.headers;
    const body = req.body;
    
    // Prepare the prompt for Haiku
    const prompt = `
You are a reverse proxy server similar to nginx. Your job is to analyze this incoming request and determine where it should be routed.
Based on the routing rules, you must decide which backend service should handle this request.

Request:
- Method: ${method}
- URL: ${url}
- Headers: ${JSON.stringify(headers)}
- Body: ${JSON.stringify(body)}

Available backends:
1. API Service: http://localhost:8001 - Handles all API requests with paths starting with /api
2. Web Service: http://localhost:8002 - Handles all web page requests
3. Admin Service: http://localhost:8003 - Handles admin requests with paths starting with /admin
4. Static Service: http://localhost:8004 - Handles requests for static assets (images, css, js)

Routing Rules:
- If the URL starts with "/api", route to the API Service (http://localhost:8001) and maintain the same path
- If the URL starts with "/admin", route to the Admin Service (http://localhost:8003) and maintain the same path
- If the URL starts with "/static", route to the Static Service (http://localhost:8004) and maintain the same path
- For all other URLs, route to the Web Service (http://localhost:8002) and maintain the same path

Your response must be ONLY a single line containing the full target URL including the protocol, host, port, and path. For example:
http://localhost:8001/api/users

DO NOT include any explanation or additional text.
`;

    console.log('Sending request to Anthropic API...');
    
    // Call Anthropic's Haiku model
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: [
        { role: 'user', content: prompt }
      ],
    });
    
    console.log('Received response from Anthropic API');

    // Extract the target URL from the response
    const targetUrl = message.content[0].text.trim();
    
    console.log(`Routing to: ${targetUrl}`);
    
    // Create a one-time proxy middleware for this specific request
    try {
      // Parse the targetUrl
      const targetUrlObj = new URL(targetUrl);
      const target = `${targetUrlObj.protocol}//${targetUrlObj.host}`;
      const pathname = targetUrlObj.pathname;
      
      console.log(`Target host: ${target}, Path: ${pathname}`);
      
      // Create options with extensive logging
      const options = {
        target: target,
        changeOrigin: true,
        pathRewrite: (path) => {
          const newPath = pathname + (targetUrlObj.search || '');
          console.log(`Rewriting path from '${path}' to '${newPath}'`);
          return newPath;
        },
        logLevel: 'debug',
        onProxyReq: (proxyReq, req, res) => {
          console.log(`Proxying ${req.method} ${req.url} to ${target}${pathname}`);
        },
        onProxyRes: (proxyRes, req, res) => {
          console.log(`Received response: ${proxyRes.statusCode} for ${req.url}`);
        },
        onError: (err, req, res) => {
          console.error('Proxy error during request:', err);
        }
      };
      
      // Create and apply the proxy
      const proxy = createProxyMiddleware(options);
      console.log('Proxy middleware created, forwarding request...');
      proxy(req, res, next);
    } catch (urlError) {
      console.error('URL parsing error:', urlError);
      console.error('Invalid URL returned by LLM:', targetUrl);
      
      // Fallback to rule-based routing if LLM fails
      console.log('Falling back to rule-based routing...');
      let fallbackTarget;
      
      if (url.startsWith('/api')) {
        fallbackTarget = 'http://localhost:8001';
      } else if (url.startsWith('/admin')) {
        fallbackTarget = 'http://localhost:8003';
      } else if (url.startsWith('/static')) {
        fallbackTarget = 'http://localhost:8004';
      } else {
        fallbackTarget = 'http://localhost:8002';
      }
      
      console.log(`Fallback routing to: ${fallbackTarget}${url}`);
      
      try {
        const fallbackProxy = createProxyMiddleware({
          target: fallbackTarget,
          changeOrigin: true,
          logLevel: 'debug',
          onError: (err, req, res) => {
            console.error('Fallback proxy error:', err);
            res.status(500).send('Proxy error');
          }
        });
        
        fallbackProxy(req, res, next);
      } catch (fallbackError) {
        console.error('Fallback proxy creation error:', fallbackError);
        res.status(500).send('Proxy routing error');
      }
    }
    
  } catch (error) {
    console.error('Proxy error:', error);
    console.error('Error stack:', error.stack);
    
    if (error.response) {
      console.error('Anthropic API error:', error.response.status, error.response.data);
    }
    
    // Ultimate fallback - direct rule-based routing
    console.log('Ultimate fallback to rule-based routing...');
    
    try {
      let fallbackTarget;
      const path = req.url;
      
      if (path.startsWith('/api')) {
        fallbackTarget = 'http://localhost:8001';
      } else if (path.startsWith('/admin')) {
        fallbackTarget = 'http://localhost:8003';
      } else if (path.startsWith('/static')) {
        fallbackTarget = 'http://localhost:8004';
      } else {
        fallbackTarget = 'http://localhost:8002';
      }
      
      console.log(`Ultimate fallback routing to: ${fallbackTarget}${path}`);
      
      const fallbackProxy = createProxyMiddleware({
        target: fallbackTarget,
        changeOrigin: true,
        logLevel: 'debug'
      });
      
      return fallbackProxy(req, res, next);
    } catch (fallbackError) {
      console.error('Ultimate fallback proxy error:', fallbackError);
      return res.status(500).send('Proxy error');
    }
  }
});

// Add a status endpoint for debugging
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

// Function to check if backends are reachable
const checkBackends = async () => {
  const http = require('http');
  
  const backends = [
    { url: 'http://localhost:8001', name: 'API Service' },
    { url: 'http://localhost:8002', name: 'Web Service' },
    { url: 'http://localhost:8003', name: 'Admin Service' },
    { url: 'http://localhost:8004', name: 'Static Service' }
  ];
  
  console.log('Checking backend services...');
  
  for (const backend of backends) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(backend.url, (res) => {
          console.log(`✅ ${backend.name} is reachable (${res.statusCode})`);
          resolve();
        });
        
        req.on('error', (err) => {
          console.log(`❌ ${backend.name} is not reachable: ${err.message}`);
          resolve(); // Resolve anyway, we don't want to fail if backends aren't up
        });
        
        req.setTimeout(1000, () => {
          req.destroy();
          console.log(`❌ ${backend.name} timed out`);
          resolve();
        });
      });
    } catch (e) {
      console.error(`Error checking ${backend.name}:`, e);
    }
  }
};

// Start the server
app.listen(PORT, () => {
  console.log(`LLM proxy server running on port ${PORT}`);
  checkBackends();
  
  console.log('\nIMPORTANT: Make sure to run the mock backends first with:');
  console.log('node mock-backends.js');
});