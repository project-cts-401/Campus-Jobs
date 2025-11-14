// Make sure you have run 'npm install dotenv'
require('dotenv').config();

const API_KEY = process.env.GEMINI_API_KEY;

// Brutal Honesty: You MUST use the exact model version specified here.
// 'gemini-2.5-flash-preview-09-2025' supports the JSON schema enforcement we need.
// Using 'latest' or other models may break the JSON parsing.
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${API_KEY}`;

// Define the precise JSON structure we want Gemini to return.
// This is not optional; it forces the AI to give us clean data.
const RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      "subjectCode": { "type": "STRING" },
      "subjectName": { "type": "STRING" },
      "mark": { "type": "NUMBER" },
      "status": { "type": "STRING" }
    },
    // We make them required so the AI doesn't get lazy and skip fields.
    required: ["subjectCode", "subjectName", "mark", "status"]
  }
};

// This is the "system instruction" or "prompt engineering".
// This is the most important part of the AI parser.
// We are telling it *exactly* what to look for based on the transcript you provided.
const SYSTEM_PROMPT = `You are an expert academic transcript parser. Your task is to extract all subjects from the user's "ACADEMIC YEAR : 2023".
You MUST follow these rules:
1.  Find the section for "ACADEMIC YEAR : 2023". This is the *only* year you should look at.
2.  Extract every subject from that section.
3.  You MUST ignore any subject with a status of 'FAIL', 'ABSENT', or 'SUPPLEMENTARY'. Only include passed subjects (e.g., 'PASS', 'PASS WITH DISTINCTION').
4.  You MUST return the data in the requested JSON format.
5.  If a subject code is not present (like for 'PROJECT 3'), use the subject name as the code.
6.  The mark MUST be a number.
7.  Do not include any subjects from other academic years (like 2021, 2022, or 2024).`;

/**
 * Utility function for exponential backoff retries on API calls.
 * This makes your app more resilient to temporary network or API server issues.
 * @param {function} fetchCall - The fetch call function to retry.
 * @param {number} maxRetries - Maximum number of retries.
 * @returns {Promise<Response>}
 */
async function fetchWithBackoff(fetchCall, maxRetries = 3) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const response = await fetchCall();
      if (response.ok) {
        return response; // Success
      }
      
      // Do not retry on client errors (4xx), it means our request is bad.
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`Client error: ${response.status} ${response.statusText}`);
      }
      
      // Retry on 5xx server errors or network errors
      console.warn(`API call failed (attempt ${attempt + 1}/${maxRetries}), retrying...`);

    } catch (error) {
      if (attempt === maxRetries - 1) throw error; // Last attempt failed, throw error
    }
    
    // Exponential backoff: 1s, 2s, 4s... + random jitter
    const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
    await new Promise(resolve => setTimeout(resolve, delay));
    attempt++;
  }
}

/**
 * Calls the Gemini API to parse raw transcript text into structured JSON.
 * @param {string} rawText - The raw text extracted from the PDF.
 * @returns {Promise<{success: boolean, subjects?: Array, error?: string}>}
 */
async function parseTranscriptWithAI(rawText) {
  if (!API_KEY || API_KEY === "YOUR_API_KEY_HERE") {
    // Brutal Honesty: This is a common failure point. Fail fast if the key is missing.
    return { success: false, error: "GEMINI_API_KEY is not set. Please check your .env file." };
  }

  const payload = {
    contents: [{
      parts: [{ text: rawText }]
    }],
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }]
    },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.0 // Set to 0 for deterministic, fact-based output
    }
  };

  try {
    const response = await fetchWithBackoff(() => fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }));

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Gemini API Error Body:", errorBody);
      return { success: false, error: `Gemini API Error: ${response.status} ${response.statusText}` };
    }

    const result = await response.json();
    const candidate = result.candidates?.[0];

    // This checks if the AI responded correctly, or if it was blocked, etc.
    if (!candidate || !candidate.content?.parts?.[0]?.text) {
      console.error("Invalid Gemini Response:", JSON.stringify(result, null, 2));
      return { success: false, error: "Invalid response structure from Gemini API. The prompt may have been blocked or returned empty." };
    }

    const jsonText = candidate.content.parts[0].text;
    const subjects = JSON.parse(jsonText);

    if (!Array.isArray(subjects)) {
      return { success: false, error: "AI did not return a valid subject array." };
    }
    
    // Final sanity check
    if (subjects.length === 0) {
         return { success: false, error: "AI found 0 valid subjects for 2023. The transcript might be missing this year or all subjects failed/are supplementary." };
    }

    return { success: true, subjects: subjects };

  } catch (error) {
    // This catches network errors, JSON.parse errors, and backoff failures
    console.error('Error in parseTranscriptWithAI:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  parseTranscriptWithAI
};