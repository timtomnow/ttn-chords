import { Route, Routes } from 'react-router-dom';
import { ReportList } from './reports/ReportList';
import { ReportEditor } from './reports/ReportEditor';

// The print view (/reports/:id/print) is a top-level route in App.tsx, rendered
// OUTSIDE the app shell so the printed output is just the report pages.
export function Reports() {
  return (
    <Routes>
      <Route index element={<ReportList />} />
      <Route path=":id" element={<ReportEditor />} />
    </Routes>
  );
}
