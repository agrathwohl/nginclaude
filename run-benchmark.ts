#!/usr/bin/env ts-node
/**
 * All-in-one benchmarking script for nginclaude
 * 
 * This script handles everything - starting mock backends, starting all proxy servers,
 * and running the benchmark, all from a single command.
 * 
 * Usage:
 *   npm run full-benchmark
 */

import { spawn, ChildProcess } from 'child_process';
import { performance } from 'perf_hooks';
import readline from 'readline';
import path from 'path';
import colors from 'chalk';
import Table from 'cli-table3';
import fetch from 'node-fetch';

// Configuration
const BENCHMARK_ITERATIONS = 5;
const BENCHMARK_ENDPOINT = '/api/users';
const BENCHMARK_PAYLOAD = JSON.stringify({ test: 'data' });
const STARTUP_DELAY = 5000; // 5 seconds to let all servers start

// Proxy servers to test
const PROXIES = [
  {
    name: 'nginclaude',
    url: 'http://localhost:6000',
    description: 'AI-powered routing (Claude)',
    color: colors.magenta
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

// Results storage
interface Result {
  proxy: string;
  description: string;
  times: number[];
  avg: number;
  min: number;
  max: number;
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
  const url = `${proxy.url}${BENCHMARK_ENDPOINT}`;
  
  if (!results[proxy.name]) {
    results[proxy.name] = {
      proxy: proxy.name,
      description: proxy.description,
      times: [],
      avg: 0,
      min: 0,
      max: 0,
      success: true
    };
  }

  try {
    process.stdout.write(`${proxy.color(`Testing ${proxy.name} [${iteration+1}/${BENCHMARK_ITERATIONS}]:`)} `);
    
    const start = performance.now();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: BENCHMARK_PAYLOAD,
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
  console.log(`Running ${colors.bold(BENCHMARK_ITERATIONS.toString())} iterations against ${colors.bold(BENCHMARK_ENDPOINT)} endpoint\n`);
  
  // Run the tests for each proxy
  for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
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
    if (i < BENCHMARK_ITERATIONS - 1) {
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
    }
  });

  // Display results
  console.log('\n📊 RESULTS:');
  
  // Sort results by average time
  const sortedResults = Object.values(results).sort((a, b) => a.avg - b.avg);
  
  console.log('## Benchmark Results\n');
  console.log('| Proxy | Description | Avg (ms) | Min (ms) | Max (ms) | Status |');
  console.log('| ----- | ----------- | -------- | -------- | -------- | ------ |');
  
  sortedResults.forEach((result) => {
    const status = result.success ? `✓ ${result.statusCode || ''}` : `✗ ${result.error || 'Failed'}`;
    console.log(`| ${result.proxy} | ${result.description} | ${result.avg.toFixed(2)} | ${result.min.toFixed(2)} | ${result.max.toFixed(2)} | ${status} |`);
  });
  
  // Calculate how much slower nginclaude is
  if (results['nginclaude'] && results['http-proxy'] && results['nginclaude'].success && results['http-proxy'].success) {
    const ratio = results['nginclaude'].avg / results['http-proxy'].avg;
    console.log(`\n⏱️  ${colors.magenta('nginclaude')} is ${colors.bold(ratio.toFixed(2))}x slower than ${colors.blue('http-proxy')} on average`);
    console.log(`   This is the cost of adding AI-powered intelligence to your routing decisions.`);
  }

  console.log('\n📝 NOTES:');
  console.log('- First requests to nginclaude may be slower due to cold starts or API latency');
  console.log('- For production use, consider caching common routing decisions');
  console.log('- Cost per request includes both latency and Anthropic API charges\n');
  
  // Exit everything
  console.log(colors.green('All tests complete! Shutting down...'));
  cleanup();
}

// Process management
const processes: ChildProcess[] = [];

function spawnProcess(command: string, args: string[], name: string): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    console.log(`Starting ${colors.cyan(name)}...`);
    
    const proc = spawn(command, args, {
      stdio: 'pipe',
      shell: true,
      cwd: process.cwd()
    });
    
    processes.push(proc);
    
    // Buffer to accumulate output for ready detection
    let output = '';
    
    // Handle process output
    proc.stdout?.on('data', (data) => {
      const str = data.toString();
      output += str;
      
      // Only print startup logs
      if (!proc.stdout?.readableEnded) {
        process.stdout.write(`${colors.dim(`[${name}]`)} ${str}`);
      }
      
      // Look for indicators that the server is ready
      if (
        (name === 'mock-backends' && str.includes('All mock backend services are running')) ||
        (name === 'nginclaude' && str.includes('Vercel AI SDK proxy server running')) ||
        (name === 'comparison-proxies' && str.includes('All mock proxy servers are running'))
      ) {
        resolve(proc);
      }
    });
    
    proc.stderr?.on('data', (data) => {
      process.stderr.write(`${colors.red(`[${name}]`)} ${data.toString()}`);
    });
    
    // Set a timeout for server startup
    const timeout = setTimeout(() => {
      // If we get here, we'll assume the process is ready even without explicit confirmation
      if (!proc.killed) {
        console.log(`${colors.yellow(`[${name}]`)} No explicit ready message, but process is running. Continuing...`);
        resolve(proc);
      }
    }, 10000);
    
    proc.on('error', (err) => {
      clearTimeout(timeout);
      console.error(`${colors.red(`[${name}]`)} Failed to start: ${err.message}`);
      reject(err);
    });
    
    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0 && !proc.killed) {
        console.error(`${colors.red(`[${name}]`)} Process exited with code ${code}`);
        reject(new Error(`Process exited with code ${code}`));
      }
    });
  });
}

