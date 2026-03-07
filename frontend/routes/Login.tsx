import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { APP_NAME } from "@/contexts/constants";

const Login: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <div
      className="absolute inset-0 bg-cover bg-center bg-[url(stlvault-background.png)] blur-sm"
    />
    <div
      className="absolute inset-0 bg-cover bg-center bg-black/60"
    />
    <div
      className="absolute inset-0"
      style={{ background: "radial-gradient(ellipse at center, transparent 10%, black 80%)" }}
    />
    <Box
      className="relative z-10"
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Box
        component="form"
        className="flex flex-col bg-vault-800 backdrop-blur-sm w-full max-w-[400px] p-8 rounded-xl border-2 border-vault-700 gap-4 "
        onSubmit={handleSubmit}
        
        >
        <Typography variant="h5" fontWeight={700} textAlign="center">
          {APP_NAME.short}
        </Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center">
          Sign in with your .mil account
        </Typography>

        {error && <Alert severity="error">{error}</Alert>}

        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          inputProps={{ pattern: ".*\\.mil$" }}
          helperText=".mil addresses only"
          required
          fullWidth
          autoComplete="email"
          autoFocus
          />

        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          fullWidth
          autoComplete="current-password"
          />

        <Button
          type="submit"
          variant="contained"
          disabled={loading}
          fullWidth
          sx={{ mt: 1 }}
          >
          {loading ? <CircularProgress size={22} color="inherit" /> : "Sign In"}
        </Button>

        <Box sx={{ display: "flex", justifyContent: "space-between", mt: 1 }}>
          <Typography variant="body2">
            <Link to="/register" style={{ color: "inherit" }}>
              Create account
            </Link>
          </Typography>
          <Typography variant="body2">
            <Link to="/forgot-password" style={{ color: "inherit" }}>
              Forgot password?
            </Link>
          </Typography>
        </Box>
      </Box>
    </Box>
          </>
  );
};

export default Login;
