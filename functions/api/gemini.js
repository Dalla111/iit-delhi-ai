// File: functions/api/gemini.js

export async function onRequest(context) {
  // Only allow POST requests
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    // Get the user's prompt from the request body
    const requestBody = await context.request.json();
    const userPrompt = requestBody.prompt;

    // Get the secret Gemini API Key from the environment variables
    const geminiApiKey = context.env.GEMINI_API_KEY;

    if (!geminiApiKey) {
        return new Response('Server configuration error: Missing API Key.', { status: 500 });
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;

    // Construct the payload for the Gemini API
    const payload = {
      contents: [{ parts: [{ text: userPrompt }] }],
    };
    if (requestBody.isJson) {
        payload.generationConfig = { responseMimeType: "application/json" };
    }

    // Call the real Gemini API
    const geminiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    // Check if the call was successful
    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      // Forward the error from Gemini API back to the client
      return new Response(errorText, { status: geminiResponse.status, headers: {'Content-Type': 'application/json'} });
    }

    // Send the response from Gemini back to your front-end
    const data = await geminiResponse.json();
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: 'An internal server error occurred.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}