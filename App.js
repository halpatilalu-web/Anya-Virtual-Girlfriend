// Aapki active Google Colab dynamic link yahan update karein 
const GRADIO_COLAB_URL = "https://33fc1e5315d4905972.gradio.live"; 

// AI ko purani baatein yaad rakhne ke liye memory variable
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

    try {
        // Gradio ke naye format ke hisaab se API endpoint set karna
        const apiUrl = GRADIO_COLAB_URL.endsWith('/') ? 
                       GRADIO_COLAB_URL + 'api/predict' : 
                       GRADIO_COLAB_URL + '/api/predict';

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // Ab hum 2 data bhej rahe hain: Naya message aur purani chat history
            body: JSON.stringify({ data: [message, JSON.stringify(chatHistory)] })
        });
        
        const result = await response.json();
        removeLoading(loadingDiv);
        
        if (result.error) {
            appendMessage("Gradio API Error: Check Colab Logs.", 'system');
            return;
        }

        // Colab se 2 cheezein wapas aayengi: Update hui history [0] aur AI ka reply [1]
        const updatedHistoryStr = result.data[0];
        const reply = result.data[1]; 
        
        // Apni history update karein taaki AI pichhli baatein yaad rakhe
        if (updatedHistoryStr) {
            chatHistory = JSON.parse(updatedHistoryStr);
        }
        
        appendMessage(reply, 'bot');
        
    } catch (error) {
        removeLoading(loadingDiv);
        appendMessage("Backend Engine Offline! Make sure your Google Colab session is running.", 'system');
        console.error("Fetch error: ", error);
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
    if(typeof text === 'string' && text.startsWith('data:image')) {
        msgDiv.innerHTML = `<p style="font-size: 12px; margin-bottom: 5px; color: #f472b6;">Priya shared a photo:</p><img src="${text}" style="border-radius: 12px; max-width: 100%; height: auto; box-shadow: 0 4px 6px rgba(0,0,0,0.3);" alt="Visual Content"/>`;
    } else {
        msgDiv.innerHTML = `<p style="font-size: 14px; line-height: 1.5;">${text}</p>`;
    }
    
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight; // Auto-scroll to bottom
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
    container.scrollTop = container.scrollHeight;
    return loadDiv;
}

function removeLoading(div) {
    if (div) div.remove();
}
