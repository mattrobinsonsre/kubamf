# Helm Deployment Guide

Deploy Kubamf to Kubernetes using Helm with comprehensive configuration options, security features, and high availability.

## Quick Start

```bash
# Add the Helm chart (if published to a registry)
helm repo add kubamf https://your-helm-repo.com/
helm repo update

# Or install from local chart
helm install kubamf ./charts/kubamf

# Install with custom values
helm install kubamf ./charts/kubamf -f my-values.yaml
```

## Chart Configuration

### Basic Deployment

**Minimal configuration (development):**
```yaml
# values-dev.yaml
backend:
  replicaCount: 1

  env:
    NODE_ENV: development

service:
  type: NodePort

ingress:
  enabled: false

kubeconfig:
  create: true
  content: |
    # Your base64-encoded kubeconfig here
```

**Production configuration:**
```yaml
# values-prod.yaml
backend:
  replicaCount: 3

  env:
    NODE_ENV: production
    security:
      corsEnabled: true
      corsOrigins: "https://kubamf.yourcompany.com"
      tlsEnabled: true
      helmetEnabled: true
      rateLimitEnabled: true
      apiKeyEnabled: true
      apiKey: "your-super-secret-api-key-min-32-chars"

  resources:
    limits:
      cpu: 1000m
      memory: 1Gi
    requests:
      cpu: 200m
      memory: 256Mi

service:
  type: ClusterIP

ingress:
  enabled: true
  className: nginx
  annotations:
    kubernetes.io/tls-acme: "true"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
  hosts:
    - host: kubamf.yourcompany.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: kubamf-tls
      hosts:
        - kubamf.yourcompany.com

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70

podDisruptionBudget:
  enabled: true
  minAvailable: 2
```

### High Availability Setup

**Multi-zone deployment with anti-affinity:**
```yaml
# values-ha.yaml
backend:
  replicaCount: 4

  # Anti-affinity to spread pods across nodes
  affinity:
    podAntiAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        - labelSelector:
            matchLabels:
              app.kubernetes.io/name: kubamf
              app.kubernetes.io/component: backend
          topologyKey: kubernetes.io/hostname
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100
          podAffinityTerm:
            labelSelector:
              matchLabels:
                app.kubernetes.io/name: kubamf
                app.kubernetes.io/component: backend
            topologyKey: topology.kubernetes.io/zone

  # Topology spread constraints for even distribution
  topologySpreadConstraints:
    - maxSkew: 1
      topologyKey: topology.kubernetes.io/zone
      whenUnsatisfiable: DoNotSchedule
      labelSelector:
        matchLabels:
          app.kubernetes.io/name: kubamf
          app.kubernetes.io/component: backend

podDisruptionBudget:
  enabled: true
  minAvailable: 2

autoscaling:
  enabled: true
  minReplicas: 4
  maxReplicas: 12
```

### Security Configuration

**Enhanced security setup:**
```yaml
# values-security.yaml
backend:
  env:
    security:
      # CORS
      corsEnabled: true
      corsOrigins: "https://kubamf.company.com,https://kubamf-staging.company.com"
      corsCredentials: false

      # TLS
      tlsEnabled: true
      trustProxy: true

      # Security headers
      helmetEnabled: true
      cspEnabled: true
      hstsEnabled: true
      hstsMaxAge: "31536000"
      hstsIncludeSubdomains: true
      hstsPreload: true

      # Rate limiting
      rateLimitEnabled: true
      rateLimitWindowMs: "900000"  # 15 minutes
      rateLimitMax: "200"          # 200 requests per window
      slowDownEnabled: true
      slowDownDelayAfter: "100"
      slowDownDelayMs: "1000"

      # API authentication
      apiKeyEnabled: true
      apiKey: "your-generated-api-key-at-least-32-characters-long"

  # Security context
  securityContext:
    runAsNonRoot: true
    runAsUser: 1001
    runAsGroup: 1001
    capabilities:
      drop:
        - ALL
    readOnlyRootFilesystem: false
    allowPrivilegeEscalation: false

  podSecurityContext:
    runAsNonRoot: true
    runAsUser: 1001
    runAsGroup: 1001
    fsGroup: 1001

# RBAC
rbac:
  create: true

# Network policy
networkPolicy:
  enabled: true
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
      ports:
        - protocol: TCP
          port: 3001
```

