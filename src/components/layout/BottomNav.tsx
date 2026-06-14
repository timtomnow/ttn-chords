import { NavLink } from 'react-router-dom';
import { NAV } from './nav';

export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/90 backdrop-blur dark:border-ink-800 dark:bg-ink-900/90 md:hidden"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <div
        className="mx-auto grid max-w-md px-2 pb-2 pt-1"
        style={{ gridTemplateColumns: `repeat(${NAV.length}, minmax(0, 1fr))` }}
      >
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                'flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition',
                isActive ? 'text-accent' : 'text-ink-400 dark:text-ink-500',
              ].join(' ')
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
