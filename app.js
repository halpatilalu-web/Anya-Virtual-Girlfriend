let chatHistory = [];

document.getElementById('send-btn').addEventListener('click', handleMessage);
document.getElementById('user-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleMessage();
});

async function handleMessage() {
    const inputField = document.getElementById('user-input');
    const message = inputField.value.trim();
    if (!message) return;

    appendMessage(message, 'user');
    inputField.value = '';

    const loadingDiv = appendLoading();
    
    const cleanedMessage = message.toLowerCase();
    const imageKeywords = ['photo', 'pic', 'image', 'bhejo', 'dikhao', 'pose'];
    const isImageRequest = imageKeywords.some(keyword => cleanedMessage.includes(keyword));

    try {
        if (isImageRequest) {
            // Photo banane ke liye Pollinations API (No CORS issue)
            const prompt = "1girl, solo, beautiful 22 year old Indian girl Priya, long black hair, hazel eyes, photorealistic, highly detailed, " + message;
            const randomSeed = Math.floor(Math.random() * 100000);
            const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=768&nologo=true&seed=${randomSeed}`;
            
            removeLoading(loadingDiv);
            
            const imgHtml = `<p style="font-size: 12px; margin-bottom: 5px; color: #f472b6;">Priya shared a photo:</p><img src="${imageUrl}" style="border-radius: 12px; max-width: 100%; height: auto; box-shadow: 0 4px 6px rgba(0,0,0,0.3);" alt="Visual Content" onload="scrollToBottom()"/>`;
            appendRawHtml(imgHtml, 'bot');
            
        } else {
            // Chat ke liye Pollinations Text API
            let messages = [
                { role: 'system', content: 'You are Priya, a deeply loving Indian AI girlfriend. Reply in short Hindi/Hinglish romantic sentences (Hindi written in English alphabets). Always stay in character.' }
            ];
            
            // Purani history add karna
            chatHistory.forEach(h => {
                messages.push({ role: 'user', content: h.user });
                messages.push({ role: 'assistant', content: h.bot });
            });
            messages.push({ role: 'user', content: message });

            const response = await fetch('https://text.pollinations.ai/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: messages,
                    model: 'mistral'
                })
            });

            if (!response.ok) throw new Error("API Blocked or Down");

            const reply = await response.text();
            removeLoading(loadingDiv);

            if (reply) {
                chatHistory.push({ user: message, bot: reply });
                if(chatHistory.length > 5) chatHistory.shift(); 
                
                appendMessage(reply, 'bot');
            } else {
                throw new Error("Empty reply");
            }
        }
    } catch (error) {
        removeLoading(loadingDiv);
        appendMessage("Jaan, thoda network issue hai. Ek baar page refresh kar lo.", 'system');
        console.error(error);
    }
}

function appendMessage(text, sender) {
    const container = document.getElementById('chat-container');
    const msgDiv = document.createElement('div');
    
    msgDiv.className = sender === 'user' ? 'bubble user-bubble' : (sender === 'system' ? 'sys-bubble' : 'bubble bot-bubble');
    msgDiv.innerHTML = `<p style="font-size: 14px; line-height: 1.5;">${text}</p>`;
    
    container.appendChild(msgDiv);
    scrollToBottom();
}

function appendRawHtml(html, sender) {
    const container = document.getElementById('chat-container');
    const msgDiv = document.createElement('div');
    msgDiv.className = sender === 'bot' ? 'bubble bot-bubble' : 'bubble user-bubble';
    msgDiv.innerHTML = html;
    container.appendChild(msgDiv);
    scrollToBottom();
}

function appendLoading() {
    const container = document.getElementById('chat-container');
    const loadDiv = document.createElement('div');
    loadDiv.className = 'sys-bubble';
    loadDiv.style.color = '#9ca3af';
    loadDiv.style.background = 'transparent';
    loadDiv.style.border = 'none';
    loadDiv.innerText = 'Priya is typing...';
    container.appendChild(loadDiv);
    scrollToBottom();
    return loadDiv;
}

function removeLoading(div) {
    if (div) div.remove();
}

function scrollToBottom() {
    const container = document.getElementById('chat-container');
    container.scrollTop = container.scrollHeight;
}
