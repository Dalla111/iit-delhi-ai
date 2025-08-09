import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, getDocs, query, where, limit } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Replace process.env.NODE_ENV checks with this:
const isProduction = !window.location.hostname.includes('localhost') && 
                     !window.location.hostname.includes('pages.dev');

// Updated environment handling
let databasePairs, geminiApiKey;
try {
    if (!isProduction) {
        console.log("DATABASE_PAIRS received");
    }
    
    databasePairs = JSON.parse(window.DATABASE_PAIRS);
    geminiApiKey = window.GEMINI_API_KEY;
} catch (error) {
    console.error("Configuration error");
    
    const loader = document.getElementById('initial-loader') || document.getElementById('chat-box');
    if (loader) {
        loader.innerHTML = `
            <p class="text-red-500 font-bold p-4 text-center">
                Configuration Error
            </p>
            <p class="text-gray-400 text-center">Please contact support</p>
        `;
    }
    
    throw error;
}

// Rest of your code remains the same...
function setAppHeight() {
            const doc = document.documentElement;
            doc.style.setProperty('--app-height', `${window.innerHeight}px`);
        }
        window.addEventListener('resize', setAppHeight);
        setAppHeight();
        // We also need to adjust the style for the app container to use this variable
        document.getElementById('app-container').style.height = 'var(--app-height)';

        let generalDb, studentDb;
        let conversationHistory = [], replyingToMessage = null;
        let currentMode = 'general';
        let localKnowledgeBase = [];

        const chatContainer = document.getElementById('chat-container');
        const chatBox = document.getElementById('chat-box');
        const userInput = document.getElementById('user-input');
        const sendBtn = document.getElementById('send-btn');
        const funFactBtn = document.getElementById('fun-fact-btn');
        const replyContextBar = document.getElementById('reply-context-bar');
        const replyText = document.getElementById('reply-text');
        const cancelReplyBtn = document.getElementById('cancel-reply-btn');
        const modeGeneralBtn = document.getElementById('mode-general');
        const modeStudentBtn = document.getElementById('mode-student');
        const modeFoodBtn = document.getElementById('mode-food');
        

        async function callGemini(prompt, isJson = false) {
            const apiUrl = `/api/gemini`;
            const payload = { contents: [{ parts: [{ text: prompt }] }] };
            if (isJson) { payload.generationConfig = { responseMimeType: "application/json" }; }
            let attempt = 0;
            const maxAttempts = 5;
            while (attempt < maxAttempts) {
                try {
                    const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                    if (response.ok) { return (await response.json()).candidates[0].content.parts[0].text; }
                    if (response.status === 429) {
                        attempt++;
                        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                        await new Promise(res => setTimeout(res, delay));
                    } else { throw new Error(`API Error: ${response.status}`); }
                } catch (error) { return "Sorry, I encountered an error trying to connect to the AI service."; }
            }
            return "The AI service is currently busy. Please try again in a moment.";
        }

        const addChatMessage = (message, sender, options = {}) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'chat-message-wrapper';

            const avatar = document.createElement('div');
            avatar.className = `chat-avatar ${sender === 'user' ? 'avatar-user' : 'avatar-ai'}`;
            avatar.textContent = sender === 'user' ? 'You' : 'AI';

            const bubble = document.createElement('div');
            bubble.className = `chat-bubble ${sender}`;
            if (options.type === 'clarification') bubble.classList.add('clarification');
            
            const content = document.createElement('div');
            content.className = 'content';
            
            if (sender === 'ai') {
                const messageId = Date.now();
                bubble.dataset.messageId = messageId;
                bubble.dataset.messageText = message;
                const replyBtn = document.createElement('div');
                replyBtn.className = 'reply-btn';
                replyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>`;
                bubble.appendChild(replyBtn);
            }
            
            content.innerHTML = marked.parse(message);
            bubble.appendChild(content);

            if (sender === 'user') {
                wrapper.style.flexDirection = 'row-reverse';
            }
            
            wrapper.appendChild(avatar);
            wrapper.appendChild(bubble);

            if (options.actions) {
                const actionsWrapper = document.createElement('div');
                actionsWrapper.className = 'flex flex-wrap gap-2 mt-2 pl-12';
                options.actions.forEach(action => {
                    const button = document.createElement('button');
                    button.className = 'clarification-btn';
                    button.dataset.action = action.action;
                    button.dataset.query = action.query;
                    button.innerHTML = action.label;
                    actionsWrapper.appendChild(button);
                });
                chatBox.appendChild(wrapper);
                chatBox.appendChild(actionsWrapper);
            } else {
                 chatBox.appendChild(wrapper);
            }
            
            chatContainer.scrollTop = chatContainer.scrollHeight;
        };
        
        const showTypingIndicator = () => {
            if (chatBox.classList.contains('initial-center')) {
                chatBox.classList.remove('initial-center');
                chatBox.innerHTML = '';
            }
            const wrapper = document.createElement('div');
            wrapper.id = 'typing-indicator-wrapper';
            wrapper.className = 'chat-message-wrapper';
            
            const avatar = document.createElement('div');
            avatar.className = 'chat-avatar avatar-ai';
            avatar.textContent = 'AI';

            const indicator = document.createElement('div');
            indicator.id = 'typing-bubble';
            indicator.className = 'chat-bubble ai typing-indicator';
            indicator.innerHTML = '<div class="content"><span></span><span></span><span></span></div>';
            
            wrapper.appendChild(avatar);
            wrapper.appendChild(indicator);
            chatBox.appendChild(wrapper);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        };
        const removeTypingIndicator = () => { document.getElementById('typing-indicator-wrapper')?.remove(); };

        const handleSend = async (queryOverride) => {
    const userQuery = queryOverride || userInput.value.trim();
    if (!userQuery) return;

    const startButtonContainer = document.getElementById('start-chat-btn-container');
    if (startButtonContainer) startButtonContainer.remove();

    if (chatBox.classList.contains('initial-center')) {
        chatBox.classList.remove('initial-center');
        chatBox.innerHTML = ''; // Clear welcome message
    }

    addChatMessage(userQuery, 'user');
    conversationHistory.push({role: 'user', text: userQuery});
    
    if (!queryOverride) {
        userInput.value = '';
    }
    
    await getAiResponse(userQuery);
};
        
// Define conversation context at the top level with other variables
let conversationContext = {
    currentIntent: null,
    pendingField: null,
    collectedData: {}
};
// PASTE THIS ENTIRE NEW FUNCTION INTO YOUR SCRIPT
async function processCommand(commandString) {
    removeTypingIndicator(); // Ensure no typing indicator is left
    const parts = commandString.split('::');
    const action = parts[1];
    const url = parts[2];
    const responseOrData = parts[3];

    if (action === 'open_url') {
        addChatMessage(responseOrData, 'ai');
        window.open(url, '_blank');
    } else if (action === 'open_url_login') {
        const data = JSON.parse(responseOrData);
        addChatMessage(data.response, 'ai');
        window.open(url, '_blank');
        
        const username = sessionStorage.getItem('tempUsername');
        const password = sessionStorage.getItem('tempPassword');

        if (data.loginScript && username && password) {
            let personalizedScript = data.loginScript
                .replace('YOUR_USERNAME_HERE', username)
                .replace('YOUR_PASSWORD_HERE', password);
            
            addChatMessage("To complete the auto-login, please do the following:\n\n1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension.\n2. Create a new script and paste the code below.\n\nThis will securely log you in every time!", 'ai');
            
            const scriptContainer = document.createElement('div');
            scriptContainer.className = 'pl-12'; // Align with message bubble
            const scriptBlock = document.createElement('pre');
            scriptBlock.className = 'bg-gray-800 text-white p-4 rounded-md overflow-x-auto text-sm';
            scriptBlock.textContent = personalizedScript;
            scriptContainer.appendChild(scriptBlock);
            chatBox.appendChild(scriptContainer);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    }
}

const getAiResponse = async (userQuery) => {
  if (conversationContext.currentIntent === 'get_credentials') {
        const [username, password] = userQuery.split(/,|\s+/).filter(Boolean);
        if (username && password) {
            sessionStorage.setItem('tempUsername', username);
            sessionStorage.setItem('tempPassword', password);
            
            const originalData = conversationContext.collectedData;
            addChatMessage("Great! I've got your credentials for this session. Let's try opening that again.", 'ai');
            const command = `COMMAND::open_url_login::${originalData.url}::${JSON.stringify(originalData)}`;
            conversationContext = {};
            await processCommand(command);
            
            sendBtn.disabled = false;
            userInput.disabled = false;
            userInput.focus();
            return; 
        } else {
            addChatMessage("I didn't seem to get that right. Please provide your username and password separated by a space or comma.", 'ai');
            removeTypingIndicator();
            sendBtn.disabled = false; userInput.disabled = false; userInput.focus();
            return;
        }
    }
    sendBtn.disabled = true;
    userInput.disabled = true;
    showTypingIndicator();

    let context = "";
    let replyContext = "";
    let finalPrompt = "";
    
    // Handle continuation of existing conversation flow
    if (conversationContext.currentIntent && conversationContext.pendingField) {
        // Capture user's response to our follow-up question
        conversationContext.collectedData[conversationContext.pendingField] = userQuery;
        conversationContext.pendingField = null;
        
        // Update the UI to show we're continuing the conversation
        replyContextBar.classList.remove('hidden');
        replyText.textContent = `Continuing: Finding ${conversationContext.collectedData.name || "student"}`;
        
        // Reprocess the original intent with complete data
        userQuery = conversationContext.currentIntent === 'find_person' 
            ? `Find ${conversationContext.collectedData.name}, ${conversationContext.collectedData.year}`
            : userQuery;
    } else {
        // Reset context for new queries
        conversationContext = {
            currentIntent: null,
            pendingField: null,
            collectedData: {}
        };
    }

    if (replyingToMessage) {
        replyContext = `The user is directly replying to your previous message. Use this as the primary context.\n**Replied-To Message:** "${replyingToMessage.text}"\n\n`;
    }

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
    } catch(e) { 
        console.error("Could not parse intent.", e);
        // Fallback to simple intent detection
        if (userQuery.toLowerCase().includes("find") || userQuery.toLowerCase().includes("search")) {
            intent.intent = currentMode === 'student' ? 'find_person' : 
                           currentMode === 'food' ? 'find_menu_or_shop' : 'general_question';
        }
    }

    if (currentMode === 'food' && intent.intent !== 'find_menu_or_shop') { 
        intent.intent = 'find_menu_or_shop'; 
    }
    if (currentMode === 'student' && intent.intent === 'general_question') { 
        intent.intent = 'find_person'; 
        if (!intent.name) intent.name = userQuery;
    }
    if (currentMode === 'general' && intent.intent !== 'general_question') { 
        intent.intent = 'general_question'; 
    }

    // Handle multi-step conversations
    if (intent.intent === 'find_person') {
        if (!intent.year && !conversationContext.collectedData.year) {
            // Set context for follow-up
            conversationContext = {
                currentIntent: 'find_person',
                pendingField: 'year',
                collectedData: { 
                    name: intent.name || userQuery,
                    originalQuery: userQuery
                }
            };
            
            // Ask for missing information
            addChatMessage("Which entry year are you looking for? e.g., 2024, 2025.", 'ai', {type: 'clarification'});
            
            // Update UI
            replyContextBar.classList.remove('hidden');
            replyText.textContent = `Asking for: Entry year`;
            
            // Reset input state
            removeTypingIndicator();
            sendBtn.disabled = false;
            userInput.disabled = false;
            userInput.focus();
            return;
        }
        
        // Use collected data if available
        const year = intent.year || conversationContext.collectedData.year;
        const name = intent.name || conversationContext.collectedData.name || userQuery;
        
        const collectionName = `students_${year}`;
        const nameQuery = name.toLowerCase();
        const studentQuery = query(collection(studentDb, collectionName));
        const snapshot = await getDocs(studentQuery);
        const results = [];
        
        snapshot.forEach(doc => {
            const studentName = doc.data().name.toLowerCase();
            if (studentName.includes(nameQuery)) {
                results.push({type: 'Student', ...doc.data()});
            }
        });
        
        context = results.length > 0 
            ? JSON.stringify(results) 
            : `No student found with name "${name}" in the ${year} directory.`;
            
        finalPrompt = `Answer the user's question about a student based ONLY on the provided context. 
            If multiple students are in the context, use the CLARIFY command.
            **Context:** ${context} 
            --- 
            **User's Question:** "${userQuery}"`;

    } else if (intent.intent === 'find_menu_or_shop') {
        const [menuSnapshot, shopSnapshot] = await Promise.all([
            getDocs(collection(generalDb, "mess_menus")),
            getDocs(collection(generalDb, "campus_shops"))
        ]);
        
        const menuDocs = menuSnapshot.docs.map(doc => ({type: 'Menu', ...doc.data()}));
        const shopDocs = shopSnapshot.docs.map(doc => ({type: 'Shop', ...doc.data()}));
        context = JSON.stringify([...menuDocs, ...shopDocs]);
        
        const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const today = daysOfWeek[new Date().getDay()];
        
        finalPrompt = `You are an expert on all food at IIT Delhi (hostel messes and campus shops). 
            Answer the user's question based ONLY on the provided JSON "Context".
            - Search through all hostel menus and shop menus to find the answer.
            - If the user asks about "tonight" or "today", use the provided "Current Day".
            - Be friendly and use emojis. List items, prices, and hours clearly.
            **Current Day:** ${today}
            **Context:** ${context}
            ---
            **User's Question:** "${userQuery}"`;

} else { // General question
    let searchKeyword;
    const lowerCaseQuery = userQuery.toLowerCase();

    if (lowerCaseQuery.includes("new moodle")) {
        searchKeyword = "new moodle";
    } else if (lowerCaseQuery.includes("moodle")) {
        searchKeyword = "moodle";
    } else {
        searchKeyword = lowerCaseQuery.split(' ').find(k => k.length > 3) || lowerCaseQuery;
    }

    const generalQuery = query(collection(generalDb, "knowledge_base"), where("keywords", "array-contains", searchKeyword), limit(1));
    const snapshot = await getDocs(generalQuery);
    let contextData = {};
    if (!snapshot.empty) {
        contextData = snapshot.docs[0].data();
    }
    
    removeTypingIndicator();

    if (contextData.action === 'open_url') {
        const storedUsername = sessionStorage.getItem('tempUsername');

        if (contextData.loginScript && !storedUsername) {
            addChatMessage(`${contextData.response} I can also help you log in automatically. For this session, would you like to provide your Kerberos ID and password?`, 'ai', {
                actions: [
                    { label: "Yes, help me log in", query: `login to ${contextData.topic}` },
                    { label: "No, just open the page", query: `open ${contextData.topic} without login` }
                ]
            });
        } else {
            await processCommand(`COMMAND::open_url_login::${contextData.url}::${JSON.stringify(contextData)}`);
        }
        
    } else if (userQuery.startsWith('login to')) {
        const topic = userQuery.replace('login to ', '').trim();
        const q = query(collection(generalDb, "knowledge_base"), where("topic", "==", topic), limit(1));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            contextData = snapshot.docs[0].data();
            conversationContext = { currentIntent: 'get_credentials', collectedData: contextData };
            addChatMessage("Please type your username and password, separated by a space. I'll only remember it for this session.\n\n**Warning:** This is for demonstration. Never share passwords with a real chatbot.", 'ai');
        }

    } else if (userQuery.endsWith('without login')) {
        const topic = userQuery.replace(' without login', '').replace('open ', '').trim();
        const q = query(collection(generalDb, "knowledge_base"), where("topic", "==", topic), limit(1));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            contextData = snapshot.docs[0].data();
            await processCommand(`COMMAND::open_url::${contextData.url}::${contextData.response}`);
        }
    } else {
        // This is the fallback that preserves your original general question logic
        const docs = (await getDocs(query(collection(generalDb, "knowledge_base"), limit(50)))).docs.map(doc => ({type: 'Knowledge', ...doc.data()}));
        const context = JSON.stringify(docs);
        finalPrompt = `Answer the user's question: "${userQuery}". Use this context if relevant: ${context}. If the context is not relevant, say you don't know.`;
        const aiResponse = await callGemini(finalPrompt);
        addChatMessage(aiResponse || "I'm not sure how to help with that, but I'm learning!", 'ai');
    }
}
    
    const fullPrompt = `${replyContext}${finalPrompt} Your response should be witty, helpful, and use Markdown and emojis.`;
    const aiResponse = await callGemini(fullPrompt);
    removeTypingIndicator();

    // This new logic checks for the special "COMMAND::" prefix.
    if (aiResponse && aiResponse.startsWith("COMMAND::")) {
        const parts = aiResponse.split('::');
        // Expected format: ['COMMAND', 'action_type', 'url', 'text_response']
        const actionType = parts[1];
        const url = parts[2];
        const textResponse = parts[3];

        if (actionType === 'open_url' && url) {
            // 1. Display the friendly message from the database in the chat.
            addChatMessage(textResponse || "Opening now...", 'ai');
            conversationHistory.push({role: 'ai', text: textResponse});
            
            // 2. Open the URL from the database in a new browser tab.
            window.open(url, '_blank');
        } else {
            // Fallback for a malformed command.
            addChatMessage("I understood the command but couldn't execute it properly.", 'ai');
        }
    } else if (aiResponse && aiResponse.startsWith("CLARIFY:")) {
        try {
            const jsonStr = aiResponse.substring(8);
            const students = JSON.parse(jsonStr);
            let clarificationHtml = "I found a few people with that name! 🤔 Which one are you looking for?<div class='flex flex-wrap gap-2 mt-2'>";
            
            students.forEach(student => {
                clarificationHtml += `<button class="clarification-btn" data-entry="${student.entryNumber}">${student.name}</button>`;
            });
            
            clarificationHtml += "</div>";
            addChatMessage(clarificationHtml, 'ai', {type: 'clarification'});
        } catch(e) {
            addChatMessage("I found a few people with that name, but had a little trouble listing them out. Could you be more specific?", 'ai');
        }
    } else {
        addChatMessage(aiResponse || "Sorry, I couldn't get a response.", 'ai');
        conversationHistory.push({role: 'ai', text: aiResponse});
    }


    if (replyingToMessage) {
        replyingToMessage = null;
        replyContextBar.classList.add('hidden');
    }

    // Reset conversation context after successful completion
    conversationContext = {
        currentIntent: null,
        pendingField: null,
        collectedData: {}
    };

    sendBtn.disabled = false;
    userInput.disabled = false;
    userInput.focus();
};

        function setMode(mode) {
            currentMode = mode;
            [modeGeneralBtn, modeStudentBtn, modeFoodBtn].forEach(btn => btn.classList.remove('active'));

            if (mode === 'student') {
                modeStudentBtn.classList.add('active');
                userInput.placeholder = "Search for a student by name & year...";
            } else if (mode === 'food') {
                modeFoodBtn.classList.add('active');
                userInput.placeholder = "What's on the menu at Jwala tonight?";
            } else {
                modeGeneralBtn.classList.add('active');
                userInput.placeholder = "Ask about clubs, events, places...";
            }
        }

