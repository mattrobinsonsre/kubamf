# Kubamf - Kubernetes GUI

A modern, friendly interface for kubectl operations, available as both an Electron desktop app and a web application.

## Features

- 🎯 **Multi-context support** - Switch between Kubernetes contexts with tabbed interface
- 🔍 **Resource browsing** - View pods, services, deployments, configmaps, secrets, nodes, and CRDs
- 📊 **Expandable views** - Drill down into pod containers and detailed resource information
- 🔄 **Real-time refresh** - Auto-refresh resource data with manual refresh controls
- 🌐 **Namespace filtering** - Filter resources by namespace with saved preferences
- 🔍 **Search functionality** - Search across resource data
- 🎨 **Theme support** - Light, dark, and system themes
- 🖱️ **Drag & drop tabs** - Reorder context tabs with persistent ordering
- ⚡ **Connection monitoring** - Visual indicators for cluster connection status

## Deployment Options

### 1. Electron Desktop App (Recommended for local use)

**Platforms supported:**
- macOS Universal Binary (Intel + Apple Silicon)
- Windows x64 and ARM64
- Linux x64 and ARM64

**Features:**
- No network ports required (uses IPC)
- Native OS integration
- Auto-updater support
- Better performance

#### Development
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run Electron app in development
npm run electron
```

#### Building
```bash
# Build for all platforms
./scripts/build-all.sh

# Or build for specific platform
npm run electron:build -- --mac --universal  # macOS Universal
npm run electron:build -- --win --x64 --arm64  # Windows
npm run electron:build -- --linux --x64 --arm64  # Linux
```

### 2. Web Application (For team/remote access)

**Features:**
- Accessible via web browser
- Can be deployed on servers
- Multi-user support
- Docker deployment ready

#### Development
```bash
# Start both frontend and backend in development
npm run dev

# Or start separately
npm run dev:frontend  # React app on :5173
npm run dev:backend   # Express API on :3001
```

#### Production Deployment

**Option A: Direct Node.js**
```bash
# Build and start
npm run build
npm run web:start
```

**Option B: Docker**
```bash
# Use pre-built images from GitHub Container Registry
docker run -p 3001:3001 \
  -v ~/.kube:/home/kubamf/.kube:ro \
  ghcr.io/yourusername/kubamf-backend:latest

# Or with docker-compose
docker-compose up -d

# Or build manually
docker build -t kubamf-web .
docker run -p 3001:3001 -v ~/.kube:/home/kubamf/.kube:ro kubamf-web
```

**Option C: Docker with custom kubeconfig**
```bash
# Mount custom kubeconfig location
docker run -p 3001:3001 \
  -v /path/to/your/kubeconfig:/home/kubamf/.kube/config:ro \
  kubamf-web
```

## Architecture

### Frontend-Backend Communication

**Electron App:**
- Frontend ↔ Main Process via IPC (no TCP ports)
- Main Process executes kubectl commands directly
- Secure, no network exposure

**Web App:**
- Frontend ↔ Express API via HTTP/WebSocket
- Express server executes kubectl commands
- Runs on configurable port (default: 3001)

### Technology Stack

- **Frontend:** React, Vite, TailwindCSS, React Query
- **Backend:** Node.js, Express, kubectl CLI
- **Desktop:** Electron with IPC communication
- **Icons:** Lucide React
- **Styling:** TailwindCSS with dark mode support

## Configuration

Kubamf uses a **configuration file first** approach with **environment variable overrides**. This provides better organization and easier management, especially in Kubernetes deployments.

### Configuration File

Create a `kubamf.yaml` (or `kubamf.yml`) file in one of these locations:

1. `/app/config/kubamf.yaml` (Kubernetes ConfigMap mount)
2. `./config/kubamf.yaml` (relative to app directory)
3. `./kubamf.yaml` (current working directory)
4. Custom path via `CONFIG_FILE` environment variable

**Example configuration file:**

```yaml
# kubamf.yaml
server:
  port: 3001
  nodeEnv: production
  host: "0.0.0.0"

