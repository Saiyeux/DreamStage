import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import {
  HomePage,
  ScriptUploadPage,
  ScriptAnalysisPage,
  GenerationCenterPage,
  ConfigPage,
} from './pages'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ScriptAnalysisPage />} />
        <Route path="/upload" element={<ScriptUploadPage />} />
        <Route path="/generation" element={<GenerationCenterPage />} />
        <Route path="/config" element={<ConfigPage />} />
        <Route path="/home" element={<Layout />}>
          <Route index element={<HomePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
