document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
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
    const initialLoader = document.getElementById('initial-loader');

    // --- State ---
    let conversationHistory = [];
    let replyingToMessage = null;
    let currentMode = 'general';

    // --- UI Functions ---
    const addChatMessage = (message, sender, options = {}) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'chat-message-wrapper';

        const avatar = document.createElement('div');
        avatar.className = `chat-avatar ${sender === 'user' ? 'avatar-user' : 'avatar-ai'}`;
        avatar.textContent = sender === 'user' ? 'You' : 'AI';

        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${sender}`;
        
        const content = document.createElement('div');
        content.className = 'content';
        content.innerHTML = marked.parse(message);
        bubble.appendChild(content);

        if (sender === 'ai') {
            const messageId = Date.now();
            bubble.dataset.messageId = messageId;
            bubble.dataset.messageText = message;
            const replyBtn = document.createElement('div');
            replyBtn.className = 'reply-btn';
            replyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>`;
            bubble.appendChild(replyBtn);
        }

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
                button.textContent = action.label;
                button.addEventListener('click', () => handleSend(action.query));
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
        if (document.getElementById('typing-indicator-wrapper')) return;
        const wrapper = document.createElement('div');
        wrapper.id = 'typing-indicator-wrapper';
        wrapper.className = 'chat-message-wrapper';
        
        const avatar = document.createElement('div');
        avatar.className = 'chat-avatar avatar-ai';
        avatar.textContent = 'AI';

        const indicator = document.createElement('div');
        indicator.className = 'chat-bubble ai typing-indicator';
        indicator.innerHTML = '<div class="content"><span></span><span></span><span></span></div>';
        
        wrapper.appendChild(avatar);
        wrapper.appendChild(indicator);
        chatBox.appendChild(wrapper);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    };

    const removeTypingIndicator = () => document.getElementById('typing-indicator-wrapper')?.remove();

    const setMode = (mode) => {
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
    };

    // --- Core Logic ---
    const handleSend = async (queryOverride) => {
        const userQuery = queryOverride || userInput.value.trim();
        if (!userQuery) return;

        if (chatBox.classList.contains('initial-center')) {
            chatBox.classList.remove('initial-center');
            chatBox.innerHTML = ''; // Clear welcome message
        }

        addChatMessage(userQuery, 'user');
        conversationHistory.push({ role: 'user', text: userQuery });
        if (!queryOverride) userInput.value = '';
        
        await getAiResponse(userQuery);
    };

    const getAiResponse = async (userQuery) => {
        sendBtn.disabled = true;
        userInput.disabled = true;
        showTypingIndicator();

        try {
            const response = await fetch('/api/proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: userQuery,
                    mode: currentMode,
                    replyContext: replyingToMessage
                }),
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            const data = await response.json();
            removeTypingIndicator();

            if (data.error) {
                addChatMessage(data.error, 'ai');
            } else if (data.isClarification) {
                addChatMessage(data.message, 'ai', { actions: data.actions });
            } else {
                addChatMessage(data.message, 'ai');
                conversationHistory.push({ role: 'ai', text: data.message });
            }

        } catch (error) {
            console.error("Fetch error:", error);
            removeTypingIndicator();
            addChatMessage("Sorry, I'm having trouble connecting to the network. Please try again later.", 'ai');
        } finally {
            if (replyingToMessage) {
                replyingToMessage = null;
                replyContextBar.classList.add('hidden');
            }
            sendBtn.disabled = false;
            userInput.disabled = false;
            userInput.focus();
        }
    };
    
    // --- Initial Setup & Event Listeners ---
    const initialize = () => {
        if(initialLoader) initialLoader.remove();
        addChatMessage("Hey there! I'm the IITD AI Assistant, fully synced and ready to help. What's up? 🚀", 'ai');
        userInput.focus();

        sendBtn.addEventListener('click', () => handleSend());
        userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSend(); });
        
        modeGeneralBtn.addEventListener('click', () => setMode('general'));
        modeStudentBtn.addEventListener('click', () => setMode('student'));
        modeFoodBtn.addEventListener('click', () => setMode('food'));

        funFactBtn.addEventListener('click', async () => {
            if (chatBox.classList.contains('initial-center')) {
                chatBox.classList.remove('initial-center');
                chatBox.innerHTML = '';
            }
            addChatMessage("Let me check my archives for a fun fact...", 'user');
            await getAiResponse("Tell me a fun fact about IIT Delhi.");
        });

        cancelReplyBtn.addEventListener('click', () => {
            replyingToMessage = null;
            replyContextBar.classList.add('hidden');
        });

        chatBox.addEventListener('click', (e) => {
            const replyBtn = e.target.closest('.reply-btn');
            if (replyBtn) {
                const bubble = replyBtn.closest('.chat-bubble');
                replyingToMessage = { id: bubble.dataset.messageId, text: bubble.dataset.messageText };
                replyText.textContent = `"${replyingToMessage.text.substring(0, 50)}..."`;
                replyContextBar.classList.remove('hidden');
                userInput.focus();
            }
        });
    };

    initialize();
});