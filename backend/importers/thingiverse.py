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


def _find_files(data: dict):
    """Try multiple paths in __NEXT_DATA__ to find the files list."""
    candidates = [
        ["props", "pageProps", "thing", "files"],
        ["props", "pageProps", "files"],
        ["props", "pageProps", "initialThingData", "files"],
    ]
    for path in candidates:
        node = data
        for key in path:
            if isinstance(node, dict):
                node = node.get(key)
            else:
                node = None
                break
        if isinstance(node, list) and node:
            return node
    return None


def _preview_for_file(file_obj: dict) -> str:
    """Best-effort extraction of a preview image URL from a file dict."""
    for key in ("default_image", ):
        img = file_obj.get(key)
        if isinstance(img, dict):
            url = img.get("url") or img.get("thumbnail")
            if url:
                return url
    for key in ("thumbnail", "preview_image"):
        val = file_obj.get(key)
        if val and isinstance(val, str):
            return val
    return ""


def _download_url_for_file(file_obj: dict) -> str:
    for key in ("direct_url", "public_url", "download_url"):
        val = file_obj.get(key)
        if val and isinstance(val, str):
            return val
    return ""


class ThingiverseImporter:
    """Import 3D model files from Thingiverse."""

    def getModelOptions(self, url: str):
        """
        Fetch file options for a Thingiverse thing URL.
        Returns a list of file option dicts, or None if files cannot be found.
        """
        match = re.search(r"thing:(\d+)", url)
        if match is None:
            return None
        thing_id = match.group(1)

        headers = {
            "User-Agent": BROWSER_UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }

        try:
            resp = requests.get(url, headers=headers, allow_redirects=True, timeout=30)
        except Exception:
            return None

        if resp.status_code != 200:
            return None

        data = _extract_next_data(resp.text)
        if data is None:
            return None

        files = _find_files(data)
        if not files:
            return None

        results = []
        for f in files:
            name = f.get("name", "")
            ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
            if ext not in ALLOWED_EXTENSIONS:
                continue
            results.append({
                "id": str(f.get("id", "")),
                "name": name,
                "parentId": thing_id,
                "folder": f.get("folder", "") or "",
                "previewPath": _preview_for_file(f),
                "typeName": ext,
                "downloadUrl": _download_url_for_file(f),
            })

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
