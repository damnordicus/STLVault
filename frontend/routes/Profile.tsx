import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { authApi } from "../services/auth";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";

const Profile: React.FC = () => {
  const { user, token, updateProfile } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");

  const [resetStatus, setResetStatus] = useState<"idle" | "sending" | "sent">("idle");

  // Keep the field in sync if the user object updates
  useEffect(() => {
    setDisplayName(user?.display_name ?? "");
  }, [user?.display_name]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus("saving");
    setSaveError("");
    try {
      await updateProfile({ display_name: displayName || null });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
      setSaveStatus("error");
    }
  };

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    setResetStatus("sending");
    await authApi.forgotPassword(user.email);
    setResetStatus("sent");
  };

  const memberSince = user
    ? null // fastapi-users BaseUser doesn't expose created_at by default
    : null;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      {/* Top bar */}
      <Box
        sx={{
          height: 56,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          px: 3,
          gap: 2,
        }}
      >
        <Typography variant="subtitle1" fontWeight={700} sx={{ flexGrow: 1 }}>
          STLVault
        </Typography>
        <Button size="small" onClick={() => navigate("/dashboard")}>
          Dashboard
        </Button>
        <Button size="small" onClick={() => navigate("/")}>
          Browse Vault
        </Button>
      </Box>

      <Box sx={{ maxWidth: 560, mx: "auto", px: 3, py: 4 }}>
        <Typography variant="h5" fontWeight={700} mb={3}>
          Profile Settings
        </Typography>

        {/* Account info */}
        <Box
          sx={{
            p: 2,
            bgcolor: "background.paper",
            borderRadius: 2,
            border: 1,
            borderColor: "divider",
            mb: 3,
            display: "flex",
            alignItems: "center",
            gap: 2,
            flexWrap: "wrap",
          }}
        >
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Signed in as
            </Typography>
            <Typography variant="body1" fontWeight={600}>
              {user?.email}
            </Typography>
          </Box>
          {user?.is_verified && (
            <Chip label="Verified" color="success" size="small" />
          )}
          {user?.is_superuser && (
            <Chip label="Admin" color="primary" size="small" />
          )}
        </Box>

        {/* Display name */}
        <Box
          component="form"
          onSubmit={handleSave}
          sx={{
            p: 3,
            bgcolor: "background.paper",
            borderRadius: 2,
            border: 1,
            borderColor: "divider",
            mb: 3,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <Typography variant="subtitle1" fontWeight={600}>
            Display Name
          </Typography>

          {saveStatus === "error" && (
            <Alert severity="error">{saveError}</Alert>
          )}
          {saveStatus === "saved" && (
            <Alert severity="success">Profile updated.</Alert>
          )}

          <TextField
            label="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name or callsign"
            helperText="Shown on your dashboard instead of your email"
            fullWidth
          />

          <Button
            type="submit"
            variant="contained"
            disabled={saveStatus === "saving"}
            sx={{ alignSelf: "flex-start" }}
          >
            {saveStatus === "saving" ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              "Save Changes"
            )}
          </Button>
        </Box>

        {/* Security */}
        <Box
          sx={{
            p: 3,
            bgcolor: "background.paper",
            borderRadius: 2,
            border: 1,
            borderColor: "divider",
          }}
        >
          <Typography variant="subtitle1" fontWeight={600} mb={1}>
            Security
          </Typography>
          <Divider sx={{ mb: 2 }} />

          {resetStatus === "sent" ? (
            <Alert severity="info">
              A password reset link has been sent to <strong>{user?.email}</strong>.
            </Alert>
          ) : (
            <Box>
              <Typography variant="body2" color="text.secondary" mb={2}>
                To change your password, we'll send a reset link to your .mil address.
              </Typography>
              <Button
                variant="outlined"
                onClick={handlePasswordReset}
                disabled={resetStatus === "sending"}
              >
                {resetStatus === "sending" ? (
                  <CircularProgress size={20} color="inherit" />
                ) : (
                  "Send Password Reset Email"
                )}
              </Button>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default Profile;
