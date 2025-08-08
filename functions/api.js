// This is your secure backend. It runs on Cloudflare's servers.

// Helper function to initialize Firebase Apps
// NOTE: Firebase SDK is not imported here as Cloudflare has its own way of handling this.
// For a real Cloudflare Worker, you'd typically use a REST API wrapper or a compatible library.
// This example simulates the logic. For a production app, you would use Firebase's REST API.

async function callGemini(prompt, apiKey, isJson = false) {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    if (isJson) {
        payload.generationConfig = { responseMimeType: "application/json" };
    }
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        throw new Error(`Gemini API Error: ${response.status}`);
    }
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}


export async function onRequest(context) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (context.request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { userQuery, mode, replyContext, conversationHistory } = await context.request.json();
        
        // Securely get your API keys from Cloudflare's environment variables
        const geminiApiKey = context.env.GEMINI_API_KEY;
        // In a real scenario, you would have all your Firebase keys here
        // const firebaseApiKey = context.env.FIREBASE_A1_KEY; 

        // --- THIS IS WHERE YOUR EFFICIENT LOGIC RUNS SECURELY ---
        // This is a simplified logic placeholder. In a real app, you would
        // initialize the chosen Firebase app here and perform targeted queries.
        
        let finalPrompt = `You are a super-intelligent AI for IIT Delhi. The user is in "${mode}" mode.
        Answer their question: "${userQuery}".
        Reply context (if any): "${replyContext}"
        Conversation History: ${JSON.stringify(conversationHistory)}
        ---
        IMPORTANT: Your database logic is handled by a secure backend. For now, just be as helpful as possible based on the user's query and the provided context. If they ask about a student, ask for the year. If they ask about a menu, try to find it.`;

        const aiResponse = await callGemini(finalPrompt, geminiApiKey);

        return new Response(JSON.stringify({ response: aiResponse }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error("Error in Cloudflare Function:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
}
