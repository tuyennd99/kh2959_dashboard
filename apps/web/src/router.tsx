import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '@tanstack/react-router';
import { DashboardPage } from './pages/public/DashboardPage';
import { LoginPage } from './pages/auth/LoginPage';

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

const manageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/manage',
  component: lazyRouteComponent(
    () => import('./pages/manage/ManagePage'),
    'ManagePage',
  ),
});

const routeTree = rootRoute.addChildren([indexRoute, loginRoute, manageRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
