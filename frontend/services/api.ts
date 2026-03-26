import { Folder, STLModel, StorageStats, STLModelCollection } from "../types";
import { v4 as uuidv4 } from "uuid";
import { BASE_URL } from "./apiBase";

const API_BASE_URL = BASE_URL + "/api";

const TOKEN_KEY = "stlvault_auth_token";

// Authenticated fetch — injects Bearer token and redirects on 401
async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = "/login";
  }
  return res;
}

// --- API SERVICE ---

export const api = {
  // 1. GET Folders
  getFolders: async (): Promise<Folder[]> => {
    const res = await authFetch(`${API_BASE_URL}/folders`);
    if (!res.ok) throw new Error("Failed to fetch folders");
    return res.json();
  },

  // 2. CREATE Folder
  createFolder: async (
    name: string,
    parentId: string | null = null,
  ): Promise<Folder> => {
    const res = await authFetch(`${API_BASE_URL}/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId }),
    });
    if (!res.ok) throw new Error("Failed to create folder");
    const folder = await res.json();
    console.log("[api] createFolder response:", folder);
    return folder;
  },

  // 3. UPDATE Folder (Rename/Move)
  updateFolder: async (id: string, name: string): Promise<Folder> => {
    const res = await authFetch(`${API_BASE_URL}/folders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error("Update failed");
    return res.json();
  },

  // 4. DELETE Folder
  deleteFolder: async (id: string): Promise<void> => {
    const res = await authFetch(`${API_BASE_URL}/folders/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Delete failed");
  },

  // 5. GET Models
  getModels: async (folderId?: string): Promise<STLModel[]> => {
    const query = folderId && folderId !== "all" ? `?folderId=${folderId}` : "";
    const res = await authFetch(`${API_BASE_URL}/models${query}`);
    if (!res.ok) throw new Error("Failed to fetch models");
    return res.json();
  },

  // 6. UPLOAD Model
  uploadModel: async (
    file: File,
    folderId: string,
    thumbnail?: string,
    tags: string[] = [],
    description: string = "",
  ): Promise<STLModel> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folderId", folderId);
    if (thumbnail) formData.append("thumbnail", thumbnail);
    if (tags.length > 0) formData.append("tags", JSON.stringify(tags));
    if (description) formData.append("description", description);

    const res = await authFetch(`${API_BASE_URL}/models/upload`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) throw new Error("Upload failed");
    return res.json();
  },

  // 7. UPDATE Model
  updateModel: async (
    id: string,
    updates: Partial<STLModel>,
  ): Promise<STLModel> => {
    const res = await authFetch(`${API_BASE_URL}/models/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error("Update failed");
    return res.json();
  },

  // 8. DELETE Model
  deleteModel: async (id: string): Promise<void> => {
    console.log("API: Deleting model", id);

    const res = await authFetch(`${API_BASE_URL}/models/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Delete failed");
  },

  // 9. GET Download URL
  getDownloadUrl: (model: STLModel) => {
    const token = localStorage.getItem(TOKEN_KEY);
    const qs = token ? `?token=${encodeURIComponent(token)}` : "";
    return `${API_BASE_URL}/models/${model.id}/download${qs}`;
  },

  //9b. GET slicer Weblink
  getSlicerUrl: (model: STLModel) => {
    const token = localStorage.getItem(TOKEN_KEY);
    const qs = token ? `?token=${encodeURIComponent(token)}` : "";
    const modelURL = `${API_BASE_URL}/models/${model.id}/download${qs}`;

    // Get user's preferred slicer from localStorage
    const slicerPreference =
      localStorage.getItem("stlvault-slicer") || "orcaslicer";

    const slicerProtocols: Record<string, string> = {
      orcaslicer: "orcaslicer://open?file=",
      prusaslicer: "prusaslicer://open?file=",
      bambu: "bambustudio://open?file=",
      cura: "cura://open?file=",
    };

    const protocol =
      slicerProtocols[slicerPreference] || slicerProtocols["orcaslicer"];
    return `${protocol}${modelURL}`;
  },

  // 10. BULK DELETE
  bulkDeleteModels: async (ids: string[]): Promise<void> => {
    console.log("API: Bulk deleting models", ids);

    const res = await authFetch(`${API_BASE_URL}/models/bulk-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) throw new Error("Bulk delete failed");
  },

  // 11. BULK MOVE
  bulkMoveModels: async (ids: string[], folderId: string): Promise<void> => {
    const res = await authFetch(`${API_BASE_URL}/models/bulk-move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, folderId }),
    });
    if (!res.ok) throw new Error("Bulk move failed");
  },

  // 12. BULK TAG
  bulkAddTags: async (ids: string[], tags: string[]): Promise<void> => {
    const res = await authFetch(`${API_BASE_URL}/models/bulk-tag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, tags }),
    });
    if (!res.ok) throw new Error("Bulk tag failed");
  },

  // 13. RETRIEVE MODEL OPTIONS
  retrieveModelOptions: async (url: string): Promise<STLModelCollection[]> => {
    const res = await authFetch(`${API_BASE_URL}/printables/options`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) throw new Error("Import failed");
    return res.json();
  },

  // 13. IMPORT FROM URL
  importModelFromId: async (
    id: string,
    name: string,
    parentId: string,
    previewPath: string,
    folderId: string,
    typeName: string,
    downloadUrl?: string,
  ): Promise<STLModel> => {
    const res = await authFetch(`${API_BASE_URL}/printables/importid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        name,
        parentId,
        previewPath,
        folderId,
        typeName,
        ...(downloadUrl ? { downloadUrl } : {}),
      }),
    });
    if (!res.ok) throw new Error("Import failed");
    return res.json();
  },

  // 14. REPLACE FILE
  replaceModelFile: async (
    id: string,
    file: File,
    thumbnail?: string,
  ): Promise<STLModel> => {
    const formData = new FormData();
    formData.append("file", file);
    if (thumbnail) formData.append("thumbnail", thumbnail);

    const res = await authFetch(`${API_BASE_URL}/models/${id}/file`, {
      method: "PUT",
      body: formData,
    });
    if (!res.ok) throw new Error("File replacement failed");
    return res.json();
  },

  // 14a. REPLACE FILE
  replaceModelThumbnail: async (id: string, file: File): Promise<STLModel> => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await authFetch(`${API_BASE_URL}/models/${id}/thumbnail`, {
      method: "PUT",
      body: formData,
    });
    if (!res.ok) throw new Error("File replacement failed");
    return res.json();
  },

  // 15. GET Storage Stats
  getStorageStats: async (): Promise<StorageStats> => {
    const res = await authFetch(`${API_BASE_URL}/storage-stats`);
    if (!res.ok) throw new Error("Failed to fetch storage stats");
    return res.json();
  },

  // 16. GET My Models (uploaded by current user)
  getMyModels: async (): Promise<STLModel[]> => {
    const res = await authFetch(`${API_BASE_URL}/my-models`);
    if (!res.ok) throw new Error("Failed to fetch your models");
    return res.json();
  },

  // 17. ADMIN: GET pending models
  getAdminPending: async (): Promise<STLModel[]> => {
    const res = await authFetch(`${API_BASE_URL}/admin/pending`);
    if (!res.ok) throw new Error("Failed to fetch pending models");
    return res.json();
  },

  // 18. ADMIN: approve a model
  approveModel: async (
    id: string,
    folderOverride?: { folderId?: string; folderName?: string },
  ): Promise<STLModel> => {
    const res = await authFetch(`${API_BASE_URL}/admin/models/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        folder_id: folderOverride?.folderId ?? null,
        folder_name: folderOverride?.folderName ?? null,
      }),
    });
    if (!res.ok) throw new Error("Approve failed");
    return res.json();
  },

  // 20. ADMIN: get pending folder requests
  getPendingFolders: async (): Promise<(Folder & { requested_by_email?: string; parent_name?: string | null })[]> => {
    const res = await authFetch(`${API_BASE_URL}/admin/pending-folders`);
    if (!res.ok) throw new Error("Failed to fetch pending folders");
    return res.json();
  },

  // 21. ADMIN: approve a folder (optionally rename)
  approveFolder: async (id: string, name?: string): Promise<Folder> => {
    const res = await authFetch(`${API_BASE_URL}/admin/folders/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name ?? null }),
    });
    if (!res.ok) throw new Error("Approve failed");
    return res.json();
  },

  // 22. ADMIN: deny a folder request
  denyFolder: async (id: string, reason?: string): Promise<void> => {
    const res = await authFetch(`${API_BASE_URL}/admin/folders/${id}/deny`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason ?? "" }),
    });
    if (!res.ok) throw new Error("Deny failed");
  },

  // 23. ADMIN: list all users
  getAdminUsers: async (): Promise<{ id: string; email: string; display_name: string | null; is_active: boolean; is_verified: boolean; is_superuser: boolean }[]> => {
    const res = await authFetch(`${API_BASE_URL}/admin/users`);
    if (!res.ok) throw new Error("Failed to fetch users");
    return res.json();
  },

  // 24. ADMIN: patch a user
  patchAdminUser: async (
    id: string,
    updates: { is_active?: boolean; is_verified?: boolean; is_superuser?: boolean },
  ): Promise<{ id: string; email: string; display_name: string | null; is_active: boolean; is_verified: boolean; is_superuser: boolean }> => {
    const res = await authFetch(`${API_BASE_URL}/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error("Failed to update user");
    return res.json();
  },

  // 25. ADMIN: delete a user
  deleteAdminUser: async (id: string): Promise<void> => {
    const res = await authFetch(`${API_BASE_URL}/admin/users/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete user");
  },

  // 19. ADMIN: deny a model
  denyModel: async (id: string, reason: string): Promise<STLModel> => {
    const res = await authFetch(`${API_BASE_URL}/admin/models/${id}/deny`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) throw new Error("Deny failed");
    return res.json();
  },
};
