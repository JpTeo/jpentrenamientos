import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

/**
 * Sin las variables de entorno, `initializeApp` explota al importar el módulo
 * y se cae toda la app (pantalla en blanco, sin pistas de por qué). Detectamos
 * ese caso y dejamos los servicios en null: la app puede arrancar igual y
 * mostrar el login o el juego, que no necesita Firebase.
 */
export const firebaseListo = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)

export const app = firebaseListo ? initializeApp(firebaseConfig) : null
export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null
export const storage = app ? getStorage(app) : null

if (!firebaseListo && import.meta.env.DEV) {
  console.warn(
    'Firebase sin configurar: copiá .env.example a .env y completá las variables ' +
      'VITE_FIREBASE_*. Mientras tanto, el login no funciona (Teo Kart en /kart sí).',
  )
}
