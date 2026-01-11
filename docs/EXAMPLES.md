# 💡 Exemples d'Utilisation - API Gemini Sécurisée

## Frontend React - Appels AI

### Exemple 1 : Analyser une Facture Commerciale

```typescript
import { analyzeTransitInfo } from '../services/geminiService';

const ShipmentForm = () => {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyzeInvoice = async (text: string) => {
    setLoading(true);
    
    try {
      // ✅ Appel sécurisé via backend
      const result = await analyzeTransitInfo(text, 'text/plain');
      
      if (result.error) {
        toast.error(result.error);
        return;
      }
      
      setAnalysis(result);
      
      // Pré-remplir formulaire avec données extraites
      if (result.extractedFields) {
        setValue('description', result.extractedFields.shipmentDescription);
        setValue('origin', result.extractedFields.origin);
        setValue('weight', result.extractedFields.weight);
        setValue('container', result.extractedFields.containerInfo);
      }
      
      toast.success(`Document détecté : ${result.detectedType}`);
      
    } catch (error) {
      toast.error('Erreur lors de l\'analyse');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <textarea 
        placeholder="Coller texte facture..."
        onChange={(e) => handleAnalyzeInvoice(e.target.value)}
      />
      
      {loading && <Spinner>Analyse en cours...</Spinner>}
      
      {analysis && (
        <div className="analysis-result">
          <h3>📄 {analysis.detectedType}</h3>
          <p>{analysis.summary}</p>
          
          {analysis.potentialHsCodes?.length > 0 && (
            <div>
              <strong>Codes SH suggérés :</strong>
              {analysis.potentialHsCodes.map(code => (
                <Badge key={code}>{code}</Badge>
              ))}
            </div>
          )}
          
          {analysis.riskAnalysis && (
            <Alert variant="warning">
              ⚠️ {analysis.riskAnalysis}
            </Alert>
          )}
        </div>
      )}
    </div>
  );
};
```

**Résultat attendu** :
```json
{
  "detectedType": "Facture commerciale",
  "summary": "Importation de 500 conteneurs 40 pieds depuis Shanghai (Chine) contenant véhicules Toyota Corolla 2024",
  "potentialHsCodes": ["8703.24", "8703.32"],
  "riskAnalysis": "Documentation complète. Vérifier certificat d'origine et conformité environnementale.",
  "extractedFields": {
    "shipmentDescription": "500 Véhicules Toyota Corolla 2024",
    "origin": "Shanghai, Chine",
    "weight": "50 000 kg",
    "containerInfo": "Conteneur 40 pieds HC",
    "estimatedArrival": "2025-06-15"
  }
}
```

---

### Exemple 2 : Scanner Document (Image/PDF)

```typescript
import { analyzeTransitInfo } from '../services/geminiService';

const DocumentScanner = () => {
  const handleScanDocument = async (file: File) => {
    // Convertir fichier en base64
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      
      // ✅ Analyser document avec Gemini
      const result = await analyzeTransitInfo(
        base64, 
        file.type // image/jpeg, application/pdf
      );
      
      if (result.error) {
        toast.error(result.error);
        return;
      }
      
      console.log('Document analysé :', result);
      
      // Afficher résultats
      setDocumentData(result.extractedFields);
    };
    
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <input 
        type="file" 
        accept="image/*,application/pdf"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleScanDocument(file);
        }}
      />
    </div>
  );
};
```

**Résultat pour BL (Bill of Lading)** :
```json
{
  "detectedType": "Connaissement (Bill of Lading)",
  "summary": "Transport maritime 2 conteneurs 20 pieds de Marseille vers Conakry",
  "potentialHsCodes": ["8528.72", "8517.62"],
  "riskAnalysis": "Documents conformes. Prévoir inspection douanière standard.",
  "extractedFields": {
    "shipmentDescription": "200 TV LED Samsung 55 pouces + 100 Smartphones",
    "origin": "Marseille, France",
    "weight": "4 500 kg",
    "containerInfo": "2x Conteneur 20 pieds DV",
    "estimatedArrival": "2025-02-10"
  }
}
```

---

### Exemple 3 : Assistant Douanes Conversationnel

```typescript
import { askCustomsAssistant } from '../services/geminiService';

const CustomsChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');

  const handleAskQuestion = async () => {
    if (!question.trim()) return;
    
    // Ajouter question utilisateur
    setMessages(prev => [...prev, {
      role: 'user',
      text: question
    }]);
    
    setQuestion('');
    
    // ✅ Appel assistant sécurisé
    const answer = await askCustomsAssistant(question);
    
    // Ajouter réponse assistant
    setMessages(prev => [...prev, {
      role: 'assistant',
      text: answer
    }]);
  };

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <div className="avatar">
              {msg.role === 'user' ? '👤' : '🤖'}
            </div>
            <div className="text">{msg.text}</div>
          </div>
        ))}
      </div>
      
      <div className="input-area">
        <input 
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleAskQuestion()}
          placeholder="Posez votre question sur les douanes..."
        />
        <button onClick={handleAskQuestion}>
          Envoyer
        </button>
      </div>
    </div>
  );
};
```

