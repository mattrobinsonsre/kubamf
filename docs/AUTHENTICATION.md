# Authentication Guide

Kubamf supports multiple authentication mechanisms to suit different deployment scenarios and security requirements. Authentication is **disabled by default** but can be easily configured for production deployments.

## Overview

### Supported Authentication Methods

1. **No Authentication** (default) - Suitable for development and trusted environments
2. **Basic Authentication** - Username/password authentication with bcrypt hashing
3. **OIDC (OpenID Connect)** - Integration with enterprise identity providers

### Authentication Flow

- **Electron App**: No authentication required (uses IPC, no network exposure)
- **Web App**: Configurable authentication with session management

## Configuration

Authentication is configured in your `kubamf.yaml` file or via environment variables.

### Basic Configuration Structure

```yaml
auth:
  provider: "none"  # "none", "basic", or "oidc"

  # No Authentication
  none:
    enabled: true

  # Basic Authentication
  basic:
    enabled: false
    realm: "Kubamf"
    secure: true
    users: []

  # OIDC Authentication
  oidc:
    enabled: false
    issuer: ""
    clientId: ""
    clientSecret: ""
    redirectUri: ""
    # ... additional OIDC settings
```

## 1. No Authentication (Default)

Perfect for development environments and trusted internal networks.

### Configuration

```yaml
auth:
  provider: "none"
  none:
    enabled: true
```

### Environment Variables

```bash
AUTH_PROVIDER=none
```

### Security Considerations

- ⚠️ **Only use in trusted environments**
- ⚠️ **Not recommended for production**
- ✅ **Perfect for development**
- ✅ **Suitable for internal corporate networks with network-level security**

---

## 2. Basic Authentication

Username and password authentication with secure bcrypt password hashing.

### Configuration

```yaml
auth:
  provider: "basic"
  basic:
    enabled: true
    realm: "Kubamf"
    secure: true  # Use bcrypt hashed passwords
    users:
      - username: "admin"
        password: "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewqB.cJ3qm8bFrK."
        email: "admin@company.com"
        name: "Administrator"
        groups: ["admins", "developers"]
        roles: ["admin"]
        enabled: true

      - username: "viewer"
        password: "$2b$12$N4rKpE7PXmsJ6DKYgr4B8e4KN9LuS.8BgVyJaJvJ1n3FV5rBm9vE."
        email: "viewer@company.com"
        name: "Read Only User"
        groups: ["viewers"]
        roles: ["viewer"]
        enabled: true
```

### Environment Variables

```bash
AUTH_PROVIDER=basic
AUTH_BASIC_ENABLED=true
AUTH_BASIC_REALM="Kubamf"
AUTH_BASIC_SECURE=true
```

### Creating Users

#### Method 1: Generate Password Hash

```bash
# Install bcrypt CLI tool
npm install -g bcrypt-cli

# Generate password hash
bcrypt-cli "your-password" 12

# Or use Node.js
node -e "console.log(require('bcrypt').hashSync('your-password', 12))"
```

#### Method 2: Using Kubamf Helper (if implemented)

```bash
# Generate user configuration
node -e "
const auth = require('./src/backend/auth/providers/basic');
console.log('Password hash:', await auth.hashPassword('your-password'));
console.log('Random password:', auth.generatePassword());
"
```

### User Configuration Fields

| Field | Required | Description |
|-------|----------|-------------|
| `username` | ✅ | Unique username for login |
| `password` | ✅ | bcrypt hash of password |
| `email` | ❌ | User's email address |
| `name` | ❌ | Display name |
| `groups` | ❌ | Array of group memberships |
| `roles` | ❌ | Array of role assignments |
| `enabled` | ❌ | Whether user can log in (default: true) |

### Security Best Practices

- ✅ **Always use bcrypt hashed passwords in production**
- ✅ **Use strong passwords (12+ characters, mixed case, numbers, symbols)**
- ✅ **Regularly rotate passwords**
- ✅ **Use HTTPS to protect credentials in transit**
- ⚠️ **Plain text passwords only for development**

---

## 3. OIDC Authentication

Enterprise-grade authentication using OpenID Connect providers.

### Basic OIDC Configuration

```yaml
auth:
  provider: "oidc"
  oidc:
    enabled: true
    issuer: "https://your-provider.com"
    clientId: "your-client-id"
    clientSecret: "your-client-secret"
    redirectUri: "https://kubamf.company.com/auth/oidc/callback"
    scope: "openid profile email groups"
    groupClaim: "groups"
    roleClaim: "roles"
    sessionSecret: "your-session-secret"
    sessionMaxAge: 86400000  # 24 hours
    secureCookies: true
    postLogoutRedirectUri: "https://kubamf.company.com"
```

### Environment Variables

