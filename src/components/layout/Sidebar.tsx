import { NavLink } from 'react-router-dom';
import { HelpCircle, ShieldCheck } from 'lucide-react';
import { Logo } from './Logo';
import { NAV } from './nav';
import { InboxBadge } from './InboxBadge';
import { useAuth } from '@/auth/AuthProvider';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
    isActive
      ? 'bg-accent text-accent-fg'
      : 'text-ink-700 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800',
  ].join(' ');

export function Sidebar() {
  const { isAdmin } = useAuth();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900 md:flex md:flex-col">
      <div className="px-6 py-6">
        <Logo />
      </div>
      <nav className="flex-1 px-3">
        <ul className="space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink to={to} className={linkClass}>
                <Icon size={18} />
                {label}
                {to === '/inbox' && <InboxBadge variant="sidebar" />}
              </NavLink>
            </li>
          ))}
          {isAdmin && (
            <li>
              <NavLink to="/admin" className={linkClass}>
                <ShieldCheck size={18} />
                Admin
              </NavLink>
            </li>
          )}
          <li>
            <NavLink to="/help" className={linkClass}>
              <HelpCircle size={18} />
              Help
            </NavLink>
          </li>
        </ul>
      </nav>
    </aside>
  );
}
