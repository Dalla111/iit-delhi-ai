import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, collection, getDocs, query } from "firebase/firestore";

// This is a Cloudflare Pages Function. It will handle all requests to /api/*
export async function onRequest(context) {
    // Only allow POST requests
    if (context.request.method !== 'POST') {
        return new Response('Invalid request method.', { status: 405 });
    }

    try {
        const { query: userQuery, mode, replyContext } = await context.request.json();
        const { env } = context; // Access environment variables (your secrets)

        // --- Select a random Firebase config from environment variables ---
        const dbPairs = JSON.parse(env.FIREBASE_CONFIGS);
        const selectedPair = dbPairs[Math.floor(Math.random() * dbPairs.length)];

        // --- Initialize Firebase connections ---
        const generalApp = initializeApp(selectedPair.general.config, selectedPair.general.name);
        const studentApp = initializeApp(selectedPair.student.config, selectedPair.student.name);
        const generalDb = getFirestore(generalApp);
        const studentDb = getFirestore(studentApp);

        // Sign in anonymously
        await Promise.all([
            signInAnonymously(getAuth(generalApp)),
            signInAnonymously(getAuth(studentApp))
        ]);
        
        // --- Gemini API Call Helper ---
        const callGemini = async (prompt, isJson = false) => {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${env.GEMINI_API_KEY}`;
            const payload = { contents: [{ parts: [{ text: prompt }] }] };
            if (isJson) { payload.generationConfig = { responseMimeType: "application/json" }; }

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                console.error("Gemini API Error:", response.status, await response.text());
                throw new Error("Failed to call Gemini API");
            }
            const result = await response.json();
            return result.candidates[0].content.parts[0].text;
        };

        // --- Intent Detection ---
        const intentDetectionPrompt = `Analyze the user's query for intent ('find_person', 'find_menu_or_shop', 'general_question'). Extract entities like 'name', 'year', 'hostel_name', 'shop_name'. Recognize abbreviations. Query: "${userQuery}". Respond ONLY with valid JSON.`;
        let intent = { intent: 'general_question' };
        try {
            const intentJson = await callGemini(intentDetectionPrompt, true);
            if (intentJson) intent = JSON.parse(intentJson.replace(/```json\n?|\n?```/g, ''));
        } catch (e) { console.error("Could not parse intent.", e); }

        // Adjust intent based on UI mode
        if (mode === 'food') intent.intent = 'find_menu_or_shop';
        if (mode === 'student' && intent.intent === 'general_question') {
             intent.intent = 'find_person';
             if (!intent.name) intent.name = userQuery;
        }

        // --- Logic based on intent ---
        let dbContext = "";
        let finalPrompt = "";

        if (intent.intent === 'find_menu_or_shop') {
            const [menuSnapshot, shopSnapshot] = await Promise.all([
                getDocs(collection(generalDb, "mess_menus")),
                getDocs(collection(generalDb, "campus_shops"))
            ]);
            const menuDocs = menuSnapshot.docs.map(doc => ({ type: 'Menu', ...doc.data() }));
            const shopDocs = shopSnapshot.docs.map(doc => ({ type: 'Shop', ...doc.data() }));
            dbContext = JSON.stringify([...menuDocs, ...shopDocs]);
            const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
            finalPrompt = `You are an expert on food at IIT Delhi. Answer based ONLY on the provided JSON "Context". Use the "Current Day" if the user asks for "today". Be friendly, use emojis, and list items/prices clearly.\n**Current Day:** ${today}\n**Context:** ${dbContext}\n---**User's Question:** "${userQuery}"`;
        
        } else if (intent.intent === 'find_person') {
            if (!intent.year) {
                return new Response(JSON.stringify({ 
                    isClarification: true, 
                    message: "Which entry year are you looking for? 🤔",
                    actions: [
                        { label: "2024", query: `${intent.name || userQuery} 2024` },
                        { label: "2023", query: `${intent.name || userQuery} 2023` },
                        { label: "2022", query: `${intent.name || userQuery} 2022` },
                    ]
                }), { headers: { 'Content-Type': 'application/json' } });
            }
            const collectionName = `students_${intent.year}`;
            const name = (intent.name || "").toLowerCase();
            const studentQuery = query(collection(studentDb, collectionName));
            const snapshot = await getDocs(studentQuery);
            const results = snapshot.docs
                .map(doc => ({ type: 'Student', ...doc.data() }))
                .filter(doc => doc.name.toLowerCase().includes(name));
            
            dbContext = results.length > 0 ? JSON.stringify(results) : `No student found with name containing "${name}" in the ${intent.year} directory.`;
            finalPrompt = `Answer the user's question about a student based ONLY on the provided context. If multiple people are found, ask for clarification. \n**Context:** ${dbContext}\n---**User's Question:** "${userQuery}"`;
        
        } else { // General question
            const generalQuery = query(collection(generalDb, "knowledge_base"));
            const snapshot = await getDocs(generalQuery);
            const docs = snapshot.docs.map(doc => ({ type: 'Knowledge', ...doc.data() }));
            dbContext = JSON.stringify(docs);
            finalPrompt = `Answer the user's general question based ONLY on the provided context. Be witty, helpful, and use Markdown and emojis.\n**Context:** ${dbContext}\n---**User's Question:** "${userQuery}"`;
        }

        let fullPrompt = finalPrompt;
        if (replyContext) {
            fullPrompt = `The user is replying to your previous message. Use this as primary context.\n**Replied-To Message:** "${replyContext.text}"\n\n---\n${finalPrompt}`;
        }
        
        const aiResponse = await callGemini(fullPrompt);
        
        // Return the final response to the client
        return new Response(JSON.stringify({ message: aiResponse }), {
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error("Function error:", error);
        return new Response(JSON.stringify({ error: "Sorry, a critical error occurred on the server." }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}