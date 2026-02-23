#!/bin/bash

set -e

echo "🚀 Building Kubamf for all platforms..."

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist dist-electron

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build web frontend
echo "🌐 Building web frontend..."
npm run build:frontend

# Build backend for web deployment
echo "⚙️  Building backend for web deployment..."
npm run build:backend

# Build Electron apps for all platforms
echo "🖥️  Building Electron apps..."

# macOS Universal Binary
echo "🍎 Building macOS Universal Binary..."
npm run electron:build -- --mac --universal

# Windows x64 and ARM64
echo "🪟 Building Windows x64 and ARM64..."
npm run electron:build -- --win --x64 --arm64

# Linux x64 and ARM64
echo "🐧 Building Linux x64 and ARM64..."
npm run electron:build -- --linux --x64 --arm64

echo "✅ All builds completed!"
echo ""
echo "📦 Build artifacts:"
echo "   • Web app: ./dist/"
echo "   • Electron apps: ./dist-electron/"
echo ""
echo "🚀 Deployment commands:"
echo "   • Web: npm run web:start"
echo "   • Electron: Open the app from ./dist-electron/"