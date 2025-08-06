import { jwtDecode } from 'jwt-decode'

const SHOW_TOKEN_IN_BROWSER = process.env.SHOW_TOKEN_IN_BROWSER === 'true'

export function successPage(token, profile = undefined) {
  const decodedIDToken = jwtDecode(token.id_token)

  const tokenHTML = `
<h2>Review token below</h2>
<pre>
${JSON.stringify(token, null, 2)}
</pre>

<h3>Decoded ID Token</h3>
<pre>
${JSON.stringify(decodedIDToken, null, 2)}
</pre>
`

  const profileHtml = `
<h2>Profile Information</h2>
<pre>
${JSON.stringify(profile, null, 2)}
</pre>
`


  return `
<!DOCTYPE html>
<h1>Authentication successful!</h1>
${SHOW_TOKEN_IN_BROWSER ? tokenHTML : ''}
${profile ? profileHtml : ''}
`
}
