import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { Providers } from './providers';
import { AuthLayout } from '@/layouts/AuthLayout';
import { PortalShell } from '@/layouts/PortalShell';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { LoginPage } from '@/features/auth/LoginPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { WorksheetPage } from '@/features/worksheet/WorksheetPage';
import { ReportHubPage } from '@/features/reports/ReportHubPage';
import { ReportDetailPage } from '@/features/reports/ReportDetailPage';
import { ProjectListPage } from '@/features/projects/ProjectListPage';
import { BrandListPage } from '@/features/brands/BrandListPage';
import { ProjectDetailPage } from '@/features/projects/ProjectDetailPage';
import { TasksTab } from '@/features/projects/detail/tabs/TasksTab';
import { OverviewTab } from '@/features/projects/detail/tabs/OverviewTab';
import { BurndownTab } from '@/features/projects/detail/tabs/BurndownTab';
import { OkrTab } from '@/features/projects/detail/tabs/OkrTab';
import { MembersTab } from '@/features/projects/detail/tabs/MembersTab';

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
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'projects', element: <ProjectListPage /> },
          { path: 'brands', element: <BrandListPage /> },
          {
            path: 'projects/:id',
            element: <ProjectDetailPage />,
            children: [
              { index: true, element: <Navigate to="tasks" replace /> },
              { path: 'tasks', element: <TasksTab /> },
              { path: 'overview', element: <OverviewTab /> },
              { path: 'burndown', element: <BurndownTab /> },
              { path: 'okr', element: <OkrTab /> },
              { path: 'members', element: <MembersTab /> },
            ],
          },
          { path: 'worksheet', element: <WorksheetPage /> },
          { path: 'reports', element: <ReportHubPage /> },
          { path: 'reports/:slug', element: <ReportDetailPage /> },
        ],
      },
      { path: '*', element: <div className="p-8">404</div> },
    ],
  },
]);
