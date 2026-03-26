import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";

import { useAuthStore } from "./stores/auth";
import { useOfflineSync } from "./hooks/useOfflineSync";

import Layout from "./components/Layout";

const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Home = lazy(() => import("./pages/Home"));
const PlantDetail = lazy(() => import("./pages/PlantDetail"));
const PlantForm = lazy(() => import("./pages/PlantForm"));
const Calendar = lazy(() => import("./pages/Calendar"));
const Stats = lazy(() => import("./pages/Stats"));
const Settings = lazy(() => import("./pages/Settings"));
const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-query-devtools").then((module) => ({
        default: module.ReactQueryDevtools,
      }))
    )
  : null;

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
  const { user } = useAuthStore();
  useOfflineSync();

  if (!user) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="/plants/new" element={<PlantForm />} />
          <Route path="/plants/:id" element={<PlantDetail />} />
          <Route path="/plants/:id/edit" element={<PlantForm />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
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
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 2500,
            style: {
              borderRadius: "12px",
              fontSize: "14px",
            },
          }}
        />
      </BrowserRouter>
      {ReactQueryDevtools ? (
        <Suspense fallback={null}>
          <ReactQueryDevtools />
        </Suspense>
      ) : null}
    </QueryClientProvider>
  );
}
