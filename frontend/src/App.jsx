import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Landing from './components/Landing';
import Quiz from './components/Quiz';

function App() {
  return (
    <Routes>
      {/* Landing — always accessible */}
      <Route path="/" element={<Landing />} />

      {/* Quiz — Direct access */}
      <Route path="/quiz" element={<Quiz />} />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;