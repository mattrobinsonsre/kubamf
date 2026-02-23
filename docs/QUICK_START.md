# 🚀 Kubamf Quick Start Guide

Get up and running with Kubamf in just a few minutes using Helm and Kubernetes!

## ⚡ 30-Second Quick Start

```bash
# Install Kubamf with default settings
helm repo add kubamf https://charts.kubamf.io
helm repo update
helm install kubamf kubamf/kubamf

# Access the application
kubectl port-forward svc/kubamf 8080:80
# Visit: http://localhost:8080
```

⚠️ **Important**: This installs with no authentication. Change the default admin password before exposing to the internet!

### 🏢 Multi-Environment Quick Deploy

```bash
# Development environment
helm install kubamf-dev kubamf/kubamf \
  --namespace development --create-namespace \
  --set nameOverride="kubamf-dev" \
  --set resourceNamePrefix="dev"

# Production environment with custom naming
helm install kubamf-prod kubamf/kubamf \
  --namespace production --create-namespace \
  --set fullnameOverride="kubamf-primary" \
  --set resourceNamePrefix="prod" \
  --set backend.replicaCount=3
```

---

## 🎯 What You Get

- ✅ **Web-based kubectl interface** - No more terminal commands
- ✅ **Multi-cluster support** - Manage all your clusters from one place
- ✅ **Real-time resource monitoring** - See pod status, logs, and metrics
- ✅ **RBAC integration** - Secure access control with Kubernetes permissions
- ✅ **No local setup required** - Runs entirely in your cluster

---

## 🔐 Secure Setup (Production Ready)

### 1. Generate a Secure Password

```bash
# Generate a bcrypt hash for the admin password
node -e "console.log(require('bcrypt').hashSync('your-secure-password-here', 12))"
```

### 2. Install with Authentication

```bash
# Create values file
cat > values.yaml << EOF
auth:
  enabled: true
  provider: basic
  basic:
    enabled: true
    users:
      - username: 'admin'
        passwordHash: '$2b$12$YOUR_GENERATED_HASH_HERE'
        email: 'admin@company.com'
        roles: ['admin']
        enabled: true

ingress:
  enabled: true
  hosts:
    - host: kubamf.company.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: kubamf-tls
      hosts:
        - kubamf.company.com
EOF

# Install with authentication
helm install kubamf kubamf/kubamf -f values.yaml
```

### 3. Access Your Deployment

```bash
# Check installation status
kubectl get pods -l app.kubernetes.io/name=kubamf

# Get the service URL
kubectl get ingress kubamf
```

---

## 🌍 Expose Externally

### Option 1: Ingress (Recommended)
```bash
helm upgrade kubamf kubamf/kubamf \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=kubamf.your-domain.com \
  --set ingress.annotations."kubernetes\.io/ingress\.class"=nginx \
  --set ingress.annotations."cert-manager\.io/cluster-issuer"=letsencrypt-prod
```

### Option 2: LoadBalancer
```bash
helm upgrade kubamf kubamf/kubamf \
  --set service.type=LoadBalancer
```

### Option 3: NodePort (Development)
```bash
helm upgrade kubamf kubamf/kubamf \
  --set service.type=NodePort \
  --set service.nodePort=30080
```

---

## 🔑 Authentication Options

### Basic Authentication (Quick Start)
```yaml
auth:
  enabled: true
  provider: basic
  basic:
    enabled: true
    users:
      - username: 'admin'
        passwordHash: '$2b$12$...'  # Generate with bcrypt
        roles: ['admin']
```

### OIDC/SSO (Enterprise)
```yaml
auth:
  enabled: true
  provider: oidc
  oidc:
    enabled: true
    issuer: 'https://accounts.google.com'
    clientId: 'your-client-id'
    clientSecret: 'your-client-secret'
    redirectUri: 'https://kubamf.company.com/auth/oidc/callback'
```

---

## 🎛️ Common Configurations

### High Availability (Multi-AZ)
```bash
# Enable HA with pod distribution across availability zones
helm upgrade kubamf kubamf/kubamf \
  --set backend.replicaCount=3 \
  --set autoscaling.enabled=true \
  --set autoscaling.minReplicas=3 \
  --set autoscaling.maxReplicas=10

# The chart includes anti-affinity rules by default to:
# - Distribute pods across availability zones (topology.kubernetes.io/zone)
# - Spread pods across different nodes (kubernetes.io/hostname)
# - Use topology spread constraints for even distribution
```

### Resource Limits
```bash
helm upgrade kubamf kubamf/kubamf \
  --set backend.resources.limits.cpu=1000m \
  --set backend.resources.limits.memory=1Gi \
  --set backend.resources.requests.cpu=200m \
  --set backend.resources.requests.memory=256Mi
```

### Node Selection and Tolerations
```bash
# Deploy on specific node types
helm upgrade kubamf kubamf/kubamf \
  --set backend.nodeSelector."node\.kubernetes\.io/instance-type"=m5.large \
  --set backend.nodeSelector."environment"=production

# Allow deployment on spot instances (cost optimization)
helm upgrade kubamf kubamf/kubamf \
  --set backend.tolerations[0].key="node.kubernetes.io/spot" \
  --set backend.tolerations[0].operator="Exists" \
  --set backend.tolerations[0].effect="NoSchedule"
```

### Multi-Cluster Access
```yaml
rbac:
  crossCluster:
    enabled: true
    clusters:
      - name: production
        description: 'Production cluster'
        kubeconfig: |
          apiVersion: v1
          kind: Config
          # ... your kubeconfig content
```

---

## 🔍 Verification

After installation, verify everything is working:

```bash
# Check pod status
kubectl get pods -l app.kubernetes.io/name=kubamf

# Check service
kubectl get service kubamf

# Check ingress (if enabled)
kubectl get ingress kubamf

# View logs
kubectl logs -l app.kubernetes.io/name=kubamf -f

# Test API endpoint
kubectl port-forward svc/kubamf 8080:80
curl http://localhost:8080/health
```

---

## 🚨 Security Checklist

Before going to production:

- [ ] **Change default admin password** - Never use the default!
- [ ] **Enable HTTPS/TLS** - Set up proper certificates
- [ ] **Configure RBAC** - Set up proper user permissions
- [ ] **Enable network policies** - Restrict network access
- [ ] **Use OIDC authentication** - Integrate with your SSO provider
- [ ] **Regular updates** - Keep Kubamf updated
- [ ] **Monitor access logs** - Watch for suspicious activity

---

## 📚 Next Steps

- 📖 [Full Deployment Guide](./DEPLOYMENT.md) - Comprehensive deployment options
- 🔐 [Authentication Setup](./AUTHENTICATION.md) - Detailed auth configuration
- 🛡️ [RBAC Configuration](./RBAC.md) - Role-based access control
- 🌐 [Multi-Cluster Setup](./MULTI_CLUSTER.md) - Managing multiple clusters
- 🔧 [Configuration Reference](./CONFIGURATION.md) - All available options

---

## 💡 Need Help?

- 📋 **Issues**: [GitHub Issues](https://github.com/your-org/kubamf/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/your-org/kubamf/discussions)
- 📧 **Support**: support@kubamf.io

---

**🎉 You're all set! Welcome to Kubamf - the modern way to manage Kubernetes!**