import React from "react";
import { ChevronRight, Folder as FolderIcon } from "lucide-react";
import { Folder } from "../types";

interface Props {
  folders: Folder[];
  selectedFolderId: string | null;
  onSelect: (folderId: string | null) => void;
}

const FolderBreadcrumbPicker: React.FC<Props> = ({ folders, selectedFolderId, onSelect }) => {
  // Build breadcrumb path to selectedFolderId
  const path: Folder[] = [];
  let cur: string | null = selectedFolderId;
  while (cur) {
    const f = folders.find((x) => x.id === cur);
    if (!f) break;
    path.unshift(f);
    cur = f.parentId ?? null;
  }

  const children = folders
    .filter((f) => f.parentId === selectedFolderId)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="border border-vault-700 rounded-md overflow-hidden text-sm">
      {/* Breadcrumb bar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-vault-900/50 border-b border-vault-700 flex-wrap min-h-[34px]">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`px-1 rounded hover:text-white transition-colors ${
            !selectedFolderId ? "text-white font-medium" : "text-blue-400"
          }`}
        >
          Root
        </button>
        {path.map((f) => (
          <React.Fragment key={f.id}>
            <ChevronRight className="w-3 h-3 text-slate-600 flex-shrink-0" />
            <button
              type="button"
              onClick={() => onSelect(f.id)}
              className={`px-1 rounded hover:text-white transition-colors ${
                selectedFolderId === f.id ? "text-white font-medium" : "text-blue-400"
              }`}
            >
              {f.name}
            </button>
          </React.Fragment>
        ))}
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
              onClick={() => onSelect(f.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-vault-700/40 transition-colors border-b border-vault-700/20 last:border-0 text-slate-300"
            >
              <FolderIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <span className="flex-1 truncate">{f.name}</span>
              <ChevronRight className="w-3 h-3 text-slate-600" />
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default FolderBreadcrumbPicker;