```bash
AUTH_PROVIDER=oidc
AUTH_OIDC_ENABLED=true
AUTH_OIDC_ISSUER=https://your-provider.com
AUTH_OIDC_CLIENT_ID=your-client-id
AUTH_OIDC_CLIENT_SECRET=your-client-secret
AUTH_OIDC_REDIRECT_URI=https://kubamf.company.com/auth/oidc/callback
AUTH_OIDC_SCOPE="openid profile email groups"
AUTH_OIDC_SESSION_SECRET=your-session-secret
```

### Popular OIDC Providers

#### Google Workspace

```yaml
auth:
  provider: "oidc"
  oidc:
    enabled: true
    issuer: "https://accounts.google.com"
    clientId: "your-google-client-id.apps.googleusercontent.com"
    clientSecret: "your-google-client-secret"
    redirectUri: "https://kubamf.company.com/auth/oidc/callback"
    scope: "openid profile email"
    groupClaim: "hd"  # Google Workspace domain
```

**Setup Steps:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `https://your-domain.com/auth/oidc/callback`

#### Microsoft Azure AD

```yaml
auth:
  provider: "oidc"
  oidc:
    enabled: true
    issuer: "https://login.microsoftonline.com/your-tenant-id/v2.0"
    clientId: "your-azure-client-id"
    clientSecret: "your-azure-client-secret"
    redirectUri: "https://kubamf.company.com/auth/oidc/callback"
    scope: "openid profile email"
    groupClaim: "groups"
```

**Setup Steps:**
1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to Azure Active Directory > App registrations
3. Create new application registration
4. Add redirect URI: `https://your-domain.com/auth/oidc/callback`
5. Create client secret
6. Configure group claims in token configuration

#### Okta

```yaml
auth:
  provider: "oidc"
  oidc:
    enabled: true
    issuer: "https://your-org.okta.com/oauth2/default"
    clientId: "your-okta-client-id"
    clientSecret: "your-okta-client-secret"
    redirectUri: "https://kubamf.company.com/auth/oidc/callback"
    scope: "openid profile email groups"
    groupClaim: "groups"
```

