const LogLevels = {
  ERROR: 'error',
  INFO: 'info',
  DEBUG: 'debug'
}

const LOG_LEVEL = process.env.LOG_LEVEL || 'info'

export function createLogger(level = LogLevels.INFO) {
  const levels = [LogLevels.ERROR, LogLevels.INFO, LogLevels.DEBUG]
  const current = levels.indexOf(level.toLowerCase())

  const log = (lvl, ...args) => {
    if (levels.indexOf(lvl) > current) return

    const errorColor = '\x1b[31m' // Red for errors
    const infoColor = '\x1b[32m' // Green for info
    const debugColor = '\x1b[34m' // Blue for debug

    switch (lvl) {
      case LogLevels.ERROR:
        console.error(errorColor, '[ERROR]', ...args, '\x1b[0m')
        break
      case LogLevels.INFO:
        console.info(infoColor, '[INFO]', ...args, '\x1b[0m')
        break
      case LogLevels.DEBUG:
        console.info(debugColor, '[DEBUG]', ...args, '\x1b[0m')
        break
    }
  }

  return {
    error: (...args) => log('error', ...args),
    info: (...args) => log('info', ...args),
    debug: (...args) => log('debug', ...args),
  };
}

export const logger = createLogger(LOG_LEVEL)
