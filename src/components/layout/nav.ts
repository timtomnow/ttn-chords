import {
  Music,
  ListMusic,
  FileText,
  Wrench,
  Store,
  Bell,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export type NavEntry = { to: string; label: string; icon: LucideIcon };

/** Single source of truth for navigation, shared by Sidebar and BottomNav. */
export const NAV: NavEntry[] = [
  { to: '/songs', label: 'Songs', icon: Music },
  { to: '/setlists', label: 'Setlists', icon: ListMusic },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/tools', label: 'Tools', icon: Wrench },
  { to: '/store', label: 'Store', icon: Store },
  { to: '/inbox', label: 'Inbox', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
];
