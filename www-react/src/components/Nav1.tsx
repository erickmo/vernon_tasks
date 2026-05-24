import { Link } from 'react-router-dom';
import { env } from '@/lib/env';
import { Breadcrumb } from './Breadcrumb';
import { NotificationDropdown } from './NotificationDropdown';
import { AvatarDropdown } from './AvatarDropdown';

export function Nav1() {
  return (
    <header className="h-16 flex items-center gap-5 px-6 lg:px-8 bg-white/80 backdrop-blur-md border-b border-slate-100 sticky top-0 z-30">
      <Link to="/portal/dashboard" className="flex items-center gap-2.5 shrink-0 group">
        <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-brand to-brand-hover text-white grid place-items-center font-bold shadow-sm group-hover:shadow transition">
          V
        </div>
        <span className="text-[15px] font-semibold tracking-tight text-slate-900 hidden sm:inline">
          {env.APP_NAME}
        </span>
      </Link>
      <div className="h-7 w-px bg-slate-200/80" />
      <div className="flex-1 min-w-0">
        <Breadcrumb />
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <NotificationDropdown />
        <AvatarDropdown />
      </div>
    </header>
  );
}
