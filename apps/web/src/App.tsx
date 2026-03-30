import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { App as CapacitorApp } from "@capacitor/app";

import { useAppBootstrap } from "./hooks/useAppBootstrap";
import { useOfflineSync } from "./hooks/useOfflineSync";
import Layout from "./components/Layout";

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
  const { appReady } = useAppBootstrap();
  useOfflineSync();
  useAndroidBackToHome();

  if (!appReady) {
    return <RouteFallback />;
  }

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="/plants/new" element={<PlantForm />} />
          <Route path="/plants/:id" element={<PlantDetail />} />
          <Route path="/plants/:id/edit" element={<PlantForm />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function useAndroidBackToHome() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let removeListener: (() => Promise<void>) | undefined;

    const setup = async () => {
      const listener = await CapacitorApp.addListener("backButton", async () => {
        if (location.pathname !== "/") {
          navigate("/", { replace: false });
          return;
        }

        try {
          await CapacitorApp.minimizeApp();
        } catch {
          CapacitorApp.exitApp();
        }
      });

      removeListener = () => listener.remove();
    };

    void setup();

    return () => {
      void removeListener?.();
    };
  }, [location.pathname, navigate]);
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
