# Kubamf - Kubernetes GUI

A Kubernetes management interface available as an Electron desktop app and a
web application deployable behind [BAMF](https://github.com/mattrobinsonsre/bamf).

## Features

- Multi-context tabbed interface with drag-and-drop reordering
- Resource tree navigation (pods, services, deployments, configmaps, secrets, nodes, CRDs)
- YAML editor with manifest and full-resource editing modes
- Pod log streaming, container exec (shell), port forwarding
- Batch operations with multi-selection
- Namespace filtering with saved preferences
- Real-time data via SSE (Server-Sent Events)
- Light, dark, and system themes

## Deployment Modes

### Standalone (Electron Desktop App)

No authentication. Uses your local kubeconfig directly via IPC.

Platforms: macOS (Universal), Windows (x64/arm64), Linux (x64/arm64).

```zsh
npm install
npm run dev        # frontend + backend dev servers
npm run electron   # launch Electron app in dev mode
```

### BAMF Mode (Web Application)

Deployed into a Kubernetes cluster behind a BAMF agent. BAMF handles
authentication (SSO), session management, and audit logging. Kubamf routes
all Kubernetes API calls through the BAMF API kube proxy with a Bearer
session token — the BAMF agent handles K8s impersonation, not kubamf.

No standalone web mode exists. The web deployment requires BAMF.

```zsh
# Deploy via Helm (as a BAMF subchart or standalone)
helm install kubamf oci://ghcr.io/mattrobinsonsre/kubamf \
  --set bamf.enabled=true \
  --set bamf.kubeResourceName=my-cluster
```

Helm values reference: see `charts/kubamf/values.yaml`.

## Tech Stack

| Layer       | Technology                                         |
|-------------|----------------------------------------------------|
| Frontend    | React 18, Vite 4, TailwindCSS 3, React Query 4    |
| Backend     | Express 4, @kubernetes/client-node 0.20            |
| Desktop     | Electron 26                                        |
| YAML Editor | CodeMirror 6 (@uiw/react-codemirror)               |
| Terminal    | Xterm.js 5 (@xterm/xterm)                          |
| Icons       | Lucide React                                       |
| Real-time   | SSE, WebSocket (ws)                                |
| Testing     | Jest (backend), Vitest (frontend), Playwright (E2E)|

## Build and Release

Versions are driven by git tags. `Chart.yaml` and `package.json` stay at
`0.0.0` in source; build scripts derive the version from `git describe --tags`.

```zsh
gmake release       # lint, test, build, publish (Docker images + Helm chart + Electron packages)
gmake build-web     # build web app only
gmake build-electron # build Electron packages only
gmake test          # run all tests
gmake lint          # run ESLint
gmake dev           # start Tilt local dev environment
```

All build, test, and lint operations run inside Docker containers via the
scripts in `scripts/`. Only Docker and `gmake` are required on the host.

## Development

See `CLAUDE.md` for detailed architecture, project structure, and development
conventions.

```zsh
# Local dev (frontend + backend with hot reload)
npm run dev

# Tilt-based K8s dev environment
gmake dev
```

## License

MIT
