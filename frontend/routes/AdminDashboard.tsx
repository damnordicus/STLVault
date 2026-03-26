import React, { useEffect, useMemo, useState } from "react";
import Navbar from "../components/Navbar";
import { api } from "../services/api";
import { Folder, STLModel } from "../types";
import Viewer3D from "../components/Viewer3D";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { CheckCircle, XCircle, Box as BoxIcon, Clock, FolderOpen, RefreshCw, ArrowLeft, Users } from "lucide-react";
import FolderBreadcrumbPicker from "../components/FolderBreadcrumbPicker";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";

type PendingFolder = Folder & { requested_by_email?: string; parent_name?: string | null };

type AdminUser = {
  id: string;
  email: string;
  display_name: string | null;
  is_active: boolean;
  is_verified: boolean;
  is_superuser: boolean;
};

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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [tab, setTab] = useState<"models" | "folders" | "users">("models");

  // Pending models state
  const [pending, setPending] = useState<STLModel[]>([]);
  const [selected, setSelected] = useState<STLModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [denyOpen, setDenyOpen] = useState(false);
  const [denyReason, setDenyReason] = useState("");

  // Pending folders state
  const [pendingFolders, setPendingFolders] = useState<PendingFolder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [folderError, setFolderError] = useState("");
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveNames, setApproveNames] = useState<Record<string, string>>({});
  const [folderDenyOpen, setFolderDenyOpen] = useState(false);
  const [folderDenyTarget, setFolderDenyTarget] = useState<PendingFolder | null>(null);
  const [folderDenyReason, setFolderDenyReason] = useState("");
  const [folderActionLoading, setFolderActionLoading] = useState(false);

  // Users state
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [userSorting, setUserSorting] = useState<SortingState>([]);

  // User edit modal
  type UserEditField = "is_active" | "is_verified" | "is_superuser";
  const [userEditTarget, setUserEditTarget] = useState<AdminUser | null>(null);
  const [userEditField, setUserEditField] = useState<UserEditField | null>(null);
  const [userEditValue, setUserEditValue] = useState<boolean>(false);
  const [userEditLoading, setUserEditLoading] = useState(false);

  const openUserEdit = (user: AdminUser, field: UserEditField) => {
    setUserEditTarget(user);
    setUserEditField(field);
    setUserEditValue(user[field]);
    setUserEditLoading(false);
  };

  const closeUserEdit = () => {
    setUserEditTarget(null);
    setUserEditField(null);
  };

  const handleUserEditSave = async () => {
    if (!userEditTarget || !userEditField) return;
    setUserEditLoading(true);
    try {
      const updated = await api.patchAdminUser(userEditTarget.id, { [userEditField]: userEditValue });
      setUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u));
      closeUserEdit();
    } catch (e) {
      setUsersError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setUserEditLoading(false);
    }
  };

  // Folder override state for models that include a new-folder request
  const [availableFolders, setAvailableFolders] = useState<Folder[]>([]);
  const [pendingFolderName, setPendingFolderName] = useState("");
  const [overrideFolderId, setOverrideFolderId] = useState<string>("");

  const loadData = () => {
    setLoading(true);
    setFoldersLoading(true);
    setError("");
    setFolderError("");

    api
      .getAdminPending()
      .then(setPending)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load pending models")
      )
      .finally(() => setLoading(false));

    api
      .getPendingFolders()
      .then((data) => {
        console.log("[AdminDashboard] pending folders response:", data);
        setPendingFolders(data);
        const names: Record<string, string> = {};
        data.forEach((f) => { names[f.id] = f.name; });
        setApproveNames(names);
      })
      .catch((e: unknown) => {
        console.error("[AdminDashboard] pending folders error:", e);
        setFolderError(e instanceof Error ? e.message : "Failed to load pending folders");
      })
      .finally(() => setFoldersLoading(false));

    api.getFolders().then(setAvailableFolders).catch(() => {});
  };

  const loadUsers = () => {
    setUsersLoading(true);
    setUsersError("");
    api
      .getAdminUsers()
      .then(setUsers)
      .catch((e: unknown) => setUsersError(e instanceof Error ? e.message : "Failed to load users"))
      .finally(() => setUsersLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (tab === "users" && users.length === 0 && !usersLoading) {
      loadUsers();
    }
  }, [tab]);

  // Reset folder override state whenever selection changes
  useEffect(() => {
    if (selected?.pending_folder) {
      setPendingFolderName(selected.pending_folder.name);
      setOverrideFolderId("");
    } else {
      setPendingFolderName("");
      setOverrideFolderId("");
    }
  }, [selected?.id]);

  const removeFromList = (id: string) => {
    setPending((prev) => prev.filter((m) => m.id !== id));
    setSelected((cur) => (cur?.id === id ? null : cur));
  };

  const handleApprove = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      const folderOverride = selected.pending_folder
        ? overrideFolderId
          ? { folderId: overrideFolderId }
          : { folderName: pendingFolderName }
        : undefined;
      await api.approveModel(selected.id, folderOverride);
      // The pending folder was handled server-side; remove it from local state too
      if (selected.pending_folder) {
        setPendingFolders((prev) => prev.filter((f) => f.id !== selected.pending_folder!.id));
      }
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

  const handleApproveFolder = async (folder: PendingFolder) => {
    setFolderActionLoading(true);
    try {
      await api.approveFolder(folder.id, approveNames[folder.id]);
      setPendingFolders((prev) => prev.filter((f) => f.id !== folder.id));
      setApprovingId(null);
    } catch (e) {
      setFolderError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setFolderActionLoading(false);
    }
  };

  const handleFolderDenyConfirm = async () => {
    if (!folderDenyTarget) return;
    setFolderActionLoading(true);
    try {
      await api.denyFolder(folderDenyTarget.id, folderDenyReason);
      setPendingFolders((prev) => prev.filter((f) => f.id !== folderDenyTarget.id));
      setFolderDenyOpen(false);
      setFolderDenyReason("");
      setFolderDenyTarget(null);
    } catch (e) {
      setFolderError(e instanceof Error ? e.message : "Deny failed");
    } finally {
      setFolderActionLoading(false);
    }
  };

  // --- Users TanStack table ---
  const userColumnHelper = createColumnHelper<AdminUser>();
  const userColumns = useMemo(() => [
    userColumnHelper.accessor("email", {
      header: "Email",
      cell: (info) => info.getValue(),
    }),
    userColumnHelper.accessor("display_name", {
      header: "Display Name",
      cell: (info) => info.getValue() ?? <Typography variant="caption" color="text.disabled">—</Typography>,
    }),
    userColumnHelper.accessor("is_active", {
      header: "Active",
      cell: (info) => info.getValue()
        ? <div className="rounded-xl w-fit px-2 py-0.5 border border-green-500 bg-green-600/30 cursor-pointer hover:opacity-70" onClick={() => openUserEdit(info.row.original, "is_active")}>Active</div>
        : <div className="rounded-xl w-fit px-2 py-0.5 border border-amber-500 bg-amber-600/30 cursor-pointer hover:opacity-70" onClick={() => openUserEdit(info.row.original, "is_active")}>Inactive</div>,
    }),
    userColumnHelper.accessor("is_verified", {
      header: "Verified",
      cell: (info) => info.getValue()
        ? <div className="rounded-xl w-fit px-2 py-0.5 border border-sky-500 bg-sky-600/30 cursor-pointer hover:opacity-70" onClick={() => openUserEdit(info.row.original, "is_verified")}>Verified</div>
        : <div className="rounded-xl w-fit px-2 py-0.5 border border-slate-500 bg-slate-600/30 cursor-pointer hover:opacity-70" onClick={() => openUserEdit(info.row.original, "is_verified")}>Unverified</div>,
    }),
    userColumnHelper.accessor("is_superuser", {
      header: "Role",
      cell: (info) => info.getValue()
        ? <div className="rounded-xl w-fit px-2 py-0.5 border border-red-500 bg-red-600/30 cursor-pointer hover:opacity-70" onClick={() => openUserEdit(info.row.original, "is_superuser")}>Admin</div>
        : <div className="rounded-xl w-fit px-2 py-0.5 border border-slate-500 bg-slate-600/30 cursor-pointer hover:opacity-70" onClick={() => openUserEdit(info.row.original, "is_superuser")}>User</div>,
    })
  ], [openUserEdit]);

  const usersFiltered = useMemo(() => {
    if (!userFilter) return users;
    const q = userFilter.toLowerCase();
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.display_name ?? "").toLowerCase().includes(q)
    );
  }, [users, userFilter]);

  const userTable = useReactTable({
    data: usersFiltered,
    columns: userColumns,
    state: { sorting: userSorting },
    onSortingChange: setUserSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  // On mobile: show detail panel when something is selected
  const showDetail = !!selected;
  const showList = !isMobile || !showDetail;

  // --- List panel ---
  const listPanel = (
    <Box
      sx={{
        width: isMobile ? "100%" : 320,
        flexShrink: 0,
        borderRight: isMobile ? 0 : 1,
        borderColor: "divider",
        display: showList ? "flex" : "none",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider", flexShrink: 0 }}>
        <Tabs
          value={tab}
          onChange={(_e, v) => setTab(v)}
          variant="fullWidth"
          sx={{ flex: 1 }}
        >
          <Tab
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                Models
                {pending.length > 0 && (
                  <Chip label={pending.length} size="small" color="warning" />
                )}
              </Box>
            }
            value="models"
          />
          <Tab
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                Folders
                {pendingFolders.length > 0 && (
                  <Chip label={pendingFolders.length} size="small" color="warning" />
                )}
              </Box>
            }
            value="folders"
          />
          <Tab label="Users" value="users" />
        </Tabs>
        <IconButton
          onClick={() => { loadData(); if (tab === "users") loadUsers(); }}
          size="small"
          sx={{ mx: 0.5 }}
          title="Refresh"
        >
          <RefreshCw size={16} />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto" }}>
        {/* Models tab */}
        {tab === "models" && (
          <>
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
                    <img src={m.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
                  {m.pending_folder && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.25 }}>
                      <FolderOpen size={11} style={{ opacity: 0.6 }} />
                      <Typography variant="caption" color="warning.main" noWrap>
                        + new folder
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Box>
            ))}
          </>
        )}

        {/* Folders tab */}
        {tab === "folders" && (
          <>
            {foldersLoading && (
              <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                <CircularProgress size={24} />
              </Box>
            )}
            {!foldersLoading && folderError && (
              <Typography color="error" sx={{ p: 2 }}>{folderError}</Typography>
            )}
            {!foldersLoading && pendingFolders.length === 0 && (
              <Box sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>
                <CheckCircle size={36} style={{ opacity: 0.3, marginBottom: 8 }} />
                <Typography variant="body2">No pending folder requests</Typography>
              </Box>
            )}
            {pendingFolders.map((f) => (
              <Box key={f.id} sx={{ p: 1.5, borderBottom: 1, borderColor: "divider" }}>
                <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start", mb: 1 }}>
                  <FolderOpen size={20} style={{ marginTop: 2, opacity: 0.6, flexShrink: 0 }} />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>{f.name}</Typography>
                    {f.parent_name && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        Under: {f.parent_name}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary" display="block" noWrap>
                      By: {f.requested_by_email ?? "Unknown"}
                    </Typography>
                  </Box>
                </Box>

                {approvingId === f.id ? (
                  <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                    <TextField
                      size="small"
                      value={approveNames[f.id] ?? f.name}
                      onChange={(e) => setApproveNames((prev) => ({ ...prev, [f.id]: e.target.value }))}
                      placeholder="Folder name"
                      fullWidth
                      autoFocus
                    />
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      onClick={() => handleApproveFolder(f)}
                      disabled={folderActionLoading || !approveNames[f.id]?.trim()}
                    >
                      OK
                    </Button>
                    <Button size="small" onClick={() => setApprovingId(null)}>✕</Button>
                  </Box>
                ) : (
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      color="success"
                      startIcon={<CheckCircle size={14} />}
                      onClick={() => setApprovingId(f.id)}
                      disabled={folderActionLoading}
                      sx={{ flex: 1 }}
                    >
                      Approve
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<XCircle size={14} />}
                      onClick={() => { setFolderDenyTarget(f); setFolderDenyOpen(true); }}
                      disabled={folderActionLoading}
                      sx={{ flex: 1 }}
                    >
                      Deny
                    </Button>
                  </Box>
                )}
              </Box>
            ))}
          </>
        )}
      </Box>
    </Box>
  );

  // --- Users panel (shown in detail area when users tab is active) ---
  const usersPanel = (
    <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", height: "100%" }}>
      <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: "divider", flexShrink: 0 }}>
        <TextField
          size="small"
          placeholder="Filter by email or name…"
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          fullWidth
        />
      </Box>
      <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
        {usersLoading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress size={24} />
          </Box>
        )}
        {!usersLoading && usersError && (
          <Typography color="error">{usersError}</Typography>
        )}
        {!usersLoading && !usersError && (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                {userTable.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((header) => (
                      <th
                        key={header.id}
                        onClick={header.column.getToggleSortingHandler()}
                        style={{
                          textAlign: "left",
                          padding: "8px 12px",
                          borderBottom: "1px solid rgba(255,255,255,0.1)",
                          cursor: header.column.getCanSort() ? "pointer" : "default",
                          whiteSpace: "nowrap",
                          color: "rgba(255,255,255,0.6)",
                          fontWeight: 600,
                          userSelect: "none",
                        }}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === "asc" ? " ↑" : header.column.getIsSorted() === "desc" ? " ↓" : ""}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {userTable.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td colSpan={userColumns.length} style={{ padding: "40px 12px", textAlign: "center", color: "rgba(255,255,255,0.3)" }}>
                      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                        <Users size={32} style={{ opacity: 0.3 }} />
                        <span>No users found</span>
                      </Box>
                    </td>
                  </tr>
                ) : (
                  userTable.getRowModel().rows.map((row) => (
                    <tr key={row.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} style={{ padding: "8px 12px", verticalAlign: "middle" }}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 1, textAlign: "right" }}>
              {userTable.getRowModel().rows.length} of {users.length} users
            </Typography>
          </>
        )}
      </Box>
    </Box>
  );

  // --- Detail panel ---
  const detailPanel = selected ? (
    <Box
      sx={{
        flex: 1,
        display: (!isMobile || showDetail) ? "flex" : "none",
        flexDirection: "column",
        overflow: "hidden",
        height: "100%",
      }}
    >
      {/* Mobile back button */}
      {isMobile && (
        <Box sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: "divider", flexShrink: 0 }}>
          <Button
            startIcon={<ArrowLeft size={16} />}
            onClick={() => setSelected(null)}
            size="small"
          >
            Back to list
          </Button>
        </Box>
      )}

      {/* 3D viewer — fixed height on mobile, flex on desktop */}
      <Box sx={{ height: isMobile ? 260 : undefined, flex: isMobile ? undefined : 1, minHeight: 0, flexShrink: 0 }}>
        <Viewer3D
          url={selected.url}
          filename={selected.name}
          thumbnail={selected.thumbnail}
        />
      </Box>

      <Divider />

      {/* Info + actions — scrollable */}
      <Box sx={{ p: 2, overflowY: "auto", flex: isMobile ? 1 : undefined, flexShrink: 0 }}>
        <Typography variant="h6" fontWeight={700} mb={0.5} noWrap title={selected.name}>
          {selected.name}
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={0.5}>
          Submitted by: <strong>{selected.uploaded_by_email ?? "Unknown"}</strong>
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={1}>
          {formatDate(selected.dateAdded)} &nbsp;·&nbsp; {formatSize(selected.size)}
        </Typography>

        {selected.tags && selected.tags.length > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1 }}>
            {selected.tags.map((t) => (
              <Chip key={t} label={t} size="small" />
            ))}
          </Box>
        )}

        {selected.description && (
          <Typography variant="body2" sx={{ mb: 1.5, whiteSpace: "pre-wrap", color: "text.secondary" }}>
            {selected.description}
          </Typography>
        )}

        {selected.pending_folder && (
          <Box sx={{ mt: 1.5, mb: 1, p: 1.5, border: 1, borderColor: "divider", borderRadius: 1, bgcolor: "action.hover" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
              <FolderOpen size={16} style={{ opacity: 0.7 }} />
              <Typography variant="body2" fontWeight={600}>New Folder Requested</Typography>
            </Box>
            {selected.pending_folder.parent_name && (
              <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                Under: {selected.pending_folder.parent_name}
              </Typography>
            )}
            <TextField
              size="small"
              label="Folder name"
              value={pendingFolderName}
              onChange={(e) => setPendingFolderName(e.target.value)}
              fullWidth
              disabled={!!overrideFolderId}
              sx={{ mb: 1 }}
            />
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
              Or place in existing folder:
            </Typography>
            <FolderBreadcrumbPicker
              folders={availableFolders}
              selectedFolderId={overrideFolderId || null}
              onSelect={(id) => setOverrideFolderId(id ?? "")}
            />
            {overrideFolderId && (
              <Typography variant="caption" color="warning.main" display="block" sx={{ mt: 0.5 }}>
                New folder request will be discarded — model placed in selected folder.
              </Typography>
            )}
          </Box>
        )}

        <Box sx={{ display: "flex", gap: 1.5, mt: 1.5 }}>
          <Button
            variant="contained"
            color="success"
            startIcon={<CheckCircle size={16} />}
            onClick={handleApprove}
            disabled={actionLoading}
            fullWidth
          >
            Approve
          </Button>
          <Button
            variant="contained"
            color="error"
            startIcon={<XCircle size={16} />}
            onClick={() => setDenyOpen(true)}
            disabled={actionLoading}
            fullWidth
          >
            Deny
          </Button>
        </Box>
      </Box>
    </Box>
  ) : (
    // Desktop empty state
    !isMobile ? (
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
    ) : null
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh", bgcolor: "background.default" }}>
      <Navbar showMenuButton={false} />

      {(error || folderError) && (
        <Box sx={{ px: 3, py: 1, bgcolor: "error.dark", flexShrink: 0 }}>
          <Typography variant="body2" color="error.contrastText">
            {error || folderError}
          </Typography>
        </Box>
      )}

      <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {listPanel}
        {tab === "users" ? usersPanel : detailPanel}
      </Box>

      {/* Folder deny dialog */}
      <Dialog open={folderDenyOpen} onClose={() => setFolderDenyOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Deny Folder Request</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Denying will delete the folder request and deny all files uploaded to it. Optionally provide a reason.
          </Typography>
          <TextField
            label="Reason (optional)"
            multiline
            rows={3}
            fullWidth
            value={folderDenyReason}
            onChange={(e) => setFolderDenyReason(e.target.value)}
            placeholder="e.g. Duplicate of existing folder, inappropriate name…"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setFolderDenyOpen(false); setFolderDenyReason(""); setFolderDenyTarget(null); }}>
            Cancel
          </Button>
          <Button onClick={handleFolderDenyConfirm} color="error" variant="contained" disabled={folderActionLoading}>
            Confirm Deny
          </Button>
        </DialogActions>
      </Dialog>

      {/* Model deny dialog */}
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
          <Button onClick={handleDenyConfirm} color="error" variant="contained" disabled={actionLoading}>
            Confirm Deny
          </Button>
        </DialogActions>
      </Dialog>
      {/* User edit modal */}
      <Dialog open={!!userEditTarget} onClose={closeUserEdit} maxWidth="xs" fullWidth>
        <DialogTitle>
          Edit {userEditField === "is_active" ? "Status" : userEditField === "is_verified" ? "Verification" : "Role"}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2} noWrap>
            {userEditTarget?.email}
          </Typography>
          {userEditField === "is_superuser" ? (
            <FormControl fullWidth size="small">
              <InputLabel>Role</InputLabel>
              <Select
                value={userEditValue ? "admin" : "user"}
                label="Role"
                onChange={(e) => setUserEditValue(e.target.value === "admin")}
              >
                <MenuItem value="user">User</MenuItem>
                <MenuItem value="admin">Admin</MenuItem>
              </Select>
            </FormControl>
          ) : (
            <FormControl fullWidth size="small">
              <InputLabel>{userEditField === "is_active" ? "Status" : "Verification"}</InputLabel>
              <Select
                value={userEditValue ? "true" : "false"}
                label={userEditField === "is_active" ? "Status" : "Verification"}
                onChange={(e) => setUserEditValue(e.target.value === "true")}
              >
                {userEditField === "is_active" ? (
                  [<MenuItem key="active" value="true">Active</MenuItem>, <MenuItem key="inactive" value="false">Inactive</MenuItem>]
                ) : (
                  [<MenuItem key="verified" value="true">Verified</MenuItem>, <MenuItem key="unverified" value="false">Unverified</MenuItem>]
                )}
              </Select>
            </FormControl>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeUserEdit}>Cancel</Button>
          <Button onClick={handleUserEditSave} variant="contained" disabled={userEditLoading}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminDashboard;
