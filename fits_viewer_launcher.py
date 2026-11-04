#!/usr/bin/env python3
"""Open the standalone FITS viewer, optionally loading one local FITS file."""

import argparse
import os
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import quote, urlsplit

SOURCE_HTML_PATH = Path(__file__).resolve().with_name("fits_viewer.html")
HTML_PATH = Path(os.environ.get("FITS_VIEWER_HTML", SOURCE_HTML_PATH)).expanduser().resolve()


def open_page(fits_path: Path) -> None:
    html_bytes = HTML_PATH.read_bytes()
    fits_bytes = fits_path.read_bytes()
    state = {"fits_served": False}

    class Handler(BaseHTTPRequestHandler):
        def send_bytes(self, content: bytes, content_type: str, status: int = 200) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Connection", "close")
            self.end_headers()
            if content:
                self.wfile.write(content)
            self.close_connection = True

        def do_GET(self) -> None:  # noqa: N802 (stdlib handler API)
            route = urlsplit(self.path).path
            if route == "/":
                self.send_bytes(html_bytes, "text/html; charset=utf-8")
            elif route == "/file":
                self.send_bytes(fits_bytes, "application/octet-stream")
                state["fits_served"] = True
            elif route == "/favicon.ico":
                self.send_bytes(b"", "image/x-icon", 204)
            else:
                self.send_bytes(b"Not found", "text/plain; charset=utf-8", 404)

        def log_message(self, _format: str, *args: object) -> None:
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    server.timeout = 2
    port = server.server_address[1]
    url = f"http://127.0.0.1:{port}/?autoload=1&name={quote(fits_path.name)}"
    try:
        if not webbrowser.open(url):
            raise RuntimeError("could not open the default browser")
        deadline = time.monotonic() + 60
        while not state["fits_served"] and time.monotonic() < deadline:
            server.handle_request()
        if not state["fits_served"]:
            raise RuntimeError("the browser did not request the FITS file within 60 seconds")
    finally:
        server.server_close()


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="fits_viewer",
        description="Open the local FITS viewer, optionally loading one FITS file.",
    )
    parser.add_argument("fits", nargs="?", type=Path, help="local FITS file to display")
    args = parser.parse_args()
    if not HTML_PATH.is_file():
        parser.error(f"viewer page not found: {HTML_PATH}")
    if args.fits is None:
        if not webbrowser.open(HTML_PATH.as_uri()):
            parser.error("could not open the default browser")
        return
    try:
        fits_path = args.fits.expanduser().resolve(strict=True)
    except OSError as error:
        parser.error(str(error))
    if not fits_path.is_file():
        parser.error(f"not a regular file: {fits_path}")
    open_page(fits_path)


if __name__ == "__main__":
    main()
