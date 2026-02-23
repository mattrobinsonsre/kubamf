# Security Configuration Guide

Kubamf includes comprehensive security features for web deployment. All security features are **disabled by default** but can be enabled via environment variables.

## 🔒 Backend Security Features

### CORS (Cross-Origin Resource Sharing)

**Status:** Disabled by default
**Recommended:** Enable in production

```bash
# Enable CORS
CORS_ENABLED=true

# Allowed origins (comma-separated)
CORS_ORIGINS=https://your-app.com,https://staging.your-app.com

# Allow credentials
CORS_CREDENTIALS=true

# Allowed HTTP methods
CORS_METHODS=GET,POST,PUT,DELETE,OPTIONS

# Allowed headers
CORS_ALLOWED_HEADERS=Origin,X-Requested-With,Content-Type,Accept,Authorization,X-API-Key
```

### TLS/HTTPS Enforcement

**Status:** Disabled by default
**Recommended:** Enable in production

```bash
# Enforce HTTPS
TLS_ENABLED=true

# Trust proxy headers (for load balancers)
TRUST_PROXY=true
```

### Security Headers (Helmet.js)

**Status:** Disabled by default
**Recommended:** Enable in production

```bash
# Enable security headers
HELMET_ENABLED=true

# Content Security Policy
CSP_ENABLED=true

# HTTP Strict Transport Security
HSTS_ENABLED=true
HSTS_MAX_AGE=31536000
HSTS_INCLUDE_SUBDOMAINS=true
HSTS_PRELOAD=true
```

### Rate Limiting

**Status:** Disabled by default
**Recommended:** Enable in production

```bash
# Enable rate limiting
RATE_LIMIT_ENABLED=true

# Window in milliseconds (15 minutes)
RATE_LIMIT_WINDOW_MS=900000

# Max requests per window
RATE_LIMIT_MAX=100

# Slow down configuration
SLOW_DOWN_ENABLED=true
SLOW_DOWN_WINDOW_MS=900000
SLOW_DOWN_DELAY_AFTER=50
SLOW_DOWN_DELAY_MS=500
```

### API Key Authentication

**Status:** Disabled by default
**Use case:** API access control

```bash
# Enable API key authentication
API_KEY_ENABLED=true

# Set a strong API key (min 32 characters)
API_KEY=your-super-secret-api-key-here-min-32-chars

# Custom header name (optional)
API_KEY_HEADER=X-API-Key
```

### Request Size Limits

```bash
# JSON payload limit
JSON_LIMIT=1mb

# URL encoded payload limit
URL_ENCODED_LIMIT=1mb
```

### Logging

**Status:** Enabled by default

```bash
# Disable logging
LOGGING_ENABLED=false

# Log format (combined, common, dev, short, tiny)
LOG_FORMAT=combined
```

## 🌐 Frontend Security Features

### Content Security Policy

Configure via nginx environment variables:

```bash
# Enable CSP
CSP_ENABLED=true

# Frame options
FRAME_OPTIONS=SAMEORIGIN

# HSTS for frontend
HSTS_ENABLED=true
```

### Rate Limiting (Nginx)

```bash
# API rate limit (requests per second)
RATE_LIMIT_PER_SECOND=10r/s

# Static files rate limit
STATIC_RATE_LIMIT_PER_SECOND=50r/s
```

### Proxy Timeouts

```bash
# Connection timeout
PROXY_CONNECT_TIMEOUT=30s

# Send timeout
PROXY_SEND_TIMEOUT=30s

# Read timeout
PROXY_READ_TIMEOUT=30s
```

## 🏥 Health Check Endpoints

### Backend Health Checks

All health endpoints require no authentication:

#### Basic Health Check
```bash
GET /health
```

