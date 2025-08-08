import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, limit } from "firebase/firestore";

// This is the main handler for your Cloudflare Function.
// It is the new, secure, server-side version of your 'getAiResponse' function.
// This is the new, correct version.
export async function onRequest(context) {
    // Only allow POST requests for security
    if (context.request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        // 1. Get data from the frontend (user's query, current mode, etc.)
        const { userQuery, mode, replyContext } = await context.request.json();
        const env = context.env; // Access to your secret API keys

        // --- Helper function to call the Gemini API securely ---
        const callGemini = async (prompt, isJson = false) => {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${env.GEMINI_API_KEY}`;
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
                console.error("Gemini API Error:", await response.text());
                throw new Error(`Gemini API error! status: ${response.status}`);
            }
            const data = await response.json();
            return data.candidates[0].content.parts[0].text;
        };

        // 2. Initialize Firebase Databases (same random selection logic)
        const dbPairs = [
            { general: 'A1', student: 'A2' }, { general: 'B1', student: 'B2' },
            { general: 'C1', student: 'C2' }, { general: 'D1', student: 'D2' },
            { general: 'E1', student: 'E2' },
        ];
        const selectedPair = dbPairs[Math.floor(Math.random() * dbPairs.length)];
        
        const generalApp = initializeApp({
            apiKey: env[`FIREBASE_API_KEY_${selectedPair.general}`],
            authDomain: env[`FIREBASE_AUTH_DOMAIN_${selectedPair.general}`],
            projectId: env[`FIREBASE_PROJECT_ID_${selectedPair.general}`]
        }, `general-${Date.now()}`);
        const generalDb = getFirestore(generalApp);

        const studentApp = initializeApp({
            apiKey: env[`FIREBASE_API_KEY_${selectedPair.student}`],
            authDomain: env[`FIREBASE_AUTH_DOMAIN_${selectedPair.student}`],
            projectId: env[`FIREBASE_PROJECT_ID_${selectedPair.student}`]
        }, `student-${Date.now()}`);
        const studentDb = getFirestore(studentApp);


        // 3. Replicate the EXACT logic from your original function
        let finalPrompt = "";
        let dbContext = "";

        // --- Intent Detection (moved to backend) ---
        const intentDetectionPrompt = `Analyze the user's query to determine their primary intent and extract key entities. The intent can be 'find_person', 'find_menu_or_shop', or 'general_question'.
            - For 'find_menu_or_shop', extract 'hostel_name', 'shop_name', 'day', and 'meal'.
            - For 'find_person', extract 'name' and 'year'.
            - Recognize abbreviations: 'jwala'->'Jwalamukhi Hostel', 'ccd'->'Cafe Coffee Day'.
            User Query: "${userQuery}"
            Respond ONLY with a valid JSON object.`;
        
        let intent = { intent: 'general_question' };
        try {
            const intentJson = await callGemini(intentDetectionPrompt, true);
            if (intentJson) intent = JSON.parse(intentJson);
        } catch (e) { console.error("Could not parse intent.", e); }

        // --- Mode-based Overrides (logic preserved) ---
        if (mode === 'food' && intent.intent !== 'find_menu_or_shop') { intent.intent = 'find_menu_or_shop'; }
        if (mode === 'student' && intent.intent === 'general_question') { intent.intent = 'find_person'; intent.name = userQuery; }
        if (mode === 'general' && intent.intent !== 'general_question') { intent.intent = 'general_question'; }

        // --- Branching Logic based on Intent (preserved) ---

        if (intent.intent === 'find_menu_or_shop') {
            const [menuSnapshot, shopSnapshot] = await Promise.all([
                getDocs(collection(generalDb, "mess_menus")),
                getDocs(collection(generalDb, "campus_shops"))
            ]);
            const menuDocs = menuSnapshot.docs.map(doc => ({ type: 'Menu', ...doc.data() }));
            const shopDocs = shopSnapshot.docs.map(doc => ({ type: 'Shop', ...doc.data() }));
            dbContext = JSON.stringify([...menuDocs, ...shopDocs]);
            
            // Note: `new Date()` runs on the server, getting the correct current day.
            const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
            const today = daysOfWeek[new Date().getDay()]; // Friday
            finalPrompt = `You are an expert on all food at IIT Delhi. Answer based ONLY on the provided JSON "Context".
             - If the user asks about "tonight" or "today", use the provided "Current Day".
             - Be friendly and use emojis. List items, prices, and hours clearly.
            **Current Day:** ${today}
            **Context:** ${dbContext}
            ---
            **User's Question:** "${userQuery}"`;

        } else if (intent.intent === 'find_person') {
            if (!intent.year) {
                // Return a simple clarification message directly
                const responsePayload = { response: "Please specify the entry year to search for a student, e.g., 'Rohan Sharma 2024'." };
                return new Response(JSON.stringify(responsePayload), { headers: { 'Content-Type': 'application/json' } });
            }
            const collectionName = `students_${intent.year}`;
            const name = intent.name ? intent.name.toLowerCase() : "";
            const studentQuery = query(collection(studentDb, collectionName));
            const snapshot = await getDocs(studentQuery);
            const results = [];
            snapshot.forEach(doc => {
                const studentData = doc.data();
                if (studentData.name && studentData.name.toLowerCase().includes(name)) {
                    results.push({ type: 'Student', ...studentData });
                }
            });

            if (results.length > 1) {
                // **CLARIFICATION LOGIC**: If multiple students found, send the special command back.
                const responsePayload = { response: `CLARIFY:${JSON.stringify(results)}` };
                return new Response(JSON.stringify(responsePayload), { headers: { 'Content-Type': 'application/json' } });
            }
            
            dbContext = results.length > 0 ? JSON.stringify(results) : `No student found with name matching "${name}" in the ${intent.year} directory.`;
            finalPrompt = `Answer the user's question about a student based ONLY on the provided context.
            **Context:** ${dbContext} --- **User's Question:** "${userQuery}"`;
            
        } else { // 'general_question'
            const generalQuery = query(collection(generalDb, "knowledge_base"), limit(50));
            const snapshot = await getDocs(generalQuery);
            const docs = snapshot.docs.map(doc => ({ type: 'Knowledge', ...doc.data() }));
            dbContext = JSON.stringify(docs);
            finalPrompt = `Answer the user's general question about IIT Delhi based ONLY on the provided context.
            **Context:** ${dbContext} --- **User's Question:** "${userQuery}"`;
        }
        
        // 4. Construct the Final Prompt and Get AI Response
        const fullPrompt = `${replyContext}${finalPrompt} Your response should be witty, helpful, and use Markdown and emojis.`;
        const aiResponse = await callGemini(fullPrompt);

        // 5. Send the final, generated response back to the frontend
        const responsePayload = { response: aiResponse };
        return new Response(JSON.stringify(responsePayload), {
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error("Error in Cloudflare Function:", error);
        return new Response(JSON.stringify({ error: "Sorry, a problem occurred on my end. The engineers have been notified." }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

}


