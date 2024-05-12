# Simple OpenAI TTS Playground

> Try out the [OpenAI Text to Speech API](https://platform.openai.com/docs/api-reference/audio) in your browser.

Minimal yet working prototype. Feel free to propose features and contribute PRs!

**Visit the playground here: <https://linqlover.github.io/simple-openai-tts-playground>**

## Current Features

- Select different voices
- Automatic division of long textes
- Price display
- Caching of audio files (in local browser storage)

## Development

To run the playground locally:

1. Check out the repository
2. Host a web server using `python3 -m http.server` (or using node analogously)
3. Open the playground on `http://localhost:8000/` (NOT `http://0.0.0.0/` because browsers might treat it as insecure context)
