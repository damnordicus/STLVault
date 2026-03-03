import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { STLModel } from "../types";
import Viewer3D from "../components/Viewer3D";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { CheckCircle, XCircle, ArrowLeft, Box as BoxIcon, Clock } from "lucide-react";

const formatSize = (bytes: number): string => {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatDate = (ms: number): string =>
  new Date(ms).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [pending, setPending] = useState<STLModel[]>([]);
  const [selected, setSelected] = useState<STLModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [denyOpen, setDenyOpen] = useState(false);
  const [denyReason, setDenyReason] = useState("");

  useEffect(() => {
    api
      .getAdminPending()
      .then(setPending)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load pending models")
      )
      .finally(() => setLoading(false));
  }, []);

  const removeFromList = (id: string) => {
    setPending((prev) => prev.filter((m) => m.id !== id));
    setSelected((cur) => (cur?.id === id ? null : cur));
  };

  const handleApprove = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await api.approveModel(selected.id);
      removeFromList(selected.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDenyConfirm = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await api.denyModel(selected.id, denyReason);
      removeFromList(selected.id);
      setDenyOpen(false);
      setDenyReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deny failed");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh", bgcolor: "background.default" }}>
      {/* Top bar */}
      <Box
        sx={{
          height: 56,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          px: 2,
          gap: 2,
          flexShrink: 0,
        }}
      >
        <Button
          size="small"
          startIcon={<ArrowLeft size={16} />}
          onClick={() => navigate("/")}
          sx={{ textTransform: "none" }}
        >
          Back to Vault
        </Button>
        <Typography variant="subtitle1" fontWeight={700} sx={{ flexGrow: 1 }}>
          Admin — Pending Reviews
        </Typography>
        <Chip
          label={`${pending.length} pending`}
          size="small"
          color={pending.length > 0 ? "warning" : "default"}
        />
      </Box>

      {error && (
        <Box sx={{ px: 3, py: 1, bgcolor: "error.dark" }}>
          <Typography variant="body2" color="error.contrastText">
            {error}
          </Typography>
        </Box>
      )}

      <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left panel — pending list */}
        <Box
          sx={{
            width: 300,
            flexShrink: 0,
            borderRight: 1,
            borderColor: "divider",
            overflowY: "auto",
          }}
        >
          {loading && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
              <CircularProgress size={24} />
            </Box>
          )}

          {!loading && pending.length === 0 && (
            <Box sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>
              <CheckCircle size={36} style={{ opacity: 0.3, marginBottom: 8 }} />
              <Typography variant="body2">No pending uploads</Typography>
            </Box>
          )}

          {pending.map((m) => (
            <Box
              key={m.id}
              onClick={() => setSelected(m)}
              sx={{
                display: "flex",
                gap: 1.5,
                p: 1.5,
                cursor: "pointer",
                borderBottom: 1,
                borderColor: "divider",
                bgcolor: selected?.id === m.id ? "action.selected" : "transparent",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              {/* Thumbnail */}
              <Box
                sx={{
                  width: 56,
                  height: 56,
                  flexShrink: 0,
                  borderRadius: 1,
                  overflow: "hidden",
                  bgcolor: "action.hover",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {m.thumbnail ? (
                  <img
                    src={m.thumbnail}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <BoxIcon size={24} style={{ opacity: 0.4 }} />
                )}
              </Box>

              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600} noWrap title={m.name}>
                  {m.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" noWrap>
                  {m.uploaded_by_email ?? "Unknown user"}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  {formatDate(m.dateAdded)}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>

        {/* Right panel — detail + viewer */}
        {!selected ? (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "text.secondary",
              flexDirection: "column",
              gap: 1,
            }}
          >
            <Clock size={40} style={{ opacity: 0.3 }} />
            <Typography variant="body2">Select a pending upload to review</Typography>
          </Box>
        ) : (
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* 3D viewer */}
            <Box sx={{ flex: 1, minHeight: 0 }}>
              <Viewer3D
                url={selected.url}
                filename={selected.name}
                thumbnail={selected.thumbnail}
              />
            </Box>

            <Divider />

            {/* Info + actions */}
            <Box sx={{ p: 2.5, overflowY: "auto", flexShrink: 0 }}>
              <Typography variant="h6" fontWeight={700} mb={0.5} noWrap title={selected.name}>
                {selected.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={0.5}>
                Submitted by: <strong>{selected.uploaded_by_email ?? "Unknown"}</strong>
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={0.5}>
                Date: {formatDate(selected.dateAdded)} &nbsp;|&nbsp; Size: {formatSize(selected.size)}
              </Typography>

              {selected.tags && selected.tags.length > 0 && (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1 }}>
                  {selected.tags.map((t) => (
                    <Chip key={t} label={t} size="small" />
                  ))}
                </Box>
              )}

              {selected.description && (
                <Typography variant="body2" sx={{ mb: 1.5, whiteSpace: "pre-wrap" }}>
                  {selected.description}
                </Typography>
              )}

              <Box sx={{ display: "flex", gap: 1.5, mt: 1 }}>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<CheckCircle size={16} />}
                  onClick={handleApprove}
                  disabled={actionLoading}
                  sx={{ flex: 1 }}
                >
                  Approve
                </Button>
                <Button
                  variant="contained"
                  color="error"
                  startIcon={<XCircle size={16} />}
                  onClick={() => setDenyOpen(true)}
                  disabled={actionLoading}
                  sx={{ flex: 1 }}
                >
                  Deny
                </Button>
              </Box>
            </Box>
          </Box>
        )}
      </Box>

      {/* Deny dialog */}
      <Dialog open={denyOpen} onClose={() => setDenyOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Deny Upload</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Denying will delete the file and notify the uploader by email. Optionally provide a reason.
          </Typography>
          <TextField
            label="Reason (optional)"
            multiline
            rows={3}
            fullWidth
            value={denyReason}
            onChange={(e) => setDenyReason(e.target.value)}
            placeholder="e.g. Does not meet size requirements, suspected non-.mil content…"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDenyOpen(false); setDenyReason(""); }}>
            Cancel
          </Button>
          <Button
            onClick={handleDenyConfirm}
            color="error"
            variant="contained"
            disabled={actionLoading}
          >
            Confirm Deny
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminDashboard;
