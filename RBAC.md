# Role-Based Access Control (RBAC)

Kubamf implements comprehensive Role-Based Access Control to secure API endpoints and control user permissions for Kubernetes operations.

## Overview

The RBAC system provides:
- **8 Default Roles** with predefined permission sets
- **Granular Permissions** for specific Kubernetes operations
- **Dynamic Configuration** via ConfigMaps in Kubernetes
- **Integration** with authentication providers (Basic Auth, OIDC)

## Default Roles

### 1. **admin** - Full System Administrator
- Complete access to all resources and operations
- Can manage users, roles, and system configuration
- Includes all Kubernetes operations without restrictions

### 2. **operator** - Cluster Operator
- Full Kubernetes cluster management
- Can view, create, update, and delete all resources
- Cannot modify RBAC or authentication settings

### 3. **developer** - Application Developer
- Manage application workloads (Pods, Deployments, Services)
- View and edit ConfigMaps and Secrets
- Scale applications and view logs
- Cannot modify cluster-level resources

### 4. **deployer** - Deployment Manager
- Deploy and update applications
- Manage Deployments, StatefulSets, DaemonSets
- View but not modify Secrets
- Cannot delete critical resources

### 5. **viewer** - Read-Only Access
- View all Kubernetes resources
- Access logs and events
- Cannot make any modifications
- Ideal for monitoring and troubleshooting

### 6. **namespace-admin** - Namespace Administrator
- Full control within assigned namespaces
- Cannot access cluster-scoped resources
- Manage all resources within namespace boundaries

### 7. **namespace-developer** - Namespace Developer
- Developer permissions limited to specific namespaces
- Deploy and manage applications within namespace
- Cannot modify namespace itself

### 8. **restricted** - Minimal Access
- View basic cluster information
- List namespaces and contexts
- Cannot view sensitive resources (Secrets, ConfigMaps)

## Permission Model

### Permission Structure

```javascript
{
  "role": "developer",
  "permissions": [
    "pod:*",           // All Pod operations
    "deployment:get",  // View Deployments
    "deployment:list", // List Deployments
    "deployment:update", // Update Deployments
    "service:*",       // All Service operations
    "configmap:get",   // View ConfigMaps
    "configmap:list",  // List ConfigMaps
    "secret:list",     // List Secrets (names only)
    "logs:get"         // View Pod logs
  ]
}
```

### Permission Format

Permissions follow the pattern: `resource:action`

**Resources:**
- `pod`, `deployment`, `statefulset`, `daemonset`, `replicaset`
- `service`, `ingress`, `networkpolicy`
- `configmap`, `secret`, `persistentvolumeclaim`
- `namespace`, `node`, `event`
- `cronjob`, `job`, `horizontalpodautoscaler`
- `customresourcedefinition`, `customresource`

**Actions:**
- `get` - View individual resource
- `list` - List resources
- `create` - Create new resource
- `update` - Modify existing resource
- `patch` - Partial update
- `delete` - Remove resource
- `exec` - Execute commands (Pods only)
- `portforward` - Port forwarding (Pods only)
- `*` - All actions

## Endpoint Permissions

### Core API Endpoints

| Endpoint | Method | Required Permission | Description |
|----------|--------|-------------------|-------------|
| `/api/kubeconfig/contexts` | GET | `context:list` | List available contexts |
| `/api/kubeconfig/switch` | POST | `context:switch` | Switch Kubernetes context |
| `/api/namespaces` | GET | `namespace:list` | List all namespaces |
| `/api/resources` | GET | `{resource}:list` | List resources by type |
| `/api/yaml` | GET | `{resource}:get` | Get resource YAML |
| `/api/yaml` | PUT | `{resource}:update` | Update resource |
| `/api/logs/:namespace/:pod` | GET | `logs:get` | Get pod logs |
| `/api/exec/:namespace/:pod` | POST | `pod:exec` | Execute in pod |
| `/api/delete` | DELETE | `{resource}:delete` | Delete resources |
| `/api/scale` | POST | `{resource}:update` | Scale deployments |
| `/api/restart` | POST | `{resource}:update` | Rolling restart |
| `/api/remove-finalizers` | POST | `{resource}:patch` | Remove finalizers |

