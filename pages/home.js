const { INITIALIZATION_PATH } = process.env

export function homePage() {
  return `
<!DOCTYPE html>
<h1>Welcome!</h1>
<p>To authenticate with Epic, please click the button below:</p>
<button onclick="location.href='${INITIALIZATION_PATH}'">
Authenticate with Epic
</button>
`
}