**Response (Healthy):**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "age": 5,
  "stale": false,
  "issues": [],
  "summary": {
    "clusters": 2,
    "totalClusters": 3,
    "uptime": 3600
  }
}
```

**Response (Degraded):**
```json
{
  "status": "degraded",
  "timestamp": "2024-01-15T10:30:00Z",
  "issues": ["1 clusters unreachable"],
  "summary": {
    "clusters": 2,
    "totalClusters": 3,
    "uptime": 3600
  }
}
```

#### Detailed Health Check
```bash
GET /health/detailed
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "responseTime": 250,
  "issues": [],
  "components": {
    "application": {
      "status": "healthy",
      "uptime": 3600,
      "memory": {
        "used": 45,
        "total": 60,
        "limit": 128
      },
      "system": {
        "platform": "linux",
        "arch": "x64",
        "nodeVersion": "v18.17.0",
        "pid": 1
      }
    },
    "kubectl": {
      "available": true,
      "version": "Client Version: v1.28.2",
      "error": null
    },
    "kubeconfig": {
      "valid": true,
      "path": "/home/kubamf/.kube/config",
      "size": 2048,
      "modified": "2024-01-15T09:00:00Z",
      "error": null
    },
    "clusters": {
      "available": true,
      "total": 3,
      "reachable": 2,
      "unreachable": 1,
      "clusters": [
        {
          "reachable": true,
          "context": "production",
          "responseTime": 120,
          "info": "Kubernetes control plane is running",
          "error": null
        },
        {
          "reachable": false,
          "context": "staging",
          "responseTime": 10000,
          "error": "Health check timeout",
          "info": null
        }
      ]
    }
  }
}
```

#### Readiness Probe
```bash
GET /health/ready
```

**Response (Ready):**
```json
{
  "ready": true,
  "timestamp": "2024-01-15T10:30:00Z",
  "checks": {
    "kubectl": true,
    "kubeconfig": true
  }
}
```

#### Liveness Probe
```bash
GET /health/live
```

**Response (Alive):**
```json
{
  "alive": true,
  "uptime": 3600,
  "memory": 45,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Frontend Health Checks

#### Basic Health Check
```bash
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "frontend",
  "timestamp": "2024-01-15T10:30:00Z",
  "server": "kubamf-frontend"
}
```

#### Readiness Check
```bash
GET /health/ready
```

**Response:**
```json
{
  "ready": true,
  "service": "frontend",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## 🚀 Production Deployment Examples

### Minimal Security (Development)

```bash
# docker-compose.yml
version: '3.8'
services:
  kubamf-api:
    build:
      dockerfile: Dockerfile.api
    environment:
      - NODE_ENV=production
      - LOGGING_ENABLED=true
    ports:
      - "3001:3001"
```

### High Security (Production)

```bash
# docker-compose.yml
version: '3.8'
services:
  kubamf-api:
    build:
      dockerfile: Dockerfile.api
    environment:
      # Security
      - NODE_ENV=production
      - TLS_ENABLED=true
      - TRUST_PROXY=true
      - HELMET_ENABLED=true
      - CSP_ENABLED=true
      - HSTS_ENABLED=true
      - CORS_ENABLED=true
      - CORS_ORIGINS=https://your-app.com
      - RATE_LIMIT_ENABLED=true
      - API_KEY_ENABLED=true
      - API_KEY=your-super-secret-api-key-min-32-chars
      # Health checks
      - HEALTH_CHECK_ENABLED=true
      - HEALTH_CHECK_INTERVAL=30000
    ports:
      - "3001:3001"
    volumes:
      - ~/.kube:/home/kubamf/.kube:ro

  kubamf-frontend:
    build:
      dockerfile: Dockerfile.frontend
    environment:
      - API_HOST=https://api.your-app.com
      - CSP_ENABLED=true
      - HSTS_ENABLED=true
      - RATE_LIMIT_PER_SECOND=10r/s
    ports:
      - "443:80"
    depends_on:
      - kubamf-api
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kubamf-api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: kubamf-api
  template:
    metadata:
      labels:
        app: kubamf-api
    spec:
      containers:
      - name: api
        image: kubamf-api:latest
        ports:
        - containerPort: 3001
        env:
        - name: NODE_ENV
          value: "production"
        - name: TLS_ENABLED
          value: "true"
        - name: HELMET_ENABLED
          value: "true"
        - name: CORS_ENABLED
          value: "true"
        - name: CORS_ORIGINS
          value: "https://your-app.com"
        - name: RATE_LIMIT_ENABLED
          value: "true"
        - name: API_KEY_ENABLED
          value: "true"
        - name: API_KEY
          valueFrom:
            secretKeyRef:
              name: kubamf-secrets
              key: api-key
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3001
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3001
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

## 🛡️ Security Best Practices

### 1. API Key Management

```bash
# Generate a strong API key
openssl rand -hex 32

# Store in environment variable or secret management
export API_KEY="64-character-hex-string-here"
```

### 2. TLS Certificate Setup

```bash
# Use Let's Encrypt for free TLS certificates
certbot --nginx -d your-app.com

# Or configure with your certificate
ssl_certificate /path/to/cert.pem;
ssl_certificate_key /path/to/private.key;
```

### 3. Firewall Configuration

```bash
# Allow only necessary ports
ufw allow 80/tcp
ufw allow 443/tcp
ufw deny 3001/tcp  # Block direct API access
```

### 4. Monitoring & Alerting

```bash
# Monitor health endpoints
curl -f http://localhost:3001/health || alert

# Monitor security headers
curl -I https://your-app.com | grep -i security

# Monitor rate limiting
tail -f /var/log/nginx/access.log | grep "limiting requests"
```

### 5. Security Scanning

```bash
# Scan for vulnerabilities
npm audit

# Scan Docker images
docker scan kubamf-api:latest

# Test security headers
curl -I https://your-app.com
```

## 🔍 Security Debugging

### Check Security Configuration

```bash
# View current security settings (dev/staging only)
curl http://localhost:3001/security-info
```

**Response:**
```json
{
  "cors": {
    "enabled": true,
    "origins": ["https://your-app.com"]
  },
  "rateLimit": {
    "enabled": true,
    "max": 100
  },
  "helmet": {
    "enabled": true
  },
  "tls": {
    "enabled": true
  },
  "apiKey": {
    "enabled": true
  }
}
```

### Validate Health Checks

```bash
# Test all health endpoints
curl -f http://localhost:3001/health
curl -f http://localhost:3001/health/detailed
curl -f http://localhost:3001/health/ready
curl -f http://localhost:3001/health/live

# Test frontend health
curl -f http://localhost/health
curl -f http://localhost/health/ready
```

### Test Security Headers

```bash
# Check security headers
curl -I https://your-app.com

# Expected headers:
# X-Frame-Options: SAMEORIGIN
# X-Content-Type-Options: nosniff
# X-XSS-Protection: 1; mode=block
# Strict-Transport-Security: max-age=31536000; includeSubDomains
# Content-Security-Policy: default-src 'self'...
```

### Test Rate Limiting

```bash
# Test API rate limiting
for i in {1..105}; do
  curl -w "%{http_code}\n" -o /dev/null -s http://localhost:3001/api/kubeconfig/contexts
done
# Should return 429 after 100 requests

# Test with API key
curl -H "X-API-Key: your-api-key" http://localhost:3001/api/kubeconfig/contexts
```

## 🚨 Security Checklist

### Pre-deployment
- [ ] Generate strong API keys (32+ characters)
- [ ] Configure TLS certificates
- [ ] Set up proper CORS origins
- [ ] Enable security headers
- [ ] Configure rate limiting
- [ ] Set up monitoring/alerting
- [ ] Review firewall rules

### Production
- [ ] Enable all security features
- [ ] Use HTTPS everywhere
- [ ] Monitor security logs
- [ ] Regular security updates
- [ ] Backup kubeconfig securely
- [ ] Implement log rotation
- [ ] Set up intrusion detection

### Ongoing
- [ ] Monitor health endpoints
- [ ] Review access logs
- [ ] Update dependencies
- [ ] Rotate API keys regularly
- [ ] Security vulnerability scans
- [ ] Performance monitoring
- [ ] Capacity planning