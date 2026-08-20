# Planificaciones

App para que un profe cree planificaciones de entrenamiento (ejercicios con
series, repeticiones, peso e imagen) y las comparta con sus alumnos. Cada
alumno tiene su propio login y ve solo lo que le asignaron.

MVP actual:

- Login con email/contraseña (Firebase Auth).
- Panel del profe: alta de alumnos, librería de ejercicios (con imagen) y
  creación/edición de planificaciones.
- Pantalla del alumno: ver sus planificaciones asignadas con series, reps,
  peso e imagen de cada ejercicio.
- Feedback profe-alumno: **no está en este MVP**, queda para la próxima etapa.

## 1. Crear el proyecto de Firebase

1. Andá a <https://console.firebase.google.com> y creá un proyecto nuevo.
2. En **Compilación → Authentication**, activá el proveedor **Correo
   electrónico/contraseña**.
3. En **Compilación → Firestore Database**, creá la base en modo producción
   (la región no importa mucho para el MVP, elegí una cercana).
4. En **Compilación → Storage**, activalo para poder subir las imágenes de
   los ejercicios.
   > Firebase ahora pide el plan **Blaze** (pago por uso) para poder usar
   > Storage en proyectos nuevos. El plan Blaze igual tiene una capa
   > gratuita generosa; con el volumen de uso de este MVP (vos y tus
   > alumnos) no debería generar costos, pero cargá una tarjeta para poder
   > activarlo.
5. En **Configuración del proyecto → General**, bajá hasta "Tus apps",
   creá una app **Web** (ícono `</>`) y copiá el objeto `firebaseConfig`
   que te muestra.

## 2. Configurar las variables de entorno

Copiá `.env.example` a `.env` y completá los valores con los que te dio
Firebase:

```bash
cp .env.example .env
```

## 3. Publicar las reglas de seguridad

Este repo incluye `firestore.rules` y `storage.rules`. Pegá el contenido de
cada archivo en la consola de Firebase:

- Firestore: **Firestore Database → Reglas** → pegar `firestore.rules` → Publicar.
- Storage: **Storage → Reglas** → pegar `storage.rules` → Publicar.

(Más adelante, si querés, se puede automatizar esto con `firebase deploy`
usando Firebase CLI.)

## 4. Crear tu cuenta de profe (una sola vez)

Las reglas de seguridad no permiten crear la primera cuenta de profe desde
la app (a propósito, para que nadie se pueda auto-asignar ese rol). Se crea
a mano, una única vez:

1. En **Authentication → Users → Add user**, cargá tu email y una
   contraseña.
2. Copiá el **User UID** que te genera.
3. En **Firestore Database → Datos**, creá manualmente un documento:
   - Colección: `users`
   - ID del documento: el UID que copiaste
   - Campos: `role` (string) = `coach`, `name` (string) = tu nombre,
     `email` (string) = tu email.

Con eso ya podés entrar a la app con ese email/contraseña y vas a caer en
el panel del profe. Desde ahí podés crear a tus alumnos (la app les genera
una contraseña provisoria que les pasás vos).

## 5. Correr la app en desarrollo

```bash
npm install
npm run dev
```

## Estructura de datos (Firestore)

- `users/{uid}`: `role` (`coach` | `student`), `name`, `email`, `createdBy`
  (uid del profe, solo en alumnos).
- `exercises/{id}`: `name`, `imageUrl`, `createdBy` (uid del profe).
  Librería reutilizable de ejercicios para no tener que subir la misma
  imagen en cada planificación.
- `plans/{id}`: `title`, `studentId`, `studentName`, `coachId`, `items`
  (array de `{ exerciseId, name, imageUrl, sets, reps, weight, notes }`).

## Próximos pasos (fuera del MVP)

- Feedback / comentarios entre profe y alumno por planificación.
- Marcar entrenamientos como completados.
- Notificaciones cuando hay una planificación nueva.
