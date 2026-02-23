# Kubamf Deployment Guide

Kubamf supports multiple deployment scenarios to fit various use cases and environments. This guide covers all deployment options from desktop development to production Kubernetes clusters.

## 🖥️ Desktop Application

The simplest deployment for local development and personal use.

### Prerequisites
- Node.js 18+ or pre-built Electron app
- kubectl configured with cluster access
- Git (for source deployment)

### Deployment Options

#### Option 1: Run from Source
```bash
# Clone repository
git clone https://github.com/your-org/kubamf.git
cd kubamf

# Install dependencies
npm install

# Run in development mode
npm run dev

# Or build and run
npm run build
npm run electron
```

#### Option 2: Pre-built Electron App
Download the latest release for your platform:
- macOS: `kubamf-1.0.0.dmg`
- Windows: `kubamf-1.0.0.exe`
- Linux: `kubamf-1.0.0.AppImage`

### Configuration

Desktop mode uses **no authentication by default**:

```yaml
# ~/.kubamf/config.yaml (optional)
auth:
  provider: 'none'  # No authentication
rbac:
  enabled: false     # No access control
multiCluster:
  enabled: false     # Use local kubeconfig only
```

### Features Available
- ✅ Full kubeconfig support (`~/.kube/config`)
- ✅ Context switching
- ✅ Multiple kubeconfig file support
- ✅ All kubectl operations
- ❌ Multi-user access
- ❌ Authentication
- ❌ Network access

### Security Model
- Relies on OS-level security
- Full access to local kubeconfig
- No network-based authentication
- Suitable for trusted single-user environments

---

## 🌐 Web Application - Kubernetes Deployment

Production-ready deployment inside Kubernetes clusters with full security features.

### Prerequisites
- Kubernetes cluster
- Helm 3.x
- kubectl configured with cluster admin access
- Optional: Ingress controller, TLS certificates

### Quick Start

```bash
# Add Helm repository (if published)
helm repo add kubamf https://charts.kubamf.io
helm repo update

# Or use local charts
cd charts/kubamf

# Install with default settings (⚠️ Change default password!)
helm install kubamf . \
  --set auth.enabled=true \
  --set auth.provider=basic \
  --set auth.basic.users[0].passwordHash='$2b$12$YOUR_BCRYPT_HASH'

# Enable ingress for external access
helm upgrade kubamf . \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=kubamf.company.com
```

### Namespace and Resource Naming

Kubamf supports flexible deployment to any namespace with customizable resource naming:

#### Namespace Deployment

```bash
# Deploy to specific namespace
helm install kubamf . --namespace production --create-namespace

# Deploy to multiple environments
helm install kubamf-dev . --namespace development
helm install kubamf-staging . --namespace staging
helm install kubamf-prod . --namespace production
```

#### Resource Name Customization

```bash
# Basic name override (changes app name part)
helm install kubamf . --set nameOverride="kubectl-web"
# Result: my-release-kubectl-web

# Full name override (complete control over resource names)
helm install kubamf . --set fullnameOverride="prod-kubamf-primary"
# Result: prod-kubamf-primary

# Resource name prefix (team/environment prefix)
helm install kubamf . --set resourceNamePrefix="team-alpha"
# Result: team-alpha-my-release-kubamf

# Combined with namespace for multi-tenant deployment
helm install kubamf . \
  --namespace team-alpha \
  --set resourceNamePrefix="alpha" \
  --set fullnameOverride="kubamf-primary"
# Result: alpha-kubamf-primary in team-alpha namespace
```

#### Multi-Environment Deployment Examples

```yaml
# values-dev.yaml
nameOverride: "kubamf-dev"
resourceNamePrefix: "dev"
auth:
  enabled: false  # No auth for development

ingress:
  enabled: true
  hosts:
    - host: kubamf-dev.company.com
```

```yaml
# values-staging.yaml
nameOverride: "kubamf-staging"
resourceNamePrefix: "staging"
auth:
  enabled: true
  provider: basic

ingress:
  enabled: true
  hosts:
    - host: kubamf-staging.company.com
```