### Configuration Management

**Using ConfigMap for configuration:**
```yaml
# values-configmap.yaml
backend:
  env:
    # Minimal env vars, detailed config in ConfigMap
    NODE_ENV: production
    CONFIG_FILE: /app/config/kubamf.yaml

# The chart automatically creates a ConfigMap with detailed configuration
# You can customize the generated config by modifying backend.env.* values
```

**Using external Secret for API key:**
```yaml
# Create secret separately
apiVersion: v1
kind: Secret
metadata:
  name: kubamf-api-secret
  namespace: kubamf
type: Opaque
data:
  api-key: eW91ci1zdXBlci1zZWNyZXQtYXBpLWtleS1taW4tMzItY2hhcnM=

---
# values-external-secret.yaml
backend:
  env:
    security:
      apiKeyEnabled: true
      # Don't set apiKey here, reference external secret instead

# Override the secret reference
extraEnvFrom:
  - secretRef:
      name: kubamf-api-secret
```

## Deployment Scenarios

### 1. Development Environment

```bash
# Install for development
helm install kubamf-dev ./charts/kubamf \
  --namespace kubamf-dev \
  --create-namespace \
  --set backend.replicaCount=1 \
  --set backend.env.NODE_ENV=development \
  --set service.type=NodePort \
  --set ingress.enabled=false
```

### 2. Staging Environment

```bash
# Install for staging
helm install kubamf-staging ./charts/kubamf \
  --namespace kubamf-staging \
  --create-namespace \
  --values values-staging.yaml
```

### 3. Production Environment

```bash
# Install for production
helm install kubamf ./charts/kubamf \
  --namespace kubamf \
  --create-namespace \
  --values values-prod.yaml \
  --wait \
  --timeout 10m
```

### 4. Upgrade Deployment

```bash
# Zero-downtime upgrade
helm upgrade kubamf ./charts/kubamf \
  --namespace kubamf \
  --values values-prod.yaml \
  --wait \
  --timeout 10m

# Rollback if needed
helm rollback kubamf 1 --namespace kubamf
```

## Configuration Options

### Backend Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `backend.replicaCount` | Number of backend replicas | `2` |
| `backend.env.NODE_ENV` | Node environment | `production` |
| `backend.env.PORT` | Server port | `3001` |
| `backend.env.security.corsEnabled` | Enable CORS | `false` |
| `backend.env.security.tlsEnabled` | Enforce HTTPS | `false` |
| `backend.env.security.helmetEnabled` | Security headers | `false` |
| `backend.env.security.rateLimitEnabled` | Rate limiting | `false` |
| `backend.env.security.apiKeyEnabled` | API key auth | `false` |

### Service Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `service.type` | Kubernetes service type | `ClusterIP` |
| `service.port` | Service port | `80` |
| `service.targetPort` | Container port | `3001` |

### Ingress Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `ingress.enabled` | Enable ingress | `false` |
| `ingress.className` | Ingress class | `""` |
| `ingress.hosts` | Ingress hosts | `[]` |
| `ingress.tls` | TLS configuration | `[]` |

### Autoscaling Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `autoscaling.enabled` | Enable HPA | `false` |
| `autoscaling.minReplicas` | Min replicas | `2` |
| `autoscaling.maxReplicas` | Max replicas | `10` |
| `autoscaling.targetCPUUtilizationPercentage` | CPU target | `80` |

### Pod Disruption Budget

| Parameter | Description | Default |
|-----------|-------------|---------|
| `podDisruptionBudget.enabled` | Enable PDB | `true` |
| `podDisruptionBudget.minAvailable` | Min available pods | `1` |

