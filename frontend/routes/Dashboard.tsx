import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import Navbar from "../components/Navbar";
import { api } from "../services/api";
import { STLModel } from "../types";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardMedia from "@mui/material/CardMedia";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import { Box as BoxIcon, FolderOpen, Upload } from "lucide-react";

const formatSize = (bytes: number): string => {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatDate = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

const statusChip = (model: STLModel) => {
  if (model.status === "pending") {
    return <Chip label="Pending review" size="small" color="warning" sx={{ mt: 0.5 }} />;
  }
  if (model.status === "denied") {
    const tip = model.denial_reason ? `Reason: ${model.denial_reason}` : "No reason provided";
    return (
      <Tooltip title={tip} placement="top">
        <Chip label="Denied" size="small" color="error" sx={{ mt: 0.5, cursor: "help" }} />
      </Tooltip>
    );
  }
  return null;
};

const ModelCard: React.FC<{ model: STLModel }> = ({ model }) => (
  <Card
    sx={{
      bgcolor: "background.paper",
      border: 1,
      borderColor: model.status === "denied" ? "error.dark" : model.status === "pending" ? "warning.dark" : "divider",
      height: "100%",
      display: "flex",
      flexDirection: "column",
    }}
  >
    <Box sx={{ position: "relative", pt: "60%", bgcolor: "action.hover" }}>
      {model.thumbnail ? (
        <CardMedia
          component="img"
          image={model.thumbnail}
          alt={model.name ?? ""}
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: model.status === "denied" ? 0.5 : 1,
          }}
        />
      ) : (
        <Box
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "text.disabled",
          }}
        >
          <BoxIcon size={40} />
        </Box>
      )}
    </Box>

    <CardContent sx={{ flexGrow: 1, p: 1.5, "&:last-child": { pb: 1.5 } }}>
      <Typography
        variant="body2"
        fontWeight={600}
        noWrap
        title={model.name ?? ""}
        sx={{ mb: 0.5 }}
      >
        {model.name ?? "Untitled"}
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block">
        {formatSize(model.size)}
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block">
        {formatDate(model.dateAdded)}
      </Typography>
      {statusChip(model)}
    </CardContent>
  </Card>
);

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [models, setModels] = useState<STLModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getMyModels()
      .then(setModels)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load models")
      )
      .finally(() => setLoading(false));
  }, []);

  const totalSize = models.reduce((acc, m) => acc + (m.size || 0), 0);
  const pendingCount = models.filter((m) => m.status === "pending").length;
  const deniedCount = models.filter((m) => m.status === "denied").length;
  const displayName = user?.display_name || user?.email?.split("@")[0] || "Soldier";

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default"}}>
      <Box sx={{ position: "sticky", top: 0, zIndex: 100 }}>
        <Navbar showMenuButton={false} />
      </Box>


      <Box sx={{ maxWidth: 1200, mx: "auto", px: 3, py: 4 }}>
        {/* Welcome */}
        <Typography variant="h5" fontWeight={700} mb={0.5}>
          Welcome back, {displayName}
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>
          {user?.email}
        </Typography>

        {/* Stats */}
        <Box
          sx={{
            display: "flex",
            gap: 2,
            mb: 4,
            flexWrap: "wrap",
          }}
        >
          {[
            { label: "Models uploaded", value: models.length.toString() },
            { label: "Total size", value: formatSize(totalSize) },
            ...(pendingCount > 0 ? [{ label: "Awaiting approval", value: pendingCount.toString() }] : []),
            ...(deniedCount > 0 ? [{ label: "Denied", value: deniedCount.toString() }] : []),
          ].map((stat) => (
            <Box
              key={stat.label}
              sx={{
                flex: "1 1 160px",
                p: 2,
                bgcolor: "background.paper",
                borderRadius: 2,
                border: 1,
                borderColor: "divider",
              }}
            >
              <Typography variant="h4" fontWeight={700}>
                {stat.value}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {stat.label}
              </Typography>
            </Box>
          ))}
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* Model grid */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <Upload size={18} />
          <Typography variant="h6" fontWeight={600}>
            Your Uploads
          </Typography>
        </Box>

        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        )}

        {!loading && error && (
          <Typography color="error">{error}</Typography>
        )}

        {!loading && !error && models.length === 0 && (
          <Box
            className="flex flex-col text-center items-center justify-center border border-dashed border-white/10 py-8 rounded-lg"
          >
            <BoxIcon size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
            <Typography variant="body1">No models uploaded yet</Typography>
            <Typography variant="body2" mt={0.5}>
              Head to the vault to upload your first model
            </Typography>
            <Button
              variant="outlined"
              sx={{ mt: 2 }}
              onClick={() => navigate("/")}
              startIcon={<FolderOpen size={16} />}
            >
              Open Vault
            </Button>
          </Box>
        )}

        {!loading && !error && models.length > 0 && (
          <Grid container spacing={2}>
            {models.map((model) => (
              <Grid key={model.id} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
                <ModelCard model={model} />
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
    </Box>
  );
};

export default Dashboard;