security:
  cors:
    # CORS is enabled by default with origins: ['*'] for development
    # Override for production with specific origins:
    enabled: true
    origins:
      - "https://kubamf.yourcompany.com"
      - "https://staging.yourcompany.com"
    credentials: true
    methods:
      - "GET"
      - "POST"
      - "PUT"
      - "DELETE"
      - "OPTIONS"
    allowedHeaders:
      - "Origin"
      - "X-Requested-With"
      - "Content-Type"
      - "Accept"
      - "Authorization"
      - "X-API-Key"

  tls:
    enabled: true
    trustProxy: true

  headers:
    helmet:
      enabled: true
      contentSecurityPolicy:
        enabled: true
        directives:
          defaultSrc: ["'self'"]
          styleSrc: ["'self'", "'unsafe-inline'"]
          scriptSrc: ["'self'"]
          imgSrc: ["'self'", "data:", "https:"]
          connectSrc: ["'self'"]
          fontSrc: ["'self'"]
          objectSrc: ["'none'"]
          mediaSrc: ["'self'"]
          frameSrc: ["'none'"]
      hsts:
        enabled: true
        maxAge: 31536000
        includeSubDomains: true
        preload: true
    custom:
      frameOptions: "SAMEORIGIN"
      contentTypeOptions: "nosniff"
      xssProtection: "1; mode=block"
      referrerPolicy: "strict-origin-when-cross-origin"

  rateLimit:
    enabled: true
    windowMs: 900000  # 15 minutes
    max: 100
    message:
      error: "Too many requests from this IP, please try again later."
    standardHeaders: true
    legacyHeaders: false

  slowDown:
    enabled: true
    windowMs: 900000
    delayAfter: 50
    delayMs: 500

  apiKey:
    enabled: true
    header: "X-API-Key"
    # key is set via environment variable or Kubernetes secret

limits:
  json: "1mb"
  urlEncoded: "1mb"

healthCheck:
  enabled: true
  interval: 30000
  timeout: 10000
  memoryThreshold: 512

logging:
  enabled: true
  format: "combined"
  level: "info"

compression:
  enabled: true

kubeconfig:
  path: "/home/kubamf/.kube/config"
  autoDetect: true

frontend:
  enabled: true
  security:
    headers:
      enabled: true
      csp:
        enabled: true
        policy: "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data: https:; connect-src 'self'; font-src 'self'; object-src 'none'; media-src 'self'; frame-src 'none';"
```

### Environment Variable Overrides

Environment variables can override any configuration file setting:

```bash
# Server configuration
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

# Security overrides
CORS_ENABLED=true
CORS_ORIGINS=https://app.com,https://staging.com
TLS_ENABLED=true
HELMET_ENABLED=true
RATE_LIMIT_ENABLED=true
API_KEY_ENABLED=true
API_KEY=your-super-secret-api-key-min-32-chars

# Custom config file location
CONFIG_FILE=/custom/path/to/config.yaml

# Kubeconfig path (optional, defaults to ~/.kube/config)
KUBECONFIG=/path/to/kubeconfig
```

### Frontend Configuration

The frontend uses a **minimal configuration system** that primarily relies on the backend for all complex configuration. The frontend only needs to know how to connect to the backend.

#### Configuration Priority (Frontend)

1. **Electron mode**: No HTTP configuration needed (uses IPC)
2. **Static hosting**: Uses `window.KUBAMF_API_HOST` injected at build time
3. **Development**: Uses `VITE_API_HOST` environment variable
4. **Production web**: Uses relative paths to the serving backend

#### Frontend Environment Variables

```bash
# Development only - API host for local development
VITE_API_HOST=http://localhost:3001

# Build time - Enable static hosting mode
VITE_STATIC_HOSTING=true
```

#### Static Hosting Configuration

For static hosting deployments, inject the API host at runtime:

```html
<!-- In your index.html or via web server -->
<script>
  window.KUBAMF_API_HOST = 'https://api.yourcompany.com';
  window.__STATIC_HOSTING__ = true;
</script>
```

Or via environment variables during the build:

```bash
# Build for static hosting with custom API host
VITE_STATIC_HOSTING=true VITE_API_HOST=https://api.example.com npm run build:frontend:static
```

#### Frontend-Backend Communication

**Electron App:**
- Communication: IPC (Inter-Process Communication)
- Configuration: None needed
- Security: Inherent process isolation

**Web App:**
- Communication: HTTP API + WebSocket (for real-time updates)
- Configuration: Backend URL only
- Security: Handled entirely by backend (CORS, auth, etc.)

The frontend automatically detects its deployment environment and configures itself appropriately.

**Environment variable mapping:**
- `NODE_ENV` → `server.nodeEnv`
- `PORT` → `server.port`
- `CORS_ENABLED` → `security.cors.enabled`
- `CORS_ORIGINS` → `security.cors.origins` (comma-separated)
- `TLS_ENABLED` → `security.tls.enabled`
- `HELMET_ENABLED` → `security.headers.helmet.enabled`
- `RATE_LIMIT_ENABLED` → `security.rateLimit.enabled`
- `API_KEY` → `security.apiKey.key`

### Configuration Validation

Configuration is validated on startup with detailed error reporting:

```bash
# Valid configuration
✅ Loaded configuration from: /app/config/kubamf.yaml