```yaml
# values-prod.yaml
fullnameOverride: "kubamf"
resourceNamePrefix: "prod"
auth:
  enabled: true
  provider: oidc  # Use SSO for production

backend:
  replicaCount: 3
autoscaling:
  enabled: true

ingress:
  enabled: true
  hosts:
    - host: kubamf.company.com
```

```bash
# Deploy all environments
helm install kubamf-dev . -f values-dev.yaml --namespace development
helm install kubamf-staging . -f values-staging.yaml --namespace staging
helm install kubamf-prod . -f values-prod.yaml --namespace production
```

### 🔐 Security Configuration

#### Basic Authentication
```yaml
# values.yaml
auth:
  enabled: true
  provider: basic
  basic:
    enabled: true
    createSecret: true  # Store credentials in Kubernetes Secret
    users:
      - username: 'admin'
        passwordHash: '$2b$12$...'  # bcrypt hash
        email: 'admin@company.com'
        roles: ['admin']
        enabled: true
      - username: 'developer'
        passwordHash: '$2b$12$...'
        email: 'dev@company.com'
        roles: ['developer']
        enabled: true

rbac:
  enabled: true
  defaultRole: 'viewer'
```

#### OIDC Authentication (Recommended)
```yaml
# values.yaml
auth:
  enabled: true
  provider: oidc
  oidc:
    enabled: true
    issuer: 'https://your-oidc-provider.com'
    clientId: 'kubamf-client'
    clientSecret: 'secret-stored-in-k8s-secret'
    redirectUri: 'https://kubamf.company.com/auth/oidc/callback'
    scope: 'openid profile email groups'
    groupClaim: 'groups'
    roleClaim: 'roles'
```

### RBAC Configuration

```yaml
# values.yaml
rbac:
  enabled: true
  customRoles:
    platform-admin:
      name: 'Platform Administrator'
      permissions:
        - actions: ['*']
          resources: ['*']
          scope: 'cluster'
          clusters: ['production', 'staging']

    developer:
      name: 'Developer'
      permissions:
        - actions: ['read', 'list', 'create', 'update']
          resources: ['pods', 'services', 'deployments']
          scope: 'namespace'
          namespaces: ['development', 'testing']

  bindings:
    - subjects:
        - type: 'group'
          name: 'platform-team'
      role: 'platform-admin'
      clusters: ['production', 'staging']
    - subjects:
        - type: 'group'
          name: 'developers'
      role: 'developer'
      namespaces: ['development', 'testing']
```

### Multi-Cluster Configuration

```yaml
# values.yaml
multiCluster:
  enabled: true
  discovery:
    enabled: true
    sources: ['configMaps', 'secrets']

rbac:
  crossCluster:
    enabled: true
    clusters:
      - name: 'production'
        description: 'Production cluster'
        kubeconfig: |
          apiVersion: v1
          kind: Config
          # ... full kubeconfig
```

### High Availability Configuration

Kubamf includes comprehensive HA configuration for production cloud deployments.

#### Pod Distribution and Anti-Affinity

```yaml
# values.yaml
backend:
  # Enable multiple replicas for HA
  replicaCount: 3

  # Anti-affinity rules (default configuration)
  affinity:
    podAntiAffinity:
      # High priority: spread across availability zones
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100
          podAffinityTerm:
            labelSelector:
              matchLabels:
                app.kubernetes.io/name: kubamf
                app.kubernetes.io/component: backend
            topologyKey: topology.kubernetes.io/zone
        # Medium priority: spread across nodes
        - weight: 50
          podAffinityTerm:
            labelSelector:
              matchLabels:
                app.kubernetes.io/name: kubamf
                app.kubernetes.io/component: backend
            topologyKey: kubernetes.io/hostname

  # Topology spread constraints (modern approach)
  topologySpreadConstraints:
    # Hard requirement: distribute evenly across AZs
    - maxSkew: 1
      topologyKey: topology.kubernetes.io/zone
      whenUnsatisfiable: DoNotSchedule
      labelSelector:
        matchLabels:
          app.kubernetes.io/name: kubamf
          app.kubernetes.io/component: backend
    # Soft requirement: distribute across nodes
    - maxSkew: 1
      topologyKey: kubernetes.io/hostname
      whenUnsatisfiable: ScheduleAnyway
      labelSelector:
        matchLabels:
          app.kubernetes.io/name: kubamf
          app.kubernetes.io/component: backend
```

