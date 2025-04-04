const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { anthropic } = require('@ai-sdk/anthropic');
const { generateText } = require('ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Function to parse Nginx-style configuration
function parseNginxConfig(configPath) {
  try {
    const configContent = fs.readFileSync(configPath, 'utf8');
    const routes = [];
    
    // Extract location blocks using regex
    const locationRegex = /location\s+([^\s{]+)\s*{[^}]*proxy_pass\s+([^;]+);/g;
    let match;
    
    while ((match = locationRegex.exec(configContent)) !== null) {
      const path = match[1];
      const target = match[2].trim();
      
      routes.push({
        path: path,
        target: target
      });
    }
    
    // Sort routes by specificity (longer paths first)
    routes.sort((a, b) => {
      // Put root location (/) at the end
      if (a.path === '/') return 1;
      if (b.path === '/') return -1;
      
      // Sort by path length (longer first)
      return b.path.length - a.path.length;
    });
    
    return routes;
  } catch (error) {
    console.error('Error parsing Nginx config:', error);
    return [];
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Load routes from Nginx-style config file
const configPath = path.join(__dirname, '..', 'nginv-proxy.conf');
const routes = parseNginxConfig(configPath);

console.log('Loaded routes from config:');
routes.forEach(route => {
  console.log(`${route.path} => ${route.target}`);
});

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
    // Skip the status endpoint
    if (req.url === '/proxy-status') {
      return next();
    }
    
    // Extract relevant information from the request
    const method = req.method;
    const url = req.url;
    const headers = req.headers;
    const body = req.body;
    
    // Build routing rules from loaded config
    let routingRules = '';
    routes.forEach(route => {
      routingRules += `- If the URL starts with "${route.path}", route to ${route.target} and maintain the same path\n`;
    });
    
    // Prepare the prompt for Haiku
    const prompt = `
You are a reverse proxy server similar to nginx. Your job is to analyze this incoming request and determine where it should be routed.
Based on the routing rules from the nginv-proxy.conf file, you must decide which backend service should handle this request.

Request:
- Method: ${method}
- URL: ${url}
- Headers: ${JSON.stringify(headers)}
- Body: ${JSON.stringify(body)}

Routing Rules from nginv-proxy.conf:
${routingRules}

Your response must be ONLY a single line containing the full target URL. For example:
http://localhost:8001/api/users

DO NOT include any explanation or additional text.
`;
    
    console.log('Sending request to Anthropic API via Vercel AI SDK...');
    
    // Use the Vercel AI SDK
    const { text: targetUrl } = await generateText({
      model: anthropic('claude-3-haiku-20240307'),
      prompt: prompt,
    });
    
    console.log(`Routing to: ${targetUrl}`);
    
    try {
      // Parse the targetUrl
      const targetUrlObj = new URL(targetUrl);
      const target = `${targetUrlObj.protocol}//${targetUrlObj.host}`;
      const pathname = targetUrlObj.pathname;
      
      console.log(`Target host: ${target}, Path: ${pathname}`);
      
      // Create proxy options
      const options = {
        target: target,
        changeOrigin: true,
        pathRewrite: (path) => {
          return pathname + (targetUrlObj.search || '');
        },
        onProxyReq: (proxyReq, req, res) => {
          console.log(`Proxying ${req.method} ${req.url} to ${target}${pathname}`);
        },
        onError: (err, req, res) => {
          console.error('Proxy forwarding error:', err);
          useRuleBasedFallback(req, res, next, url);
        }
      };
      
      // Create and apply the proxy
      const proxy = createProxyMiddleware(options);
      proxy(req, res, next);
      
    } catch (urlError) {
      console.error('URL parsing error:', urlError);
      console.error('Invalid URL returned by LLM:', targetUrl);
      
      // Fall back to rule-based routing if URL parsing fails
      useRuleBasedFallback(req, res, next, url);
    }
    
  } catch (error) {
    console.error('AI SDK error:', error);
    
    // Fall back to rule-based routing if AI API fails
    useRuleBasedFallback(req, res, next, req.url);
  }
});

// Function for rule-based fallback routing
function useRuleBasedFallback(req, res, next, url) {
  console.log('Using rule-based fallback routing from nginv-proxy.conf...');
  
  // Find matching route from the config
  let fallbackTarget = null;
  
  for (const route of routes) {
    if (url.startsWith(route.path)) {
      fallbackTarget = route.target;
      break;
    }
  }
  
  if (!fallbackTarget) {
    console.error('No matching route found for:', url);
    return res.status(404).send('No matching route found');
  }
  
  console.log(`Fallback routing to: ${fallbackTarget}${url}`);
  
  try {
    const fallbackProxy = createProxyMiddleware({
      target: fallbackTarget,
      changeOrigin: true
    });
    
    fallbackProxy(req, res, next);
  } catch (fallbackError) {
    console.error('Fallback proxy error:', fallbackError);
    res.status(500).send('Proxy error');
  }
}

// Status endpoint for debugging
app.get('/proxy-status', (req, res) => {
  res.json({
    status: 'running',
    sdk: 'Vercel AI SDK with @ai-sdk/anthropic',
    config: configPath,
    routes: routes.map(route => `${route.path} => ${route.target}`)
  });
});

// Function to check if backends are reachable
const checkBackends = async () => {
  const http = require('http');
  
  // Extract unique backend targets from the routes
  const backendUrls = [...new Set(routes.map(route => route.target))];
  const backends = backendUrls.map(url => ({ url, name: url }));
  
  console.log('Checking backend services from config...');
  
  for (const backend of backends) {
    try {
      await new Promise((resolve) => {
        const req = http.get(backend.url, (res) => {
          console.log(`✅ ${backend.name} is reachable (${res.statusCode})`);
          resolve();
        });
        
        req.on('error', (err) => {
          console.log(`❌ ${backend.name} is not reachable: ${err.message}`);
          resolve();
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
  console.log(`Vercel AI SDK proxy server running on port ${PORT}`);
  checkBackends();
  
  console.log('\nIMPORTANT: Make sure to run the mock backends first with:');
  console.log('node mock-backends.js');
});