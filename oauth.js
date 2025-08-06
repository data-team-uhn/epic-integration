// ###########################################################################################
// # The Main Oauth functionality is defined in this section.
// # These steps must happen while the callback server is listening to receive the
// # callback from Epic.
// #
// # Step 1: Request the URIs from Epic's FHIR metadata.
// # This will fetch the authorization and token URIs needed for the OAuth flow.
// # This step can technically be skipped if the URIs are known and static.
// #
// # Step 2: Request Epic authorization by redirecting the browser with requestEpicAuthorization.
// # This will redirect the browser window for the user to log in and authorize the app.
// #
// # Step 3: Exchange the authorization code for an access token.
// # This will be done in the callback server when Epic redirects back to the app.
// ###########################################################################################
import Bluebird from 'bluebird'
import fs from 'fs'
import { jwtDecode } from 'jwt-decode'
import _ from 'lodash'
import url from 'url'
import { logger } from './logger.js'
import { successPage } from './pages/authSuccess.js'
import { generateState, validateState } from './state-manager.js'
import requests from './test-requests.json' with { type: 'json' }

const {
  EPIC_BASE_URL,
  CLIENT_ID,
  CLIENT_SECRET = undefined,
  HOST = 'localhost',
  PORT = 4005,
  CALLBACK_PATH,
  SCOPE = 'openid fhirUser profile',
} = process.env
const REDIRECT_URI = `http://${HOST}:${PORT}${CALLBACK_PATH}`
const METADATA_URL = `${EPIC_BASE_URL}/metadata`
const FETCH_PROFILE = process.env.FETCH_PROFILE === 'true'
const FETCH_ADDITIONAL_RESOURCES = process.env.FETCH_ADDITIONAL_RESOURCES === 'true'
const RESPONSE_DIRECTORY = './responses'

/**
 * Global URIs available to request epic auth and exchange code for token.
 */
let authUri, tokenUri

/**
 * Fetch the authorization and token URIs from Epic's FHIR metadata.
 * @returns {Promise<void>}
 */
export async function fetchURIs() {
  logger.info('Fetching Epic metadata...')

  const metadataRes = await fetch(METADATA_URL, {
    headers: { Accept: 'application/json' }
  })
  const metadata = await metadataRes.json()

  const extensions = _.get(metadata, 'rest[0].security.extension[0].extension')
  authUri = extensions[0].valueUri
  tokenUri = extensions[1].valueUri

  logger.debug(`Authorization URI: ${authUri}`)
  logger.debug(`Token URI: ${tokenUri}`)
}

/**
 * Request Epic authorization by redirecting the browser.
 * @returns {Promise<void>}
 */
export async function requestEpicAuthorization(res, req) {
  logger.info('Redirecting to Epic for authorization...')
  const parsedUrl = url.parse(req.url, true)
  const launch = parsedUrl.query.launch
  const iss = parsedUrl.query.iss
  const scope = launch ? `${SCOPE} launch` : SCOPE

  if (launch) {
    logger.info('Received embedded launch request')
    logger.debug('URL:', req.url)
  }

  const baseUrl = authUri
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope,
    redirect_uri: REDIRECT_URI,
    state: generateState(),
    ...iss && { aud: iss },
    ...launch && { launch },
    ...CLIENT_SECRET && { secret: CLIENT_SECRET },
  }).toString()
  const authUrl = `${baseUrl}?${params}`

  logger.debug('Opening Epic authorization URL:', authUrl)

  res.writeHead(302, { Location: authUrl })
  res.end()
}

/**
 * Parse code from Epic OAuth callback and request an access token.
 *
 * Validation is performed on the state variable in the Epic response to prevent against csrf attacks.
 * If an error is present in the Epic response, it will be parsed and shown in the browser.
 * The access token will be stored in a file to be used for further access to FHIR endpoints.
 * If desired, a follow-up request will be made to Epic to get the authenticated user's FHIR profile.
 *
 * @param req
 * @param res
 * @returns {Promise<void>}
 */