async function main() {
    try {
        const selectedPair = databasePairs[Math.floor(Math.random() * databasePairs.length)];
        
        if (!isProduction) {
            console.log(`Connecting to database pair`);
        }

        const generalApp = initializeApp(selectedPair.general.config, selectedPair.general.name);
        const studentApp = initializeApp(selectedPair.student.config, selectedPair.student.name);
        generalDb = getFirestore(generalApp);
        studentDb = getFirestore(studentApp);

        await Promise.all([
            signInAnonymously(getAuth(generalApp)),
            signInAnonymously(getAuth(studentApp))
        ]);
        
        const loader = document.getElementById('initial-loader');
        if(loader) loader.remove();
        
        addChatMessage("Hey there! I'm the IITD AI Assistant, fully synced and ready to help. What's up? 🚀", 'ai');
        
        const startButtonContainer = document.createElement('div');
        startButtonContainer.id = 'start-chat-btn-container';
        startButtonContainer.className = 'flex justify-center mt-4';
        startButtonContainer.innerHTML = `<button id="start-chat-btn" class="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-full hover:bg-indigo-700 transition-all shadow-lg">Let's get started ✨</button>`;
        chatBox.appendChild(startButtonContainer);

        document.getElementById('start-chat-btn').addEventListener('click', () => {
            if (chatBox.classList.contains('initial-center')) {
                chatBox.classList.remove('initial-center');
            }
            startButtonContainer.remove();
            userInput.focus();
        });

        sendBtn.addEventListener('click', handleSend);
        userInput.addEventListener('keypress', (e) => { 
            if (e.key === 'Enter') handleSend(); 
        });
        
        modeGeneralBtn.addEventListener('click', () => setMode('general'));
        modeStudentBtn.addEventListener('click', () => setMode('student'));
        modeFoodBtn.addEventListener('click', () => setMode('food'));

        cancelReplyBtn.addEventListener('click', () => { 
            replyingToMessage = null;
            replyContextBar.classList.add('hidden');
        });

        funFactBtn.addEventListener('click', async () => { 
            const startButton = document.getElementById('start-chat-btn-container');
            if(startButton) startButton.remove();
            if (chatBox.classList.contains('initial-center')) {
                chatBox.classList.remove('initial-center');
                chatBox.innerHTML = '';
            }
            addChatMessage("Let me check my archives for a fun fact...", 'user');
            const prompt = "Tell me a fun, interesting, or little-known fact about IIT Delhi, its history, campus, or a notable achievement. Make it sound exciting!";
            await getAiResponse(prompt);
        });

        chatBox.addEventListener('click', async (e) => { 
            const replyBtn = e.target.closest('.reply-btn');
            if (replyBtn) {
                const bubble = replyBtn.closest('.chat-bubble');
                replyingToMessage = { id: bubble.dataset.messageId, text: bubble.dataset.messageText };
                replyText.textContent = `"${replyingToMessage.text.substring(0, 50)}..."`;
                replyContextBar.classList.remove('hidden');
                userInput.focus();
                return;
            }

            const clarificationBtn = e.target.closest('.clarification-btn');
    if (clarificationBtn && clarificationBtn.dataset.query) {
        // This is NEW: handles login buttons
        handleSend(clarificationBtn.dataset.query);
    } else if (clarificationBtn) {
                const startButton = document.getElementById('start-chat-btn-container');
                if(startButton) startButton.remove();
                if (chatBox.classList.contains('initial-center')) {
                    chatBox.classList.remove('initial-center');
                    chatBox.innerHTML = '';
                }
                const entryNumber = clarificationBtn.dataset.entry;
                const student = localKnowledgeBase.find(doc => doc.type === 'Student' && doc.entryNumber === entryNumber);
                if (student) {
                    addChatMessage(`Okay, you selected **${student.name}**. What would you like to know?`, 'user');
                    await getAiResponse(`Tell me about the student: ${JSON.stringify(student)}`);
                }
            }
        });

        chatBox.addEventListener('dblclick', (e) => {
            const bubble = e.target.closest('.chat-bubble.ai');
            if (bubble && bubble.dataset.messageId) {
                replyingToMessage = { id: bubble.dataset.messageId, text: bubble.dataset.messageText };
                replyText.textContent = `"${replyingToMessage.text.substring(0, 50)}..."`;
                replyContextBar.classList.remove('hidden');
                userInput.focus();
            }
        });

    } catch (error) {
        console.error("Initialization failed");
        const loader = document.getElementById('initial-loader') || document.getElementById('chat-box');
        if(loader) {
            loader.innerHTML = `
                <p class="text-red-500 font-bold p-4 text-center">
                    System Error: Could not initialize application
                </p>
                <p class="text-gray-400 text-center">Please try refreshing the page</p>
                <p class="text-gray-400 text-center">If the problem persists, contact support</p>
            `;
        }
    }
}


        main();


