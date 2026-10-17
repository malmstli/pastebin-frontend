
const API_URL = "https://womp1loginapi.onrender.com";
const WS_URL = "wss://ws-pastebin.onrender.com/";

const loginForm = document.getElementById("login-form");
const loginSection = document.getElementById("login-section");
const pastebinSection = document.getElementById("pastebin-section");

const textInput = document.getElementById("text-input");
const sendBtn = document.getElementById("send-btn");
const copyBtn = document.getElementById("copy-btn");
const reconnectBtn = document.getElementById("reconnect-btn");
const logoutBtn = document.getElementById("logout-btn");

const status = document.getElementById("status");
const message = document.getElementById("message");
const loginMessage = document.getElementById("login-message");

let socket = null;

// Show a message
function showMessage(text) {
    message.textContent = text;
}

// Update connection status
function updateStatus(text, connected = false) {
    status.textContent = text;
    status.classList.toggle("connected", connected);
}

// Check if JWT has expired
function tokenExpired(token) {
    try {
        const payload = JSON.parse(atob(
            token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")
        ));

        return !payload.exp || Date.now() >= payload.exp * 1000;
    } catch {
        return true;
    }
}

// Show login page
function showLogin(text = "") {
    loginSection.hidden = false;
    pastebinSection.hidden = true;
    loginMessage.textContent = text;
    updateStatus("Disconnected");
}

// Connect to WebSocket
function connectWebSocket() {
    const token = localStorage.getItem("accessToken");

    if (!token || tokenExpired(token)) {
        localStorage.removeItem("accessToken");
        showLogin("Session expired. Please log in again.");
        return;
    }

    if (socket) {
        socket.onclose = null;
        socket.close();
    }

    updateStatus("Connecting...");
    showMessage("Connecting to WebSocket...");

    socket = new WebSocket(
        `${WS_URL}?token=${encodeURIComponent(token)}`
    );

    socket.onopen = () => {
        updateStatus("Connected", true);
        showMessage("Connected to WebSocket!");
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            if (data.status === 0) {
                textInput.value = data.msg;
                showMessage("Text received!");
            } else {
                showMessage(data.msg || "Server error.");
            }
        } catch {
            textInput.value = event.data;
            showMessage("Text received!");
        }
    };

    socket.onerror = () => {
        showMessage("WebSocket connection error.");
    };

    socket.onclose = () => {
        updateStatus("Disconnected");

        if (tokenExpired(token)) {
            localStorage.removeItem("accessToken");
            showLogin("Session expired. Please log in again.");
        } else {
            showMessage("Disconnected. Click Reconnect to try again.");
        }
    };
}

// Login
loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    loginMessage.textContent = "Logging in...";

    try {
        const response = await fetch(`${API_URL}/users/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            loginMessage.textContent = "Invalid username or password.";
            return;
        }

        const data = await response.json();

        if (!data.jwt) {
            loginMessage.textContent = "No token received.";
            return;
        }

        localStorage.setItem("accessToken", data.jwt);

        loginSection.hidden = true;
        pastebinSection.hidden = false;

        loginMessage.textContent = "";
        loginForm.reset();

        connectWebSocket();

    } catch (error) {
        loginMessage.textContent = "Could not connect to login server.";
        console.error(error);
    }
});

// Send text
sendBtn.addEventListener("click", () => {
    if (!textInput.value.trim()) {
        showMessage("Please enter some text.");
        return;
    }

    if (!socket || socket.readyState !== WebSocket.OPEN) {
        showMessage("Not connected to WebSocket.");
        return;
    }

    socket.send(textInput.value);
    showMessage("Text sent!");
});

// Copy text
copyBtn.addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(textInput.value);
        showMessage("Text copied!");
    } catch {
        showMessage("Could not copy text.");
    }
});

// Reconnect
reconnectBtn.addEventListener("click", () => {
    connectWebSocket();
});

// Logout
logoutBtn.addEventListener("click", () => {
    if (socket) {
        socket.onclose = null;
        socket.close();
        socket = null;
    }

    localStorage.removeItem("accessToken");

    loginForm.reset();
    textInput.value = "";

    showLogin();
});

// Check saved login on page load
const savedToken = localStorage.getItem("accessToken");

if (savedToken && !tokenExpired(savedToken)) {
    loginSection.hidden = true;
    pastebinSection.hidden = false;
    connectWebSocket();
} else {
    localStorage.removeItem("accessToken");
    showLogin();
}
