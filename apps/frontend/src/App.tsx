import type { App } from "app";
import "./index.css";
import { BrowserRouter, Routes, Route } from "react-router";
import { Signin } from "./pages/Signin";
import { Signup } from "./pages/Signup";
import { Dashboard } from "./pages/Dashboard";
import { Analytics } from "./pages/Analytics";
import { Credits } from "./pages/Credits";
import { ApiKeys } from "./pages/ApiKeys";
import { Memory } from "./pages/Memory";
import { Docs } from "./pages/Docs";
import { Models } from "./pages/Models";
import { Landing } from "./pages/Landing";
import { Playground } from "./pages/Playground";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ElysiaClientContextProvider } from "./providers/Eden";
import { treaty } from "@elysiajs/eden";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { primaryBackendUrl } from "./config/api";

const client = treaty<App>(primaryBackendUrl, {
  fetch: {
    credentials: 'include'
  }
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 15_000,
      retry: 1,
    },
  },
})

export function App() {

  return (
    <QueryClientProvider client={queryClient}>
      <ElysiaClientContextProvider value={client}>
          <BrowserRouter>
            <Routes>
              <Route path={"/"} element={<Landing />} /> 
              <Route path={"/signup"} element={<Signup />} /> 
              <Route path={"/signin"} element={<Signin />} /> 
              <Route path={"/docs"} element={<Docs />} /> 
              <Route path={"/models"} element={<Models />} /> 
              <Route path={"/dashboard"} element={<ProtectedRoute><Dashboard /></ProtectedRoute>} /> 
              <Route path={"/analytics"} element={<ProtectedRoute><Analytics /></ProtectedRoute>} /> 
              <Route path={"/playground"} element={<ProtectedRoute><Playground /></ProtectedRoute>} /> 
              <Route path={"/memory"} element={<ProtectedRoute><Memory /></ProtectedRoute>} /> 
              <Route path={"/credits"} element={<ProtectedRoute><Credits /></ProtectedRoute>} /> 
              <Route path={"/api-keys"} element={<ProtectedRoute><ApiKeys /></ProtectedRoute>} /> 
            </Routes>
          </BrowserRouter>
      </ElysiaClientContextProvider>
    </QueryClientProvider>
  );
}

export default App;
