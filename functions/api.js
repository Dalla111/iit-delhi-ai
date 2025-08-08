// /functions/api.js - The Definitive, Fully-Featured Backend

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

// A robust function to initialize Firebase in a serverless environment, preventing crashes.
function initializeFirebaseApp(config, name) {
    const existingApp = getApps().find(app => app.name === name);
    if (existingApp) {
        return existingApp;
    }
    return initializeApp(config, name);
}

export async function onRequest(context) {
    if (context.request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        const { userQuery, conversationHistory, currentMode, replyingToMessage } = await context.request.json();
        const env = context.env;

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

        const dbPairs = [ { general: 'A1', student: 'A2' }, { general: 'B1', student: 'B2' }, { general: 'C1', student: 'C2' }, { general: 'D1', student: 'D2' }, { general: 'E1', student: 'E2' }];
        const selectedPair = dbPairs[Math.floor(Math.random() * dbPairs.length)];
        
        const generalApp = initializeFirebaseApp({ apiKey: env[`FIREBASE_API_KEY_${selectedPair.general}`], authDomain: env[`FIREBASE_AUTH_DOMAIN_${selectedPair.general}`], projectId: env[`FIREBASE_PROJECT_ID_${selectedPair.general}`] }, "general");
        const generalDb = getFirestore(generalApp);

        const studentApp = initializeFirebaseApp({ apiKey: env[`FIREBASE_API_KEY_${selectedPair.student}`], authDomain: env[`FIREBASE_AUTH_DOMAIN_${selectedPair.student}`], projectId: env[`FIREBASE_PROJECT_ID_${selectedPair.student}`] }, "student");
        const studentDb = getFirestore(studentApp);

        // --- Replicating the EXACT logic from your original, working prototype ---
        let dbContext = "";
        let finalPrompt = "";
        let replyContext = replyingToMessage ? `The user is directly replying to your previous message: "${replyingToMessage.text}"\n\n` : "";

        const intentDetectionPrompt = `Analyze the user's query to determine their primary intent and extract key entities. The intent can be 'find_person', 'find_club_members', 'find_menu_or_shop', or 'general_question'.
            - For 'find_menu_or_shop', extract 'hostel_name', 'shop_name', 'day', and 'meal'.
            - For 'find_person', extract 'name' and 'year'.
            - For 'find_club_members', extract 'club_name' and 'year'.
            - Recognize abbreviations: 'jwala'->'Jwalamukhi Hostel', 'ccd'->'Cafe Coffee Day', etc.
            User Query: "${userQuery}"
            Respond ONLY with a valid JSON object.`;
        
        let intent = { intent: 'general_question' };
        try {
            const intentJson = await callGemini(intentDetectionPrompt, true);
            if (intentJson) intent = JSON.parse(intentJson);
        } catch (e) { console.error("Could not parse intent.", e); }

        // --- Mode-based logic from your prototype ---
        if (currentMode === 'food' && intent.intent !== 'find_menu_or_shop') { intent.intent = 'find_menu_or_shop'; }
        if (currentMode === 'student' && intent.intent === 'general_question') { intent.intent = 'find_person'; intent.name = userQuery; }
        if (currentMode === 'general' && intent.intent !== 'general_question') { intent.intent = 'general_question'; }

        // --- Data fetching logic from your prototype ---
        if (intent.intent === 'find_menu_or_shop') {
            const [menuSnapshot, shopSnapshot] = await Promise.all([
                getDocs(collection(generalDb, "mess_menus")),
                getDocs(collection(generalDb, "campus_shops"))
            ]);
            const menuDocs = menuSnapshot.docs.map(doc => ({type: 'Menu', ...doc.data()}));
            const shopDocs = shopSnapshot.docs.map(doc => ({type: 'Shop', ...doc.data()}));
            dbContext = JSON.stringify([...menuDocs, ...shopDocs]);
            const today = new Date().toLocaleString('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' });
            finalPrompt = `You are an expert on all food at IIT Delhi. Answer based ONLY on the provided JSON "Context".
             - If the user asks about "tonight" or "today", use the provided "Current Day".
             - Be friendly, use emojis, and list items, prices, and hours clearly.
            **Current Day:** ${today}
            **Context:** ${dbContext}
            ---
            **User's Question:** "${userQuery}"`;

        } else if (intent.intent === 'find_person') {
            if (!intent.year) {
                return new Response(JSON.stringify({ response: "Which entry year are you looking for? e.g., 2024, 2025." }), { headers: { 'Content-Type': 'application/json' } });
            }
            const collectionName = `students_${intent.year}`;
            const name = intent.name ? intent.name.toLowerCase() : "";
            const studentQuery = collection(studentDb, collectionName);
            const snapshot = await getDocs(studentQuery);
            const results = [];
            snapshot.forEach(doc => {
                if (doc.data().name.toLowerCase().includes(name)) {
                    results.push({type: 'Student', ...doc.data()});
                }
            });
            dbContext = results.length > 0 ? JSON.stringify(results) : `No student found with that name in the ${intent.year} directory.`;
            finalPrompt = `Answer the user's question about a student based ONLY on the provided context. If multiple students are found, use the CLARIFY command: CLARIFY:[{"name":"Student Name 1", "entryNumber":"ID1"}, ...]
            **Context:** ${dbContext} --- **User's Question:** "${userQuery}"`;
        
        } else { // General question or other intents
            const snapshot = await getDocs(collection(generalDb, "knowledge_base"));
            const docs = snapshot.docs.map(doc => ({type: 'Knowledge', ...doc.data()}));
            dbContext = JSON.stringify(docs);
            finalPrompt = `Answer the user's general question based ONLY on the provided context.
            **Context:** ${dbContext} --- **User's Question:** "${userQuery}"`;
        }
        
        const fullPrompt = `${replyContext}${finalPrompt} Your response should be witty, helpful, and use Markdown and emojis.`;
        const aiResponse = await callGemini(fullPrompt);

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
