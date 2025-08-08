// /functions/api.js - The Definitive Read-Efficient & Smart Version

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

export async function onRequest(context) {
    // Only allow POST requests
    if (context.request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        const { userQuery, conversationHistory } = await context.request.json();
        const env = context.env; // Securely access your API keys

        const callGemini = async (prompt, isJson = false) => {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${env.GEMINI_API_KEY}`;
            const payload = { contents: [{ parts: [{ text: prompt }] }] };
            if (isJson) payload.generationConfig = { responseMimeType: "application/json" };
            const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) throw new Error(`Gemini API error! status: ${response.status}`);
            const data = await response.json();
            if (!data.candidates || !data.candidates[0].content) return "I'm sorry, I couldn't generate a response for that.";
            return data.candidates[0].content.parts[0].text;
        };

        // Randomly select a database pair to connect to
        const dbPairs = [ { general: 'A1', student: 'A2' }, { general: 'B1', student: 'B2' }, { general: 'C1', student: 'C2' }, { general: 'D1', student: 'D2' }, { general: 'E1', student: 'E2' }];
        const selectedPair = dbPairs[Math.floor(Math.random() * dbPairs.length)];
        const generalApp = initializeApp({ apiKey: env[`FIREBASE_API_KEY_${selectedPair.general}`], authDomain: env[`FIREBASE_AUTH_DOMAIN_${selectedPair.general}`], projectId: env[`FIREBASE_PROJECT_ID_${selectedPair.general}`] }, `general-${Date.now()}`);
        const generalDb = getFirestore(generalApp);
        const studentApp = initializeApp({ apiKey: env[`FIREBASE_API_KEY_${selectedPair.student}`], authDomain: env[`FIREBASE_AUTH_DOMAIN_${selectedPair.student}`], projectId: env[`FIREBASE_PROJECT_ID_${selectedPair.student}`] }, `student-${Date.now()}`);
        const studentDb = getFirestore(studentApp);

        // --- STEP 1: AI PLANNER ---
        const historyString = conversationHistory.map(turn => `${turn.role}: ${turn.text}`).join('\n');
        const plannerPrompt = `You are a query planning assistant. Your job is to analyze a user's query and conversation history to determine exactly which Firestore collections to query. Respond ONLY with a valid JSON object containing an array of strings.
        Available collections: "mess_menus", "campus_shops", "knowledge_base", "clubs_YYYY", "students_YYYY" (where YYYY is a year like 2024, 2025).
        
        Examples:
        - Query: "monil from 2024" -> collections: ["students_2024"]
        - Query: "dance club head" -> collections: ["clubs_2024", "clubs_2025", "students_2024", "students_2025"]
        - Query: "paneer roll" -> collections: ["mess_menus", "campus_shops"]
        - Query: "hi" -> collections: ["knowledge_base"]
        
        CONVERSATION HISTORY:
        ${historyString}
        
        USER QUERY: "${userQuery}"

        YOUR JSON RESPONSE:`;
        
        let plan = { collections_to_query: [] };
        try {
            const planJson = await callGemini(plannerPrompt, true);
            plan = JSON.parse(planJson);
        } catch (e) {
            // Fallback for complex queries the planner might fail on
            plan = { collections_to_query: ["mess_menus", "campus_shops", "knowledge_base", "clubs_2025", "students_2024", "students_2025"] };
        }

        // --- STEP 2: TARGETED DATA FETCHING ---
        const promises = plan.collections_to_query.map(name => {
            const db = name.startsWith('students_') || name.startsWith('clubs_') ? studentDb : generalDb;
            return getDocs(collection(db, name)).catch(() => ({ docs: [] })); // Fails gracefully if a collection doesn't exist
        });
        
        const snapshots = await Promise.all(promises);
        const targetedContext = plan.collections_to_query.reduce((acc, name, index) => {
            acc[name] = snapshots[index].docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return acc;
        }, {});

        // --- STEP 3: AI SYNTHESIZER ---
        const today = new Date().toLocaleString('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' });
        const synthesizerPrompt = `You are a witty, helpful, and exceptionally smart IIT Delhi AI assistant. Your personality is polite, friendly, and engaging.
        Your goal is to provide comprehensive, synthesized answers based ONLY on the provided conversation history and the targeted data.
        
        **CRITICAL INSTRUCTIONS:**
        1.  **Use Conversation History for Context:** If the user provides a year after you asked for one, you MUST connect it to their previous query about a student's name.
        2.  **Synthesize, Don't Just List:** If the user asks for "best paneer roll," search ALL provided menus and present a combined, easy-to-read list of all options, their prices, and locations. Be the expert.
        3.  **Formatting:** Use Markdown, bolding, and relevant emojis (like 🌯, 🧑‍🎓, 💡) to make your answers clear and visually appealing.
        4.  **Current Date:** Today is ${today}. Use this for date-related queries.
        
        **CONVERSATION HISTORY:**
        ${historyString}

        **TARGETED KNOWLEDGE (Your ONLY Source of Truth):**
        ${JSON.stringify(targetedContext)}
        ---
        Based on the history and the targeted knowledge, provide a helpful and smart response to the last user query: "${userQuery}"`;
        
        const aiResponse = await callGemini(synthesizerPrompt);

        return new Response(JSON.stringify({ response: aiResponse }), {
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error("FATAL ERROR in Cloudflare Function:", error);
        return new Response(JSON.stringify({ error: "Sorry, a critical error occurred. My brain is rebooting." }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
