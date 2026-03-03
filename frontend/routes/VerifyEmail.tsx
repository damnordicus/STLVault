import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authApi } from "../services/auth";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";

const VerifyEmail: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("No verification token found in the URL.");
      return;
    }

    authApi
      .verifyEmail(token)
      .then(() => setStatus("success"))
      .catch((err: unknown) => {
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "Verification failed");
      });
  }, [token]);

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
          Email Verification
        </Typography>

        {status === "verifying" && (
          <>
            <CircularProgress sx={{ mx: "auto" }} />
            <Typography variant="body2" color="text.secondary">
              Verifying your email…
            </Typography>
          </>
        )}

        {status === "success" && (
          <>
            <Alert severity="success">
              Your email has been verified. You can now sign in.
            </Alert>
            <Button variant="contained" onClick={() => navigate("/login")} fullWidth>
              Sign In
            </Button>
          </>
        )}

        {status === "error" && (
          <>
            <Alert severity="error">{errorMsg}</Alert>
            <Button variant="outlined" onClick={() => navigate("/login")} fullWidth>
              Back to Sign In
            </Button>
          </>
        )}
      </Box>
    </Box>
  );
};

export default VerifyEmail;
