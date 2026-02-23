# Static Hosting Deployment Guide

This guide explains how to deploy the Kubamf frontend as a static site while running the API backend separately.

## Quick Start

```bash
# Build static frontend
npm run build:frontend:static

# Deploy ./dist/frontend/ to your static hosting provider
# Deploy API backend separately using Docker
```

## Architecture

```
┌─────────────────┐    HTTP/API calls    ┌─────────────────┐
│   Static CDN    │  ──────────────────▶ │   API Server    │
│   (Frontend)    │                      │   (Backend)     │
│                 │                      │                 │
│ • HTML/CSS/JS   │                      │ • kubectl API   │
│ • React SPA     │                      │ • Express.js    │
│ • No server     │                      │ • Docker        │
└─────────────────┘                      └─────────────────┘
```

## Frontend (Static Hosting)

### Build
```bash
./scripts/build-static.sh
```

### Deploy Options

#### 1. Netlify
```bash
# Drag & drop ./dist/frontend/ to netlify.com
# Or use CLI:
npm install -g netlify-cli
netlify deploy --prod --dir=dist/frontend
```

#### 2. Vercel
```bash
npm install -g vercel
vercel --prod
```

#### 3. AWS S3 + CloudFront
```bash
aws s3 sync ./dist/frontend/ s3://your-bucket-name
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

#### 4. GitHub Pages
```bash
# Push ./dist/frontend/ contents to gh-pages branch
# Enable GitHub Pages in repository settings
```

#### 5. Azure Static Web Apps
```bash
# Use Azure CLI or portal to deploy
az staticwebapp create --name kubamf --resource-group myRG --source ./dist/frontend/
```

### API Configuration

The frontend needs to know where your API server is running. Configure this by adding to your HTML:

```html
<script>
  window.KUBAMF_API_HOST = 'https://api.yourcompany.com/api';
</script>
```

Or set it in your static hosting provider's environment variables.

## Backend (API Server)

### Build Docker Image
```bash
docker build -f Dockerfile.api -t kubamf-api .
```

### Deploy API

#### Option 1: Docker Container
```bash
docker run -d \
  --name kubamf-api \
  -p 3001:3001 \
  -v ~/.kube:/home/kubamf/.kube:ro \
  kubamf-api
```

#### Option 2: Kubernetes
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kubamf-api
spec:
  replicas: 1
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
        volumeMounts:
        - name: kubeconfig
          mountPath: /home/kubamf/.kube
          readOnly: true
      volumes:
      - name: kubeconfig
        secret:
          secretName: kubamf-kubeconfig
---
apiVersion: v1
kind: Service
metadata:
  name: kubamf-api-service
spec:
  selector:
    app: kubamf-api
  ports:
  - port: 3001
    targetPort: 3001
  type: LoadBalancer
```

#### Option 3: Cloud Run (Google Cloud)
```bash
# Build and push to Google Container Registry
docker build -f Dockerfile.api -t gcr.io/YOUR_PROJECT/kubamf-api .
docker push gcr.io/YOUR_PROJECT/kubamf-api

# Deploy to Cloud Run
gcloud run deploy kubamf-api \
  --image gcr.io/YOUR_PROJECT/kubamf-api \
  --port 3001 \
  --allow-unauthenticated
```

#### Option 4: AWS ECS/Fargate
```bash
# Push to AWS ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com
docker build -f Dockerfile.api -t kubamf-api .
docker tag kubamf-api:latest YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/kubamf-api:latest
docker push YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/kubamf-api:latest

# Deploy using ECS CLI or AWS Console
```

## Security Considerations

### CORS Configuration
Ensure your API server allows requests from your static hosting domain:

```javascript
// In your API server
app.use(cors({
  origin: [
    'https://yourapp.netlify.app',
    'https://yourapp.vercel.app',
    'https://yourapp.github.io'
  ]
}));
```

### Authentication
For production deployments, consider adding authentication:

1. **API Key Authentication**
   ```javascript
   // Add to your API server
   app.use('/api', (req, res, next) => {
     const apiKey = req.headers['x-api-key'];
     if (apiKey !== process.env.API_KEY) {
       return res.status(401).json({ error: 'Unauthorized' });
     }
     next();
   });
   ```

2. **OAuth/JWT Integration**
   ```javascript
   // Add JWT middleware to your API routes
   app.use('/api', verifyJWT);
   ```

### Network Security
- Use HTTPS for both frontend and API
- Configure proper CORS headers
- Consider VPN or private network for API access
- Use kubectl RBAC to limit API permissions

## Environment Variables

### Frontend (Build Time)
```bash
# Set during build
VITE_STATIC_HOSTING=true npm run build:frontend:static
```

### API Server (Runtime)
```bash
NODE_ENV=production
PORT=3001
KUBECONFIG=/path/to/kubeconfig
API_KEY=your-secret-api-key
ALLOWED_ORIGINS=https://yourapp.netlify.app,https://yourapp.vercel.app
```

## Monitoring & Logging

### API Health Check
```bash
curl http://your-api-server:3001/api/kubeconfig/contexts
```

### Frontend Monitoring
- Use your static hosting provider's analytics
- Add error tracking (Sentry, LogRocket, etc.)
- Monitor API call failures

### API Monitoring
```bash
# Docker logs
docker logs kubamf-api

# Kubernetes logs
kubectl logs deployment/kubamf-api
```

## Troubleshooting

### Common Issues

1. **CORS Errors**
   - Check API server CORS configuration
   - Verify frontend is calling correct API URL

2. **API Connection Failed**
   - Verify API server is running
   - Check network connectivity
   - Verify KUBAMF_API_HOST is set correctly

3. **kubectl Commands Fail**
   - Check kubeconfig is mounted correctly
   - Verify kubectl binary is in PATH
   - Check cluster connectivity from API server

4. **Authentication Errors**
   - Verify kubeconfig credentials are valid
   - Check kubectl context is accessible
   - Verify cluster RBAC permissions

### Debug Mode
```bash
# Enable debug logging in API server
DEBUG=kubectl:* node src/backend/server.js
```