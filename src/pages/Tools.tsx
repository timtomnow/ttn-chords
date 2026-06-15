import { Route, Routes } from 'react-router-dom';
import { ToolsHome } from './tools/ToolsHome';
import { MetronomePage } from './tools/MetronomePage';
import { TunerPage } from './tools/TunerPage';
import { ChordDiagramsPage } from './tools/ChordDiagramsPage';

export function Tools() {
  return (
    <Routes>
      <Route index element={<ToolsHome />} />
      <Route path="metronome" element={<MetronomePage />} />
      <Route path="tuner" element={<TunerPage />} />
      <Route path="diagrams" element={<ChordDiagramsPage />} />
    </Routes>
  );
}
