#!/bin/bash

set -e

echo "🌐 Building Kubamf for static hosting..."

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist/frontend

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build frontend for static hosting
echo "🏗️  Building frontend for static hosting..."
npm run build:frontend:static

echo "✅ Static build completed!"
echo ""
echo "📁 Static files are in: ./dist/frontend/"
echo ""
echo "🚀 Static hosting deployment options:"
echo ""
echo "1. 📄 Copy ./dist/frontend/ to your static hosting provider"
echo ""
echo "2. 🔧 Configure API endpoint by adding to your HTML:"
echo "   <script>window.KUBAMF_API_HOST = 'https://your-api-server.com/api';</script>"
echo ""
echo "3. 🌐 Popular static hosting options:"
echo "   • Netlify: drag & drop ./dist/frontend/ folder"
echo "   • Vercel: vercel --prod"
echo "   • AWS S3 + CloudFront"
echo "   • GitHub Pages"
echo "   • Azure Static Web Apps"
echo ""
echo "📝 Note: You'll need to deploy the API separately using:"
echo "   docker build -f Dockerfile.api -t kubamf-api ."