import { Route, Routes } from 'react-router-dom';
import { SongList } from './songs/SongList';
import { SongEditor } from './songs/SongEditor';

export function Songs() {
  return (
    <Routes>
      <Route index element={<SongList />} />
      <Route path=":id" element={<SongEditor />} />
    </Routes>
  );
}