export async function exchangeCodeForToken(req, res) {
  logger.info('Received callback from Epic')
  logger.debug('URL:', req.url)

  const parsedUrl = url.parse(req.url, true)
  const returnedState = parsedUrl.query.state
  const code = parsedUrl.query.code
  const error = parsedUrl.query.error
  const errorDescription = parsedUrl.query.error_description

  // Error handling and state validation
  try {
    if (!validateState(returnedState)) {
      throw new Error(`Invalid state parameter: expected ${state}, but got ${returnedState}`, { cause: 'Invalid State' })
    }

    if (error) {
      throw new Error(errorDescription, { cause: error })
    }

    if (!code) {
      throw new Error('Missing authorization code', { cause: 'Missing code' })
    }

    logger.debug(`Received code for token ${code}`)
    logger.info('Exchanging code for token...')

    const baseUrl = tokenUri
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      ...CLIENT_SECRET && { secret: CLIENT_SECRET },
    }).toString()

    logger.debug('Exchanging code for token at:', baseUrl)
    logger.debug('Body of token request:', params)

    const tokenResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    })

    if (!tokenResponse.ok) {
      throw new Error(`Token exchange failed: ${tokenResponse.status} ${await tokenResponse.text()}`, { cause: 'Failed to get token from Epic' })
    }

    // Write token to file (not necessary for production code)
    const token = await tokenResponse.json()
    await fs.writeFileSync('./token.json', JSON.stringify(token, null, 2))
    logger.info('Access token saved to token.json')

    // Optionally fetch the user's profile
    let profile
    if (FETCH_PROFILE) {
      profile = await requestProfile(token)
      profile && logger.debug('Profile information retrieved:', profile)
    }

    res.writeHead(200, { 'Content-Type': 'text/html' }).end(successPage(token, profile))

    // Optionally make additional requests
    if (FETCH_ADDITIONAL_RESOURCES) {
      await testRequests(token)
    }
  } catch (error) {
    logger.error('Token exchange failed:', error.message)
    res.writeHead(500).end(`${error.cause}: ${error.message}`)
  }
}

/**
 * Make a request to the fhirUser url stored in the authorization token as part of the OAuth flow.
 *
 * @param token
 * @returns {Promise<any>}
 */
export async function requestProfile(token) {
  logger.info('Requesting authenticated user\'s profile...')
  const {
    id_token,
    access_token
  } = token

  const { fhirUser: url } = jwtDecode(id_token)

  logger.debug('Profile URL:', url)

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Authorization: `Bearer ${access_token}`,
    },
  })

  if (!res.ok) {
    logger.error(`Profile request failed: ${res.status} ${await res.text()}`)
    return
  }

  return res.json()
}

/**
 * Read from the requests json file to send requests to Epic.
 *
 * Results will be stored in timestamped files with the resource name in the file name.
 *
 * @param token
 * @returns {Promise<void>}
 */
async function testRequests(token) {
  const {
    access_token
  } = token

  if (!fs.existsSync(RESPONSE_DIRECTORY)) {
    // If it doesn't exist, create the directory
    fs.mkdirSync(RESPONSE_DIRECTORY);
  }

  return Bluebird.each(requests, async (request) => {
    const {
      resource,
      params = {},
    } = request

    const encodedParams = new URLSearchParams(params).toString()
    const url = `${EPIC_BASE_URL}/${resource}?${encodedParams}`

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${access_token}`,
      },
    })

    if (!res.ok) {
      logger.error('Error when requesting', url, ':', await res.text())
      return
    }

    const jsonRes = await res.json()
    logger.debug(jsonRes)

    await fs.writeFileSync(`${RESPONSE_DIRECTORY}/${Date.now()}-${resource}.json`, JSON.stringify(jsonRes, null, 2))
    logger.info('Wrote response for', resource)
  })
}