**Setup Steps:**
1. Go to [Okta Developer Console](https://developer.okta.com/)
2. Create new application
3. Choose "Web Application"
4. Add redirect URI: `https://your-domain.com/auth/oidc/callback`
5. Configure group claims

#### Auth0

```yaml
auth:
  provider: "oidc"
  oidc:
    enabled: true
    issuer: "https://your-domain.auth0.com/"
    clientId: "your-auth0-client-id"
    clientSecret: "your-auth0-client-secret"
    redirectUri: "https://kubamf.company.com/auth/oidc/callback"
    scope: "openid profile email"
    groupClaim: "groups"
```

**Setup Steps:**
1. Go to [Auth0 Dashboard](https://manage.auth0.com/)
2. Create new application
3. Choose "Regular Web Applications"
4. Add callback URL: `https://your-domain.com/auth/oidc/callback`
5. Configure rules for group claims

#### Keycloak

```yaml
auth:
  provider: "oidc"
  oidc:
    enabled: true
    issuer: "https://keycloak.company.com/auth/realms/your-realm"
    clientId: "kubamf"
    clientSecret: "your-keycloak-client-secret"
    redirectUri: "https://kubamf.company.com/auth/oidc/callback"
    scope: "openid profile email groups"
    groupClaim: "groups"
```

**Setup Steps:**
1. Login to Keycloak admin console
2. Create new client in your realm
3. Set client protocol to "openid-connect"
4. Add valid redirect URI: `https://your-domain.com/auth/oidc/callback`
5. Configure client mappers for groups

#### GitLab

```yaml
auth:
  provider: "oidc"
  oidc:
    enabled: true
    issuer: "https://gitlab.com"
    clientId: "your-gitlab-application-id"
    clientSecret: "your-gitlab-application-secret"
    redirectUri: "https://kubamf.company.com/auth/oidc/callback"
    scope: "openid profile email"
    groupClaim: "groups"
```

### OIDC Configuration Options

| Option | Required | Description |
|--------|----------|-------------|
| `issuer` | ✅ | OIDC provider's issuer URL |
| `clientId` | ✅ | OAuth 2.0 client identifier |
| `clientSecret` | ✅ | OAuth 2.0 client secret |
| `redirectUri` | ✅ | Callback URL after authentication |
| `scope` | ❌ | Requested scopes (default: "openid profile email") |
| `groupClaim` | ❌ | JWT claim containing user groups |
| `roleClaim` | ❌ | JWT claim containing user roles |
| `sessionSecret` | ❌ | Secret for session encryption |
| `sessionMaxAge` | ❌ | Session duration in milliseconds |
| `secureCookies` | ❌ | Use secure cookies (HTTPS only) |
| `postLogoutRedirectUri` | ❌ | URL to redirect after logout |

---

## Security Considerations

### Production Deployment

```yaml
# Recommended production OIDC configuration
auth:
  provider: "oidc"
  oidc:
    enabled: true
    secureCookies: true     # HTTPS only
    sessionMaxAge: 28800000 # 8 hours
    sessionSecret: "CHANGE-THIS-TO-A-LONG-RANDOM-STRING"
```

### Environment Variables for Secrets

```bash
# Use environment variables for sensitive data
AUTH_OIDC_CLIENT_SECRET="${OIDC_CLIENT_SECRET}"
AUTH_OIDC_SESSION_SECRET="${OIDC_SESSION_SECRET}"
```

### Kubernetes Secrets

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: kubamf-auth-secrets
type: Opaque
stringData:
  AUTH_OIDC_CLIENT_SECRET: "your-client-secret"
  AUTH_OIDC_SESSION_SECRET: "your-session-secret"
```

### TLS/HTTPS Requirements

For production OIDC deployments:

```yaml
security:
  tls:
    enabled: true
    trustProxy: true  # If behind a proxy/load balancer

  cors:
    enabled: true
    origins:
      - "https://kubamf.company.com"
```

---

## Troubleshooting

### Common Issues

#### Basic Auth Not Working

1. **Check password hash format:**
   ```bash
   # Correct bcrypt format starts with $2b$
   $2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewqB.cJ3qm8bFrK.
   ```

2. **Verify configuration:**
   ```bash
   curl -u username:password http://localhost:3001/auth/basic/user
   ```

#### OIDC Redirect Issues

1. **Check redirect URI matches exactly:**
   ```yaml
   # Provider configuration
   redirectUri: "https://kubamf.company.com/auth/oidc/callback"
   ```

2. **Verify issuer URL:**
   ```bash
   curl https://your-provider.com/.well-known/openid-configuration
   ```

#### Session Problems

1. **Check session secret:**
   ```yaml
   # Must be set for persistent sessions
   sessionSecret: "your-long-random-string"
   ```

2. **Cookie security:**
   ```yaml
   # For HTTPS deployments
   secureCookies: true
   ```

### Debug Mode

Enable debug logging:

```bash
DEBUG=kubamf:auth npm start
```

### Testing Authentication

```bash
# Test auth info endpoint
curl http://localhost:3001/auth/info

# Test basic auth
curl -u admin:password http://localhost:3001/auth/basic/user

# Test protected API
curl -u admin:password http://localhost:3001/api/kubeconfig/contexts
```

---

## Migration Guide

### From No Auth to Basic Auth

1. Add users to configuration:
   ```yaml
   auth:
     provider: "basic"
     basic:
       enabled: true
       users:
         - username: "admin"
           password: "$2b$12$..."
   ```

2. Restart the application
3. Update client applications to send credentials

### From Basic Auth to OIDC

1. Configure OIDC provider
2. Update configuration:
   ```yaml
   auth:
     provider: "oidc"
     oidc:
       enabled: true
       # ... OIDC configuration
   ```
3. Restart application
4. Users will be redirected to OIDC provider

### Kubernetes Deployment

```yaml
# helm values.yaml
auth:
  provider: oidc
  oidc:
    enabled: true
    issuer: "https://your-provider.com"
    clientId: "your-client-id"
    redirectUri: "https://kubamf.company.com/auth/oidc/callback"

# Use external secrets for sensitive data
secretRef:
  name: kubamf-auth-secrets
```

---

## API Reference

### Authentication Endpoints

| Endpoint | Method | Provider | Description |
|----------|--------|----------|-------------|
| `/auth/info` | GET | All | Get auth configuration |
| `/auth/basic/login` | POST | Basic | Verify credentials |
| `/auth/basic/user` | GET | Basic | Get user info |
| `/auth/oidc/login` | GET | OIDC | Start OIDC flow |
| `/auth/oidc/callback` | GET | OIDC | OIDC callback |
| `/auth/oidc/logout` | POST | OIDC | Logout |
| `/auth/oidc/user` | GET | OIDC | Get user info |
| `/auth/oidc/refresh` | POST | OIDC | Refresh token |

### Response Formats

#### Auth Info Response

```json
{
  "provider": "oidc",
  "enabled": true,
  "config": {
    "type": "oidc",
    "issuer": "https://accounts.google.com",
    "clientId": "your-client-id",
    "provider": "google"
  },
  "endpoints": {
    "login": "/auth/oidc/login",
    "logout": "/auth/oidc/logout",
    "user": "/auth/oidc/user"
  },
  "user": {
    "id": "user-123",
    "username": "john.doe",
    "email": "john.doe@company.com",
    "name": "John Doe",
    "groups": ["developers", "admins"],
    "roles": ["user", "admin"],
    "provider": "oidc"
  }
}
```

This comprehensive authentication system provides enterprise-grade security while maintaining ease of use for development and simple deployments.