import Aura from '@primeuix/themes/aura';

export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',

  // 📍 THE MAGIC FIX: Route Proxying
  // routeRules: {
  //   '/api/**': {
  //     proxy: 'http://localhost:9000/api/**'
  //   }
  // },
  // 🚀 Enforce Nuxt 4 features
  future: {
    compatibilityVersion: 4,
  },
  
  // 🛑 Disable Server-Side Rendering (Pure SPA Mode)
  ssr: false,

  // 📦 Load the modules
  modules: [
    '@nuxtjs/tailwindcss',
    '@primevue/nuxt-module',  'nuxt-elysia'
  ],

    nitro: { 
        preset: 'Bun'
    },

  // 🎨 PrimeVue Configuration
  primevue: {
    options: {
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: '.dark',
        }
      }
    }
  },

  runtimeConfig: {
    public: {
      cmsUrl: process.env.CMS_URL || 'http://localhost:3001',
    }
  },

  // 🔤 Load PrimeIcons
  css: ['primeicons/primeicons.css']
})