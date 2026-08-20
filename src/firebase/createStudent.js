import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './config'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// Crea la cuenta del alumno en un app de Firebase secundaria y aislada,
// para que iniciar sesión como el alumno nuevo no cierre la sesión del profe.
export async function createStudentAccount({ name, email, password, coachUid }) {
  const secondaryApp = initializeApp(firebaseConfig, `secondary-${Date.now()}`)
  const secondaryAuth = getAuth(secondaryApp)

  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password)
    const studentUid = credential.user.uid

    await setDoc(doc(db, 'users', studentUid), {
      role: 'student',
      name,
      email,
      createdBy: coachUid,
      createdAt: serverTimestamp(),
    })

    await signOut(secondaryAuth)
    return studentUid
  } finally {
    await deleteApp(secondaryApp)
  }
}
