import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authApi } from "../services/auth";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

const VerifyEmail: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError("Please enter the 6-digit code from your email.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await authApi.verifyEmailCode(email.trim(), code.trim());
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

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
        component={success ? "div" : "form"}
        onSubmit={success ? undefined : handleSubmit}
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
          Email Verification
        </Typography>

        {success ? (
          <>
            <Alert severity="success">
              Your email has been verified. You can now sign in.
            </Alert>
            <Button variant="contained" onClick={() => navigate("/login")} fullWidth>
              Sign In
            </Button>
          </>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary">
              Enter the 6-digit code sent to your .mil email address.
            </Typography>

            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
              autoComplete="email"
            />

            <TextField
              label="6-Digit Code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputProps={{ inputMode: "numeric", maxLength: 6 }}
              required
              fullWidth
              autoFocus={!!searchParams.get("email")}
              placeholder="000000"
            />

            <Button
              type="submit"
              variant="contained"
              disabled={loading}
              fullWidth
              sx={{ mt: 1 }}
            >
              {loading ? <CircularProgress size={22} color="inherit" /> : "Verify Email"}
            </Button>

            <Button variant="text" onClick={() => navigate("/login")} fullWidth>
              Back to Sign In
            </Button>
          </>
        )}
      </Box>
    </Box>
  );
};

export default VerifyEmail;
