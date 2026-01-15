/**
 * 🧪 TEST AUTHENTIFICATION AVEC VRAIE GESTION COOKIES
 * 
 * Simule parfaitement un navigateur avec cookies persistants
 * Utilise fetch + tough-cookie pour gérer automatiquement les cookies
 * comme le ferait Chrome/Firefox
 */

import fetch from 'node-fetch';
import { CookieJar } from 'tough-cookie';
import fetchCookie from 'fetch-cookie';

const BASE_URL = 'https://etrans-production.up.railway.app';
const ORIGIN = 'https://etrans-eight.vercel.app';

// Créer cookie jar (comme le navigateur)
const cookieJar = new CookieJar();
const fetchWithCookies = fetchCookie(fetch, cookieJar);

console.log('\n═══════════════════════════════════════');
console.log('🧪 TEST AUTH AVEC GESTION COOKIES NAVIGATEUR');
console.log('═══════════════════════════════════════\n');

async function test() {
  try {
    // 1. GET CSRF Token
    console.log('1️⃣  GET /api/auth/csrf-token');
    const csrfRes = await fetchWithCookies(`${BASE_URL}/api/auth/csrf-token`, {
      method: 'GET',
      headers: { 'Origin': ORIGIN }
    });
    
    const csrfData = await csrfRes.json();
    const cookies1 = await cookieJar.getCookies(BASE_URL);
    
    console.log(`   Status: ${csrfRes.status}`);
    console.log(`   Token: ${csrfData.token.substring(0, 30)}...`);
    console.log(`   Cookies après CSRF:`);
    cookies1.forEach(c => console.log(`      - ${c.key} = ${c.value.substring(0, 20)}...`));
    
    if (csrfRes.status !== 200) {
      throw new Error(`CSRF failed: ${csrfRes.status}`);
    }
    
    // 2. POST Login (cookies envoyés automatiquement par fetch-cookie !)
    console.log('\n2️⃣  POST /api/auth/login');
    console.log(`   Envoi cookies: ${cookies1.map(c => c.key).join(', ')}`);
    console.log(`   Envoi header X-CSRF-Token: ${csrfData.token.substring(0, 30)}...`);
    
    const loginRes = await fetchWithCookies(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Origin': ORIGIN,
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfData.token
      },
      body: JSON.stringify({
        email: 'admin@transit.gn',
        password: 'AdminSecure123!',
        isHashed: false
      })
    });
    
    const loginData = await loginRes.json();
    const cookies2 = await cookieJar.getCookies(BASE_URL);
    
    console.log(`   Status: ${loginRes.status}`);
    
    if (loginRes.status === 200) {
      console.log(`   ✅ LOGIN RÉUSSI !`);
      console.log(`   User: ${loginData.user.email} (${loginData.user.role})`);
      console.log(`   Cookies après login:`);
      cookies2.forEach(c => console.log(`      - ${c.key}`));
    } else {
      console.log(`   ❌ LOGIN ÉCHOUÉ: ${loginData.message}`);
      console.log(`   Cookies présents lors de login:`);
      cookies2.forEach(c => console.log(`      - ${c.key} = ${c.value.substring(0, 20)}...`));
    }
    
    // 3. GET /me (test session)
    if (loginRes.status === 200) {
      console.log('\n3️⃣  GET /api/auth/me');
      const meRes = await fetchWithCookies(`${BASE_URL}/api/auth/me`, {
        method: 'GET',
        headers: { 'Origin': ORIGIN }
      });
      
      const meData = await meRes.json();
      console.log(`   Status: ${meRes.status}`);
      console.log(`   User: ${meData.email} (${meData.role})`);
      
      if (meRes.status === 200) {
        console.log('   ✅ SESSION OK\n');
      }
    }
    
    console.log('═══════════════════════════════════════');
    if (loginRes.status === 200) {
      console.log('✅ TOUS LES TESTS RÉUSSIS !');
    } else {
      console.log('❌ ÉCHEC LOGIN - CSRF ou cookies non persistés');
    }
    console.log('═══════════════════════════════════════\n');
    
    process.exit(loginRes.status === 200 ? 0 : 1);
    
  } catch (error) {
    console.error('\n❌ ERREUR:', error.message);
    process.exit(1);
  }
}

test();
