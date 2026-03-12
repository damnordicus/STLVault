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
    <div className="flex min-h-screen">
      {/* Left panel — form */}
      <div className="flex flex-col justify-between items-center w-full md:w-[420px] lg:w-[480px] shrink-0 bg-vault-900 px-10 py-12 z-10">
        <div className="flex-1 flex items-center justify-center w-full">
          <Box
            component="form"
            className="flex flex-col w-full max-w-[360px] gap-5"
            onSubmit={handleSubmit}
          >
          <div className="mb-2">
            <Typography variant="h4" fontWeight={700}>
              {APP_NAME.full}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Sign in with your .mil account
            </Typography>
          </div>

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

          <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}>
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
        </div>
        <div className="flex items-center gap-2 text-slate-500 text-xs">
          <span>Powered by</span>
          <img src="/spark.png" alt="Spark" className="h-5 w-auto" />
        </div>
      </div>

      {/* Right panel — image */}
      <div className="hidden md:block flex-1 relative overflow-hidden">
        <img
          src="stlvault-background.png"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* subtle left-edge fade to blend with the dark panel */}
        <div className="absolute inset-0 bg-gradient-to-r from-vault-900/80 via-transparent to-transparent" />
      </div>
    </div>
  );
};

export default Login;
