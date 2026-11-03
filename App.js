// ⚠️ IMPORTANT STEP: Jab aap Google Colab run karein, wahan se mili Public URL ko yahan paste karein
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
        
        const reply = result.data[0]; // Fetching output text or image data
        appendMessage(reply, 'bot');
        
    } catch (error) {
        removeLoading(loadingDiv);
        appendMessage("Connection Refused! Make sure your Google Colab Backend is running and link is updated in app.js.", 'system');
    }
}

function appendMessage(text, sender) {
    const container = document.getElementById('chat-container');
    const msgDiv = document.createElement('div');
    
    if (sender === 'user') {
        msgDiv.className = 'bg-purple-600/30 border border-purple-500/20 max-w-[80%] rounded-2xl p-4 self-end ml-auto my-2';
    } else if (sender === 'system') {
        msgDiv.className = 'bg-red-500/20 border border-red-500/30 max-w-[80%] rounded-xl p-3 self-center my-2 text-red-300 text-xs text-center';
    } else {
        msgDiv.className = 'bg-white/5 max-w-[80%] rounded-2xl p-4 border border-white/5 self-start my-2';
    }
    
    // Auto-detect if output is an image or normal text
    if(text.startsWith('data:image') || text.startsWith('http')) {
        msgDiv.innerHTML = `<img src="${text}" class="rounded-xl max-w-full h-auto shadow-md" alt="Visual Content"/>`;
    } else {
        msgDiv.innerHTML = `<p class="text-sm leading-relaxed">${text}</p>`;
    }
    
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

function appendLoading() {
    const container = document.getElementById('chat-container');
    const loadDiv = document.createElement('div');
    loadDiv.className = 'text-xs text-neutral-500 animate-pulse self-start p-2';
    loadDiv.innerText = 'Priya is typing/generating content...';
    container.appendChild(loadDiv);
    return loadDiv;
}

function removeLoading(div) {
    if (div) div.remove();
}