#### Node Selection and Tolerations

Control where Kubamf pods are scheduled using node selectors and tolerations:

```yaml
backend:
  # Node selection - only schedule on nodes with these labels
  nodeSelector:
    kubernetes.io/arch: amd64                    # AMD64 architecture only
    node.kubernetes.io/instance-type: m5.large  # Specific instance type
    environment: production                      # Custom environment label
    workload-type: application                   # Custom workload classification

  # Tolerations - allow scheduling on tainted nodes
  tolerations:
    # Dedicated nodes for kubamf
    - key: "dedicated"
      operator: "Equal"
      value: "kubamf"
      effect: "NoSchedule"
    # Spot/preemptible instances (cost optimization)
    - key: "node.kubernetes.io/spot"
      operator: "Exists"
      effect: "NoSchedule"
    # Custom maintenance windows
    - key: "maintenance-window"
      operator: "Equal"
      value: "weekends"
      effect: "NoSchedule"
```

#### Cloud Provider Examples

**AWS EKS Multi-AZ Deployment:**
```yaml
backend:
  replicaCount: 3  # One per AZ

  # Target specific instance types and availability zones
  nodeSelector:
    node.kubernetes.io/instance-type: m5.large
    topology.kubernetes.io/zone: us-west-2a  # Optional: specific AZ

  # Tolerate spot instances for cost savings
  tolerations:
    - key: "node.kubernetes.io/spot"
      operator: "Exists"
      effect: "NoSchedule"
    - key: "eks.amazonaws.com/capacity-type"
      operator: "Equal"
      value: "SPOT"
      effect: "NoSchedule"
```

**Google GKE Regional Cluster:**
```yaml
backend:
  replicaCount: 6  # Two per zone in 3-zone cluster

  # Prefer standard nodes over preemptible for stability
  nodeSelector:
    cloud.google.com/gke-nodepool: standard-pool

  # Allow preemptible nodes for cost optimization
  tolerations:
    - key: "cloud.google.com/gke-preemptible"
      operator: "Equal"
      value: "true"
      effect: "NoSchedule"

  # Node affinity for standard nodes preference
  affinity:
    nodeAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100
          preference:
            matchExpressions:
              - key: cloud.google.com/gke-preemptible
                operator: DoesNotExist
```

**Azure AKS Availability Zone Setup:**
```yaml
backend:
  replicaCount: 3

  # Target specific VM sizes and zones
  nodeSelector:
    kubernetes.io/arch: amd64
    node.kubernetes.io/instance-type: Standard_D4s_v3

  # Tolerate spot instances
  tolerations:
    - key: "kubernetes.azure.com/scalesetpriority"
      operator: "Equal"
      value: "spot"
      effect: "NoSchedule"

  # Ensure distribution across availability zones
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
          - matchExpressions:
              - key: topology.kubernetes.io/zone
                operator: In
                values: ["eastus-1", "eastus-2", "eastus-3"]
```

#### Autoscaling Configuration

```yaml
# Enable Horizontal Pod Autoscaler
autoscaling:
  enabled: true
  minReplicas: 3  # Minimum for HA across AZs
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

  # Advanced metrics (requires metrics-server and custom metrics)
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80

  # Scaling behavior
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 10
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
```

#### Pod Disruption Budget

```yaml
# Ensure minimum availability during updates
podDisruptionBudget:
  enabled: true
  minAvailable: 2  # Keep at least 2 pods running
  # Alternative: maxUnavailable: 1
```

#### Rolling Update Strategy

