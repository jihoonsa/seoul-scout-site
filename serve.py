"""Opens the Seoul Scout map on this computer: serves this folder at http://localhost:8000 and opens the browser.

Why a server at all: a page opened as a file (double-clicking index.html) may not read the files next to it, so the
data and the base map would not load. This small server sends them to the browser. Nothing goes online.

Python's built-in server (python -m http.server) always sends whole files. The base map (data/seoul.pmtiles) is
read in small parts ("byte ranges"), the way GitHub Pages serves it, so this server adds that feature. Like GitHub
Pages, it also compresses text files (gzip): the 2.2 MB neighbourhood data then arrives as a fraction of that.

Run:  double-click "Open Seoul Scout.bat" (Windows),  or:  python serve.py
      python serve.py --no-browser    only serves the page, without opening the browser
Stop: Ctrl+C, or close the window.
"""
import functools
import gzip
import http.server
import os
import re
import sys
import webbrowser
from pathlib import Path

FOLDER = Path(__file__).resolve().parent
FIRST_PORT = 8000
PORTS_TO_TRY = 20                     # if 8000 is taken (the map is already open, or another program), try 8001, ...
RANGE = re.compile(r"bytes=(\d*)-(\d*)$")
COMPRESSED_TYPES = {".html", ".js", ".css", ".json", ".svg"}


@functools.lru_cache(maxsize=64)
def gzipped(path, modified):
    """A text file's gzip bytes, kept until the file changes (modified is part of the key)."""
    return gzip.compress(Path(path).read_bytes(), compresslevel=6)


class RangeRequestHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".json": "application/json", ".pmtiles": "application/octet-stream"}

    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        wanted = RANGE.match(self.headers.get("Range", ""))
        path = Path(self.translate_path(self.path))
        if path.is_dir():
            path = path / "index.html"
        if not wanted and path.is_file() and path.suffix in COMPRESSED_TYPES \
                and "gzip" in self.headers.get("Accept-Encoding", ""):
            return self.send_gzipped(path)
        if not wanted or not path.is_file():
            return super().do_GET()
        size = path.stat().st_size
        first, last = wanted.groups()
        if first:
            start, end = int(first), min(int(last) if last else size - 1, size - 1)
        else:                                       # "bytes=-500": the last 500 bytes
            start, end = max(size - int(last), 0), size - 1
        if start > end:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(str(path)))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        with open(path, "rb") as file:
            file.seek(start)
            self.wfile.write(file.read(end - start + 1))

    def send_gzipped(self, path):
        body = gzipped(os.fspath(path), path.stat().st_mtime_ns)
        self.send_response(200)
        self.send_header("Content-Type", self.guess_type(str(path)))
        self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Vary", "Accept-Encoding")
        self.end_headers()
        self.wfile.write(body)


class MapServer(http.server.ThreadingHTTPServer):
    # On Windows, "reuse address" lets a second server share a port that is in use, so a taken port would go unnoticed.
    allow_reuse_address = os.name != "nt"
    # The map opens many files at once; with Python's default queue of 5, Windows refuses the extra connections (D62).
    request_queue_size = 64


def start_server():
    """Starts the server on the first free port from 8000."""
    handler = functools.partial(RangeRequestHandler, directory=os.fspath(FOLDER))
    for port in range(FIRST_PORT, FIRST_PORT + PORTS_TO_TRY):
        try:
            return MapServer(("localhost", port), handler)
        except OSError:
            continue
    sys.exit(f"Ports {FIRST_PORT} to {FIRST_PORT + PORTS_TO_TRY - 1} are all in use. Close other servers and try again.")


if __name__ == "__main__":
    with start_server() as server:
        address = f"http://localhost:{server.server_port}"
        print(f"Seoul Scout map: {address}")
        print("Keep this window open while you use the map. Ctrl+C or closing the window stops it.")
        if "--no-browser" not in sys.argv:
            webbrowser.open(address)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("Stopped.")
