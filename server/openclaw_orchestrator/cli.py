"""CLI entry point for openclaw-orchestrator."""

import argparse
import sys


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="openclaw-orchestrator",
        description="Multi-Agent Visual Orchestration Plugin for OpenClaw",
    )
    subparsers = parser.add_subparsers(dest="command")

    # serve command
    serve_parser = subparsers.add_parser("serve", help="Start the orchestrator server")
    serve_parser.add_argument(
        "--host", default="0.0.0.0", help="Host to bind (default: 0.0.0.0)"
    )
    serve_parser.add_argument(
        "--port", type=int, default=None, help="Port to listen on (default: 3721)"
    )
    serve_parser.add_argument(
        "--openclaw-home",
        default=None,
        help="OpenClaw home directory (default: ~/.openclaw)",
    )
    serve_parser.add_argument(
        "--reload", action="store_true", help="Enable auto-reload for development"
    )

    # version command
    subparsers.add_parser("version", help="Show version")

    args = parser.parse_args()

    if args.command == "version":
        from openclaw_orchestrator import __version__

        print(f"openclaw-orchestrator v{__version__}")
        return

    if args.command == "serve":
        _run_server(args)
        return

    # Default: show help
    parser.print_help()
    sys.exit(1)


def _run_server(args: argparse.Namespace) -> None:
    """Start the FastAPI server with uvicorn."""
    import os

    # Set config via environment variables before importing app
    if args.openclaw_home:
        os.environ["OPENCLAW_HOME"] = args.openclaw_home
    if args.port:
        os.environ["PORT"] = str(args.port)

    import uvicorn

    from openclaw_orchestrator.config import settings

    port = args.port or settings.port
    host = args.host

    print(f"OpenClaw Orchestrator server starting on http://{host}:{port}")
    print(f"OpenClaw home: {settings.openclaw_home}")

    uvicorn.run(
        "openclaw_orchestrator.app:app",
        host=host,
        port=port,
        reload=args.reload,
        log_level="info",
    )


if __name__ == "__main__":
    main()
