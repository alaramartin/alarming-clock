import querystring from 'querystring'

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const refresh_token = process.env.SPOTIFY_REFRESH_TOKEN;

const basic = Buffer.from(`${client_id}:${client_secret}`).toString('base64');
const NOW_PLAYING_ENDPOINT = `https://api.spotify.com/v1/me/player/currently-playing`;
const TOKEN_ENDPOINT = `https://accounts.spotify.com/api/token`

// get access token for the API
const getAccessToken = async() => {
    const response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${basic}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: querystring.stringify({
            grant_type: 'refresh_token',
            refresh_token,
        }),
    });

    const body = await response.json();

    // A revoked/expired refresh token comes back as 400 invalid_grant. Surface it
    // loudly — otherwise it looks identical to "nothing is playing" downstream.
    if (!response.ok || !body.access_token) {
        throw new Error(
            `Spotify token refresh failed (${response.status}): ${body.error ?? "unknown"}` +
            `${body.error_description ? ` — ${body.error_description}` : ""}` +
            `${body.error === "invalid_grant" ? "\nRe-run: npm run spotify:token" : ""}`
        );
    }

    return body;
}

// request currently playing song
export const getNowPlaying = async() => {
    const { access_token } = await getAccessToken();

    return fetch(NOW_PLAYING_ENDPOINT, {
        headers: {
            Authorization: `Bearer ${access_token}`,
        }
    })
}