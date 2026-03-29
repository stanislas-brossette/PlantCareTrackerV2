import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";

import { useAppBootstrap } from "./hooks/useAppBootstrap";
import { useOfflineSync } from "./hooks/useOfflineSync";
import { useAppStore } from "./stores/app";
import Layout from "./components/Layout";

const Setup = lazy(() => import("./pages/Setup"));
const Home = lazy(() => import("./pages/Home"));
const PlantDetail = lazy(() => import("./pages/PlantDetail"));
const PlantForm = lazy(() => import("./pages/PlantForm"));
const Settings = lazy(() => import("./pages/Settings"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      gcTime: 5 * 60 * 1000,
    },
  },
});

function AppRoutes() {
  const { setupComplete, hasLocalData } = useAppStore();
  const { appReady } = useAppBootstrap();
  useOfflineSync();

  if (!appReady) {
    return <RouteFallback />;
  }

  const canEnterApp = setupComplete || hasLocalData;

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {!canEnterApp ? (
          <>
            <Route path="/setup" element={<Setup />} />
            <Route path="*" element={<Navigate to="/setup" replace />} />
          </>
        ) : (
          <>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="/plants/new" element={<PlantForm />} />
              <Route path="/plants/:id" element={<PlantDetail />} />
              <Route path="/plants/:id/edit" element={<PlantForm />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            <Route path="/setup" element={<Setup />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </Suspense>
  );
}

function RouteFallback() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
      Chargement...
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
        <Toaster position="top-center" />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