```yaml
# Safe rolling updates
backend:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0      # Never go below desired capacity
      maxSurge: 1           # Add one extra pod during updates
```

#### Resource Management

Kubamf uses sensible resource defaults that work well for most deployments:

```yaml
backend:
  # Default resources (good for most use cases)
  resources:
    requests:
      cpu: 200m       # 0.2 CPU cores guaranteed
      memory: 256Mi   # 256MB RAM guaranteed
    limits:
      cpu: 1000m      # 1 CPU core maximum
      memory: 1Gi     # 1GB RAM maximum

  # Quality of Service: Burstable (recommended)
  # - Requests set for scheduling and HPA calculations
  # - Limits prevent resource exhaustion
```

**Environment-Specific Resource Configurations:**

```yaml
# Small/Development environment
backend:
  resources:
    limits:
      cpu: 500m
      memory: 512Mi
    requests:
      cpu: 100m
      memory: 128Mi

# Large/Production environment
backend:
  resources:
    limits:
      cpu: 2000m
      memory: 2Gi
    requests:
      cpu: 500m
      memory: 512Mi

# High-performance environment
backend:
  resources:
    limits:
      cpu: 4000m
      memory: 4Gi
    requests:
      cpu: 1000m
      memory: 1Gi
```

**Important Notes:**
- Resource requests are used for HPA scaling calculations
- Set limits to prevent resource starvation in shared clusters
- Memory requests should account for Node.js baseline memory usage
- CPU requests impact scheduling and cluster utilization

#### Health Checks and Graceful Shutdown

```yaml
backend:
  # Readiness probe - pod ready to receive traffic
  readinessProbe:
    enabled: true
    httpGet:
      path: /health/ready
      port: http
    initialDelaySeconds: 5
    periodSeconds: 5
    timeoutSeconds: 5
    failureThreshold: 3

  # Liveness probe - restart unhealthy pods
  livenessProbe:
    enabled: true
    httpGet:
      path: /health/live
      port: http
    initialDelaySeconds: 30
    periodSeconds: 10
    timeoutSeconds: 5
    failureThreshold: 3

  # Graceful shutdown
  terminationGracePeriodSeconds: 30
```

### Features Available
- ✅ Multi-user authentication (Basic Auth, OIDC)
- ✅ Fine-grained RBAC
- ✅ Multi-cluster management
- ✅ Secure credential storage in Kubernetes Secrets
- ✅ Audit logging
- ✅ High availability (multiple replicas)
- ✅ Horizontal Pod Autoscaler
- ✅ Network policies
- ✅ TLS termination

---

## 🐳 Web Application - Container Outside Kubernetes

Containerized deployment on traditional infrastructure without Kubernetes orchestration.

### Prerequisites
- Docker or Podman
- Container orchestrator (Docker Compose, Nomad, etc.)
- External authentication provider (optional)
- Load balancer (for HA)

### Docker Compose Deployment

```yaml
# docker-compose.yml
version: '3.8'

services:
  kubamf:
    image: kubamf:latest
    container_name: kubamf-web
    ports:
      - "3001:3001"
    environment:
      # Authentication
      AUTH_PROVIDER: basic
      AUTH_BASIC_ENABLED: true

      # RBAC
      RBAC_ENABLED: true

      # Security
      HELMET_ENABLED: true
      RATE_LIMIT_ENABLED: true

      # HTTPS (recommended)
      TLS_ENABLED: true
      TRUST_PROXY: true

    volumes:
      # Configuration
      - ./config:/app/config:ro
      - ./kubeconfigs:/app/kubeconfigs:ro

      # TLS certificates (if not using reverse proxy)
      - ./certs:/app/certs:ro

    configs:
      - source: kubamf-config
        target: /app/config/kubamf.yaml
      - source: auth-config
        target: /app/config/auth.yaml

    secrets:
      - kubamf-users

    restart: unless-stopped

    # Resource limits
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'

  # Optional: nginx reverse proxy
  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - kubamf

configs:
  kubamf-config:
    file: ./config/kubamf.yaml
  auth-config:
    file: ./config/auth.yaml

secrets:
  kubamf-users:
    file: ./secrets/users.yaml
```

