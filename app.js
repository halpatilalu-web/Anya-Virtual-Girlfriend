// AI ko purani baatein yaad rakhne ke liye
let chatHistory = [];

// Hugging Face API (Free text generation)
// Note: Bina token ke ye kabhi-kabhi slow ho sakta hai, par free hai.
const TEXT_API_URL = "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2";

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
            // Photo banne ka direct free API (Bina Colab)
            const prompt = "1girl, solo, beautiful 22 year old Indian girl Priya, long black hair, hazel eyes, photorealistic, 4k, highly detailed, " + message;
            const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=768&nologo=true`;
            
            removeLoading(loadingDiv);
            
            // Photo chat me dikhana
            const imgHtml = `<p style="font-size: 12px; margin-bottom: 5px; color: #f472b6;">Priya shared a photo:</p><img src="${imageUrl}" style="border-radius: 12px; max-width: 100%; height: auto; box-shadow: 0 4px 6px rgba(0,0,0,0.3);" alt="Visual Content" onload="scrollToBottom()"/>`;
            appendRawHtml(imgHtml, 'bot');
            
        } else {
            // Text Chat ka system prompt
            const systemPrompt = "You are Priya, a deeply loving Indian AI influencer girlfriend. Talk romantic roleplay in Hindi/Hinglish (Hindi written in English alphabets). Always stay in character.";
            let promptText = `<s>[INST] ${systemPrompt} \n`;
            chatHistory.forEach(h => { promptText += `User: ${h.user} \nPriya: ${h.bot} \n`; });
            promptText += `User: ${message} [/INST]`;

            // Text Generate karne ki request
            const response = await fetch(TEXT_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    inputs: promptText,
                    parameters: { max_new_tokens: 150, temperature: 0.7 }
                })
            });

            const result = await response.json();
            removeLoading(loadingDiv);

            if (result && result[0] && result[0].generated_text) {
                let reply = result[0].generated_text.split('[/INST]').pop().trim();
                chatHistory.push({ user: message, bot: reply });
                
                // Memory zyada bhare na isliye sirf last 5 chat yaad rakhegi
                if(chatHistory.length > 5) chatHistory.shift(); 
                
                appendMessage(reply, 'bot');
            } else {
                appendMessage("Jaan, thoda network slow hai, API ne reply nahi kiya.", 'bot');
            }
        }
    } catch (error) {
        removeLoading(loadingDiv);
        appendMessage("Network error! Server se connect nahi ho pa raha.", 'system');
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
