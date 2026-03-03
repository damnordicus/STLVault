import React, { useState } from "react";
import { Link } from "react-router-dom";
import { authApi } from "../services/auth";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await authApi.forgotPassword(email);
    setLoading(false);
    setSubmitted(true);
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
        component={submitted ? "div" : "form"}
        {...(!submitted && { onSubmit: handleSubmit })}
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
          Reset Password
        </Typography>

        {submitted ? (
          <>
            <Alert severity="info">
              If an account exists for <strong>{email}</strong>, a reset link has been
              sent to that address.
            </Alert>
            <Link to="/login" style={{ textDecoration: "none" }}>
              <Button variant="outlined" fullWidth>
                Back to Sign In
              </Button>
            </Link>
          </>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary">
              Enter your .mil email and we'll send you a reset link.
            </Typography>

            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
              autoFocus
            />

            <Button type="submit" variant="contained" disabled={loading} fullWidth>
              {loading ? <CircularProgress size={22} color="inherit" /> : "Send Reset Link"}
            </Button>

            <Typography variant="body2" textAlign="center">
              <Link to="/login" style={{ color: "inherit" }}>
                Back to Sign In
              </Link>
            </Typography>
          </>
        )}
      </Box>
    </Box>
  );
};

export default ForgotPassword;