# Configuration errors
❌ Server port must be between 1 and 65535
❌ API key is enabled but no key is provided

# Configuration warnings
⚠️  API key should be at least 32 characters long
⚠️  TLS enforcement is disabled in production
```

### Kubeconfig Requirements

Kubamf uses your existing kubectl configuration:

1. Ensure kubectl is installed and working
2. Configure your contexts: `kubectl config get-contexts`
3. Test connectivity: `kubectl cluster-info`

## Development

### Project Structure

```
src/
├── components/          # React components
│   ├── Toolbar.jsx     # Main toolbar
│   ├── ContextTabs.jsx # Context tab management
│   ├── ContextView.jsx # Individual context view
│   ├── ResourceTree.jsx # Resource navigation
│   └── ResourceView.jsx # Resource data display
├── contexts/           # React contexts
│   ├── ThemeContext.jsx
│   └── KubeConfigContext.jsx
├── utils/
│   └── api.js          # API abstraction (IPC + HTTP)
├── electron/           # Electron main process
│   ├── main.js         # Main window setup
│   └── preload.js      # IPC bridge
└── backend/            # Express server
    ├── server.js       # HTTP API (web deployment)
    └── ipc-handlers.js # IPC handlers (Electron)
```

### Adding New Resource Types

1. Add resource definition to `ResourceTree.jsx`
2. Implement API method in `src/utils/api.js`
3. Add backend handler in `server.js` and `ipc-handlers.js`
4. Create resource view component

### Testing

Kubamf includes comprehensive testing with heavy parallelism for fast execution:

#### Test Suites

**Unit Tests:**
- Backend tests: Jest with Node.js environment
- Frontend tests: Vitest with JSDOM
- Coverage reports for both suites

**Integration Tests:**
- Full API endpoint testing
- Server startup/shutdown testing
- Cross-component integration

#### Running Tests

```bash
# Run all tests with heavy parallelism (recommended)
npm test
# or
npm run test:parallel

# Run individual test suites
npm run test:backend    # Jest backend tests
npm run test:frontend   # Vitest frontend tests
npm run test:integration # Integration tests

# Run tests sequentially (slower but more reliable on resource-constrained systems)
npm run test:sequential

# Watch mode for development
npm run test:watch

# Coverage reports
npm run test:coverage
```

#### Parallel Test Execution

The `scripts/test-parallel.js` script optimizes test execution:

- **Automatic worker calculation** based on CPU cores and memory
- **Parallel execution** of Jest and Vitest simultaneously
- **Colored output** with labeled test suite identification
- **CI optimization** with appropriate flags for GitHub Actions
- **Memory management** prevents OOM on resource-constrained systems

Example output:
```bash
🚀 Running tests with 6 workers
Platform: darwin, CPUs: 8, Memory: 16GB
CI Mode: No

[Backend] ✅ All tests passed (Backend tests completed in 12.3s)
[Frontend] ✅ All tests passed (Frontend tests completed in 8.7s)

🎉 All tests completed successfully in 15.2s!
```

#### GitHub Actions Integration

Tests run automatically with heavy parallelism and intelligent caching:

**Pull Request Workflow (`.github/workflows/ci-pr.yml`):**
- ✅ Parallel linting and testing across multiple workers
- ✅ Build artifact caching to skip redundant builds
- ✅ Test result caching to speed up subsequent runs
- ✅ Matrix-based testing for backend and frontend
- ✅ Coverage reporting to Codecov
- ✅ Docker build testing without publishing
- ✅ Helm chart validation
- ✅ Security scanning with npm audit and Snyk

**Main Branch Workflow (`.github/workflows/ci-main.yml`):**
- ✅ Heavy parallelism with optimized worker allocation
- ✅ Intelligent caching that skips unchanged components
- ✅ Container image building and publishing to GHCR
- ✅ Helm chart packaging and publishing
- ✅ Automated release creation for tags
- ✅ Tag-based vs commit-based versioning

**Release Workflow (`.github/workflows/release.yml`):**
- ✅ Triggered by version tags (e.g., `v1.0.0`)
- ✅ Publishes container images with multiple tags
- ✅ Creates GitHub releases with installation instructions
- ✅ Validates published artifacts

#### Caching Strategy

Both local and CI environments benefit from multi-layer caching:

1. **Dependency caching** - `node_modules` cached by package-lock.json hash
2. **Build caching** - Build outputs cached by source file hashes
3. **Test result caching** - Test results cached to skip unchanged tests
4. **Docker layer caching** - Docker buildx cache for faster image builds
5. **Lint result caching** - ESLint results cached by source hashes

#### Testing Best Practices

- **Test file naming**: `*.test.js` for unit tests, `*.integration.test.js` for integration
- **Parallel execution**: Designed for heavy parallelism without race conditions
- **Resource isolation**: Tests don't interfere with each other
- **CI optimization**: Different test strategies for PR vs main branch
- **Coverage tracking**: Separate coverage reports for backend and frontend

### Building & Deployment

```bash
# Build for development
npm run build

