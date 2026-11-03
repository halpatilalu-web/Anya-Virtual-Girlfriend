// Aapki active Google Colab dynamic link automatic mapped hai
const GRADIO_COLAB_URL = "https://gradio.live"; 

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

    try {
        const response = await fetch(GRADIO_COLAB_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: [message] })
        });
        
        const result = await response.json();
        removeLoading(loadingDiv);
        
        const reply = result.data[0]; 
        appendMessage(reply, 'bot');
        
    } catch (error) {
        removeLoading(loadingDiv);
        appendMessage("Backend Engine Offline! Make sure your Google Colab session is running.", 'system');
    }
}

function appendMessage(text, sender) {
    const container = document.getElementById('chat-container');
    const msgDiv = document.createElement('div');
    
    if (sender === 'user') {
        msgDiv.className = 'bubble user-bubble';
    } else if (sender === 'system') {
        msgDiv.className = 'sys-bubble';
    } else {
        msgDiv.className = 'bubble bot-bubble';
    }
    
    // Check if the response is a Base64 Image
    if(text.startsWith('data:image')) {
        msgDiv.innerHTML = `<p class="text-sm mb-1 text-pink-300">Priya shared a photo:</p><img src="${text}" class="rounded-xl max-w-full h-auto shadow-md" alt="Visual Concept"/>`;
    } else {
        msgDiv.innerHTML = `<p class="text-sm leading-relaxed">${text}</p>`;
    }
    
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

function appendLoading() {
    const container = document.getElementById('chat-container');
    const loadDiv = document.createElement('div');
    loadDiv.className = 'text-xs text-gray-500 animate-pulse p-2 self-start';
    loadDiv.innerText = 'Priya is responding...';
    container.appendChild(loadDiv);
    return loadDiv;
}

function removeLoading(div) {
    if (div) div.remove();
}
