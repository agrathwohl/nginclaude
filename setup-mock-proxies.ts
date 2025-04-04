#!/usr/bin/env ts-node
/**
 * Setup script to run mock proxy servers for benchmark comparison
 * 
 * This script starts various proxy servers on different ports to allow
 * fair comparison with nginclaude in the benchmark tests.
 * 
 * Usage:
 *   npx ts-node setup-mock-proxies.ts
 */

import express from 'express';
import httpProxy from 'http-proxy';
import fastify from 'fastify';
import fastifyHttpProxy from '@fastify/http-proxy';
import fs from 'fs/promises';
import path from 'path';
import colors from 'chalk';

// Configuration for the mock proxies
const MOCK_PROXIES = [
  {
    name: 'http-proxy',
    port: 8081,
    type: 'http-proxy',
    color: colors.blue
  },
  {
    name: 'fastify-proxy',
    port: 8082,
    type: 'fastify',
    color: colors.yellow
  }
];

// Default backend services (same as in mock-backends.ts)
const BACKENDS = [
  { 
    path: '/api', 
    target: 'http://localhost:8001',
    name: 'API Service' 
  },
  { 
    path: '/admin', 
    target: 'http://localhost:8003',
    name: 'Admin Service' 
  },
  { 
    path: '/static', 
    target: 'http://localhost:8004',
    name: 'Static Service' 
  },
  { 
    path: '/', 
    target: 'http://localhost:8002',
    name: 'Web Service' 
  }
];

// Create nginx config file for comparison
async function createNginxConfig() {
  try {
    // Basic nginx config template
    const nginxConfig = `
# Generated nginx config for benchmark comparison
# To use: copy this to /etc/nginx/conf.d/ and reload nginx

server {
    listen 8080;
    server_name localhost;

    # Status endpoint for health check
    location = /proxy-status {
        default_type application/json;
        return 200 '{"status":"running","name":"nginx"}';
    }

    # API Service
    location /api {
        proxy_pass http://localhost:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Admin Service
    location /admin {
        proxy_pass http://localhost:8003;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Static Files Service
    location /static {
        proxy_pass http://localhost:8004;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Default Web Service
    location / {
        proxy_pass http://localhost:8002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
`;

    await fs.writeFile(path.join(__dirname, 'benchmark-nginx.conf'), nginxConfig);
    console.log(`${colors.green('✓')} Created nginx config at: benchmark-nginx.conf`);
    console.log(`   To use it:`);
    console.log(`   1. Copy to /etc/nginx/conf.d/: ${colors.dim('sudo cp benchmark-nginx.conf /etc/nginx/conf.d/')}`);
    console.log(`   2. Test config: ${colors.dim('sudo nginx -t')}`);
    console.log(`   3. Reload nginx: ${colors.dim('sudo systemctl reload nginx')}\n`);
  } catch (error) {
    console.error('Failed to create nginx config:', error);
  }
}

// Start a Node.js http-proxy server
function startHttpProxy() {
  const app = express();
  const proxy = httpProxy.createProxyServer();
  
  // Add status endpoint
  app.get('/proxy-status', (req, res) => {
    res.json({
      status: 'running',
      name: 'http-proxy',
      backends: BACKENDS.map(b => `${b.target} - ${b.name}`)
    });
  });
  
  // Register routes
  BACKENDS.forEach(backend => {
    app.all(backend.path === '/' ? '/*' : `${backend.path}/*`, (req, res) => {
      console.log(`[http-proxy] Routing ${req.method} ${req.url} to ${backend.target}`);
      proxy.web(req, res, { target: backend.target, changeOrigin: true });
    });
  });
  
  // Handle proxy errors
  proxy.on('error', (err, req, res) => {
    console.error('[http-proxy] Proxy error:', err);
    if (res && 'writeHead' in res) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Proxy error');
    }
  });
  
  // Start server
  const server = app.listen(8081, () => {
    console.log(`${colors.blue('✓')} Started http-proxy on port 8081`);
  });
  
  return server;
}

