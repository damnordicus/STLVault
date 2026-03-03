import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authApi } from "../services/auth";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

const MIN_PASSWORD_LENGTH = 12;

const Register: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
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
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
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
        <Box
          sx={{
            width: "100%",
            maxWidth: 400,
            p: 4,
            bgcolor: "background.paper",
            borderRadius: 2,
            border: 1,
            borderColor: "divider",
            display: "flex",
            flexDirection: "column",
            gap: 2,
            textAlign: "center",
          }}
        >
          <Typography variant="h5" fontWeight={700}>
            Check Your Inbox
          </Typography>
          <Alert severity="success">
            A verification link has been sent to <strong>{email}</strong>.
            You must verify your email before signing in.
          </Alert>
          <Typography variant="body2" color="text.secondary">
            Click the link in the email to activate your account.
          </Typography>
          <Button variant="outlined" onClick={() => navigate("/login")} fullWidth>
            Back to Sign In
          </Button>
        </Box>
      </Box>
    );
  }

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
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          width: "100%",
          maxWidth: 400,
          p: 4,
          bgcolor: "background.paper",
          borderRadius: 2,
          border: 1,
          borderColor: "divider",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <Typography variant="h5" fontWeight={700} textAlign="center">
          Create Account
        </Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center">
          .mil email addresses only
        </Typography>

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

        <Typography variant="body2" textAlign="center" mt={1}>
          Already have an account?{" "}
          <Link to="/login" style={{ color: "inherit" }}>
            Sign in
          </Link>
        </Typography>
      </Box>
    </Box>
  );
};

export default Register;