**Exemple conversation** :

```
👤 User: Quels documents sont requis pour importer des véhicules en Guinée ?

🤖 Assistant: Pour importer des véhicules en Guinée, vous devez fournir :

1. **Documents obligatoires :**
   - Facture commerciale originale
   - Connaissement (Bill of Lading) maritime ou aérien
   - Certificat d'origine
   - Certificat de conformité véhicule
   - Carte grise ou document d'immatriculation d'origine

2. **Documents douaniers :**
   - Déclaration en douane (DUM)
   - Bon à enlever (BAE) après paiement droits
   - Attestation de vérification BIVAC/SGS

3. **Taxes applicables :**
   - Droits de douane : 5-20% selon cylindrée
   - TVA : 18%
   - Taxe statistique : 1%
   - Redevance CEDEAO : 0.5%

4. **Restrictions :**
   - Véhicules > 8 ans interdits (sauf utilitaires)
   - Véhicules droite interdits
   - Certificat anti-pollution requis

Délai moyen traitement : 7-10 jours après arrivée port.

---

👤 User: Quel est le code SH pour des smartphones ?

🤖 Assistant: Le code SH (Système Harmonisé) pour les smartphones est :

**8517.13** - Téléphones pour réseaux cellulaires ou pour autres réseaux sans fil

**Détails :**
- Chapitre 85 : Machines électriques
- Position 8517 : Appareils téléphoniques
- Sous-position 8517.13 : Smartphones

**Droits de douane Guinée :**
- Droit de douane : 5%
- TVA : 18%
- Taxe statistique : 1%
- Redevance CEDEAO : 0.5%

**Total taxes** : ~24.5% de la valeur CIF

**Documents requis :**
- Facture commerciale
- Certificat IMEI si > 10 unités
- Certificat de conformité technique
```

---

## Backend Express - Routes AI

### Exemple 1 : Test Manuel cURL

```bash
# PowerShell
$TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Analyser texte
$body = @{
    input = "FACTURE COMMERCIALE\nDate: 2025-01-10\nFournisseur: CHINA EXPORT CO\nClient: GUINEE IMPORT SARL\n\nDésignation: 500 Conteneurs 40 pieds\nContenu: Véhicules Toyota Corolla 2024\nOrigine: Shanghai, Chine\nPoids: 50 000 kg\nValeur: 25 000 000 USD"
    mimeType = "text/plain"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "http://localhost:3001/api/ai/analyze" `
  -Method POST `
  -Headers @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $TOKEN"
  } `
  -Body $body

# Question assistant
$question = @{
    question = "Quels documents pour importer des véhicules ?"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "http://localhost:3001/api/ai/assistant" `
  -Method POST `
  -Headers @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $TOKEN"
  } `
  -Body $question
```

### Exemple 2 : Test Rate Limiting

```powershell
# Boucle 101 requêtes pour tester limite
$TOKEN = "votre_token_jwt"

for ($i=1; $i -le 101; $i++) {
  try {
    $body = @{ input = "test $i"; mimeType = "text/plain" } | ConvertTo-Json
    
    $response = Invoke-RestMethod `
      -Uri "http://localhost:3001/api/ai/analyze" `
      -Method POST `
      -Headers @{
        "Authorization" = "Bearer $TOKEN"
        "Content-Type" = "application/json"
      } `
      -Body $body
      
    Write-Host "✅ Request $i : OK"
    
  } catch {
    Write-Host "❌ Request $i : FAILED - $($_.Exception.Message)"
    
    if ($_.Exception.Message -like "*429*") {
      Write-Host "🚦 Rate limit atteint à la requête $i"
      break
    }
  }
  
  Start-Sleep -Milliseconds 100
}

# ✅ Attendu : Rate limit à la 101ème requête
```

### Exemple 3 : Monitoring Logs

