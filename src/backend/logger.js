/**
 * JSON Logger for backend services
 * Provides structured logging with different log levels
 */

class Logger {
  constructor(component = 'backend') {
    this.component = component
    this.logLevel = process.env.LOG_LEVEL || 'info'
    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    }
  }

  shouldLog(level) {
    return this.levels[level] >= this.levels[this.logLevel]
  }

  formatLog(level, message, meta = {}) {
    const log = {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      message,
      ...meta
    }

    // Add environment info
    if (process.env.NODE_ENV) {
      log.env = process.env.NODE_ENV
    }

    // Add Kubernetes pod info if available
    if (process.env.HOSTNAME) {
      log.hostname = process.env.HOSTNAME
    }
    if (process.env.POD_NAME) {
      log.pod = process.env.POD_NAME
    }
    if (process.env.POD_NAMESPACE) {
      log.namespace = process.env.POD_NAMESPACE
    }

    return JSON.stringify(log)
  }

  debug(message, meta = {}) {
    if (this.shouldLog('debug')) {
      console.log(this.formatLog('debug', message, meta))
    }
  }

  info(message, meta = {}) {
    if (this.shouldLog('info')) {
      console.log(this.formatLog('info', message, meta))
    }
  }

  warn(message, meta = {}) {
    if (this.shouldLog('warn')) {
      console.warn(this.formatLog('warn', message, meta))
    }
  }

  error(message, meta = {}) {
    if (this.shouldLog('error')) {
      // For errors, extract useful info
      if (meta instanceof Error) {
        meta = {
          error: meta.message,
          stack: meta.stack,
          code: meta.code
        }
      }
      console.error(this.formatLog('error', message, meta))
    }
  }

  // HTTP request logger middleware
  httpLogger() {
    return (req, res, next) => {
      const startTime = Date.now()

      // Log request
      this.info('HTTP Request', {
        method: req.method,
        path: req.path,
        query: req.query,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent')
      })

      // Capture response
      const originalSend = res.send
      res.send = function(data) {
        res.send = originalSend

        // Log response
        const duration = Date.now() - startTime
        this.logger.info('HTTP Response', {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
          contentLength: res.get('content-length')
        })

        return res.send(data)
      }.bind({ logger: this })

      next()
    }
  }
}

// Create singleton instance
const logger = new Logger()

module.exports = logger
module.exports.Logger = Logger