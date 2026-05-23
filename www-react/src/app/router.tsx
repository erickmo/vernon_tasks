import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { Providers } from './providers';
import { AuthLayout } from '@/layouts/AuthLayout';
import { PortalShell } from '@/layouts/PortalShell';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { LoginPage } from '@/features/auth/LoginPage';
import { WorksheetPage } from '@/features/worksheet/WorksheetPage';

function PlaceholderPage({ title }: { title: string }) {
  return <h1 className="text-xl font-semibold">{title}</h1>;
}

function RouterOutlet() {
  return <Outlet />;
}

export const router = createBrowserRouter([
  {
    element: (
      <Providers>
        <RouterOutlet />
      </Providers>
    ),
    children: [
      { path: '/', element: <Navigate to="/portal/dashboard" replace /> },
      {
        path: '/login',
        element: <AuthLayout />,
        children: [{ index: true, element: <LoginPage /> }],
      },
      {
        path: '/portal',
        element: (
          <ProtectedRoute>
            <PortalShell />
          </ProtectedRoute>
        ),
        children: [
          { path: 'dashboard', element: <PlaceholderPage title="Dashboard" /> },
          { path: 'projects', element: <PlaceholderPage title="Projects" /> },
          { path: 'projects/:id', element: <PlaceholderPage title="Project Detail" /> },
          { path: 'worksheet', element: <WorksheetPage /> },
          { path: 'reports', element: <PlaceholderPage title="Reports" /> },
          { path: 'reports/:slug', element: <PlaceholderPage title="Report Detail" /> },
        ],
      },
      { path: '*', element: <div className="p-8">404</div> },
    ],
  },
]);
