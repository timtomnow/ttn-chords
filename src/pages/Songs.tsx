import { Route, Routes } from 'react-router-dom';
import { SongList } from './songs/SongList';
import { SongView } from './songs/SongView';
import { SongEditor } from './songs/SongEditor';
import { Perform } from './songs/Perform';

export function Songs() {
  return (
    <Routes>
      <Route index element={<SongList />} />
      <Route path=":id" element={<SongView />} />
      <Route path=":id/edit" element={<SongEditor />} />
      <Route path=":id/perform" element={<Perform />} />
    </Routes>
  );
}
