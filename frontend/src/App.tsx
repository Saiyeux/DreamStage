import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ScriptAnalysisPage } from './pages'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ScriptAnalysisPage />} />
        <Route path="*" element={<ScriptAnalysisPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
