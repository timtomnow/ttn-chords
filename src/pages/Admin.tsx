import { Route, Routes } from 'react-router-dom';
import { RequireAdmin } from '@/auth/RequireAdmin';
import { AdminBundles } from './admin/AdminBundles';
import { AdminBundleEditor } from './admin/AdminBundleEditor';

export function Admin() {
  return (
    <Routes>
      <Route element={<RequireAdmin />}>
        <Route index element={<AdminBundles />} />
        <Route path="bundles/:id" element={<AdminBundleEditor />} />
      </Route>
    </Routes>
  );
}
