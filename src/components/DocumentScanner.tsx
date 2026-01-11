import React, { useState, useRef, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { Camera, Upload, CheckCircle, Loader2, FileText, AlertTriangle } from 'lucide-react';
import Tesseract from 'tesseract.js';

interface DocumentScannerProps {
  onScanComplete: (analysis: any) => void;
  onClose: () => void;
}

// Security constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_TEXT_LENGTH = 50000; // 50KB text
const UPLOAD_COOLDOWN_MS = 3000; // 3 seconds between uploads
const MAX_UPLOADS_PER_SESSION = 10;
const ANALYSIS_TIMEOUT_MS = 5000;
const MAX_REGEX_MATCHES = 100;

export const DocumentScanner: React.FC<DocumentScannerProps> = ({ onScanComplete, onClose }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [mockFile, setMockFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [uploadCount, setUploadCount] = useState(0);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  const workerRef = useRef<Tesseract.Worker | null>(null);
  const lastUploadTime = useRef<number>(0);

  // Cleanup Tesseract worker on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  /**
   * Validate file signature (magic numbers)
   */
  const validateFileSignature = async (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const arr = new Uint8Array(e.target?.result as ArrayBuffer).subarray(0, 4);
        let header = '';
        for (let i = 0; i < arr.length; i++) {
          header += arr[i].toString(16);
        }
        
        // Check magic numbers
        const validSignatures = [
          'ffd8ffe0', // JPEG
          'ffd8ffe1', // JPEG
          'ffd8ffe2', // JPEG
          '89504e47', // PNG
          '52494646'  // WebP (RIFF)
        ];
        
        resolve(validSignatures.some(sig => header.startsWith(sig)));
      };
      
      reader.onerror = () => resolve(false);
      reader.readAsArrayBuffer(file.slice(0, 4));
    });
  };

  /**
   * Validate file before processing
   */
  const validateFile = async (file: File): Promise<string | null> => {
    if (file.size > MAX_FILE_SIZE) {
      return `Fichier trop volumineux (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`;
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return `Format non autorisé. Formats acceptés: JPEG, PNG, WebP`;
    }

    // Magic number validation (real file type check)
    const isValidSignature = await validateFileSignature(file);
    if (!isValidSignature) {
      return `Fichier corrompu ou format non reconnu`;
    }

    return null;
  };

  /**
   * Sanitize OCR extracted text
   */
  const sanitizeOCRText = (text: string): string => {
    // Remove control characters
    let sanitized = text.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    
    // DOMPurify with strict config
    sanitized = DOMPurify.sanitize(sanitized, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true
    });
    
    // Limit length to prevent DoS
    if (sanitized.length > MAX_TEXT_LENGTH) {
      console.warn('[DocumentScanner] OCR text truncated');
      sanitized = sanitized.substring(0, MAX_TEXT_LENGTH);
    }
    
    return sanitized.trim();
  };

  /**
   * Extract text from image using Tesseract OCR
   */
  const extractTextFromImage = async (file: File): Promise<string> => {
    try {
      // Create worker if not exists
      if (!workerRef.current) {
        workerRef.current = await Tesseract.createWorker('fra');
      }

      const { data: { text } } = await workerRef.current.recognize(file, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round(m.progress * 100));
          }
        }
      });
      
      return sanitizeOCRText(text);
    } catch (error) {
      // Cleanup on error
      if (workerRef.current) {
        await workerRef.current.terminate();
        workerRef.current = null;
      }
      throw error;
    }
  };

  /**
   * Simple text analysis to extract key information with ReDoS protection
   */
  const analyzeExtractedText = (text: string) => {
    const startTime = Date.now();
    
    // Timeout check
    const checkTimeout = () => {
      if (Date.now() - startTime > ANALYSIS_TIMEOUT_MS) {
        throw new Error('Analyse timeout: texte trop complexe');
      }
    };

    const lines = text.split('\n').filter(line => line.trim().length > 0);
    checkTimeout();
    
    // Simplified regex with bounded iterations
    const hsCodePattern = /\b\d{4}[.\s]?\d{2}[.\s]?\d{2}\b/g;
    const hsCodes = [];
    let match;
    let matchCount = 0;
    
    while ((match = hsCodePattern.exec(text)) !== null && matchCount < MAX_REGEX_MATCHES) {
      hsCodes.push(match[0]);
      matchCount++;
      checkTimeout();
    }

    // Extract dates
    const datePattern = /\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/g;
    const dates = [];
    matchCount = 0;
    while ((match = datePattern.exec(text)) !== null && matchCount < MAX_REGEX_MATCHES) {
      dates.push(match[0]);
      matchCount++;
      checkTimeout();
    }

    // Extract amounts
    const amountPattern = /\b\d{1,10}[,.]?\d{0,2}\s?(€|USD|GNF|FCFA)?\b/g;
    const amounts = [];
    matchCount = 0;
    while ((match = amountPattern.exec(text)) !== null && matchCount < MAX_REGEX_MATCHES) {
      amounts.push(match[0]);
      matchCount++;
      checkTimeout();
    }

    return {
      rawText: text,
      extractedData: {
        hsCodes: [...new Set(hsCodes)],
        dates: [...new Set(dates)],
        amounts: [...new Set(amounts)].slice(0, 5),
        lineCount: lines.length,
        confidence: 'medium'
      },
      summary: `Document analysé : ${lines.length} lignes détectées`
    };
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const now = Date.now();
      
      // Rate limiting: Cooldown check
      if (now - lastUploadTime.current < UPLOAD_COOLDOWN_MS) {
        const waitTime = Math.ceil((UPLOAD_COOLDOWN_MS - (now - lastUploadTime.current)) / 1000);
        setError(`Veuillez attendre ${waitTime}s avant le prochain scan`);
        return;
      }
      
      // Rate limiting: Session limit check
      if (uploadCount >= MAX_UPLOADS_PER_SESSION) {
        setError('Limite de scans atteinte. Rafraîchissez la page.');
        return;
      }
      
      if (isAnalyzing) return;

      // Create image preview
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target?.result as string);
      reader.readAsDataURL(file);

      const validationError = await validateFile(file);
      if (validationError) {
        setError(validationError);
        setImagePreview(null);
        return;
      }

      setError(null);
      setMockFile(file);
      setIsAnalyzing(true);
      setProgress(0);
      lastUploadTime.current = now;
      setUploadCount(prev => prev + 1);

      try {
        // Extract text using Tesseract OCR
        const extractedText = await extractTextFromImage(file);
        
        // Analyze extracted text
        const analysis = analyzeExtractedText(extractedText);
        
        onScanComplete(analysis);
      } catch (err: any) {
        console.error('[DocumentScanner] Scan error:', err);
        
        let userMessage = 'Erreur lors de l\'analyse du document.';
        
        if (err.message?.includes('timeout')) {
          userMessage = 'Analyse trop longue. Réessayez avec une image plus petite.';
        } else if (err.message?.includes('memory')) {
          userMessage = 'Mémoire insuffisante. Fermez d\'autres onglets et réessayez.';
        } else if (err.message?.includes('network')) {
          userMessage = 'Erreur réseau. Vérifiez votre connexion.';
        } else if (err.message?.includes('format')) {
          userMessage = 'Format d\'image non reconnu. Utilisez JPEG ou PNG.';
        }
        
        setError(userMessage);
        onScanComplete({ 
          error: err.message || 'Analyse impossible', 
          rawText: '',
          confidence: 'failed'
        });
      } finally {
        setIsAnalyzing(false);
        setProgress(0);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
          <h3 className="font-semibold flex items-center gap-2">
            <Camera size={20} />
            Scanner de Documents
          </h3>
          <button 
            onClick={onClose}
            aria-label="Fermer le scanner de documents"
            className="text-gray-300 hover:text-white text-2xl"
          >
            &times;
          </button>
        </div>

        <div className="p-6 text-center">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
              <AlertTriangle className="flex-shrink-0 text-red-600" size={20} />
              <div className="text-left">
                <p className="text-sm font-semibold text-red-800">Erreur</p>
                <p className="text-xs text-red-700 mt-1">{error}</p>
              </div>
            </div>
          )}

          {!isAnalyzing && !mockFile && (
            <div className="space-y-6">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 hover:bg-gray-50 transition-colors">
                <input
                  type="file"
                  id="doc-upload"
                  className="hidden"
                  onChange={handleFileUpload}
                  accept="image/jpeg,image/png,image/webp"
                  aria-label="Télécharger une photo de document"
                  aria-describedby="upload-help"
                />
                <label htmlFor="doc-upload" className="cursor-pointer flex flex-col items-center gap-3">
                  <div className="bg-blue-100 p-4 rounded-full text-blue-600">
                    <Upload size={32} />
                  </div>
                  <span className="text-slate-600 font-medium">Télécharger une photo</span>
                  <span id="upload-help" className="text-xs text-gray-400">Factures, BL, Certificats (max 10MB)</span>
                </label>
              </div>
              <p className="text-sm text-gray-500 bg-blue-50 p-3 rounded text-left flex gap-2">
                <FileText className="flex-shrink-0 text-blue-500" size={16} />
                Le scanner OCR extraira automatiquement le texte et les données clés du document.
              </p>
              {imagePreview && (
                <div className="mt-4">
                  <p className="text-xs text-slate-600 mb-2 font-medium">Aperçu:</p>
                  <img 
                    src={imagePreview} 
                    alt="Aperçu du document" 
                    className="max-h-48 mx-auto rounded border border-slate-200"
                  />
                </div>
              )}
            </div>
          )}

          {isAnalyzing && (
            <div className="py-12 flex flex-col items-center">
              <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
              <p className="text-slate-700 font-medium">Analyse OCR en cours...</p>
              <p className="text-xs text-gray-500 mt-2">Extraction du texte : {progress}%</p>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-4">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {!isAnalyzing && mockFile && (
            <div className="py-8">
              <CheckCircle className="text-green-500 mx-auto mb-4" size={48} />
              <p className="font-semibold text-slate-800">Scan terminé !</p>
              <p className="text-sm text-gray-500 mb-6">{mockFile.name}</p>
              <button
                onClick={onClose}
                className="bg-slate-900 text-white px-6 py-2 rounded-lg w-full font-medium hover:bg-slate-800 transition-colors"
              >
                Voir les résultats
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};