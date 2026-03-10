import base64
import re
import json

import requests


BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

ALLOWED_EXTENSIONS = {"stl", "step", "stp", "3mf", "obj"}

API_BASE = "https://makerworld.com/api/v1/design-service/design/{id}"


def _extract_next_data(html: str):
    """Return parsed JSON from <script id="__NEXT_DATA__"> or None."""
    match = re.search(
        r'<script[^>]+id=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script>',
        html,
        re.DOTALL,
    )
    if not match:
        return None
    try:
        return json.loads(match.group(1))
    except Exception:
        return None


def _ext(name: str) -> str:
    return name.rsplit(".", 1)[-1].lower() if "." in name else ""


def _files_from_api_response(data: dict) -> list:
    """Try to find file entries in the MakerWorld API response."""
    candidates = [
        data.get("files"),
        data.get("designFiles"),
        data.get("data", {}).get("files") if isinstance(data.get("data"), dict) else None,
    ]
    for candidate in candidates:
        if isinstance(candidate, list) and candidate:
            return candidate
    return []


def _files_from_next_data(data: dict) -> list:
    """Try multiple paths in __NEXT_DATA__ to find the files list."""
    paths = [
        ["props", "pageProps", "design", "files"],
        ["props", "pageProps", "files"],
        ["props", "pageProps", "designData", "files"],
    ]
    for path in paths:
        node = data
        for key in path:
            if isinstance(node, dict):
                node = node.get(key)
            else:
                node = None
                break
        if isinstance(node, list) and node:
            return node
    return []


def _build_file_entry(f: dict, model_id: str) -> dict | None:
    name = f.get("name", f.get("fileName", ""))
    ext = _ext(name)
    if ext not in ALLOWED_EXTENSIONS:
        return None

    # Extract preview
    preview = ""
    for key in ("thumbnail", "previewUrl", "preview_url", "imageUrl", "image_url"):
        val = f.get(key)
        if val and isinstance(val, str):
            preview = val
            break
    img_obj = f.get("defaultImage") or f.get("default_image")
    if not preview and isinstance(img_obj, dict):
        preview = img_obj.get("url") or img_obj.get("thumbnail") or ""

    # Extract download URL
    download = ""
    for key in ("downloadUrl", "download_url", "directUrl", "direct_url", "url"):
        val = f.get(key)
        if val and isinstance(val, str):
            download = val
            break

    return {
        "id": str(f.get("id", f.get("fileId", ""))),
        "name": name,
        "parentId": model_id,
        "folder": f.get("folder", "") or "",
        "previewPath": preview,
        "typeName": ext,
        "downloadUrl": download,
    }


class MakerWorldImporter:
    """Import 3D model files from MakerWorld."""

    def getModelOptions(self, url: str):
        """
        Fetch file options for a MakerWorld model URL.
        Returns a list of file option dicts, or None if files cannot be found.
        """
        match = re.search(r"/models/(\d+)", url)
        if match is None:
            return None
        model_id = match.group(1)

        headers = {
            "User-Agent": BROWSER_UA,
            "Accept": "application/json, text/html,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }

        # --- Try the public API first ---
        try:
            api_url = API_BASE.format(id=model_id)
            api_resp = requests.get(api_url, headers=headers, allow_redirects=True, timeout=20)
            if api_resp.status_code == 200:
                try:
                    api_data = api_resp.json()
                    raw_files = _files_from_api_response(api_data)
                    if raw_files:
                        results = []
                        for f in raw_files:
                            entry = _build_file_entry(f, model_id)
                            if entry:
                                results.append(entry)
                        if results:
                            return results
                except Exception:
                    pass
        except Exception:
            pass

        # --- Fallback: scrape __NEXT_DATA__ from the page ---
        try:
            page_resp = requests.get(url, headers=headers, allow_redirects=True, timeout=30)
        except Exception:
            return None

        if page_resp.status_code != 200:
            return None

        data = _extract_next_data(page_resp.text)
        if data is None:
            return None

        raw_files = _files_from_next_data(data)
        if not raw_files:
            return None

        results = []
        for f in raw_files:
            entry = _build_file_entry(f, model_id)
            if entry:
                results.append(entry)

        return results if results else None

    def importFromUrl(self, download_url: str, preview_path: str):
        """
        Download the file and thumbnail.
        Returns (file_response, thumbnail_data_uri).
        """
        headers = {"User-Agent": BROWSER_UA}
        file_resp = requests.get(
            download_url, headers=headers, allow_redirects=True, timeout=60
        )

        thumbnail = ""
        if preview_path:
            try:
                img = requests.get(
                    preview_path, headers=headers, allow_redirects=True, timeout=15
                )
                if img.status_code == 200:
                    thumbnail = (
                        "data:image/jpeg;base64,"
                        + base64.b64encode(img.content).decode()
                    )
            except Exception:
                pass

        return file_resp, thumbnail
