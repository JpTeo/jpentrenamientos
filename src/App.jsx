import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Kart from './pages/Kart'
import CoachLayout from './pages/coach/CoachLayout'
import Students from './pages/coach/Students'
import Exercises from './pages/coach/Exercises'
import Plans from './pages/coach/Plans'
import PlanEditor from './pages/coach/PlanEditor'
import Templates from './pages/coach/Templates'
import TemplateEditor from './pages/coach/TemplateEditor'
import StudentLayout from './pages/student/StudentLayout'
import Home from './pages/student/Home'
import MyPlans from './pages/student/MyPlans'
import PlanDetail from './pages/student/PlanDetail'
import Maxes from './pages/student/Maxes'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/kart" element={<Kart />} />

          <Route
            path="/coach"
            element={
              <ProtectedRoute role="coach">
                <CoachLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="planificaciones" replace />} />
            <Route path="plantillas" element={<Templates />} />
            <Route path="plantillas/nueva" element={<TemplateEditor />} />
            <Route path="plantillas/:id" element={<TemplateEditor />} />
            <Route path="planificaciones" element={<Plans />} />
            <Route path="planificaciones/nueva" element={<PlanEditor />} />
            <Route path="planificaciones/:id" element={<PlanEditor />} />
            <Route path="alumnos" element={<Students />} />
            <Route path="ejercicios" element={<Exercises />} />
          </Route>

          <Route
            path="/alumno"
            element={
              <ProtectedRoute role="student">
                <StudentLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Home />} />
            <Route path="planificaciones" element={<MyPlans />} />
            <Route path="planificaciones/:id" element={<PlanDetail />} />
            <Route path="marcas" element={<Maxes />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
