//#region Constants
const OPENAPI_URL = "https://api.openai.com/v1";
//#endregion

//#region Utils
const sha256 = async (source) => {
  const sourceBytes = new TextEncoder().encode(source);
  const digest = await crypto.subtle.digest("SHA-256", sourceBytes);
  const resultBytes = [...new Uint8Array(digest)];
  return resultBytes.map((x) => x.toString(16).padStart(2, "0")).join("");
};

const blobToBase64 = (blob) => {
  const reader = new FileReader();
  reader.readAsDataURL(blob);
  return new Promise((resolve) => {
    reader.onloadend = () => {
      resolve(reader.result);
    };
  });
};

const base64ToBlob = (base64) => {
  const parts = base64.split(";base64,");
  const type = parts[0].split(":")[1];
  const byteCharacters = atob(parts[1]);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type });
};

const delay = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
//#endregion

const generateCacheKey = async (text, config, type = "audio") => {
  return `${type}-${config.model}-${config.voice}-${await sha256(text)}`;
};

// Function to split the text into meaningful chunks
const splitText = (text) => {
  let chunks = [];
  const maxChunkSize = 4096; // Maximum characters per request
  const delimiters = [". ", "? ", "! ", "\n"]; // Sensible points to split the text

  while (text.length > 0) {
    if (text.length <= maxChunkSize) {
      chunks.push(text);
      break;
    }
    let end = maxChunkSize;
    for (let delimiter of delimiters) {
      let pos = text.lastIndexOf(delimiter, maxChunkSize);
      if (pos > -1) {
        end = pos + delimiter.length;
        break;
      }
    }
    chunks.push(text.substring(0, end));
    text = text.substring(end);
  }
  return chunks;
};

// Function to handle API requests and concatenating audio with rate limiting
const fetchAndConcatenateAudio = async (
  textChunks,
  config,
  progressFn = null
) => {
  const rpm = 100; // Maximum requests per minute
  const interval = 60000 / rpm; // Time between requests in milliseconds

  let audioBlobs = [];
  progressFn(0);
  for (let i = 0; i < textChunks.length; i++) {
    if (progressFn) {
      progressFn(i / textChunks.length);
    }

    const chunk = textChunks[i];
    const cacheKey = await generateCacheKey(chunk, config, "chunk");

    let cachedBlob = null;

    let cachedBase64 = localStorage.getItem(cacheKey);
    if (cachedBase64) {
      cachedBlob = base64ToBlob(cachedBase64);
    }
    if (!cachedBlob) {
      if (i > 0 && i % rpm === 0) {
        await delay(60000); // Wait for a minute after 100 requests
      } else if (i > 0) {
        await delay(interval); // Wait the required interval before the next request
      }

      const response = await fetch(`${OPENAPI_URL}/audio/speech`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          input: chunk,
          voice: config.voice,
        }),
      });

      if (!response.ok) {
        throw new Error(
          "Failed to convert text to speech:\n\n" + (await response.text())
        );
      }

      const blob = await response.blob();
      const base64 = await blobToBase64(blob);
      try {
        localStorage.setItem(cacheKey, base64); // Cache the new audio file
      } catch (error) {
        console.error("Failed to cache audio file:", error);
      }

      audioBlobs.push(blob);
    }
  }
  progressFn(1);

  return new Blob(audioBlobs, { type: "audio/mp3" });
};

const convert = async () => {
  const text = document.getElementById("textInput").value;
  const voice = document.getElementById("voiceSelect").value;
  const model = document.getElementById("modelSelect").value;
  const apiKey = document.getElementById("apiKeyInput").value;

  const cacheKey = await generateCacheKey(text, { voice, model });

  // Check cache first
  let cachedBase64 = localStorage.getItem(cacheKey);
  if (cachedBase64) {
    const cachedBlob = base64ToBlob(cachedBase64);
    const cachedUrl = URL.createObjectURL(cachedBlob);
    document.getElementById("audioPlayer").src = cachedUrl;
    return;
  }

  const button = document.getElementById("convertBtn");
  let audioBlob = null;
  try {
    // gray out the button while processing
    button.disabled = true;
    button.innerText = "Converting...";

    const textChunks = splitText(text);
    audioBlob = await fetchAndConcatenateAudio(
      textChunks,
      { voice, model, apiKey },
      (progress) => {
        button.innerText = `Converting... (${(progress * 100).toFixed(0)}%)`;
      }
    );
  } catch (error) {
    alert(error.message);
    await updatePricing();
    return;
  } finally {
    button.disabled = false;
  }

  const url = URL.createObjectURL(audioBlob);
  document.getElementById("audioPlayer").src = url;

  try {
    localStorage.setItem(cacheKey, await blobToBase64(audioBlob));
  } catch (error) {
    console.error("Failed to cache audio file:", error);
  }
  localStorage.setItem("apiKey", apiKey);

  await updatePricing(); // Optionally update pricing or status message here
};

const updatePricing = async () => {
  const text = document.getElementById("textInput").value;
  const voice = document.getElementById("voiceSelect").value;
  const model = document.getElementById("modelSelect").value;

  const cacheKey = await generateCacheKey(text, { model, voice });

  // Check cache first
  let cachedBase64 = localStorage.getItem(cacheKey);
  if (cachedBase64) {
    document.getElementById("convertBtn").innerText =
      "Convert to Speech (cached)";
    return;
  }

  const pricePerMillion = 15.0;
  const price = (text.length / 1000000) * pricePerMillion;
  const cents = price * 100;
  document.getElementById(
    "convertBtn"
  ).innerText = `Convert to Speech (¢${cents.toFixed(2)})`;
};

const init = () => {
  // Load the API key from cache
  const apiKey = localStorage.getItem("apiKey");
  if (apiKey) {
    document.getElementById("apiKeyInput").value = apiKey;
  }

  document.getElementById("textInput").addEventListener("input", updatePricing);
  document
    .getElementById("voiceSelect")
    .addEventListener("change", updatePricing);
  document
    .getElementById("modelSelect")
    .addEventListener("change", updatePricing);
  document.getElementById("convertBtn").addEventListener("click", convert);
};

init();