// Clean up all running processes
function cleanup() {
  console.log('Cleaning up processes...');
  
  // Kill all spawned processes
  processes.forEach(proc => {
    if (!proc.killed) {
      proc.kill('SIGTERM');
    }
  });
  
  // Exit after a short delay
  setTimeout(() => {
    process.exit(0);
  }, 1000);
}

// Handle termination
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  cleanup();
});

// Main function to orchestrate the entire benchmark
async function main() {
  console.log(`\n🚀 ${colors.bold('NGINCLAUDE BENCHMARK')}`);
  console.log(`This script will automatically start all required services and run the benchmark.\n`);
  
  try {
    // Step 1: Start mock backends
    const backendsProcess = await spawnProcess(
      'npx', 
      ['ts-node', path.join(process.cwd(), 'tests', 'mock-backends.ts')],
      'mock-backends'
    );
    console.log(`${colors.green('✓')} Mock backends running`);
    
    // Step 2: Start nginclaude
    const nginclaudeProcess = await spawnProcess(
      'npx', 
      ['ts-node', path.join(process.cwd(), 'src', 'vercel-proxy.ts')],
      'nginclaude'
    );
    console.log(`${colors.green('✓')} nginclaude running`);
    
    // Step 3: Start comparison proxies
    const proxiesProcess = await spawnProcess(
      'npx',
      ['ts-node', path.join(process.cwd(), 'setup-mock-proxies.ts')],
      'comparison-proxies'
    );
    console.log(`${colors.green('✓')} Comparison proxies running`);
    
    // Step 4: Wait for all servers to be fully ready
    console.log(`\n${colors.yellow('!')} Waiting ${STARTUP_DELAY/1000} seconds for all servers to stabilize...`);
    await new Promise(resolve => setTimeout(resolve, STARTUP_DELAY));
    
    // Step 5: Run the benchmark
    await runBenchmark();
    
  } catch (error) {
    console.error(`${colors.red('ERROR:')} Failed to run benchmark:`, error);
    cleanup();
  }
}

// Start everything
main().catch(error => {
  console.error('Top-level error:', error);
  cleanup();
});