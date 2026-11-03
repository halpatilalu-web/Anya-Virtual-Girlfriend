// ⚠️ MANDATORY STEP: Google Colab run karke jo dynamic public .gradio.live link milti hai use har baar yahan update karein.
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
        
        // Output parse system
        const reply = result.data[0]; 
        appendMessage(reply, 'bot');
        
    } catch (error) {
        removeLoading(loadingDiv);
        appendMessage("Backend Offline! Google Colab par backend run karke check karein ki kya dynamic public url app.js me successfully updated hai ya nahi.", 'system');
    }
}

function appendMessage(text, sender) {
    const container = document.getElementById('chat-container');
    const msgDiv = document.createElement('div');
    
    if (sender === 'user') {
        msgDiv.className = 'chat-bubble-user';
    } else if (sender === 'system') {
        msgDiv.className = 'system-bubble';
    } else {
        msgDiv.className = 'chat-bubble-bot';
    }
    
    // Auto engine checks if response payload maps down clean base64 image data blocks
    if(text.startsWith('data:image') || text.startsWith('http://') || text.startsWith('https://')) {
        msgDiv.innerHTML = `<img src="${text}" class="rounded-xl max-w-full h-auto mt-2 border border-white border-opacity-10 shadow-lg" alt="AI Generated Image Layer"/>`;
    } else {
        msgDiv.innerHTML = `<p class="text-sm leading-relaxed text-gray-200">${text}</p>`;
    }
    
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

function appendLoading() {
    const container = document.getElementById('chat-container');
    const loadDiv = document.createElement('div');
    loadDiv.className = 'text-xs text-gray-500 animate-pulse p-2 self-start';
    loadDiv.innerText = 'Priya is formatting explicit response layers...';
    container.appendChild(loadDiv);
    return loadDiv;
}

function removeLoading(div) {
    if (div) div.remove();
}
