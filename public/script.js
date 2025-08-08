import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, getDocs, query, where, limit } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Environment variables

// Get environment variables from Cloudflare
const env = {
    GEMINI_API_KEY: window.GEMINI_API_KEY,
    DATABASE_PAIRS: JSON.parse(window.DATABASE_PAIRS)
};

// Then use these in your code:
const databasePairs = env.DATABASE_PAIRS;
const geminiApiKey = env.GEMINI_API_KEY;

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

        const handleSend = async () => {
            const userQuery = userInput.value.trim();
            if (!userQuery) return;

            const startButtonContainer = document.getElementById('start-chat-btn-container');
            if (startButtonContainer) startButtonContainer.remove();

            if (chatBox.classList.contains('initial-center')) {
                chatBox.classList.remove('initial-center');
                chatBox.innerHTML = ''; // Clear welcome message
            }

            addChatMessage(userQuery, 'user');
            conversationHistory.push({role: 'user', text: userQuery});
            userInput.value = '';
            await getAiResponse(userQuery);
        };
        
        const getAiResponse = async (userQuery) => {
            sendBtn.disabled = true;
            userInput.disabled = true;
            showTypingIndicator();

            let context = "";
            let replyContext = "";
            let finalPrompt = "";

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
            } catch(e) { console.error("Could not parse intent.", e); }

            if (currentMode === 'food' && intent.intent !== 'find_menu_or_shop') { intent.intent = 'find_menu_or_shop'; }
            if (currentMode === 'student' && intent.intent === 'general_question') { intent.intent = 'find_person'; intent.name = userQuery; }
            if (currentMode === 'general' && intent.intent !== 'general_question') { intent.intent = 'general_question'; }

            if (intent.intent === 'find_menu_or_shop') {
                const [menuSnapshot, shopSnapshot] = await Promise.all([
                    getDocs(collection(generalDb, "mess_menus")),
                    getDocs(collection(generalDb, "campus_shops"))
                ]);
                const menuDocs = menuSnapshot.docs.map(doc => ({type: 'Menu', ...doc.data()}));
                const shopDocs = shopSnapshot.docs.map(doc => ({type: 'Shop', ...doc.data()}));
                context = JSON.stringify([...menuDocs, ...shopDocs]);
                
                const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                const today = daysOfWeek[new Date().getDay()];
                finalPrompt = `You are an expert on all food at IIT Delhi (hostel messes and campus shops). Answer the user's question based ONLY on the provided JSON "Context".
                - Search through all hostel menus and shop menus to find the answer.
                - If the user asks about "tonight" or "today", use the provided "Current Day".
                - Be friendly and use emojis. List items, prices, and hours clearly.
                **Current Day:** ${today}
                **Context:** ${context}
                ---
                **User's Question:** "${userQuery}"`;

            } else if (intent.intent === 'find_person') {
                if (!intent.year) {
                    addChatMessage("Which entry year are you looking for? e.g., 2024, 2025.", 'ai', {type: 'clarification'});
                    removeTypingIndicator(); sendBtn.disabled = false; userInput.disabled = false; userInput.focus(); return;
                }
                const collectionName = `students_${intent.year}`;
                const name = intent.name ? intent.name.toLowerCase() : "";
                const studentQuery = query(collection(studentDb, collectionName));
                const snapshot = await getDocs(studentQuery);
                const results = [];
                snapshot.forEach(doc => {
                    if (doc.data().name.toLowerCase().includes(name)) {
                        results.push({type: 'Student', ...doc.data()});
                    }
                });
                context = results.length > 0 ? JSON.stringify(results) : `No student found with that name in the ${intent.year} directory.`;
                finalPrompt = `Answer the user's question about a student based ONLY on the provided context. If multiple students are in the context, use the CLARIFY command.
                **Context:** ${context} --- **User's Question:** "${userQuery}"`;
            } else { 
                const generalQuery = query(collection(generalDb, "knowledge_base"), limit(50));
                const snapshot = await getDocs(generalQuery);
                const docs = snapshot.docs.map(doc => ({type: 'Knowledge', ...doc.data()}));
                context = JSON.stringify(docs);
                finalPrompt = `Answer the user's general question based ONLY on the provided context.
                **Context:** ${context} --- **User's Question:** "${userQuery}"`;
            }
            
            const fullPrompt = `${replyContext}${finalPrompt} Your response should be witty, helpful, and use Markdown and emojis.`;
            const aiResponse = await callGemini(fullPrompt);
            removeTypingIndicator();

            if (aiResponse && aiResponse.startsWith("CLARIFY:")) {
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
                console.log(`Connecting to database pair: ${selectedPair.general.name} & ${selectedPair.student.name}`);

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
                userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSend(); });
                
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
                    if (clarificationBtn) {
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
                console.error("Initialization failed:", error);
                const loader = document.getElementById('initial-loader') || document.getElementById('chat-box');
                if(loader) {
                    loader.innerHTML = `<p class="text-red-500 font-bold p-4 text-center">Error: Could not initialize the application. Please check the console.</p>`;
                }
            }
        }


        main();