### Configuration Files

```yaml
# config/kubamf.yaml
server:
  port: 3001
  nodeEnv: production

auth:
  provider: basic
  basic:
    enabled: true
    realm: 'Kubamf Production'
    secure: true

rbac:
  enabled: true

multiCluster:
  enabled: true
  clusters:
    production:
      name: 'Production Cluster'
      kubeconfig: '/app/kubeconfigs/prod.yaml'
      credentials:
        type: 'file'
```

```yaml
# secrets/users.yaml
users:
  - username: 'admin'
    passwordHash: '$2b$12$...'
    email: 'admin@company.com'
    roles: ['admin']
    enabled: true
```

### Features Available
- ✅ Multi-user authentication
- ✅ RBAC with custom roles
- ✅ Multi-cluster support
- ✅ Container-based scaling
- ✅ External load balancing
- ✅ Configuration management
- ❌ Kubernetes-native features (ServiceMonitor, etc.)
- ❌ Dynamic configuration reload

---

## 🖥️ Web Application - Native Host Installation

Direct installation on physical or virtual machines without containers.

### Prerequisites
- Linux/macOS/Windows server
- Node.js 18+ runtime
- Process manager (PM2, systemd, etc.)
- Reverse proxy (nginx, Apache)
- Database (optional, for session storage)

### Installation

```bash
# Create application user
sudo useradd -r -s /bin/false kubamf

# Install application
sudo mkdir -p /opt/kubamf
cd /opt/kubamf

# Install from source
git clone https://github.com/your-org/kubamf.git .
npm ci --production

# Build application
npm run build

# Set permissions
sudo chown -R kubamf:kubamf /opt/kubamf
sudo chmod +x /opt/kubamf/dist/backend/index.js
```

### Configuration

```yaml
# /opt/kubamf/config/kubamf.yaml
server:
  port: 3001
  host: '127.0.0.1'  # Bind to localhost (use reverse proxy)
  nodeEnv: production

auth:
  provider: oidc  # Recommended for production
  oidc:
    enabled: true
    issuer: 'https://auth.company.com'
    clientId: 'kubamf'
    clientSecret: 'stored-in-env-var'
    redirectUri: 'https://kubamf.company.com/auth/oidc/callback'

security:
  cors:
    enabled: true
    origins: ['https://kubamf.company.com']

  headers:
    helmet:
      enabled: true
      hsts:
        enabled: true
        maxAge: 31536000

  rateLimit:
    enabled: true
    max: 100
    windowMs: 900000

rbac:
  enabled: true

logging:
  enabled: true
  format: 'combined'
  level: 'info'
```

### Systemd Service

```ini
# /etc/systemd/system/kubamf.service
[Unit]
Description=Kubamf Web Application
After=network.target

[Service]
Type=simple
User=kubamf
Group=kubamf
WorkingDirectory=/opt/kubamf
ExecStart=/usr/bin/node dist/backend/index.js
Restart=always
RestartSec=5

# Environment
Environment=NODE_ENV=production
Environment=CONFIG_FILE=/opt/kubamf/config/kubamf.yaml
EnvironmentFile=-/opt/kubamf/.env

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/kubamf/logs

# Resource limits
LimitNOFILE=65536
MemoryLimit=1G

[Install]
WantedBy=multi-user.target
```

### Nginx Reverse Proxy

```nginx
# /etc/nginx/sites-available/kubamf
server {
    listen 443 ssl http2;
    server_name kubamf.company.com;

    # TLS configuration
    ssl_certificate /etc/ssl/certs/kubamf.crt;
    ssl_certificate_key /etc/ssl/private/kubamf.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Proxy to application
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://127.0.0.1:3001/health;
        access_log off;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name kubamf.company.com;
    return 301 https://$server_name$request_uri;
}
```

### Process Management with PM2

