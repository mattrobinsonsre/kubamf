#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

async function generateDocs() {
  try {
    // Dynamic import for ES module
    const { marked } = await import('marked');

    // Configure marked options
    marked.setOptions({
      gfm: true,
      breaks: true,
      highlight: function(code, lang) {
        // Simple syntax highlighting placeholder
        return code;
      }
    });

    // Documentation structure
    const docs = {
      ui: [],
      deployment: [],
      api: [],
      general: []
    };

    // Map markdown files to categories
    const fileMap = {
      // General documentation
      'README.md': { category: 'general', title: 'Getting Started', order: 1 },
      'SECURITY.md': { category: 'general', title: 'Security Guidelines', order: 2 },
      'docs/QUICK_START.md': { category: 'general', title: 'Quick Start Guide', order: 3 },
      'docs/DESKTOP_COMPATIBILITY.md': { category: 'general', title: 'Desktop Compatibility', order: 4 },

      // Deployment documentation
      'HELM.md': { category: 'deployment', title: 'Helm Deployment', order: 1 },
      'static-hosting.md': { category: 'deployment', title: 'Static Hosting', order: 2 },
      'docs/DEPLOYMENT.md': { category: 'deployment', title: 'Deployment Guide', order: 3 },
      'docs/KUBECONFIG_SWITCHING.md': { category: 'deployment', title: 'Kubeconfig Switching', order: 4 },

      // API and Security documentation
      'RBAC.md': { category: 'api', title: 'Role-Based Access Control', order: 1 },
      'docs/AUTHENTICATION.md': { category: 'api', title: 'Authentication', order: 2 }
    };

    // Read and process markdown files
    Object.entries(fileMap).forEach(([filename, config]) => {
      const filepath = path.join(__dirname, '..', filename);

      if (fs.existsSync(filepath)) {
        const markdown = fs.readFileSync(filepath, 'utf8');
        const html = marked(markdown);

        docs[config.category].push({
          title: config.title,
          content: html,
          order: config.order,
          filename: filename
        });
      }
    });

    // Sort docs by order
    Object.keys(docs).forEach(category => {
      docs[category].sort((a, b) => a.order - b.order);
    });

    // Generate the documentation JSON
    const outputPath = path.join(__dirname, '..', 'public', 'docs.json');
    fs.writeFileSync(outputPath, JSON.stringify(docs, null, 2));

    console.log(`Documentation generated at ${outputPath}`);
  } catch (error) {
    console.error('Error generating documentation:', error.message);
    // Create empty docs file to allow build to continue
    const outputPath = path.join(__dirname, '..', 'public', 'docs.json');
    fs.writeFileSync(outputPath, JSON.stringify({ ui: [], deployment: [], api: [], general: [] }, null, 2));
    console.log(`Empty documentation created at ${outputPath}`);
  }
}

generateDocs();