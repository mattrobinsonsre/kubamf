#!/usr/bin/env node

const { spawn } = require('child_process')
const os = require('os')
const path = require('path')

/**
 * Parallel test runner for kubamf
 * Runs backend (Jest) and frontend (Vitest) tests in parallel with optimal worker configuration
 */

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
}

function log(message, color = COLORS.reset) {
  console.log(`${color}${message}${COLORS.reset}`)
}

function calculateOptimalWorkers() {
  const cpuCount = os.cpus().length
  const totalMemoryMB = os.totalmem() / (1024 * 1024)

  // Conservative memory estimation: ~200MB per worker
  const memoryBasedWorkers = Math.floor(totalMemoryMB / 200)

  // Use 75% of CPU cores, but respect memory constraints
  const optimalWorkers = Math.min(
    Math.max(1, Math.floor(cpuCount * 0.75)),
    memoryBasedWorkers,
    8 // Cap at 8 for stability
  )

  return optimalWorkers
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const { label, color = COLORS.reset } = options

    log(`${COLORS.bright}Starting: ${label || command}${COLORS.reset}`, color)

    const child = spawn(command, args, {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      env: { ...process.env, FORCE_COLOR: '1' }
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => {
      const output = data.toString()
      stdout += output
      // Prefix output with label for identification
      output.split('\n').forEach(line => {
        if (line.trim()) {
          console.log(`${color}[${label || command}]${COLORS.reset} ${line}`)
        }
      })
    })

    child.stderr.on('data', (data) => {
      const output = data.toString()
      stderr += output
      output.split('\n').forEach(line => {
        if (line.trim()) {
          console.error(`${color}[${label || command}]${COLORS.reset} ${line}`)
        }
      })
    })

    child.on('close', (code) => {
      if (code === 0) {
        log(`✅ Completed: ${label || command}`, COLORS.green)
        resolve({ code, stdout, stderr })
      } else {
        log(`❌ Failed: ${label || command} (exit code: ${code})`, COLORS.red)
        reject(new Error(`${label || command} failed with exit code ${code}`))
      }
    })

    child.on('error', (error) => {
      log(`❌ Error: ${label || command} - ${error.message}`, COLORS.red)
      reject(error)
    })
  })
}

async function runTests() {
  const workers = calculateOptimalWorkers()
  const isCI = process.env.CI === 'true'

  log(`${COLORS.bright}🚀 Running tests with ${workers} workers${COLORS.reset}`)
  log(`Platform: ${os.platform()}, CPUs: ${os.cpus().length}, Memory: ${Math.round(os.totalmem() / (1024 * 1024 * 1024))}GB`)
  log(`CI Mode: ${isCI ? 'Yes' : 'No'}`)

  const testPromises = []

  // Backend tests with Jest
  const jestArgs = [
    'src/backend',
    '--testPathPattern=src/backend',
    `--maxWorkers=${workers}`,
    '--coverage',
    '--coverageDirectory=coverage/backend',
    '--coverageReporters=text',
    '--coverageReporters=lcov',
    '--coverageReporters=json-summary',
    '--passWithNoTests'
  ]

  if (isCI) {
    jestArgs.push('--ci', '--watchman=false')
  }

  testPromises.push(
    runCommand('npx', ['jest', ...jestArgs], {
      label: 'Backend',
      color: COLORS.blue
    })
  )

  // Frontend tests with Vitest
  const vitestArgs = [
    'run',
    'src/',
    '--reporter=verbose',
    '--coverage',
    '--coverage.enabled',
    '--coverage.reporter=text',
    '--coverage.reporter=lcov',
    '--coverage.reporter=json-summary',
    '--coverage.reportsDirectory=coverage/frontend',
    `--pool.threads.maxThreads=${workers}`,
    `--pool.threads.minThreads=${Math.max(1, Math.floor(workers / 2))}`
  ]

  if (isCI) {
    vitestArgs.push('--run', '--no-watch')
  }

  testPromises.push(
    runCommand('npx', ['vitest', ...vitestArgs], {
      label: 'Frontend',
      color: COLORS.magenta
    })
  )

  try {
    const startTime = Date.now()
    const results = await Promise.all(testPromises)
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    log(`${COLORS.bright}🎉 All tests completed successfully in ${duration}s!${COLORS.reset}`, COLORS.green)

    // Summary
    log('\n📊 Test Summary:', COLORS.cyan)
    results.forEach((result, index) => {
      const label = index === 0 ? 'Backend (Jest)' : 'Frontend (Vitest)'
      log(`  ✅ ${label}: Passed`, COLORS.green)
    })

    process.exit(0)
  } catch (error) {
    log(`\n💥 Test execution failed: ${error.message}`, COLORS.red)
    process.exit(1)
  }
}

// Handle CLI arguments
const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
${COLORS.bright}Parallel Test Runner for kubamf${COLORS.reset}

Usage: node scripts/test-parallel.js [options]

Options:
  --help, -h     Show this help message

Environment Variables:
  CI=true        Enable CI mode (non-interactive, optimized for CI/CD)

Examples:
  node scripts/test-parallel.js
  CI=true node scripts/test-parallel.js

The script automatically:
- Calculates optimal worker count based on CPU cores and available memory
- Runs Jest (backend) and Vitest (frontend) tests in parallel
- Generates coverage reports for both test suites
- Provides colored, labeled output for easy debugging
`)
  process.exit(0)
}

// Run the tests
runTests().catch((error) => {
  log(`Fatal error: ${error.message}`, COLORS.red)
  process.exit(1)
})