### Streaming Endpoints

| Endpoint | Method | Required Permission | Description |
|----------|--------|-------------------|-------------|
| `/api/stream/pods` | GET (SSE) | `pod:list` | Stream pod updates |
| `/api/stream/deployments` | GET (SSE) | `deployment:list` | Stream deployments |
| `/api/stream/events` | GET (SSE) | `event:list` | Stream cluster events |
| `/api/stream/logs` | GET (SSE) | `logs:get` | Stream pod logs |

### System Endpoints

| Endpoint | Method | Required Permission | Description |
|----------|--------|-------------------|-------------|
| `/api/metrics` | GET | `metrics:get` | Cluster metrics |
| `/api/health` | GET | None | Health check |
| `/api/health/ready` | GET | None | Readiness check |
| `/api/health/live` | GET | None | Liveness check |

## Configuration

### Environment Variables

```bash
# Enable RBAC
RBAC_ENABLED=true

# Set default role for new users
RBAC_DEFAULT_ROLE=viewer

# ConfigMap for dynamic configuration
RBAC_CONFIG_MAP=kubamf-rbac
RBAC_CONFIG_NAMESPACE=kubamf
```

### ConfigMap Configuration

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: kubamf-rbac
  namespace: kubamf
data:
  rbac.yaml: |
    enabled: true
    defaultRole: viewer

    roles:
      custom-role:
        description: "Custom role for specific needs"
        permissions:
          - "pod:get"
          - "pod:list"
          - "deployment:get"
          - "deployment:list"
          - "service:*"

    userRoles:
      - username: "john.doe@company.com"
        roles: ["developer", "custom-role"]
      - username: "admin@company.com"
        roles: ["admin"]
```

### Helm Values

```yaml
# values.yaml
rbac:
  enabled: true
  defaultRole: viewer

  # Create custom roles
  customRoles:
    - name: monitoring
      permissions:
        - "pod:list"
        - "pod:get"
        - "logs:get"
        - "metrics:get"
        - "event:list"

    - name: ci-cd
      permissions:
        - "deployment:*"
        - "service:*"
        - "configmap:*"
        - "secret:list"

  # Assign roles to users
  userRoleBindings:
    - user: "ci-bot@company.com"
      roles: ["ci-cd"]
    - user: "sre-team@company.com"
      roles: ["operator"]
```

## Integration with Authentication

### Basic Authentication

```yaml
auth:
  provider: "basic"
  basic:
    users:
      - username: "admin"
        password: "$2b$12$..."
        roles: ["admin"]  # RBAC roles assigned here

      - username: "developer"
        password: "$2b$12$..."
        roles: ["developer", "viewer"]
```

### OIDC Authentication

```yaml
auth:
  provider: "oidc"
  oidc:
    # Map OIDC groups to RBAC roles
    groupRoleMapping:
      "admins": ["admin"]
      "developers": ["developer"]
      "sre": ["operator"]
      "contractors": ["viewer"]

    # Claim containing user roles
    roleClaim: "roles"
    groupClaim: "groups"
```

## Dynamic Role Loading

The RBAC system can dynamically load configuration from:

1. **Kubernetes ConfigMap** (when deployed in-cluster)
2. **Local configuration file** (`kubamf.yaml`)
3. **Environment variables**
4. **Default built-in roles**

Priority order: ConfigMap > Config File > Environment > Defaults

## Examples

### Creating a Custom Role

```yaml
# custom-rbac.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: kubamf-rbac
  namespace: kubamf
data:
  rbac.yaml: |
    roles:
      log-viewer:
        description: "Can only view logs"
        permissions:
          - "pod:list"
          - "pod:get"
          - "logs:get"

      secret-manager:
        description: "Manage secrets and configmaps"
        permissions:
          - "secret:*"
          - "configmap:*"
