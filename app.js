
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
let refreshPromise = null;
let refreshTimer = null;

// Show a message
function showMessage(text) {
    message.textContent = text;
}

// Update connection status
function updateStatus(text, connected = false) {
    status.textContent = text;
    status.classList.toggle("connected", connected);
}

// Save tokens
function saveTokens(access, refresh) {
    localStorage.setItem("accessToken", access);
    localStorage.setItem("refreshToken", refresh);
}

// Remove tokens
function clearTokens() {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");

    clearTimeout(refreshTimer);
    refreshTimer = null;
}

// Read JWT expiration
function getTokenExpiry(token) {
    try {
        const payload = JSON.parse(atob(
            token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")
        ));

        return payload.exp * 1000 || 0;
    } catch {
        return 0;
    }
}

// Check expiration
function tokenExpired(token) {
    return !token || Date.now() >= getTokenExpiry(token);
}

// Show login
function showLogin(text = "") {
    loginSection.hidden = false;
    pastebinSection.hidden = true;
    loginMessage.textContent = text;
    updateStatus("Disconnected");
}

// Close WebSocket
function disconnectWebSocket() {
    if (socket) {
        const oldSocket = socket;
        socket = null;

        oldSocket.onclose = null;
        oldSocket.onerror = null;
        oldSocket.close();
    }

    updateStatus("Disconnected");
}

// Refresh access token
async function refreshAccessToken() {
    if (refreshPromise) {
        return refreshPromise;
    }

    refreshPromise = (async () => {
        const refreshToken = localStorage.getItem("refreshToken");

        if (!refreshToken || tokenExpired(refreshToken)) {
            return false;
        }

        try {
            const response = await fetch(`${API_URL}/refresh`, {
                method: "POST",
                headers: {
                    "jwtRef": `Bearer ${refreshToken}`
                }
            });

            if (!response.ok) {
                return false;
            }

            const data = await response.json();

            if (!data.jwtAccess) {
                return false;
            }

            saveTokens(
                data.jwtAccess,
                data.jwtRef || refreshToken
            );

            scheduleRefresh();
            return true;

        } catch (error) {
            console.error("Refresh error:", error);
            return false;
        }
    })();

    try {
        return await refreshPromise;
    } finally {
        refreshPromise = null;
    }
}

// Automatically refresh before token expires
function scheduleRefresh() {
    clearTimeout(refreshTimer);

    const token = localStorage.getItem("accessToken");
    if (!token) return;

    const delay = Math.max(
        0,
        getTokenExpiry(token) - Date.now() - 60000
    );

    refreshTimer = setTimeout(async () => {
        const success = await refreshAccessToken();

        if (success) {
            connectWebSocket();
        } else {
            disconnectWebSocket();
            clearTokens();
            showLogin("Session expired. Please log in again.");
        }
    }, delay);
}

// Connect to WebSocket
async function connectWebSocket() {
    let token = localStorage.getItem("accessToken");

    if (tokenExpired(token)) {
        const success = await refreshAccessToken();

        if (!success) {
            disconnectWebSocket();
            clearTokens();
            showLogin("Session expired. Please log in again.");
            return;
        }

        token = localStorage.getItem("accessToken");
    }

    if (socket && socket.readyState === WebSocket.CONNECTING) {
        return;
    }

    disconnectWebSocket();

    updateStatus("Connecting...");
    showMessage("Connecting to WebSocket...");

    const ws = new WebSocket(
        `${WS_URL}?token=${encodeURIComponent(token)}`
    );

    socket = ws;

    ws.onopen = () => {
        if (socket !== ws) return;

        updateStatus("Connected", true);
        showMessage("Connected to WebSocket!");
    };

    ws.onmessage = (event) => {
        if (socket !== ws) return;

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

    ws.onerror = () => {
        if (socket !== ws) return;
        showMessage("WebSocket connection error.");
    };

    ws.onclose = async () => {
        if (socket !== ws) return;

        socket = null;
        updateStatus("Disconnected");

        if (tokenExpired(token)) {
            const success = await refreshAccessToken();

            if (success) {
                connectWebSocket();
                return;
            }

            clearTokens();
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

        if (!data.jwtAccess || !data.jwtRef) {
            loginMessage.textContent = "Login tokens missing.";
            return;
        }

        saveTokens(data.jwtAccess, data.jwtRef);

        loginSection.hidden = true;
        pastebinSection.hidden = false;

        loginMessage.textContent = "";
        loginForm.reset();

        scheduleRefresh();
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

// Logout through API
logoutBtn.addEventListener("click", async () => {
    const refreshToken = localStorage.getItem("refreshToken");

    logoutBtn.disabled = true;

    try {
        if (refreshToken) {
            const response = await fetch(`${API_URL}/refresh`, {
                method: "DELETE",
                headers: {
                    "jwtRef": `Bearer ${refreshToken}`
                }
            });

            if (!response.ok) {
                showMessage("Logout failed. Please try again.");
                return;
            }
        }

        disconnectWebSocket();
        clearTokens();

        loginForm.reset();
        textInput.value = "";
        showLogin();

    } catch (error) {
        showMessage("Could not connect to logout server.");
        console.error(error);
    } finally {
        logoutBtn.disabled = false;
    }
});

// Check saved login on startup
async function startApp() {
    const accessToken = localStorage.getItem("accessToken");
    const refreshToken = localStorage.getItem("refreshToken");

    if (!refreshToken || tokenExpired(refreshToken)) {
        clearTokens();
        showLogin();
        return;
    }

    if (!accessToken || tokenExpired(accessToken)) {
        const success = await refreshAccessToken();

        if (!success) {
            clearTokens();
            showLogin("Session expired. Please log in again.");
            return;
        }
    }

    loginSection.hidden = true;
    pastebinSection.hidden = false;

    scheduleRefresh();
    connectWebSocket();
}

startApp();
