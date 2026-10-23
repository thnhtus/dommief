// Đặc tả: backlog DM-207. Cây `<Routes>` từ `virtual:dommief/routes`; route `*` cuối cùng.
// Suspense bọc **từng route**, không bọc cả <Routes> (tránh unmount cả trang khi chuyển trang).
import { Suspense, type ComponentType } from 'react';
import { Routes, Route } from 'react-router';
import virtualRoutes from 'virtual:dommief/routes';
import type { RouteModule } from '../routesModule.js';
import { NotFound } from './NotFound.js';

/** Fallback rỗng (không spinner — tránh nháy). Phase 5 theme thay bằng slot. */
export function RouteLoading() {
  return null;
}

/**
 * Dựng `<AppRoutes>` từ `RouteModule[]`; export riêng để test không cần Vite.
 * `<Route path="*">` nằm trong **cùng** `<Routes>` để SSG (DM-404) render 404 qua đúng cây.
 */
export function createAppRoutes(routes: RouteModule[]) {
  return function AppRoutes() {
    return (
      <Routes>
        {routes.map((r) => {
          // SAFETY: RouteModule.component là React.LazyExoticComponent (CONTRACTS §5); typed `unknown` vì repo không có @types/react.
          const Page = r.component as ComponentType;
          return (
            <Route
              key={r.id}
              path={r.path}
              element={
                <Suspense fallback={<RouteLoading />}>
                  <Page />
                </Suspense>
              }
            />
          );
        })}
        <Route path="*" element={<NotFound />} />
      </Routes>
    );
  };
}

export const AppRoutes = createAppRoutes(virtualRoutes);
