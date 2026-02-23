# Desktop App Compatibility

Kubamf is designed to work seamlessly both as a web application with full authentication and RBAC, and as a desktop application with simplified access controls.

## Default Desktop Configuration

When running as a desktop app (default configuration):

- **Authentication**: Disabled (`auth.provider: 'none'`)
- **RBAC**: Disabled (`rbac.enabled: false`)
- **Multi-cluster**: Disabled (`multiCluster.enabled: false`)

## Desktop Mode Behavior

### Authentication
- No login required
- All API requests pass through without authentication
- `req.user` is set to `null`
- `req.authenticated` is set to `false`

### RBAC
- Mock RBAC functions are provided that allow all operations
- All permission checks return `true`
- User is treated as having admin privileges
- No actual permission validation occurs

### Multi-cluster
- Multi-cluster API endpoints return appropriate "disabled" responses
- `/api/clusters` returns an empty array
- Individual cluster endpoints return 404 with "not enabled" message

## Configuration for Web Mode

To enable full authentication and RBAC for web deployment:

```yaml
# kubamf.yaml or environment variables
auth:
  provider: 'basic'  # or 'oidc'
  basic:
    enabled: true
    users:
      - username: 'admin'
        password: '$2b$12$...'  # bcrypt hash
        roles: ['admin']

rbac:
  enabled: true

multiCluster:
  enabled: true  # if needed
```

## Environment Variables

For quick configuration:

```bash
# Enable authentication
AUTH_PROVIDER=basic
AUTH_BASIC_ENABLED=true

# Or for OIDC
AUTH_PROVIDER=oidc
AUTH_OIDC_ENABLED=true
AUTH_OIDC_ISSUER=https://your-provider.com
AUTH_OIDC_CLIENT_ID=your-client-id

# Enable RBAC when auth is enabled
# (automatically enabled when authentication is configured)
```

## Graceful Degradation

The application handles missing or disabled features gracefully:

1. **Authentication disabled**: All requests pass through
2. **RBAC disabled**: Mock functions allow all operations
3. **Multi-cluster disabled**: Endpoints return appropriate empty/disabled responses
4. **Kubernetes unavailable**: Falls back to local kubeconfig only

## Security Considerations

### Desktop Mode
- Assumes trusted local environment
- No network-based access controls
- Relies on OS-level security
- Full access to local kubeconfig

### Web Mode
- Requires proper authentication configuration
- Enforces RBAC permissions
- Supports multi-tenant scenarios
- Can restrict access to specific clusters/namespaces

## Migration Path

To migrate from desktop to web deployment:

1. Configure authentication provider
2. Set up RBAC roles and bindings
3. Configure multi-cluster access if needed
4. Test with restricted user accounts
5. Deploy with appropriate Kubernetes RBAC

The application will automatically detect and use the enhanced security features without breaking existing desktop installations.