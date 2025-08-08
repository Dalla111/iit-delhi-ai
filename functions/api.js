// This is your secure backend function. It runs on Cloudflare's servers.
// NOTE: This code is designed for the Cloudflare Pages Functions environment.
// It uses fetch() for API calls, which is natively supported.

// Helper function to initialize a specific Firebase app instance.
// In a real Cloudflare Worker, you would use Firebase's REST API.
// This is a simplified simulation of that logic for clarity.
async function getFirestoreInstance(config, name) {
    // In a real worker, you'd use the config to get an auth token
    // and then use fetch with that token to interact with the Firestore REST API.
    // This is a placeholder for that logic.
    console.log(`Simulating connection to ${name}`);
    return {
        // This would be replaced with actual REST API calls
        collection: (path) => ({
            where: () => ({ get: async () => ({ docs: [] }) }),
            get: async () => ({ docs: [] })
        })
    };
}

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
        throw new Error(`Gemini API Error: ${response.status} ${await response.text()}`);
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
        
        // In a real implementation, you would select a Firebase config here
        // and use its credentials to make REST API calls.
        // For this example, we'll pass the query to Gemini to simulate the logic.

        // --- DYNAMIC AI BRAIN ---
        // In a real app, you would first fetch the system prompt from your general DB
        // const systemPromptDoc = await getDoc(doc(generalDb, "system_prompts", "chatbot_v1"));
        // const systemPrompt = systemPromptDoc.data().prompt;
        // For now, we hardcode it here:
        const systemPrompt = `You are a fun, friendly, and super-helpful AI assistant for students at IIT Delhi. You are an expert at understanding slang, abbreviations, and typos. Answer questions based *only* on the provided "Context" below.`;
        
        let contextData = "No data fetched from database in this simulation.";
        // This is where you would build your database query logic based on the 'mode'
        // and then fetch the data to create the 'contextData' variable.

        const finalPrompt = `${systemPrompt}
        
        **Analysis Steps & Rules:**
        1.  **Reply Context is KING:** If the context includes a "Replied-To Message", this is the MOST important piece of information. The user's new question is about this specific message.
        2.  **Club Membership:** If the context contains a 'Club Found' document, your primary task is to list the names of the members from the 'Member Details' section.
        3.  **Student Info:** If the context contains one or more 'Student' documents, present their information clearly using Markdown. If there are multiple, ask for clarification using the command: \`CLARIFY:[{"name":"Student Name 1", "entryNumber":"ID1"}, ...]\`.
        4.  **General Query:** If the context contains 'Knowledge' documents, use them to answer the user's question.

        ---
        **Context:**
        ${replyContext}
        ${contextData}
        ---
        
        **User's Question/Task:**
        "${userQuery}"
        
        **Your Witty & Helpful Answer (in Markdown):**`;

        const aiResponse = await callGemini(finalPrompt, geminiApiKey);

        return new Response(JSON.stringify({ response: aiResponse }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error("Error in Cloudflare Function:", error);
        return new Response(JSON.stringify({ error: error.message, response: "Oh no! My circuits are a bit tangled right now. 😵 Please try again in a moment." }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
}

