// Vite environment variables type declaration
declare global {
  interface ImportMetaEnv {
    readonly VITE_APP_TAG: string;
    readonly VITE_API_URL: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  status?: "pending" | "approved";
  requested_by?: string | null;
  icon?: string;
}

export interface STLModel {
  id: string;
  name: string;
  folderId: string;
  url: string; // Blob URL
  size: number;
  dateAdded: number;
  tags: string[];
  description: string;
  dimensions?: { x: number; y: number; z: number };
  thumbnail?: string;
  status?: "pending" | "approved" | "denied";
  denial_reason?: string | null;
  uploaded_by?: string | null;
  uploaded_by_email?: string | null;
}

export interface STLModelCollection {
  parentId: string;
  id: string;
  name: string;
  folder: string | null;
  previewPath: string;
  typeName: string;
  downloadUrl?: string;
}

export interface StorageStats {
  used: number;
  total: number;
}

export enum ViewMode {
  GRID = "GRID",
  LIST = "LIST",
}

export type AppState = {
  folders: Folder[];
  models: STLModel[];
  currentFolderId: string;
  selectedModelId: string | null;
  sidebarOpen: boolean;
};