```

### Assigning Multiple Roles

```yaml
userRoles:
  - username: "jane.doe@company.com"
    roles:
      - "developer"      # Base developer permissions
      - "secret-manager" # Additional secret management
      - "log-viewer"     # Explicit log access
```

### Namespace-Scoped Permissions

```yaml
roles:
  production-deployer:
    description: "Deploy to production namespace only"
    permissions:
      - "deployment:*"
      - "service:*"
    namespaces: ["production"]  # Limit to specific namespaces
```

## Security Best Practices

1. **Principle of Least Privilege**
   - Assign minimum required permissions
   - Use viewer role as default
   - Grant elevated permissions temporarily

2. **Regular Audits**
   - Review user role assignments
   - Check for unused custom roles
   - Monitor permission usage

3. **Separation of Duties**
   - Separate deployment from configuration
   - Different roles for different environments
   - Limit admin role usage

4. **Integration with Enterprise IAM**
   - Use OIDC for enterprise SSO
   - Map enterprise groups to RBAC roles
   - Centralize user management

## Troubleshooting

### Check Current User Permissions

```bash
# Get current user info and roles
curl http://localhost:3001/api/auth/user

# Response
{
  "username": "john.doe",
  "roles": ["developer", "viewer"],
  "permissions": [
    "pod:*",
    "deployment:get",
    "deployment:list",
    "deployment:update"
  ]
}
```

### Permission Denied Errors

```json
{
  "error": "Permission denied",
  "required": "pod:delete",
  "userPermissions": ["pod:get", "pod:list"],
  "message": "User lacks required permission: pod:delete"
}
```

### Verify RBAC Configuration

```bash
# Check if RBAC is enabled
curl http://localhost:3001/api/rbac/status

# List available roles
curl http://localhost:3001/api/rbac/roles

# Check specific role permissions
curl http://localhost:3001/api/rbac/roles/developer
```

### Debug Mode

Enable debug logging for RBAC:

```bash
DEBUG=kubamf:rbac npm start
LOG_LEVEL=debug npm start
```

## Migration Guide

### Enabling RBAC in Existing Deployment

1. **Start with permissive settings:**
   ```yaml
   rbac:
     enabled: true
     defaultRole: operator  # Start permissive
   ```

2. **Map existing users to roles:**
   ```yaml
   userRoles:
     - username: "existing-admin@company.com"
       roles: ["admin"]
   ```

3. **Gradually restrict permissions:**
   - Monitor usage patterns
   - Identify required permissions
   - Create custom roles as needed
   - Switch default role to viewer

### Migrating from File-Based to ConfigMap

```bash
# Create ConfigMap from existing file
kubectl create configmap kubamf-rbac \
  --from-file=rbac.yaml=./kubamf-rbac.yaml \
  --namespace kubamf

# Update deployment to use ConfigMap
kubectl set env deployment/kubamf \
  RBAC_CONFIG_MAP=kubamf-rbac \
  RBAC_CONFIG_NAMESPACE=kubamf
```

## API Reference

### RBAC Management Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/rbac/status` | GET | RBAC system status |
| `/api/rbac/roles` | GET | List all available roles |
| `/api/rbac/roles/:role` | GET | Get specific role details |
| `/api/rbac/permissions` | GET | List all permissions |
| `/api/rbac/user/:username` | GET | Get user's roles and permissions |
| `/api/rbac/check` | POST | Check if user has permission |

### Permission Check Request

```bash
POST /api/rbac/check
Content-Type: application/json

{
  "username": "john.doe",
  "permission": "pod:delete",
  "namespace": "production"
}

# Response
{
  "allowed": false,
  "reason": "User lacks permission: pod:delete",
  "userRoles": ["developer"],
  "requiredPermission": "pod:delete"
}
```

This RBAC system provides enterprise-grade access control while maintaining flexibility for custom requirements and easy integration with existing authentication systems.