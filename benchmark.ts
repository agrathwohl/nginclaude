#!/usr/bin/env ts-node
/**
 * Benchmarking script to compare nginclaude performance against other reverse proxies
 * 
 * This script measures request latency across different reverse proxy implementations:
 * - nginclaude (AI-powered routing)
 * - nginx (traditional config-based routing)
 * - http-proxy (simple Node.js based proxy)
 * - fastify-proxy (modern Node.js framework proxy)
 * 
 * Usage:
 *   npx ts-node benchmark.ts [iterations] [endpoint]
 * 
 * Example:
 *   npx ts-node benchmark.ts 10 /api/users
 */

import fetch from 'node-fetch';
import { performance } from 'perf_hooks';
import { createInterface } from 'readline';
import colors from 'chalk';
import Table from 'cli-table3';

// Default config
const DEFAULT_ITERATIONS = 5;
const DEFAULT_ENDPOINT = '/api/users';
const DEFAULT_PAYLOAD = JSON.stringify({ test: 'data' });

// Proxy servers to test (ensure these are running before executing script)
const PROXIES = [
  {
    name: 'nginclaude',
    url: 'http://localhost:3000',
    description: 'AI-powered routing (Claude)',
    color: colors.magenta
  },
  {
    name: 'nginx',
    url: 'http://localhost:8080',
    description: 'Traditional nginx',
    color: colors.green
  },
  {
    name: 'http-proxy',
    url: 'http://localhost:8081',
    description: 'Simple Node proxy',
    color: colors.blue
  },
  {
    name: 'fastify-proxy',
    url: 'http://localhost:8082',
    description: 'Fastify proxy',
    color: colors.yellow
  }
];

// Parse command line arguments
const iterations = process.argv[2] ? parseInt(process.argv[2], 10) : DEFAULT_ITERATIONS;
const endpoint = process.argv[3] || DEFAULT_ENDPOINT;

// Results storage
interface Result {
  proxy: string;
  description: string;
  times: number[];
  avg: number;
  min: number;
  max: number;
  p95: number;
  success: boolean;
  statusCode?: number;
  error?: string;
}

const results: Record<string, Result> = {};

// Helper to calculate percentile
function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  values.sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * values.length) - 1;
  return values[index];
}

// Function to test a single proxy
async function testProxy(proxy: typeof PROXIES[0], iteration: number): Promise<void> {
  const url = `${proxy.url}${endpoint}`;
  
  if (!results[proxy.name]) {
    results[proxy.name] = {
      proxy: proxy.name,
      description: proxy.description,
      times: [],
      avg: 0,
      min: 0,
      max: 0,
      p95: 0,
      success: true
    };
  }

  try {
    process.stdout.write(`${proxy.color(`Testing ${proxy.name} [${iteration+1}/${iterations}]:`)} `);
    
    const start = performance.now();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: DEFAULT_PAYLOAD,
      timeout: 30000 // 30 seconds timeout (Claude can be slow)
    });
    const end = performance.now();
    const time = end - start;
    
    results[proxy.name].times.push(time);
    results[proxy.name].statusCode = response.status;
    
    process.stdout.write(`${time.toFixed(2)}ms\n`);
  } catch (error) {
    results[proxy.name].success = false;
    results[proxy.name].error = error instanceof Error ? error.message : String(error);
    process.stdout.write(`${colors.red('ERROR')}\n`);
  }
}

// Main function to run the benchmark
async function runBenchmark() {
  console.log(`\n🧪 ${colors.bold('REVERSE PROXY BENCHMARK')}`);
  console.log(`Running ${colors.bold(iterations.toString())} iterations against ${colors.bold(endpoint)} endpoint\n`);
  
  // Run the tests for each proxy
  for (let i = 0; i < iterations; i++) {
    for (const proxy of PROXIES) {
      try {
        await testProxy(proxy, i);
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (e) {
        console.error(`Error testing ${proxy.name}:`, e);
      }
    }
    // Larger delay between iterations
    if (i < iterations - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Calculate statistics
  Object.keys(results).forEach(proxyName => {
    const result = results[proxyName];
    if (result.times.length > 0) {
      result.avg = result.times.reduce((a, b) => a + b, 0) / result.times.length;
      result.min = Math.min(...result.times);
      result.max = Math.max(...result.times);
      result.p95 = percentile(result.times, 95);
    }
  });

  // Display results
  console.log('\n📊 RESULTS:');
  
  const table = new Table({
    head: ['Proxy', 'Description', 'Avg (ms)', 'Min (ms)', 'Max (ms)', 'p95 (ms)', 'Status'],
    style: {
      head: ['cyan'],
      border: []
    }
  });

  // Sort results by average time
  const sortedResults = Object.values(results).sort((a, b) => a.avg - b.avg);
  
  sortedResults.forEach((result, index) => {
    const status = result.success 
      ? colors.green(`✓ ${result.statusCode || ''}`) 
      : colors.red(`✗ ${result.error || 'Failed'}`);
      
    // Highlight the winner in green
    const proxyName = index === 0 && result.success 
      ? colors.green.bold(result.proxy) 
      : result.proxy;
      
    table.push([
      proxyName,
      result.description,
      result.avg.toFixed(2),
      result.min.toFixed(2),
      result.max.toFixed(2),
      result.p95.toFixed(2),
      status
    ]);
  });

  console.log(table.toString());
  
  // Calculate how much slower nginclaude is
  if (results['nginclaude'] && results['nginx'] && results['nginclaude'].success && results['nginx'].success) {
    const ratio = results['nginclaude'].avg / results['nginx'].avg;
    console.log(`\n⏱️  ${colors.magenta('nginclaude')} is ${colors.bold(ratio.toFixed(2))}x slower than ${colors.green('nginx')} on average`);
    console.log(`   This is the cost of adding AI-powered intelligence to your routing decisions.`);
  }
  
  console.log('\n📝 NOTES:');
  console.log('- First requests to nginclaude may be slower due to cold starts or API latency');
  console.log('- For production use, consider caching common routing decisions');
  console.log('- Cost per request includes both latency and Anthropic API charges\n');
}

// Check if proxies are running before starting benchmark
async function checkProxiesAndRun() {
  console.log('Checking if proxy servers are running...');
  const unavailableProxies: string[] = [];
  
  // Check each proxy with a quick request
  for (const proxy of PROXIES) {
    try {
      process.stdout.write(`Testing ${proxy.name}... `);
      await fetch(`${proxy.url}/proxy-status`, { 
        timeout: 2000,
        method: 'GET'
      });
      console.log(colors.green('OK'));
    } catch (error) {
      console.log(colors.red('NOT AVAILABLE'));
      unavailableProxies.push(proxy.name);
    }
  }
  
  if (unavailableProxies.length > 0) {
    console.log(`\n${colors.yellow('WARNING:')} The following proxies appear to be unavailable:`);
    unavailableProxies.forEach(p => console.log(`- ${p}`));
    
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise<string>(resolve => {
      rl.question('\nDo you want to continue with available proxies only? (y/n) ', resolve);
    });
    
    rl.close();
    
    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      console.log('Benchmark cancelled.');
      process.exit(0);
    }
  }
  
  await runBenchmark();
}

// Start the benchmark
checkProxiesAndRun().catch(error => {
  console.error('Benchmark failed:', error);
});