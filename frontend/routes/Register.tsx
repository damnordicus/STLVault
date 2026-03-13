import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authApi } from "../services/auth";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

const MIN_PASSWORD_LENGTH = 8;

const PoweredBy = () => (
  <div className="flex items-center gap-2 text-slate-500 text-xs">
    <span>Powered by</span>
    <img src="/spark.png" alt="Spark" className="h-5 w-auto" />
  </div>
);

const ImagePanel = () => (
  <div className="hidden md:block flex-1 relative overflow-hidden">
    <img
      src="stlvault-background.png"
      alt=""
      className="absolute inset-0 w-full h-full object-cover"
    />
    <div className="absolute inset-0 bg-gradient-to-r from-vault-900/80 via-transparent to-transparent" />
  </div>
);

const Register: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const validate = (): string => {
    if (!email.toLowerCase().endsWith(".mil")) {
      return "Only .mil email addresses are permitted.";
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (password !== confirm) {
      return "Passwords do not match.";
    }
    return "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setLoading(true);
    try {
      await authApi.register(email, password);
      navigate(`/verify?email=${encodeURIComponent(email)}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
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
                Create Account
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                .mil email addresses only
              </Typography>
            </div>

            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              helperText="Must be a .mil address"
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
              helperText={`Minimum ${MIN_PASSWORD_LENGTH} characters`}
              required
              fullWidth
              autoComplete="new-password"
            />

            <TextField
              label="Confirm Password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              fullWidth
              autoComplete="new-password"
            />

            <Button
              type="submit"
              variant="contained"
              disabled={loading}
              fullWidth
              sx={{ mt: 1 }}
            >
              {loading ? <CircularProgress size={22} color="inherit" /> : "Create Account"}
            </Button>

            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Already have an account?{" "}
              <Link to="/login" style={{ color: "inherit" }}>
                Sign in
              </Link>
            </Typography>
          </Box>
        </div>
        <PoweredBy />
      </div>

      {/* Right panel — image */}
      <ImagePanel />
    </div>
  );
};

export default Register;