```yaml
# ecosystem.config.yaml
apps:
  - name: kubamf
    script: dist/backend/index.js
    cwd: /opt/kubamf
    instances: 2
    exec_mode: cluster
    env:
      NODE_ENV: production
      CONFIG_FILE: /opt/kubamf/config/kubamf.yaml
    env_production:
      NODE_ENV: production
    error_file: logs/error.log
    out_file: logs/output.log
    log_file: logs/combined.log
    time: true
    max_memory_restart: 1G
    restart_delay: 5000
    watch: false

deploy:
  production:
    user: kubamf
    host: kubamf.company.com
    ref: origin/main
    repo: git@github.com:your-org/kubamf.git
    path: /opt/kubamf
    post-deploy: 'npm ci --production && npm run build && pm2 reload ecosystem.config.yaml --env production'
```

### Features Available
- ✅ Full production features
- ✅ System-level integration
- ✅ Native process management
- ✅ Direct OS security integration
- ✅ Custom logging and monitoring
- ✅ Fine-grained resource control
- ❌ Container orchestration benefits
- ❌ Easy horizontal scaling

---

## 📊 Comparison Matrix

| Feature | Desktop | K8s Web | Container Web | Native Web |
|---------|---------|---------|---------------|------------|
| Authentication | None | Basic/OIDC | Basic/OIDC | Basic/OIDC |
| RBAC | No | Full | Full | Full |
| Multi-cluster | Local only | Yes | Yes | Yes |
| High Availability | No | Yes | Manual | Manual |
| Auto-scaling | No | Yes | Limited | No |
| Security | OS-level | K8s-native | Container | OS-level |
| Complexity | Low | Medium | Medium | High |
| Resource Usage | Low | Medium | Medium | Low |
| Deployment Speed | Instant | Medium | Fast | Slow |

## 🔒 Security Best Practices

### For All Deployments
1. **Change default credentials immediately**
2. Use strong, unique passwords (20+ characters)
3. Enable HTTPS/TLS in production
4. Regular security updates
5. Monitor authentication logs
6. Use least-privilege access

### Web Deployments
7. Enable rate limiting
8. Use security headers (Helmet.js)
9. Configure CORS properly
10. Use OIDC instead of Basic Auth when possible
11. Store secrets securely (Kubernetes Secrets, HashiCorp Vault)
12. Enable audit logging

### Kubernetes Specific
13. Use Network Policies
14. Enable Pod Security Standards
15. Use ServiceAccounts with minimal permissions
16. Regular vulnerability scanning
17. Enable admission controllers

---

## 🎨 Frontend Deployment Options

The Kubamf frontend can be deployed in several ways depending on your architecture and requirements.

### Combined Deployment (Default)

By default, the backend serves the frontend as static files.

```yaml
# values.yaml
deployment:
  components:
    backend: true
    frontend: true  # Frontend served by backend
```

**Pros:**
- ✅ Simple single-container deployment
- ✅ Unified configuration and management
- ✅ No cross-origin issues
- ✅ Easier SSL/TLS setup

**Cons:**
- ❌ Backend handles static file serving
- ❌ Limited CDN optimization options
- ❌ Monolithic deployment

### Static Hosting (Separate Frontend)

Host the frontend separately using CDN or static hosting services.

#### Build Frontend for Static Hosting

```bash
# Build production frontend
npm run build:frontend

# Output directory: dist/frontend/
# Contains: index.html, assets/, etc.
```

#### Configuration

```javascript
// Frontend build configuration
// Set API base URL to point to backend
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://api.kubamf.company.com'
```

#### Popular Static Hosting Options

**1. Nginx/Apache**
```nginx
# nginx.conf
server {
    listen 443 ssl http2;
    server_name kubamf.company.com;

    root /var/www/kubamf/frontend;
    index index.html;

    # SPA routing support
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy to backend
    location /api/ {
        proxy_pass https://api.kubamf.company.com/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**2. AWS CloudFront + S3**
```bash
# Upload frontend to S3
aws s3 sync dist/frontend/ s3://kubamf-frontend-bucket/

