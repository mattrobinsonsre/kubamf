# Kubeconfig File Switching

Kubamf supports dynamic switching between different kubeconfig files, making it easy to manage multiple Kubernetes environments in the desktop app.

## Features

### Default Behavior
- Starts with `~/.kube/config` (or `$KUBECONFIG` if set)
- All contexts from the current kubeconfig are available
- Automatically discovers common kubeconfig locations

### Kubeconfig Discovery
Automatically discovers kubeconfig files in common locations:
- `~/.kube/config` (default)
- `~/.kube/config-dev`, `~/.kube/config-staging`, `~/.kube/config-prod`, `~/.kube/config-test`
- `/etc/kubeconfig`, `/etc/kubernetes/admin.conf`
- `./kubeconfig`, `./config` (current directory)

### Dynamic Switching
- Switch between different kubeconfig files without restarting
- Upload new kubeconfig files
- Validate kubeconfig content before switching
- Reset to default kubeconfig anytime

## API Endpoints

### Get Current Kubeconfig
```http
GET /api/kubeconfig/current
```
Returns the currently active kubeconfig file path.

### Discover Available Kubeconfigs
```http
GET /api/kubeconfig/discover
```
Returns a list of discovered kubeconfig files with metadata:
```json
[
  {
    "path": "/home/user/.kube/config",
    "isDefault": true,
    "isCurrent": true,
    "contextCount": 3,
    "currentContext": "my-cluster",
    "lastModified": "2025-01-20T10:30:00Z",
    "size": 2048
  }
]
```

### Switch Kubeconfig
```http
POST /api/kubeconfig/switch
Content-Type: application/json

{
  "path": "/home/user/.kube/config-staging"
}
```

### Reset to Default
```http
POST /api/kubeconfig/reset
```

### Preview Kubeconfig Contexts
```http
GET /api/kubeconfig/:encodedPath/contexts
```
View contexts from a specific kubeconfig without switching to it.

### Upload Kubeconfig
```http
POST /api/kubeconfig/upload
Content-Type: application/json

{
  "content": "apiVersion: v1\nkind: Config\n...",
  "filename": "my-cluster.yaml"
}
```

### Validate Kubeconfig
```http
POST /api/kubeconfig/validate
Content-Type: application/json

{
  "content": "apiVersion: v1\nkind: Config\n..."
}
```

## Frontend Integration

The frontend can use these endpoints to provide:

1. **Kubeconfig Selector**
   - Dropdown showing available kubeconfig files
   - Visual indicators for current/default files
   - Context count and cluster information

2. **File Upload Dialog**
   - Drag & drop kubeconfig files
   - Validation feedback before switching
   - Option to save as new file

3. **Quick Switch Menu**
   - Recently used kubeconfigs
   - One-click switching between environments
   - Reset to default option

## Example Usage Scenarios

### Development Workflow
1. Default: `~/.kube/config` (local development cluster)
2. Switch to: `~/.kube/config-staging` for testing
3. Switch to: `~/.kube/config-prod` for production issues
4. Reset to default when done

### Team Configuration
1. Upload shared team kubeconfig
2. Validate before switching
3. Save to `~/.kube/config-team`
4. Switch between personal and team clusters

### Temporary Access
1. Receive kubeconfig file via email/Slack
2. Upload without saving to disk permanently
3. Use for specific task
4. Reset to default configuration

## Security Considerations

- Uploaded files are saved to `~/.kube/` directory with restricted permissions
- Content validation prevents malformed configurations
- File paths are validated to prevent directory traversal
- Original kubeconfig files are never modified

## File Naming Convention

Uploaded files are saved as:
- `~/.kube/kubamf-{sanitized-filename}.yaml`
- Special characters replaced with underscores
- Timestamp added if no filename provided

## Error Handling

- Invalid YAML format: Returns validation error
- Missing contexts: Warning but allows switching
- File not found: Clear error message
- Permission issues: Helpful troubleshooting info

## Caching

- Context information cached for 30 seconds
- Cache automatically cleared when switching files
- Reduces file system access for better performance