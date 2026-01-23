import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import {
  HomePage,
  ScriptUploadPage,
  ScriptAnalysisPage,
  GenerationCenterPage,
} from './pages'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="upload" element={<ScriptUploadPage />} />
          <Route path="analysis" element={<ScriptAnalysisPage />} />
          <Route path="generation" element={<GenerationCenterPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
