/**
 * 🧪 TEST COMPLET : Flow d'authentification cross-domain
 * 
 * Teste le parcours complet CSRF + Login depuis frontend Vercel → backend Railway
 * 
 * Usage:
 *   node test-auth-flow.js
 * 
 * Tests:
 *   ✅ GET /api/auth/csrf-token → 200 + 2 cookies
 *   ✅ POST /api/auth/login → 200 + cookie auth_token
 *   ✅ GET /api/auth/me → 200 + user data
 *   ✅ POST /api/auth/logout → 200
 */

import fetch from 'node-fetch';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'fetch-cookie';

const BASE_URL = process.env.API_URL || 'https://etrans-production.up.railway.app';
const ORIGIN = 'https://etrans-eight.vercel.app';

// Créer fetch avec gestion cookies
const cookieJar = new CookieJar();
const fetchWithCookies = wrapper(fetch, cookieJar);

/**
 * Test 1: Récupérer token CSRF
 */
async function testCSRFToken() {
  console.log('\n🔐 Test 1: GET /api/auth/csrf-token');
  
  const response = await fetchWithCookies(`${BASE_URL}/api/auth/csrf-token`, {
    method: 'GET',
    headers: {
      'Origin': ORIGIN
    }
  });
  
  const data = await response.json();
  const cookies = await cookieJar.getCookies(BASE_URL);
  
  console.log(`   Status: ${response.status}`);
  console.log(`   Token: ${data.token.substring(0, 20)}...`);
  console.log(`   Cookies: ${cookies.map(c => c.key).join(', ')}`);
  
  if (response.status !== 200) {
    throw new Error('CSRF token fetch failed');
  }
  
  if (!cookies.find(c => c.key === 'csrf_session')) {
    throw new Error('Cookie csrf_session missing');
  }
  
  if (!cookies.find(c => c.key === 'XSRF-TOKEN')) {
    throw new Error('Cookie XSRF-TOKEN missing');
  }
  
  console.log('   ✅ CSRF token OK\n');
  return data.token;
}

/**
 * Test 2: Login avec credentials
 */
async function testLogin(csrfToken) {
  console.log('🔑 Test 2: POST /api/auth/login');
  
  const response = await fetchWithCookies(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Origin': ORIGIN,
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken
    },
    body: JSON.stringify({
      email: 'admin@transit.gn',
      password: 'AdminSecure123!',
      isHashed: false
    })
  });
  
  const data = await response.json();
  const cookies = await cookieJar.getCookies(BASE_URL);
  
  console.log(`   Status: ${response.status}`);
  console.log(`   User: ${data.user?.email} (${data.user?.role})`);
  console.log(`   Cookies: ${cookies.map(c => c.key).join(', ')}`);
  
  if (response.status !== 200) {
    throw new Error(`Login failed: ${data.message || 'Unknown error'}`);
  }
  
  if (!cookies.find(c => c.key === 'auth_token')) {
    throw new Error('Cookie auth_token missing');
  }
  
  console.log('   ✅ Login OK\n');
  return data;
}

/**
 * Test 3: Vérifier session
 */
async function testMe() {
  console.log('👤 Test 3: GET /api/auth/me');
  
  const response = await fetchWithCookies(`${BASE_URL}/api/auth/me`, {
    method: 'GET',
    headers: {
      'Origin': ORIGIN
    }
  });
  
  const data = await response.json();
  
  console.log(`   Status: ${response.status}`);
  console.log(`   User: ${data.email} (${data.role})`);
  
  if (response.status !== 200) {
    throw new Error('Session check failed');
  }
  
  console.log('   ✅ Session OK\n');
  return data;
}

/**
 * Test 4: Logout
 */
async function testLogout(csrfToken) {
  console.log('🚪 Test 4: POST /api/auth/logout');
  
  const response = await fetchWithCookies(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: {
      'Origin': ORIGIN,
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken
    }
  });
  
  const data = await response.json();
  
  console.log(`   Status: ${response.status}`);
  console.log(`   Message: ${data.message}`);
  
  if (response.status !== 200) {
    throw new Error('Logout failed');
  }
  
  console.log('   ✅ Logout OK\n');
  return data;
}

/**
 * Runner principal
 */
async function runTests() {
  console.log('═══════════════════════════════════════');
  console.log('🧪 TEST FLOW AUTHENTIFICATION CROSS-DOMAIN');
  console.log('═══════════════════════════════════════');
  console.log(`Backend: ${BASE_URL}`);
  console.log(`Origin: ${ORIGIN}\n`);
  
  try {
    // Test 1: CSRF token
    const csrfToken = await testCSRFToken();
    
    // Test 2: Login
    const loginData = await testLogin(csrfToken);
    
    // Test 3: Session check
    await testMe();
    
    // Test 4: Logout
    await testLogout(csrfToken);
    
    console.log('═══════════════════════════════════════');
    console.log('✅ TOUS LES TESTS RÉUSSIS !');
    console.log('═══════════════════════════════════════\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST ÉCHOUÉ:', error.message);
    console.error('═══════════════════════════════════════\n');
    process.exit(1);
  }
}

// Exécuter tests
runTests();