# Build for static hosting (frontend only)
npm run build:frontend:static

# Preview production build
npm run preview

# Lint code
npm run lint
npm run lint:fix

# Type check (if TypeScript is added)
npm run typecheck
```

## Container Images & Helm Charts

### Versioning Strategy

Container images and Helm charts are automatically built and published with intelligent versioning:

#### For Commits to Main Branch
- **Container tags**: `commit-<sha>`, `latest`
- **Helm chart version**: `0.0.0-<short-sha>`
- **Published to**: GitHub Container Registry (GHCR)

#### For Git Tags (Releases)
- **Container tags**: `<tag>`, `latest`, semantic versions (e.g., `1.2`, `1`)
- **Helm chart version**: `<tag>` (without `v` prefix)
- **Published to**: GitHub Container Registry (GHCR) + GitHub Releases

### Available Container Images

**Backend API:**
```bash
# Latest release
docker pull ghcr.io/yourusername/kubamf-backend:latest

# Specific version
docker pull ghcr.io/yourusername/kubamf-backend:v1.0.0

# Latest commit
docker pull ghcr.io/yourusername/kubamf-backend:commit-abc1234
```

**Frontend (Static):**
```bash
# Latest release
docker pull ghcr.io/yourusername/kubamf-frontend:latest

# Specific version
docker pull ghcr.io/yourusername/kubamf-frontend:v1.0.0
```

### Helm Chart Installation

**Install latest release:**
```bash
# Add the OCI registry
helm install kubamf oci://ghcr.io/yourusername/kubamf/charts/kubamf

# Install specific version
helm install kubamf oci://ghcr.io/yourusername/kubamf/charts/kubamf --version 1.0.0

# Upgrade to latest
helm upgrade kubamf oci://ghcr.io/yourusername/kubamf/charts/kubamf
```

**Custom values:**
```bash
# Install with custom configuration
helm install kubamf oci://ghcr.io/yourusername/kubamf/charts/kubamf \
  --set backend.replicas=3 \
  --set frontend.enabled=true \
  --set security.cors.enabled=true
```

### Creating Releases

To create a new release with automatic publishing:

```bash
# Create and push a version tag
git tag v1.0.0
git push origin v1.0.0

# This triggers:
# 1. Full test suite with heavy parallelism
# 2. Container image building for linux/amd64 and linux/arm64
# 3. Helm chart packaging and publishing
# 4. GitHub release creation with installation instructions
# 5. Artifact verification
```

### Multi-Platform Support

All container images are built for multiple architectures:
- `linux/amd64` (Intel/AMD 64-bit)
- `linux/arm64` (ARM 64-bit, Apple Silicon, ARM servers)

Docker automatically selects the correct architecture for your platform.

## License

MIT License - see LICENSE file for details

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Key Features

Kubamf provides a comprehensive Kubernetes management interface with:

**Core Functionality:**
- ✅ Multi-context tabbed interface with drag & drop reordering
- ✅ Resource tree navigation with expandable details
- ✅ Real-time streaming for large datasets (SSE)
- ✅ YAML editor with dual-mode (manifest/full) editing
- ✅ Multi-selection with batch operations
- ✅ Resource inspector with detailed views
- ✅ Auto-refresh with configurable intervals
- ✅ Advanced search and filtering
- ✅ Namespace persistence across sessions

**Operations:**
- ✅ View, edit, and delete resources
- ✅ Remove finalizers from stuck resources
- ✅ Trigger rolling restarts for deployments
- ✅ Scale deployments and statefulsets
- ✅ View pod logs with streaming support
- ✅ Execute commands in containers
- ✅ Port forwarding support

**Security & Enterprise:**
- ✅ Role-Based Access Control (RBAC)
- ✅ Authentication (Basic, OIDC)
- ✅ API key protection
- ✅ Rate limiting and CORS
- ✅ In-cluster service account support
- ✅ TLS/HTTPS enforcement
- ✅ Security headers (CSP, HSTS)

**Deployment Options:**
- ✅ Electron desktop app (no network exposure)
- ✅ Web application (team access)
- ✅ Docker containers (multi-arch)
- ✅ Kubernetes Helm charts
- ✅ Static frontend hosting
- ✅ High availability configurations