#!/usr/bin/env node
/**
 * Railway Startup Script - Force logs visibility
 */

console.log('='.repeat(70));
console.log('RAILWAY STARTUP SCRIPT');
console.log('='.repeat(70));
console.log('Node version:', process.version);
console.log('Working directory:', process.cwd());
console.log('Environment:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'MISSING');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'SET' : 'MISSING');
console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'SET' : 'MISSING');
console.log('='.repeat(70));

console.log('\nStarting server with tsx...\n');

// Lancer tsx avec gestion erreurs
const { spawn } = require('child_process');

const proc = spawn('npx', ['tsx', 'server/index.ts'], {
  stdio: 'inherit',
  env: process.env
});

proc.on('error', (err) => {
  console.error('FATAL: Failed to start tsx:', err);
  process.exit(1);
});

proc.on('exit', (code, signal) => {
  console.error(`tsx process exited with code ${code}, signal ${signal}`);
  process.exit(code || 1);
});