// Start a Fastify proxy server
async function startFastifyProxy() {
  const app = fastify();
  
  // Add status endpoint
  app.get('/proxy-status', async (req, reply) => {
    return {
      status: 'running',
      name: 'fastify-proxy',
      backends: BACKENDS.map(b => `${b.target} - ${b.name}`)
    };
  });
  
  // Register routes with fastify-http-proxy
  for (const backend of BACKENDS) {
    if (backend.path === '/') {
      // Root path needs special handling
      await app.register(fastifyHttpProxy, {
        upstream: backend.target,
        prefix: '/',
        rewritePrefix: '/',
        httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        replyOptions: {
          rewriteRequestHeaders: (req, headers) => {
            return {
              ...headers,
              host: new URL(backend.target).host
            };
          }
        }
      });
    } else {
      await app.register(fastifyHttpProxy, {
        upstream: backend.target,
        prefix: backend.path,
        rewritePrefix: backend.path,
        httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
      });
    }
  }
  
  try {
    await app.listen({ port: 8082 });
    console.log(`${colors.yellow('✓')} Started fastify-proxy on port 8082`);
    return app;
  } catch (err) {
    console.error('Failed to start fastify server:', err);
    throw err;
  }
}

// Check if backends are running
async function checkBackends() {
  console.log('Checking backend services...');
  
  const fetch = (await import('node-fetch')).default;
  const unavailableBackends: string[] = [];
  
  for (const backend of BACKENDS) {
    try {
      process.stdout.write(`Testing ${backend.name} (${backend.target})... `);
      await fetch(backend.target, { timeout: 2000 });
      console.log(colors.green('OK'));
    } catch (error) {
      console.log(colors.red('NOT AVAILABLE'));
      unavailableBackends.push(backend.name);
    }
  }
  
  if (unavailableBackends.length > 0) {
    console.log(`\n${colors.yellow('WARNING:')} Some backend services are unavailable:`);
    unavailableBackends.forEach(b => console.log(`- ${b}`));
    console.log(`\nPlease run the mock backends first with: ${colors.cyan('npx ts-node tests/mock-backends.ts')}\n`);
    return false;
  }
  
  return true;
}

// Main function
async function main() {
  console.log(`\n🚀 ${colors.bold('SETTING UP MOCK PROXY SERVERS FOR BENCHMARKING')}\n`);
  
  // Check if backends are running
  const backendsAvailable = await checkBackends();
  if (!backendsAvailable) {
    console.log('Do you want to continue anyway? (y/n)');
    process.stdin.once('data', (data) => {
      const answer = data.toString().trim().toLowerCase();
      if (answer !== 'y' && answer !== 'yes') {
        console.log('Setup cancelled.');
        process.exit(0);
      }
      startProxies();
    });
  } else {
    startProxies();
  }
}

// Start all proxy servers
async function startProxies() {
  try {
    // Create nginx config
    await createNginxConfig();
    
    // Start http-proxy
    const httpProxyServer = startHttpProxy();
    
    // Start fastify proxy
    const fastifyServer = await startFastifyProxy();
    
    console.log(`\n✅ ${colors.green('All mock proxy servers are running!')}`);
    console.log('\nPress Ctrl+C to stop all servers\n');
    
    // Handle graceful shutdown
    const shutdown = async () => {
      console.log('\nShutting down proxy servers...');
      
      // Close http-proxy server
      httpProxyServer.close(() => {
        console.log(`${colors.blue('✓')} Stopped http-proxy`);
      });
      
      // Close fastify server
      await fastifyServer.close();
      console.log(`${colors.yellow('✓')} Stopped fastify-proxy`);
      
      console.log('\nAll servers stopped. Goodbye!');
      process.exit(0);
    };
    
    // Listen for shutdown signals
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
  } catch (error) {
    console.error('Failed to start proxy servers:', error);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error('Setup failed:', error);
});