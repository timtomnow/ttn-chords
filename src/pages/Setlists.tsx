import { Route, Routes } from 'react-router-dom';
import { SetlistList } from './setlists/SetlistList';
import { SetlistEditor } from './setlists/SetlistEditor';
import { SetlistRun } from './setlists/SetlistRun';

export function Setlists() {
  return (
    <Routes>
      <Route index element={<SetlistList />} />
      <Route path=":id" element={<SetlistEditor />} />
      <Route path=":id/run" element={<SetlistRun />} />
    </Routes>
  );
}