# Configure CloudFront distribution
# - Origin: S3 bucket
# - Behavior: /api/* -> Backend ALB
# - Behavior: /* -> S3 bucket
```

**3. Cloudflare Pages**
```yaml
# wrangler.toml
name = "kubamf-frontend"
compatibility_date = "2023-10-10"

[build]
command = "npm run build:frontend"
destination = "dist/frontend"

[[redirects]]
from = "/api/*"
to = "https://api.kubamf.company.com/api/:splat"
status = 200
```

**4. Vercel**
```json
// vercel.json
{
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "https://api.kubamf.company.com/api/$1"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

**5. Netlify**
```toml
# netlify.toml
[build]
  command = "npm run build:frontend"
  publish = "dist/frontend"

[[redirects]]
  from = "/api/*"
  to = "https://api.kubamf.company.com/api/:splat"
  status = 200

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

#### Backend Configuration for Separate Frontend

```yaml
# values.yaml - Disable frontend serving in backend
deployment:
  components:
    backend: true
    frontend: false  # Don't serve frontend from backend

backend:
  env:
    security:
      corsEnabled: true
      corsOrigins: "https://kubamf.company.com"  # Frontend domain
      corsCredentials: true
```

### Containerized Frontend (Separate Container)

Deploy frontend as a separate container for microservices architecture.

#### Frontend Dockerfile

```dockerfile
# Dockerfile.frontend
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY src/ src/
COPY public/ public/
COPY vite.config.js ./
COPY index.html ./

RUN npm run build:frontend

FROM nginx:alpine
COPY --from=builder /app/dist/frontend /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

#### Nginx Configuration for Frontend Container

```nginx
# nginx.conf
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Health check
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
```

#### Helm Chart for Separate Frontend

```yaml
# values.yaml
frontend:
  enabled: true
  replicaCount: 2

  image:
    repository: kubamf-frontend
    tag: "latest"
    pullPolicy: IfNotPresent

  service:
    type: ClusterIP
    port: 80

  ingress:
    enabled: true
    hosts:
      - host: kubamf.company.com
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: kubamf-frontend
                port: 80

backend:
  service:
    type: ClusterIP
    port: 80

  ingress:
    enabled: true
    hosts:
      - host: api.kubamf.company.com
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: kubamf-backend
                port: 80
```

### Hybrid Deployment (CDN + Fallback)

Use CDN for frontend with backend fallback for dynamic content.

```yaml
# values.yaml
frontend:
  cdn:
    enabled: true
    baseUrl: "https://cdn.kubamf.company.com"

  fallback:
    enabled: true  # Serve from backend if CDN fails
```

## 🔀 Deployment Strategy Comparison

| Strategy | Complexity | Performance | Scalability | Cost | Use Case |
|----------|------------|-------------|-------------|------|----------|
| **Combined** | Low | Good | Limited | Low | Small deployments, development |
| **Static CDN** | Medium | Excellent | High | Medium | Production, global users |
| **Containerized** | High | Good | High | Medium | Microservices, K8s-native |
| **Hybrid** | High | Excellent | Very High | High | Enterprise, high availability |

## 🎯 Choosing the Right Strategy

### Combined Deployment ✅
- **When to use**: Development, small teams, simple deployments
- **Best for**: Quick setup, minimal complexity
- **Avoid when**: High traffic, global users, strict performance requirements

### Static Hosting ✅
- **When to use**: Production environments, global user base
- **Best for**: Performance, CDN caching, cost efficiency
- **Avoid when**: Frequent updates, complex build pipelines

### Containerized Frontend ✅
- **When to use**: Kubernetes-native architecture, microservices
- **Best for**: Team separation, independent scaling, GitOps workflows
- **Avoid when**: Simple setups, limited K8s expertise

### Hybrid Approach ✅
- **When to use**: Enterprise deployments, maximum availability
- **Best for**: Global scale, zero downtime, complex requirements
- **Avoid when**: Budget constraints, simple use cases

---

Choose the deployment method that best fits your environment, security requirements, and operational capabilities.