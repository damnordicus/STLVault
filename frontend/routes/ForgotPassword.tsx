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
    <div className="flex min-h-screen">
      {/* Left panel — form */}
      <div className="flex flex-col justify-between items-center w-full md:w-[420px] lg:w-[480px] shrink-0 bg-vault-900 px-10 py-12 z-10">
        <div className="flex-1 flex items-center justify-center w-full">
          <Box
            component={submitted ? "div" : "form"}
            {...(!submitted && { onSubmit: handleSubmit })}
            className="flex flex-col w-full max-w-[360px] gap-5"
          >
            <div className="mb-2">
              <Typography variant="h4" fontWeight={700}>
                Reset Password
              </Typography>
              {!submitted && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Enter your .mil email and we'll send you a reset link.
                </Typography>
              )}
            </div>

            {submitted ? (
              <>
                <Alert severity="info">
                  If an account exists for <strong>{email}</strong>, a reset link has been
                  sent to that address.
                </Alert>
                <Link to="/login" style={{ textDecoration: "none" }}>
                  <Button variant="outlined" fullWidth sx={{ mt: 1 }}>
                    Back to Sign In
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <TextField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  fullWidth
                  autoFocus
                />

                <Button type="submit" variant="contained" disabled={loading} fullWidth sx={{ mt: 1 }}>
                  {loading ? <CircularProgress size={22} color="inherit" /> : "Send Reset Link"}
                </Button>

                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  <Link to="/login" style={{ color: "inherit" }}>
                    Back to Sign In
                  </Link>
                </Typography>
              </>
            )}
          </Box>
        </div>
        <div className="flex items-center gap-2 text-slate-500 text-xs">
          <span>Powered by</span>
          <img src="/assets/spark.png" alt="Spark" className="h-5 w-auto" />
        </div>
      </div>

      {/* Right panel — image */}
      <div className="hidden md:block flex-1 relative overflow-hidden">
        <img
          src="stlvault-background.png"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-vault-900/80 via-transparent to-transparent" />
      </div>
    </div>
  );
};

export default ForgotPassword;
