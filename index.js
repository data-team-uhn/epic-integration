import 'dotenv/config'
import http from 'http'
import open from 'open'
import url from 'url'
import { logger } from './logger.js'
import { exchangeCodeForToken, fetchURIs, requestEpicAuthorization } from './oauth.js'
import { homePage } from './pages/home.js'

// ###########################################################################################
// # Load environment variables.
// ###########################################################################################

const {
  HOST = 'localhost',
  PORT = 4005,
  CALLBACK_PATH,
  INITIALIZATION_PATH,
} = process.env

const OPEN_BROWSER = process.env.OPEN_BROWSER === 'true'
const REDIRECT_URI = `http://${HOST}:${PORT}${CALLBACK_PATH}`

// ###########################################################################################
// # Create a simple HTTP server to handle the OAuth requests.
// ###########################################################################################
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true)
  const pathname = parsedUrl.pathname

  switch (pathname) {
    // Home page with button to initialize authorization with Epic
    case '':
    case '/':
      res.writeHead(200, { 'Content-Type': 'text/html' }).end(homePage())
      return // to keep the server alive

    // Initializes authorization a redirects to epic login
    case INITIALIZATION_PATH:
      await requestEpicAuthorization(res, req)
      return // to keep the server alive

    // Handles OAuth callback from Epic
    case CALLBACK_PATH:
      await exchangeCodeForToken(req, res)
      break

    // Unknown route
    default:
      logger.error(`Unexpected path: ${pathname}`)
      res.writeHead(404).end('Not Found')
  }

  await server.close(() => logger.info('Server closed.'))
})

server.listen(PORT, () => {
  logger.info(`Listening for Epic callback at ${REDIRECT_URI}`)

  // fetch authorization and token uris and save them in memory
  // then open the browser to the home page.
  fetchURIs().then(() => {
    if (OPEN_BROWSER) {
      open(`http://${HOST}:${PORT}`)
    }
  })
})
