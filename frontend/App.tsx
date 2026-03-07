import React, { useState, useEffect } from "react";
import { useAuth } from "./contexts/AuthContext";
import Sidebar from "./components/Sidebar";
import ModelList from "./components/ModelList";
import DetailPanel from "./components/DetailPanel";
import Navbar from "./components/Navbar";
import { STLModel, Folder, StorageStats, STLModelCollection } from "./types";
import { generateThumbnail } from "./services/thumbnailGenerator";
import { api } from "./services/api";
import {
  FolderInput,
  Tags,
  X,
  Trash2,
  AlertTriangle,
  Download,
  FileUp,
  Globe,
  ChevronRight,
  Folder as FolderIcon,
} from "lucide-react";
import JSZip from "jszip";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useVisualViewport } from "./hooks/useVisualViewport";
import Snackbar, { SnackbarCloseReason } from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import { APP_NAME } from "./contexts/constants";

const App = () => {
  const { user } = useAuth();
  const isDesktop = useMediaQuery("(min-width: 1024px)", true);
  const isMobile = !isDesktop;
  const visualViewport = useVisualViewport();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [models, setModels] = useState<STLModel[]>([]);
  const [storageStats, setStorageStats] = useState<StorageStats>({
    used: 0,
    total: 0,
  });

  const [currentFolderId, setCurrentFolderId] = useState<string>("all");
  const [currentFolderParentId, setCurrentFolderParentId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<number>(0);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isMobileSidebarMounted, setIsMobileSidebarMounted] = useState(false);
  const [isMobileSidebarVisible, setIsMobileSidebarVisible] = useState(false);

  // Bulk Action State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [bulkTags, setBulkTags] = useState("");

  const [showPendingSnackbar, setShowPendingSnackbar] = useState(false);

  // Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [browseFolderId, setBrowseFolderId] = useState<string | null>(null);
  const [uploadTags, setUploadTags] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadMode, setUploadMode] = useState<"existing" | "new">("existing");
  const [newFolderName, setNewFolderName] = useState("");

  // Import Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [showImportOptionsModal, setShowImportOptionsModal] = useState(false);
  const [modelsOptions, setModelsOptions] = useState<STLModelCollection[]>([]);
  const [folderOptions, setFolderOptions] = useState<Set<string>>(new Set());
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(
    new Set(),
  );
  const [importUrl, setImportUrl] = useState("");
  const [importFolderId, setImportFolderId] = useState("");
  const port = import.meta.env.VITE_API_URL;
  // Delete Confirmation State
  const [deleteConfirmState, setDeleteConfirmState] = useState<{
    isOpen: boolean;
    type: "single" | "bulk" | "folder";
    id?: string;
  }>({ isOpen: false, type: "single" });

  // Initial Data Fetch
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [fetchedFolders, fetchedModels, fetchedStats, myModels] = await Promise.all(
          [api.getFolders(), api.getModels("all"), api.getStorageStats(), api.getMyModels()],
        );
        setFolders(fetchedFolders);
        // Merge own pending/denied models so the uploader can see them in the vault
        const approvedIds = new Set(fetchedModels.map((m) => m.id));
        const ownPending = myModels.filter((m) => !approvedIds.has(m.id));
        setModels([...fetchedModels, ...ownPending]);
        setStorageStats(fetchedStats);
      } catch (error) {
        console.error("Failed to fetch initial data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  // Refresh storage stats when models change (upload, delete, replace)
  useEffect(() => {
    api
      .getStorageStats()
      .then(setStorageStats)
      .catch((e) => console.error("Failed to refresh storage stats", e));
  }, [models]);

  // Filter models based on selection
  const filteredModels =
    currentFolderId === "all"
      ? models
      : models.filter((m) => m.folderId === currentFolderId);

  // Filter subfolders based on selection
  const filteredFolders =
    currentFolderId === "all"
      ? folders.filter((f) => f.parentId == null)
      : folders.filter((f) => f.parentId === currentFolderId);

  // Clear selection when changing folders to avoid confusion
  useEffect(() => {
    setSelectedIds(new Set());
    setCurrentFolderParentId(
      currentFolderId === "all"
        ? "all"
        : folders.find((f) => f.id === currentFolderId)?.parentId || "all",
    );
  }, [currentFolderId]);

  // Close mobile sidebar when switching to desktop
  useEffect(() => {
    if (isDesktop) setIsMobileSidebarOpen(false);
  }, [isDesktop]);

  // Mobile sidebar animation: keep mounted during close transition
  useEffect(() => {
    const transitionMs = 220;
    let timeoutId: number | undefined;

    if (isMobileSidebarOpen) {
      setIsMobileSidebarMounted(true);
      // Delay visibility to allow initial off-screen position to render before sliding in
      timeoutId = window.setTimeout(() => setIsMobileSidebarVisible(true), 10);
    } else {
      setIsMobileSidebarVisible(false);
      timeoutId = window.setTimeout(
        () => setIsMobileSidebarMounted(false),
        transitionMs,
      );
    }

    return () => {
      if (typeof timeoutId === "number") window.clearTimeout(timeoutId);
    };
  }, [isMobileSidebarOpen]);

  // Mobile sidebar UX: ESC to close + prevent body scroll
  useEffect(() => {
    if (!isMobileSidebarMounted) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMobileSidebarOpen(false);
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isMobileSidebarMounted]);

  const selectedModel = models.find((m) => m.id === selectedModelId) || null;

  const currentFolderName =
    currentFolderId === "all"
      ? "Home"
      : folders.find((f) => f.id === currentFolderId)?.name || "Folder";

  const handleCreateFolder = async (
    name: string,
    parentId: string | null = null,
  ) => {
    try {
      const newFolder = await api.createFolder(name, parentId);
      setFolders((prev) => [...prev, newFolder]);
      // If created under a parent, ensure parent is expanded in Sidebar (Sidebar handles its own expansion state, but good to know)
    } catch (error) {
      console.error("Failed to create folder:", error);
    }
  };

  const handleRenameFolder = async (id: string, newName: string) => {
    try {
      await api.updateFolder(id, newName);
      setFolders((prev) =>
        prev.map((f) => (f.id === id ? { ...f, name: newName } : f)),
      );
    } catch (error) {
      console.error("Failed to rename folder", error);
    }
  };

  const handleDeleteFolder = (id: string) => {
    const hasModels = models.some((m) => m.folderId === id);
    const hasSubfolders = folders.some((f) => f.parentId === id);

    if (hasModels || hasSubfolders) {
      alert(
        "Folder must be empty to delete. Please delete or move all models and subfolders first.",
      );
      return;
    }
    setDeleteConfirmState({ isOpen: true, type: "folder", id });
  };

  // Core upload logic
  const executeUpload = async (
    files: File[],
    targetFolderId: string,
    tags: string[],
    description: string = "",
  ) => {
    setUploadQueue((prev) => prev + files.length);

    for (const file of files) {
      try {
        let thumbnail: string | undefined = undefined;
        try {
          thumbnail = await generateThumbnail(file);
        } catch (e) {
          console.warn(
            "Thumbnail generation failed, uploading without thumbnail",
          );
        }

        const newModel = await api.uploadModel(
          file,
          targetFolderId,
          thumbnail,
          tags,
          description,
        );
        setModels((prev) => [newModel, ...prev]);
        if (newModel.status === "pending") {
          setShowPendingSnackbar(true);
        }
      } catch (error) {
        console.error(`Failed to upload ${file.name}:`, error);
      } finally {
        setUploadQueue((prev) => prev - 1);
      }
    }
  };

  const handleUpload = async (
    fileList: FileList,
    specificFolderId?: string,
  ) => {
    const files = Array.from(fileList);

    // If dropping into the general area ("all") and not a specific folder drop
    // We want to show the modal to let user pick a folder and add tags
    if (!specificFolderId && currentFolderId === "all") {
      setPendingFiles(files);
      setBrowseFolderId(null);
      setUploadTags("");
      setUploadDescription("");
      setUploadMode("existing");
      setNewFolderName("");
      setShowUploadModal(true);
      return;
    }

    // Normal flow (specific folder target or current view is a folder)
    const targetFolderId = specificFolderId || currentFolderId;

    // Fallback if for some reason 'all' is passed without modal (shouldn't happen with above check)
    const finalFolderId =
      targetFolderId === "all" && folders.length > 0
        ? folders[0].id
        : targetFolderId;

    await executeUpload(files, finalFolderId, []);
  };

  const handleConfirmUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    let targetFolderId = browseFolderId ?? "";

    if (uploadMode === "new") {
      if (!newFolderName.trim()) return;
      try {
        const newFolder = await api.createFolder(newFolderName.trim(), browseFolderId);
        targetFolderId = newFolder.id;
        // Don't add pending folder to state — it won't appear until an admin approves it
      } catch (err) {
        console.error("Failed to request folder", err);
        return;
      }
    }

    if (!targetFolderId) return;

    const tags = uploadTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    setShowUploadModal(false);
    await executeUpload(pendingFiles, targetFolderId, tags, uploadDescription);
    setPendingFiles([]);
  };

  const handleOpenImport = () => {
    setImportUrl("");
    setSelectedOptions(new Set());
    setModelsOptions([]);
    // Pre-select current folder if specific, otherwise first available
    setImportFolderId(
      currentFolderId !== "all" ? currentFolderId : folders[0]?.id || "",
    );
    setShowImportModal(true);
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importUrl || !importFolderId) return;

    try {
      const ModelOptions = await api.retrieveModelOptions(importUrl);
      const NewSet = new Set("");
      ModelOptions.forEach((m) => {
        if (!NewSet.has(m.folder)) {
          NewSet.add(m.folder);
        }
      });
      setFolderOptions(NewSet);
      setModelsOptions(ModelOptions);
      setShowImportModal(false);
      setShowImportOptionsModal(true);
    } catch (error) {
      console.error("Import failed:", error);
      alert("Failed to import from URL");
    }
  };

  const handleOptionsToggleSelection = (id: string) => {
    const newSet = new Set(selectedOptions);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedOptions(newSet);
  };

  const handleUpdateSTEPThumbnail = async (newModel: STLModel) => {
    let tbuff = await fetch(port + newModel.url).then((response) => {
      return response;
    });
    let thumbnailBuffer = await tbuff.bytes().then((bytes) => {
      return bytes;
    });
    try {
      let thumbnail = await generateThumbnail(
        new File([thumbnailBuffer], newModel.name),
      );
      let newerModel = await api.updateModel(newModel.id, {
        thumbnail: thumbnail,
      });
      setModels((prev) => [newerModel, ...prev]);
      if (newerModel.status === "pending") {
        setShowPendingSnackbar(true);
      }
    } catch (e) {
      console.warn("Thumbnail generation failed, uploading without thumbnail");
    }
  };

  const handleImportChoice = async () => {
    if (!importUrl || !importFolderId) return;

    setIsLoading(true);
    setShowImportOptionsModal(false);
    setUploadQueue((prev) => prev + selectedOptions.size);
    try {
      for (const model of modelsOptions) {
        if (selectedOptions.has(model.id)) {
          let newModel = await api.importModelFromId(
            model.id,
            model.name,
            model.parentId,
            model.previewPath,
            importFolderId,
            model.typeName,
          );
          await handleUpdateSTEPThumbnail(newModel);
          setUploadQueue((prev) => prev - 1);
        }
      }
    } catch (error) {
      console.error("Import failed:", error);
      alert("Failed to import from URL");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateModel = async (id: string, updates: Partial<STLModel>) => {
    try {
      setModels((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...updates } : m)),
      );
      await api.updateModel(id, updates);
    } catch (error) {
      console.error("Failed to update model:", error);
    }
  };

  const handleDeleteModel = (id: string) => {
    console.log("Opening delete confirmation for model:", id);
    setDeleteConfirmState({ isOpen: true, type: "single", id });
  };

  const handleBulkDelete = () => {
    console.log("Opening bulk delete confirmation for:", selectedIds);
    setDeleteConfirmState({ isOpen: true, type: "bulk" });
  };

  const executeDelete = async () => {
    const { type, id } = deleteConfirmState;
    console.log(`Executing delete type: ${type}, id: ${id}`);

    try {
      if (type === "single" && id) {
        await api.deleteModel(id);
        setModels((prev) => prev.filter((m) => m.id !== id));
        if (selectedModelId === id) setSelectedModelId(null);
      } else if (type === "bulk") {
        const ids = Array.from(selectedIds) as string[];
        await api.bulkDeleteModels(ids);
        setModels((prev) => prev.filter((m) => !ids.includes(m.id)));
        setSelectedIds(new Set());
        if (selectedModelId && ids.includes(selectedModelId))
          setSelectedModelId(null);
      } else if (type === "folder" && id) {
        await api.deleteFolder(id);
        setFolders((prev) => prev.filter((f) => f.id !== id));
        if (currentFolderId === id) setCurrentFolderId("all");
      }
    } catch (error) {
      console.error("Delete operation failed:", error);
      alert("Failed to delete. Please check console.");
    } finally {
      setDeleteConfirmState((prev) => ({ ...prev, isOpen: false }));
    }
  };

  // --- Bulk Actions Logic ---

  const handleToggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleSelectAll = (filtered) => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      const allIds = filtered.map((m) => m.id);
      setSelectedIds(new Set(allIds));
    }
  };

  const handleBulkMoveSubmit = async (targetFolderId: string) => {
    try {
      const ids = Array.from(selectedIds) as string[];
      await api.bulkMoveModels(ids, targetFolderId);
      setModels((prev) =>
        prev.map((m) =>
          selectedIds.has(m.id) ? { ...m, folderId: targetFolderId } : m,
        ),
      );
      setShowMoveModal(false);
      setSelectedIds(new Set());
    } catch (e) {
      console.error("Bulk move failed", e);
    }
  };

  const handleDropMove = async (targetFolderId: string, modelIds: string[]) => {
    try {
      await api.bulkMoveModels(modelIds, targetFolderId);
      setModels((prev) =>
        prev.map((m) =>
          modelIds.includes(m.id) ? { ...m, folderId: targetFolderId } : m,
        ),
      );
      setSelectedIds(new Set());
    } catch (e) {
      console.error("Drop move failed", e);
    }
  };

  const handleBulkTagSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const ids = Array.from(selectedIds) as string[];
      const tags = bulkTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await api.bulkAddTags(ids, tags);
      setModels((prev) =>
        prev.map((m) => {
          if (selectedIds.has(m.id)) {
            return { ...m, tags: [...new Set([...m.tags, ...tags])] };
          }
          return m;
        }),
      );
      setShowTagModal(false);
      setSelectedIds(new Set());
    } catch (err) {
      console.error("Bulk tag failed", err);
    }
  };

  const handleBulkDownload = async () => {
    setIsLoading(true);
    try {
      const zip = new JSZip();
      const selectedModels = models.filter((m) => selectedIds.has(m.id));

      // Add files to zip
      const filePromises = selectedModels.map(async (model) => {
        try {
          const url = api.getDownloadUrl(model);
          const response = await fetch(url);
          if (!response.ok) throw new Error(`Failed to fetch ${model.name}`);
          const blob = await response.blob();
          zip.file(model.name, blob);
        } catch (err) {
          console.error(`Error downloading ${model.name} for zip:`, err);
        }
      });

      await Promise.all(filePromises);

      // Generate zip
      const content = await zip.generateAsync({ type: "blob" });
      // Trigger download
      const link = document.createElement("a");
      link.href = saveUrl;
      link.download = `stlvault-batch-${new Date().getTime()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(saveUrl);

      // Clear selection
      setSelectedIds(new Set());
    } catch (error) {
      console.error("Bulk download failed:", error);
      alert("Failed to generate zip file.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-dvh text-slate-200 font-sans selection:bg-blue-500/30 overflow-hidden">
        <Navbar
          title={APP_NAME.full}
          subtitle={!isDesktop ? currentFolderName : undefined}
          onOpenSidebar={!isDesktop ? () => setIsMobileSidebarOpen(true) : undefined}
          showMenuButton={!isDesktop}
        />

        <div className="flex flex-1 overflow-hidden">
        {isDesktop && (
          <Sidebar
            folders={folders}
            models={models}
            currentFolderId={currentFolderId}
            storageStats={storageStats}
            onSelectFolder={(id) => {
              setCurrentFolderId(id);
              setSelectedModelId(null);
            }}
            onCreateFolder={handleCreateFolder}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
            onMoveToFolder={handleDropMove}
            onUploadToFolder={(folderId, files) =>
              handleUpload(files, folderId)
            }
            variant="desktop"
          />
        )}

        {!isDesktop && isMobileSidebarMounted && (
              <div className="fixed inset-0 z-[70]">
                <div
                  className={`absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 ${
                    isMobileSidebarVisible ? "opacity-100" : "opacity-0"
                  }`}
                  onClick={() => setIsMobileSidebarOpen(false)}
                />
                <div
                  className={`absolute inset-y-0 left-0 w-[85vw] max-w-[360px] transform transition-transform duration-200 ease-out ${
                    isMobileSidebarVisible
                      ? "translate-x-0"
                      : "-translate-x-full"
                  }`}
                >
                  <Sidebar
                    folders={folders}
                    models={models}
                    currentFolderId={currentFolderId}
                    storageStats={storageStats}
                    onSelectFolder={(id) => {
                      setCurrentFolderId(id);
                      setSelectedModelId(null);
                      setIsMobileSidebarOpen(false);
                    }}
                    onCreateFolder={handleCreateFolder}
                    onRenameFolder={handleRenameFolder}
                    onDeleteFolder={handleDeleteFolder}
                    onMoveToFolder={handleDropMove}
                    onUploadToFolder={(folderId, files) =>
                      handleUpload(files, folderId)
                    }
                    variant="mobile"
                  />
                </div>
              </div>
        )}

        <>
            <main className="flex-1 flex overflow-hidden relative">
              {isLoading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-vault-900 z-50">
                  <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                    <p className="text-slate-400 animate-pulse">
                      Processing...
                    </p>
                  </div>
                </div>
              ) : (
                <ModelList
                  models={filteredModels}
                  folders={filteredFolders}
                  currentFolderName={currentFolderName}
                  isAllView={currentFolderId === "all"}
                  onBackNavigation={() => {
                    setCurrentFolderId(currentFolderParentId);
                  }}
                  onUpload={(files) => handleUpload(files)}
                  onImport={handleOpenImport}
                  onSelectModel={(m) => setSelectedModelId(m.id)}
                  onDelete={handleDeleteModel}
                  selectedModelId={selectedModelId}
                  // Selection Props
                  selectedIds={selectedIds}
                  onToggleSelection={handleToggleSelection}
                  onSelectAll={(filtered) => handleSelectAll(filtered)}
                  onClearSelection={() => setSelectedIds(new Set())}
                  onNavigateFolder={(id) => setCurrentFolderId(id)}
                  onMoveToFolder={handleDropMove}
                  onUploadToFolder={(folderId, files) =>
                    handleUpload(files, folderId)
                  }
                />
              )}

              {/* Upload Indicator */}
              {uploadQueue > 0 && (
                <div className="absolute bottom-6 left-6 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center gap-3 animate-pulse">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm font-medium">
                    Uploading {uploadQueue} file(s)...
                  </span>
                </div>
              )}

              {/* Backdrop for closing sidebar */}
              <div
                className={`absolute inset-0 bg-black/50 backdrop-blur-[2px] z-20 transition-opacity duration-300 ${
                  selectedModelId
                    ? "opacity-100 pointer-events-auto"
                    : "opacity-0 pointer-events-none"
                }`}
                onClick={() => setSelectedModelId(null)}
              />

              {/* Slide-over panel */}
              <div
                className={`absolute top-0 right-0 h-full transition-transform duration-300 ease-in-out transform ${
                  selectedModelId ? "translate-x-0" : "translate-x-full"
                } z-30`}
              >
                <DetailPanel
                  model={selectedModel}
                  folders={folders}
                  onClose={() => setSelectedModelId(null)}
                  onUpdate={handleUpdateModel}
                  onDelete={handleDeleteModel}
                />
              </div>

              {/* Floating Action Bar - Moved to App to ensure it is top-level Z-index */}
              {selectedIds.size > 0 && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-vault-800 border border-vault-600 shadow-2xl rounded-full px-6 py-3 flex items-center gap-4 z-50 animate-in slide-in-from-bottom-10 duration-200">
                  <div className="flex items-center gap-2 border-r border-vault-600 pr-4">
                    <span className="font-bold text-white">
                      {selectedIds.size}
                    </span>
                    <span className="text-slate-400 text-sm">selected</span>
                    <button
                      onClick={() => setSelectedIds(new Set())}
                      className="ml-2 text-slate-500 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowMoveModal(true)}
                      className="p-2 rounded-full hover:bg-vault-700 text-slate-300 hover:text-blue-400 transition-colors flex items-center gap-2"
                      title="Move Selected"
                    >
                      <FolderInput className="w-4 h-4" />
                      <span className="text-sm font-medium hidden sm:inline">
                        Move
                      </span>
                    </button>

                    <button
                      onClick={() => {
                        setBulkTags("");
                        setShowTagModal(true);
                      }}
                      className="p-2 rounded-full hover:bg-vault-700 text-slate-300 hover:text-purple-400 transition-colors flex items-center gap-2"
                      title="Tag Selected"
                    >
                      <Tags className="w-4 h-4" />
                      <span className="text-sm font-medium hidden sm:inline">
                        Tag
                      </span>
                    </button>

                    <button
                      onClick={handleBulkDownload}
                      className="p-2 rounded-full hover:bg-vault-700 text-slate-300 hover:text-green-400 transition-colors flex items-center gap-2"
                      title="Download Selected"
                    >
                      <Download className="w-4 h-4" />
                      <span className="text-sm font-medium hidden sm:inline">
                        Download
                      </span>
                    </button>

                    {(user?.is_superuser || Array.from(selectedIds).some(id => models.find(m => m.id === id)?.uploaded_by === user?.id)) && (
                      <button
                        onClick={handleBulkDelete}
                        className="p-2 rounded-full hover:bg-vault-700 text-slate-300 hover:text-red-400 transition-colors flex items-center gap-2"
                        title="Delete Selected"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="text-sm font-medium hidden sm:inline">
                          Delete
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Modals Layer */}

              {/* Upload Modal */}
              {showUploadModal && (
                <div
                  className={`fixed left-0 top-0 z-[60] bg-black/60 backdrop-blur-sm flex justify-center p-4 ${
                    visualViewport.keyboardOpen ? "items-start" : "items-center"
                  }`}
                  style={{
                    width: "100%",
                    height:
                      visualViewport.height ||
                      (typeof window !== "undefined" ? window.innerHeight : 0),
                    transform: `translate(${visualViewport.offsetLeft}px, ${visualViewport.offsetTop}px)`,
                  }}
                >
                  <div
                    className="bg-vault-800 border border-vault-600 rounded-xl p-6 w-96 shadow-2xl animate-in zoom-in-95 duration-200 overflow-y-auto"
                    style={{
                      maxHeight: Math.max(
                        240,
                        (visualViewport.height ||
                          (typeof window !== "undefined"
                            ? window.innerHeight
                            : 0)) - 32,
                      ),
                    }}
                  >
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <FileUp className="w-5 h-5 text-blue-500" /> Upload
                        Files
                      </h3>
                      <button
                        onClick={() => setShowUploadModal(false)}
                        className="text-slate-400 hover:text-white"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <form onSubmit={handleConfirmUpload}>
                      <div className="mb-4 p-3 bg-vault-900/50 rounded-lg border border-vault-700/50">
                        <p className="text-sm text-slate-300 font-medium">
                          {pendingFiles.length} files selected
                        </p>
                        <p className="text-xs text-slate-500 truncate mt-1">
                          {pendingFiles.map((f) => f.name).join(", ")}
                        </p>
                      </div>

                      <div className="mb-4">
                        <label className="block text-sm font-medium text-slate-400 mb-2">
                          Destination Folder
                        </label>
                        <div className="flex gap-2 mb-3">
                          <button
                            type="button"
                            onClick={() => setUploadMode("existing")}
                            className={`flex-1 py-1.5 text-sm rounded-md border transition-colors ${uploadMode === "existing" ? "bg-blue-600 border-blue-500 text-white" : "bg-vault-900 border-vault-700 text-slate-400 hover:text-white"}`}
                          >
                            Existing
                          </button>
                          <button
                            type="button"
                            onClick={() => setUploadMode("new")}
                            className={`flex-1 py-1.5 text-sm rounded-md border transition-colors ${uploadMode === "new" ? "bg-blue-600 border-blue-500 text-white" : "bg-vault-900 border-vault-700 text-slate-400 hover:text-white"}`}
                          >
                            Request New
                          </button>
                        </div>

                        {uploadMode === "new" && (
                          <input
                            type="text"
                            className="w-full bg-vault-900 border border-vault-700 rounded-md px-3 py-2 text-white focus:border-blue-500 outline-none placeholder:text-slate-600 mb-2"
                            placeholder="New folder name..."
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            autoFocus
                          />
                        )}

                        {/* Breadcrumb folder browser */}
                        {(() => {
                          const approved = folders.filter((f) => f.status !== "pending");
                          const path: Folder[] = [];
                          let cur: string | null = browseFolderId;
                          while (cur) {
                            const f = folders.find((x) => x.id === cur);
                            if (!f) break;
                            path.unshift(f);
                            cur = f.parentId ?? null;
                          }
                          const children = approved
                            .filter((f) => f.parentId === browseFolderId)
                            .sort((a, b) => a.name.localeCompare(b.name));
                          return (
                            <div className="border border-vault-700 rounded-md overflow-hidden text-sm">
                              {/* Breadcrumb bar */}
                              <div className="flex items-center gap-0.5 px-2 py-1.5 bg-vault-900/50 border-b border-vault-700 flex-wrap min-h-[34px]">
                                <button
                                  type="button"
                                  onClick={() => setBrowseFolderId(null)}
                                  className={`px-1 rounded hover:text-white transition-colors ${
                                    !browseFolderId
                                      ? uploadMode === "new" ? "text-white font-medium" : "text-slate-400"
                                      : "text-blue-400"
                                  }`}
                                >
                                  Root
                                </button>
                                {path.map((f) => (
                                  <React.Fragment key={f.id}>
                                    <ChevronRight className="w-3 h-3 text-slate-600 flex-shrink-0" />
                                    <button
                                      type="button"
                                      onClick={() => setBrowseFolderId(f.id)}
                                      className={`px-1 rounded hover:text-white transition-colors ${
                                        browseFolderId === f.id ? "text-white font-medium" : "text-blue-400"
                                      }`}
                                    >
                                      {f.name}
                                    </button>
                                  </React.Fragment>
                                ))}
                                {uploadMode === "existing" && !browseFolderId && (
                                  <span className="text-slate-500 text-xs italic ml-1">— select a folder below</span>
                                )}
                              </div>
                              {/* Child folders */}
                              <div className="max-h-36 overflow-y-auto">
                                {children.length === 0 ? (
                                  <div className="px-3 py-2.5 text-slate-500 italic">No subfolders</div>
                                ) : (
                                  children.map((f) => (
                                    <button
                                      key={f.id}
                                      type="button"
                                      onClick={() => setBrowseFolderId(f.id)}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-vault-700/40 transition-colors border-b border-vault-700/20 last:border-0 text-slate-300"
                                    >
                                      <FolderIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />
                                      <span className="flex-1 truncate">{f.name}</span>
                                      <ChevronRight className="w-3 h-3 text-slate-600" />
                                    </button>
                                  ))
                                )}
                                {uploadMode === "new" && <div
                                  key={1}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-vault-700/40 transition-colors border-b border-vault-700/20 last:border-0 text-slate-300"
                                >
                                  <FolderIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />
                                  <span className="text-yellow-400">{newFolderName.length > 0 ? newFolderName : "---"}</span>
                                </div>}
                              </div>
                            </div>
                          );
                        })()}

                        {uploadMode === "new" && (
                          <p className="text-xs text-white mt-1">
                            This folder will be reviewed by an admin before it appears in the vault.
                          </p>
                        )}
                      </div>

                      <div className="mb-4">
                        <label className="block text-sm font-medium text-slate-400 mb-1">
                          Description (Optional)
                        </label>
                        <textarea
                          className="w-full bg-vault-900 border border-vault-700 rounded-md px-3 py-2 text-white focus:border-blue-500 outline-none placeholder:text-slate-600 resize-none"
                          placeholder="What is this model? Any relevant notes..."
                          rows={3}
                          value={uploadDescription}
                          onChange={(e) => setUploadDescription(e.target.value)}
                        />
                      </div>

                      <div className="mb-6">
                        <label className="block text-sm font-medium text-slate-400 mb-1">
                          Tags (Optional)
                        </label>
                        <input
                          type="text"
                          className="w-full bg-vault-900 border border-vault-700 rounded-md px-3 py-2 text-white focus:border-blue-500 outline-none placeholder:text-slate-600"
                          placeholder="scifi, armor, weapon..."
                          value={uploadTags}
                          onChange={(e) => setUploadTags(e.target.value)}
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          Separate tags with commas
                        </p>
                      </div>

                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setShowUploadModal(false)}
                          className="flex-1 py-2 rounded-lg bg-vault-700 hover:bg-vault-600 text-slate-200 font-medium transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={uploadMode === "existing" ? !browseFolderId : !newFolderName.trim()}
                          className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Upload
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Import URL Modal */}
              {showImportModal && (
                <div
                  className={`fixed left-0 top-0 z-[60] bg-black/60 backdrop-blur-sm flex justify-center p-4 ${
                    visualViewport.keyboardOpen ? "items-start" : "items-center"
                  }`}
                  style={{
                    width: "100%",
                    height:
                      visualViewport.height ||
                      (typeof window !== "undefined" ? window.innerHeight : 0),
                    transform: `translate(${visualViewport.offsetLeft}px, ${visualViewport.offsetTop}px)`,
                  }}
                >
                  <div
                    className="bg-vault-800 border border-vault-600 rounded-xl p-6 w-96 shadow-2xl animate-in zoom-in-95 duration-200 overflow-y-auto"
                    style={{
                      maxHeight: Math.max(
                        240,
                        (visualViewport.height ||
                          (typeof window !== "undefined"
                            ? window.innerHeight
                            : 0)) - 32,
                      ),
                    }}
                  >
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Globe className="w-5 h-5 text-indigo-500" /> Import
                        from URL
                      </h3>
                      <button
                        onClick={() => setShowImportModal(false)}
                        className="text-slate-400 hover:text-white"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <form onSubmit={handleImportSubmit}>
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-slate-400 mb-1">
                          Model URL
                        </label>
                        <input
                          autoFocus
                          type="url"
                          required
                          className="w-full bg-vault-900 border border-vault-700 rounded-md px-3 py-2 text-white focus:border-indigo-500 outline-none placeholder:text-slate-600"
                          placeholder="https://www.printables.com/model/..."
                          value={importUrl}
                          onChange={(e) => setImportUrl(e.target.value)}
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          Paste a link from Printables or similar sites
                        </p>
                      </div>

                      <div className="mb-6">
                        <label className="block text-sm font-medium text-slate-400 mb-1">
                          Destination Folder
                        </label>
                        <select
                          className="w-full bg-vault-900 border border-vault-700 rounded-md px-3 py-2 text-white focus:border-indigo-500 outline-none"
                          value={importFolderId}
                          onChange={(e) => setImportFolderId(e.target.value)}
                        >
                          <option value="" disabled>
                            Select a folder...
                          </option>
                          {folders.map((folder) => (
                            <option key={folder.id} value={folder.id}>
                              {folder.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setShowImportModal(false)}
                          className="flex-1 py-2 rounded-lg bg-vault-700 hover:bg-vault-600 text-slate-200 font-medium transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={!importUrl || !importFolderId}
                          className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Import
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Import Options Modal */}
              {showImportOptionsModal && (
                <div
                  className={`fixed left-0 top-0 z-[60] bg-black/60 backdrop-blur-sm flex justify-center p-4 ${
                    visualViewport.keyboardOpen ? "items-start" : "items-center"
                  }`}
                  style={{
                    width: "100%",
                    height:
                      visualViewport.height ||
                      (typeof window !== "undefined" ? window.innerHeight : 0),
                    transform: `translate(${visualViewport.offsetLeft}px, ${visualViewport.offsetTop}px)`,
                  }}
                >
                  <div
                    className="relative bg-vault-800 border border-vault-600 rounded-xl p-6 w-full lg:w-1/2 shadow-2xl animate-in zoom-in-95 duration-200 "
                    style={{
                      maxHeight: Math.max(
                        240,
                        (visualViewport.height ||
                          (typeof window !== "undefined"
                            ? window.innerHeight
                            : 0)) - 32,
                      ),
                    }}
                  >
                    <div className="static flex top-0 justify-between items-center mb-6">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Globe className="w-5 h-5 text-indigo-500" /> Select
                        model to download
                      </h3>
                      <button
                        onClick={() => setShowImportOptionsModal(false)}
                        className="text-slate-400 hover:text-white"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {/* File List */}
                    <div
                      className={`static overflow-auto px-2 ${
                        visualViewport.height > 900 ? "h-[700px]" : "h-[400px]"
                      }`}
                    >
                      {Array.from(folderOptions).map((f) => (
                        <div>
                          <div className="text-xl font-medium p-4">
                            {f ? f : "Root Folder"}
                          </div>
                          {modelsOptions.map((model) => (
                            <div>
                              {model.folder == f ? (
                                <div
                                  key={model.id}
                                  onClick={() =>
                                    handleOptionsToggleSelection(model.id)
                                  }
                                  className={`group bg-vault-900 border rounded-xl p-4 cursor-pointer transition-all flex items-center gap-4 mb-2 relative overflow-hidden
                              ${
                                selectedOptions.has(model.id)
                                  ? "border-blue-500 ring-1 ring-blue-500/50"
                                  : "border-vault-700 hover:border-vault-600"
                              }
                            `}
                                >
                                  <div className="w-12 h-12 bg-blue-900/20 rounded-lg flex items-center justify-center text-blue-500 group-hover:text-blue-400 group-hover:scale-110 transition-all shrink-0">
                                    <img
                                      src={model.previewPath}
                                      alt={model.name}
                                      className="w-12 h-12 object-contain opacity-80 group-hover:opacity-100 transition-opacity"
                                    />
                                  </div>

                                  <div className="min-w-0">
                                    <h3 className="font-semibold text-slate-200 truncate group-hover:text-white">
                                      {model.name}
                                    </h3>
                                    <p className="text-xs text-slate-500">
                                      {model.typeName}
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <div></div>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>

                    <div
                      onClick={() => handleImportChoice()}
                      className="static bottom-0 p-2 mt-4 cursor-pointer rounded-lg bg-vault-700 hover:bg-vault-600 text-slate-200 font-medium transition-colors text-center"
                    >
                      {" "}
                      Import{" "}
                    </div>
                  </div>
                </div>
              )}

              {/* Delete Confirmation Modal */}
              {deleteConfirmState.isOpen && (
                <div
                  className={`fixed left-0 top-0 z-[60] bg-black/60 backdrop-blur-sm flex justify-center p-4 ${
                    visualViewport.keyboardOpen ? "items-start" : "items-center"
                  }`}
                  style={{
                    width: "100%",
                    height:
                      visualViewport.height ||
                      (typeof window !== "undefined" ? window.innerHeight : 0),
                    transform: `translate(${visualViewport.offsetLeft}px, ${visualViewport.offsetTop}px)`,
                  }}
                >
                  <div
                    className="bg-vault-800 border border-vault-600 rounded-xl p-6 w-96 shadow-2xl animate-in zoom-in-95 duration-200 overflow-y-auto"
                    style={{
                      maxHeight: Math.max(
                        240,
                        (visualViewport.height ||
                          (typeof window !== "undefined"
                            ? window.innerHeight
                            : 0)) - 32,
                      ),
                    }}
                  >
                    <div className="flex flex-col items-center text-center mb-6">
                      <div className="w-12 h-12 bg-red-900/30 rounded-full flex items-center justify-center mb-4">
                        <AlertTriangle className="w-6 h-6 text-red-500" />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2">
                        Confirm Deletion
                      </h3>
                      <p className="text-slate-400 text-sm">
                        {deleteConfirmState.type === "single" &&
                          "Are you sure you want to delete this model? This action cannot be undone."}
                        {deleteConfirmState.type === "bulk" &&
                          `Are you sure you want to delete ${selectedIds.size} models? This action cannot be undone.`}
                        {deleteConfirmState.type === "folder" &&
                          "Are you sure you want to delete this folder?"}
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() =>
                          setDeleteConfirmState((prev) => ({
                            ...prev,
                            isOpen: false,
                          }))
                        }
                        className="flex-1 py-2.5 rounded-lg bg-vault-700 hover:bg-vault-600 text-slate-200 font-medium transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={executeDelete}
                        className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {showMoveModal && (
                <div
                  className={`fixed left-0 top-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center p-4 ${
                    visualViewport.keyboardOpen ? "items-start" : "items-center"
                  }`}
                  style={{
                    width: "100%",
                    height:
                      visualViewport.height ||
                      (typeof window !== "undefined" ? window.innerHeight : 0),
                    transform: `translate(${visualViewport.offsetLeft}px, ${visualViewport.offsetTop}px)`,
                  }}
                >
                  <div
                    className="bg-vault-800 border border-vault-600 rounded-xl p-6 w-80 shadow-2xl animate-in zoom-in-95 duration-200 overflow-y-auto"
                    style={{
                      maxHeight: Math.max(
                        200,
                        (visualViewport.height ||
                          (typeof window !== "undefined"
                            ? window.innerHeight
                            : 0)) - 32,
                      ),
                    }}
                  >
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="font-bold text-white flex items-center gap-2">
                        <FolderInput className="w-4 h-4" /> Move to Folder
                      </h3>
                      <button
                        onClick={() => setShowMoveModal(false)}
                        className="text-slate-400 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
                      {folders.map((folder) => (
                        <button
                          key={folder.id}
                          onClick={() => handleBulkMoveSubmit(folder.id)}
                          className="w-full text-left px-3 py-2 rounded hover:bg-vault-700 text-slate-300 hover:text-white text-sm transition-colors"
                        >
                          {folder.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {showTagModal && (
                <div
                  className={`fixed left-0 top-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center p-4 ${
                    visualViewport.keyboardOpen ? "items-start" : "items-center"
                  }`}
                  style={{
                    width: "100%",
                    height:
                      visualViewport.height ||
                      (typeof window !== "undefined" ? window.innerHeight : 0),
                    transform: `translate(${visualViewport.offsetLeft}px, ${visualViewport.offsetTop}px)`,
                  }}
                >
                  <div
                    className="bg-vault-800 border border-vault-600 rounded-xl p-6 w-96 shadow-2xl animate-in zoom-in-95 duration-200 overflow-y-auto"
                    style={{
                      maxHeight: Math.max(
                        240,
                        (visualViewport.height ||
                          (typeof window !== "undefined"
                            ? window.innerHeight
                            : 0)) - 32,
                      ),
                    }}
                  >
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="font-bold text-white flex items-center gap-2">
                        <Tags className="w-4 h-4" /> Add Tags
                      </h3>
                      <button
                        onClick={() => setShowTagModal(false)}
                        className="text-slate-400 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <form onSubmit={handleBulkTagSubmit}>
                      <p className="text-sm text-slate-400 mb-2">
                        Add tags to {selectedIds.size} items (comma separated):
                      </p>
                      <input
                        autoFocus
                        type="text"
                        className="w-full bg-vault-900 border border-vault-700 rounded-md px-3 py-2 text-white focus:border-blue-500 outline-none mb-4"
                        placeholder="scifi, armor, weapon..."
                        value={bulkTags}
                        onChange={(e) => setBulkTags(e.target.value)}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowTagModal(false)}
                          className="px-3 py-1.5 text-sm text-slate-300 hover:text-white"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded"
                        >
                          Add Tags
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </main>
          </>
        </div>
        <Snackbar
          open={!port}
          autoHideDuration={6000}
          message="API Host Not Set"
          anchorOrigin={{ vertical: "top", horizontal: "center" }}
        >
          <Alert severity="error" variant="filled" sx={{ width: "100%" }}>
            API Host Not Set
          </Alert>
        </Snackbar>
        <Snackbar
          open={showPendingSnackbar}
          autoHideDuration={6000}
          onClose={() => setShowPendingSnackbar(false)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert
            severity="info"
            variant="filled"
            onClose={() => setShowPendingSnackbar(false)}
            sx={{ width: "100%" }}
          >
            Upload submitted — pending admin review before appearing in the vault.
          </Alert>
        </Snackbar>
      </div>
  );
};

export default App;
