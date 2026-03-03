import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import CircularProgress from "@mui/material/CircularProgress";
import Box from "@mui/material/Box";

import App from "./App";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Login from "./routes/Login";
import Register from "./routes/Register";
import VerifyEmail from "./routes/VerifyEmail";
import ForgotPassword from "./routes/ForgotPassword";
import Dashboard from "./routes/Dashboard";
import Profile from "./routes/Profile";
import AdminDashboard from "./routes/AdminDashboard";

const darkTheme = createTheme({ palette: { mode: "dark" } });

// Redirects unauthenticated users to /login
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "background.default",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

// Redirects non-admins to /
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "background.default",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!user?.is_superuser) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const RouterRoot: React.FC = () => (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/verify" element={<VerifyEmail />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route
      path="/dashboard"
      element={<ProtectedRoute><Dashboard /></ProtectedRoute>}
    />
    <Route
      path="/profile"
      element={<ProtectedRoute><Profile /></ProtectedRoute>}
    />
    <Route
      path="/admin"
      element={<AdminRoute><AdminDashboard /></AdminRoute>}
    />
    <Route
      path="/*"
      element={
        <ProtectedRoute>
          <App />
        </ProtectedRoute>
      }
    />
  </Routes>
);

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <BrowserRouter>
        <AuthProvider>
          <RouterRoot />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