```typescript
// server/routes/ai.ts - Ajout logs détaillés

router.post('/analyze', authenticateJWT, analyzeLimiter, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { input, mimeType } = req.body;
    
    // Log entrée
    console.log(`[AI] User ${req.user.id} - Analyse started`);
    console.log(`[AI] Input length: ${input.length} chars`);
    console.log(`[AI] MIME type: ${mimeType || 'text/plain'}`);
    
    // Appel Gemini
    const response = await ai.models.generateContent({ /* ... */ });
    const result = JSON.parse(response.text || '{}');
    
    // Log sortie
    const duration = Date.now() - startTime;
    console.log(`[AI] Analysis completed in ${duration}ms`);
    console.log(`[AI] Detected type: ${result.detectedType}`);
    console.log(`[AI] HS codes: ${result.potentialHsCodes?.join(', ')}`);
    
    // Sauvegarder dans DB (audit)
    await db.aiLogs.create({
      userId: req.user.id,
      endpoint: '/ai/analyze',
      inputLength: input.length,
      outputType: result.detectedType,
      duration,
      success: true,
      timestamp: new Date()
    });
    
    res.json(result);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[AI] Error after ${duration}ms:`, error);
    
    // Log erreur
    await db.aiLogs.create({
      userId: req.user.id,
      endpoint: '/ai/analyze',
      success: false,
      error: error.message,
      duration,
      timestamp: new Date()
    });
    
    res.status(500).json({ error: 'Analyse impossible' });
  }
});
```

**Exemple logs production** :
```
[2025-01-15T14:30:00.123Z] POST /api/ai/analyze
[AI] User user_abc123 - Analyse started
[AI] Input length: 1234 chars
[AI] MIME type: text/plain
[AI] Analysis completed in 2345ms
[AI] Detected type: Facture commerciale
[AI] HS codes: 8703.24, 8703.32
[2025-01-15T14:30:02.468Z] POST /api/ai/analyze 200 - 2345ms
```

---

## Gestion Erreurs

### Erreur 401 : Unauthorized

```typescript
try {
  const result = await analyzeTransitInfo(text);
} catch (error) {
  if (error.status === 401) {
    // Rediriger vers login
    localStorage.removeItem('authToken');
    navigate('/login');
    toast.error('Session expirée. Reconnectez-vous.');
  }
}
```

### Erreur 429 : Rate Limit

```typescript
try {
  const result = await analyzeTransitInfo(text);
} catch (error) {
  if (error.status === 429) {
    toast.error(
      'Limite de 100 analyses/jour atteinte. Réessayez demain.',
      { duration: 5000 }
    );
    
    // Afficher compteur
    const resetTime = new Date();
    resetTime.setHours(24, 0, 0, 0);
    
    setRateLimitInfo({
      blocked: true,
      resetAt: resetTime
    });
  }
}
```

### Erreur 500 : Server Error

```typescript
try {
  const result = await analyzeTransitInfo(text);
} catch (error) {
  if (error.status === 500) {
    toast.error('Service temporairement indisponible. Réessayez plus tard.');
    
    // Fallback : Formulaire manuel
    setShowManualForm(true);
  }
}
```

---

## Tests Unitaires

### Test 1 : geminiService.ts

```typescript
// __tests__/services/geminiService.test.ts
import { describe, it, expect, vi } from 'vitest';
import { analyzeTransitInfo } from '../services/geminiService';

describe('geminiService', () => {
  it('should call backend API with correct parameters', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        detectedType: 'Facture',
        summary: 'Test summary'
      })
    });
    
    localStorage.setItem('authToken', 'test_token');
    
    const result = await analyzeTransitInfo('test input', 'text/plain');
    
    expect(fetch).toHaveBeenCalledWith('/api/ai/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test_token'
      },
      body: JSON.stringify({
        input: 'test input',
        mimeType: 'text/plain'
      }),
      credentials: 'include'
    });
    
    expect(result.detectedType).toBe('Facture');
  });
  
  it('should handle 401 error correctly', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401
    });
    
    const result = await analyzeTransitInfo('test');
    
    expect(result.error).toBe('Session expirée. Reconnectez-vous.');
  });
});
```

### Test 2 : Backend Route

```typescript
// __tests__/server/routes/ai.test.ts
import request from 'supertest';
import app from '../../server/index';

describe('POST /api/ai/analyze', () => {
  it('should return 401 without token', async () => {
    const response = await request(app)
      .post('/api/ai/analyze')
      .send({ input: 'test' });
    
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Token manquant');
  });
  
  it('should analyze document with valid token', async () => {
    const token = 'valid_jwt_token';
    
    const response = await request(app)
      .post('/api/ai/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({
        input: 'Facture commerciale test',
        mimeType: 'text/plain'
      });
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('detectedType');
  });
});
```

---

## Performances

### Temps Réponse Gemini

```typescript
// Mesurer performance
const startTime = performance.now();

const result = await analyzeTransitInfo(text);

const duration = performance.now() - startTime;
console.log(`Analyse complétée en ${duration.toFixed(0)}ms`);

// ✅ Attendu :
// - Texte court : 1-2 secondes
// - Image/PDF : 3-5 secondes
// - Timeout : 10 secondes (configuré backend)
```

### Cache Résultats

```typescript
// Cache local pour éviter requêtes répétées
const cache = new Map<string, CachedResult>();

const analyzeWithCache = async (text: string) => {
  const cacheKey = hashString(text);
  
  // Vérifier cache (1h)
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 3600000) {
    console.log('Using cached result');
    return cached.result;
  }
  
  // Appel API
  const result = await analyzeTransitInfo(text);
  
  // Sauvegarder cache
  cache.set(cacheKey, {
    result,
    timestamp: Date.now()
  });
  
  return result;
};
```

---

**Documentation complète** : [docs/AI_SECURITY.md](./AI_SECURITY.md)  
**Mise à jour** : 2025-01-15  
**Version** : 1.0.0
