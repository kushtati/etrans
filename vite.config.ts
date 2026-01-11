import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src')
        }
      },
      build: {
        target: 'esnext',
        minify: 'esbuild',
        cssMinify: true,
        rollupOptions: {
          output: {
            manualChunks: {
              'react-vendor': ['react', 'react-dom'],
              'ui-icons': ['lucide-react'],
              'charts': ['recharts'], // Lazy loaded, sera un chunk séparé
              'pdf-export': ['jspdf', 'jspdf-autotable'],
              'utils': ['uuid', 'dompurify']
            }
          }
        },
        chunkSizeWarningLimit: 1000,
        // ⚡ Optimisations performance supplémentaires
        sourcemap: false, // Désactiver sourcemaps en production
        reportCompressedSize: true
      },
      optimizeDeps: {
        include: ['react', 'react-dom', 'lucide-react'],
        exclude: ['@google/genai']
      },
      server: {
        port: 5173,
        host: 'localhost',
        proxy: {
          '/api': {
            target: 'http://127.0.0.1:3001',
            changeOrigin: true,
            secure: false
          }
        }
      },
      plugins: [
        react(),
        visualizer({
          open: true,
          filename: 'dist/stats.html',
          gzipSize: true,
          brotliSize: true
        }),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['favicon.svg', 'favicon-32x32.png', 'favicon-16x16.png'],
          
          manifest: {
            name: 'TransitGuinée Secure',
            short_name: 'TransitGN',
            description: 'Système professionnel de gestion des opérations de transit et dédouanement en Guinée',
            start_url: '/',
            scope: '/',
            display: 'standalone',
            display_override: ['standalone', 'minimal-ui'],
            background_color: '#0f172a',
            theme_color: '#0f172a',
            orientation: 'portrait-primary',
            dir: 'ltr',
            lang: 'fr',
            categories: ['business', 'productivity', 'logistics'],
            icons: [
              {
                src: '/icon-192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any'
              },
              {
                src: '/icon-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any maskable'
              }
            ],
            shortcuts: [
              {
                name: 'Nouveau Dossier',
                short_name: 'Créer',
                description: 'Créer un nouveau dossier de transit',
                url: '/?action=create',
                icons: [{ src: '/shortcut-create.png', sizes: '96x96' }]
              },
              {
                name: 'Mes Dossiers',
                short_name: 'Dossiers',
                description: 'Voir mes dossiers en cours',
                url: '/?action=dashboard',
                icons: [{ src: '/shortcut-dashboard.png', sizes: '96x96' }]
              }
            ]
          },
          
          workbox: {
            // ✅ Cache TOUS les assets du build
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json}'],
            
            // ✅ Taille max cache (50 MB safe mobile - quota IndexedDB)
            maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
            
            // ✅ Stratégies de cache pour API et ressources externes
            runtimeCaching: [
              {
                // API Backend - Network First (données fraîches, fallback cache)
                urlPattern: /^https?:\/\/.*\/api\/.*/i,
                handler: 'NetworkFirst',
                options: {
                  cacheName: 'api-cache',
                  expiration: {
                    maxEntries: 100,
                    maxAgeSeconds: 60 * 60 * 24 // 24 heures
                  },
                  networkTimeoutSeconds: 15, // ✅ Timeout 3G Guinée (balance UX/offline)
                  cacheableResponse: {
                    statuses: [0, 200]
                  }
                }
              },
              {
                // Google Fonts - Cache First (rarement changent)
                urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'google-fonts-cache',
                  expiration: {
                    maxEntries: 10,
                    maxAgeSeconds: 60 * 60 * 24 * 365 // 1 an
                  }
                }
              },
              {
                // Google Fonts Static - Cache First
                urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'gstatic-fonts-cache',
                  expiration: {
                    maxEntries: 20,
                    maxAgeSeconds: 60 * 60 * 24 * 365 // 1 an
                  }
                }
              },
              {
                // Images externes - Stale While Revalidate
                urlPattern: /^https?:.*\.(png|jpg|jpeg|svg|gif|webp)$/i,
                handler: 'StaleWhileRevalidate',
                options: {
                  cacheName: 'images-cache',
                  expiration: {
                    maxEntries: 50,
                    maxAgeSeconds: 60 * 60 * 24 * 30 // 30 jours
                  }
                }
              }
            ],
            
            // ✅ Skip waiting pour updates immédiates
            skipWaiting: true,
            clientsClaim: true,
            
            // ✅ Nettoyage automatique vieux caches
            cleanupOutdatedCaches: true
          },
          
          devOptions: {
            enabled: false, // Service Worker désactivé en dev pour éviter cache
            type: 'module'
          }
        })
      ],
      css: {
        postcss: './postcss.config.js', // ✅ Tailwind CSS optimisé
      },
      define: {
        // ❌ CLÉ API SUPPRIMÉE - Maintenant côté serveur uniquement
        // Conserve uniquement variables publiques non sensibles
        'import.meta.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL || 'http://localhost:3001')
      }
    };
});