## Monitoring & Observability

### Health Checks

The chart configures comprehensive health checks:

```yaml
# Liveness probe
livenessProbe:
  enabled: true
  httpGet:
    path: /health/live
    port: http
  initialDelaySeconds: 30
  periodSeconds: 10

# Readiness probe
readinessProbe:
  enabled: true
  httpGet:
    path: /health/ready
    port: http
  initialDelaySeconds: 5
  periodSeconds: 5
```

### Prometheus Monitoring

```yaml
# values-monitoring.yaml
monitoring:
  serviceMonitor:
    enabled: true
    interval: 30s
    labels:
      release: prometheus

# Enable metrics endpoint in backend
backend:
  env:
    custom:
      METRICS_ENABLED: "true"
```

### Grafana Dashboard

```yaml
monitoring:
  grafanaDashboard:
    enabled: true
    labels:
      grafana_dashboard: "1"
```

## Troubleshooting

### Common Issues

**1. Pods not starting:**
```bash
# Check pod status
kubectl get pods -n kubamf

# Check pod logs
kubectl logs -n kubamf deployment/kubamf

# Check events
kubectl get events -n kubamf --sort-by='.lastTimestamp'
```

**2. Health check failures:**
```bash
# Test health endpoints
kubectl exec -n kubamf deployment/kubamf -- curl -f http://localhost:3001/health
kubectl exec -n kubamf deployment/kubamf -- curl -f http://localhost:3001/health/ready
```

**3. Configuration issues:**
```bash
# Check ConfigMap
kubectl get configmap -n kubamf kubamf-config -o yaml

# Check Secret (if using API key)
kubectl get secret -n kubamf kubamf-secret -o yaml
```

**4. Network connectivity:**
```bash
# Test service
kubectl get svc -n kubamf
kubectl port-forward -n kubamf svc/kubamf 8080:80

# Test ingress
kubectl get ingress -n kubamf
curl -I https://your-domain.com/health
```

### Debug Mode

Enable debug logging:
```yaml
backend:
  env:
    logging:
      level: "debug"
    custom:
      DEBUG: "kubamf:*"
```

### Configuration Validation

The backend validates configuration on startup:
```bash
# Check startup logs for validation errors
kubectl logs -n kubamf deployment/kubamf --since=5m | grep -E "(❌|⚠️|✅)"
```

## Security Best Practices

1. **Always enable security features in production:**
   ```yaml
   backend:
     env:
       security:
         corsEnabled: true
         tlsEnabled: true
         helmetEnabled: true
         rateLimitEnabled: true
         apiKeyEnabled: true
   ```

2. **Use secrets for sensitive data:**
   ```bash
   kubectl create secret generic kubamf-secrets \
     --from-literal=api-key="your-secret-key" \
     --namespace kubamf
   ```

3. **Configure proper RBAC:**
   ```yaml
   rbac:
     create: true
     additionalRules:
       - apiGroups: [""]
         resources: ["pods", "services"]
         verbs: ["get", "list"]
   ```

4. **Enable network policies:**
   ```yaml
   networkPolicy:
     enabled: true
   ```

5. **Use security contexts:**
   ```yaml
   backend:
     securityContext:
       runAsNonRoot: true
       readOnlyRootFilesystem: false
       allowPrivilegeEscalation: false
   ```

## Backup & Recovery

### Backup Configuration

```bash
# Backup Helm values
helm get values kubamf -n kubamf > kubamf-backup.yaml

# Backup kubeconfig secret
kubectl get secret kubamf-kubeconfig -n kubamf -o yaml > kubeconfig-backup.yaml
```

### Disaster Recovery

```bash
# Restore from backup
helm install kubamf ./charts/kubamf \
  --namespace kubamf \
  --create-namespace \
  --values kubamf-backup.yaml

# Restore kubeconfig
kubectl apply -f kubeconfig-backup.yaml -n kubamf
```