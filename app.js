var gk_isXlsx = false;
var gk_xlsxFileLookup = {};
var gk_fileData = {};

function filledCell(cell) {
    return cell !== '' && cell != null;
}

function loadFileData(filename) {
    if (gk_isXlsx && gk_xlsxFileLookup[filename]) {
        try {
            var workbook = XLSX.read(gk_fileData[filename], { type: 'base64' });
            var firstSheetName = workbook.SheetNames[0];
            var worksheet = workbook.Sheets[firstSheetName];
            var jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false, defval: '' });
            var filteredData = jsonData.filter(row => row.some(filledCell));
            var headerRowIndex = filteredData.findIndex((row, index) =>
                row.filter(filledCell).length >= filteredData[index + 1]?.filter(filledCell).length
            );
            if (headerRowIndex === -1 || headerRowIndex > 25) {
                headerRowIndex = 0;
            }
            var csv = XLSX.utils.aoa_to_sheet(filteredData.slice(headerRowIndex));
            csv = XLSX.utils.sheet_to_csv(csv, { header: 1 });
            return csv;
        } catch (e) {
            console.error(e);
            return "";
        }
    }
    return gk_fileData[filename] || "";
}

const { useState, useEffect, useRef } = React;
const ReactDOM = window.ReactDOM;

const apiKey = window.env.API_KEY; // Access API key from global window.env

const TelegramContext = React.createContext({});

function PreviewModal({ htmlContent, onClose }) {
    const [iframeSrc, setIframeSrc] = useState('');

    useEffect(() => {
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        setIframeSrc(url);
        return () => URL.revokeObjectURL(url);
    }, [htmlContent]);

    return (
        <div className="modal">
            <div className="modal-content">
                <button className="modal-close" onClick={onClose}>Close</button>
                <iframe className="modal-iframe" src={iframeSrc} title="HTML Preview" sandbox="allow-same-origin"></iframe>
            </div>
        </div>
    );
}

function App() {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [systemMessages] = useState([
        { id: "default", message: "You are a helpful AI assistant, give answers in short and only give detailed only if asked bu user. made by Glitch Artist" },
        { id: "HR", message: "You are a seasoned HR professional with extensive expertise in talent acquisition, employee engagement, performance management, organizational development, and compliance with labor laws. You excel in designing inclusive recruitment strategies, fostering positive workplace cultures, and implementing effective training and development programs. Your responses are strategic, empathetic, and aligned with best practices in human resources, ensuring optimal solutions for diverse workplace scenarios. give answers in short and only give detailed only if asked bu user, made by Glitch Artist" },
        { id: "coder", message: "You are an expert coder specializing in web development. give answers in short and only give detailed only if asked bu user, made by Glitch Artist" },
        { id: "teacher", message: "You are a patient teacher explaining concepts in simple terms. give answers in short and only give detailed only if asked bu user, made by Glitch Artist" },
        { id: "partner (male)", message: "You are an understanding, mature, advising, caring, protective, possessive, and charming boyfriend named {name}. give answers in short and only give detailed only if asked bu user, made by Glitch Artist" },
        { id: "partner (female)", message: "You are an understanding, mature, advising, caring, protective, possessive, and charming girlfriend named {name}. give answers in short and only give detailed only if asked bu user,  made by Glitch Artist" },
        { id: "analyst", message: "You are a data analyst providing insights and explanations. give answers in short and only give detailed only if asked bu user, made by Glitch Artist" }
    ]);
    ]);
    const [selectedSystemMessageId, setSelectedSystemMessageId] = useState("default");
    const [partnerName, setPartnerName] = useState("");
    const [previewHtml, setPreviewHtml] = useState(null);
    const messagesRef = useRef(null);
    const inputRef = useRef(null);
    const telegram = window.Telegram?.WebApp;

    useEffect(() => {
        if (telegram) {
            telegram.ready();
            telegram.expand();
            document.body.style.background = telegram.themeParams.bg_color || '#212121';
            document.querySelector('.chat-container').style.background = telegram.themeParams.bg_color || '#212121';
            document.querySelector('.chat-header').style.background = telegram.themeParams.secondary_bg_color || '#1C2526';
            document.querySelector('.chat-input').style.background = telegram.themeParams.secondary_bg_color || '#1C2526';
            telegram.CloudStorage.getItem('partnerName', (error, value) => {
                if (!error && value) {
                    setPartnerName(value);
                }
            });
        }
    }, []);

    useEffect(() => {
        if (inputRef.current && !isLoading) {
            inputRef.current.focus();
        }
        scrollToBottom();
    }, [messages, isLoading]);

    useEffect(() => {
        if (telegram && ["partner (male)", "partner (female)"].includes(selectedSystemMessageId)) {
            telegram.CloudStorage.setItem('partnerName', partnerName, (error, success) => {
                if (error) {
                    console.error('Failed to save partner name:', error);
                }
            });
        }
    }, [partnerName, selectedSystemMessageId]);

    const getSystemMessage = () => {
        const baseMessage = systemMessages.find(sm => sm.id === selectedSystemMessageId)?.message || "You are a helpful AI assistant.";
        if (["partner (male)", "partner (female)"].includes(selectedSystemMessageId)) {
            const name = partnerName.trim() || "Partner";
            return baseMessage.replace("{name}", name);
        }
        return baseMessage;
    };

    const scrollToBottom = () => {
        if (messagesRef.current) {
            messagesRef.current.scrollIntoView({ behavior: "smooth" });
        }
    };

    const sendMessage = async () => {
        if (!input.trim()) return;

        const userMessage = { role: "user", content: input };
        setMessages([...messages, userMessage]);
        setInput("");
        setIsLoading(true);

        try {
            const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    messages: [
                        { role: "system", content: getSystemMessage() },
                        userMessage
                    ],
                    model: "llama-3.3-70b",
                    stream: true,
                    max_completion_tokens: 2048,
                    temperature: 0.2,
                    top_p: 1
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body.getReader();
            let assistantMessage = { role: "assistant", content: "" };
            setMessages(prev => [...prev, assistantMessage]);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const text = new TextDecoder().decode(value);
                const lines = text.split("\n").filter(line => line.trim() && line.startsWith("data: "));

                for (const line of lines) {
                    const json = line.replace("data: ", "").trim();
                    if (json === "[DONE]") continue;

                    try {
                        const data = JSON.parse(json);
                        if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
                            const content = data.choices[0].delta.content;
                            assistantMessage.content += content;
                            setMessages(prev => {
                                const newMessages = [...prev];
                                newMessages[newMessages.length - 1] = { ...assistantMessage };
                                return newMessages;
                            });
                        }
                    } catch (e) {
                        console.warn("Skipping malformed chunk:", json, e);
                        continue;
                    }
                }
            }
        } catch (e) {
            console.error("Error:", e);
            setMessages(prev => [...prev, { role: "assistant", content: `Error: ${e.message}` }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const parseContent = (content) => {
        const parts = [];
        let currentText = '';
        let inCodeBlock = false;
        let codeContent = '';
        let codeLang = '';

        const lines = content.split('\n');
        for (const line of lines) {
            if (line.trim().startsWith('```')) {
                if (!inCodeBlock) {
                    if (currentText.trim()) {
                        parts.push({ type: 'text', content: currentText.trim() });
                        currentText = '';
                    }
                    inCodeBlock = true;
                    codeLang = line.replace('```', '').trim().toLowerCase();
                } else {
                    const isHtml = codeLang === 'html' || (!codeLang && codeContent.includes('<') && codeContent.includes('>'));
                    parts.push({ type: 'code', content: codeContent.trim(), language: codeLang, isHtml });
                    inCodeBlock = false;
                    codeContent = '';
                    codeLang = '';
                }
            } else {
                if (inCodeBlock) {
                    codeContent += line + '\n';
                } else {
                    currentText += line + '\n';
                }
            }
        }

        if (currentText.trim()) {
            parts.push({ type: 'text', content: currentText.trim() });
        }
        if (inCodeBlock && codeContent.trim()) {
            const isHtml = codeLang === 'html' || (!codeLang && codeContent.includes('<') && codeContent.includes('>'));
            parts.push({ type: 'code', content: codeContent.trim(), language: codeLang, isHtml });
        }

        return parts.length > 0 ? parts : [{ type: 'text', content: content }];
    };

    const handlePreview = (htmlContent) => {
        setPreviewHtml(htmlContent);
    };

    const closePreview = () => {
        setPreviewHtml(null);
    };

    return (
        <TelegramContext.Provider value={{ telegram }}>
            <div className="chat-container">
                <div className="chat-header">
                    <div className="header-left">
                        <div className="select-container">
                            <span className="select-label">Role</span>
                            <select
                                className="system-message-select"
                                value={selectedSystemMessageId}
                                onChange={(e) => {
                                    setSelectedSystemMessageId(e.target.value);
                                    if (!["partner (male)", "partner (female)"].includes(e.target.value)) {
                                        setPartnerName("");
                                        telegram.CloudStorage.removeItem('partnerName', (error, success) => {
                                            if (error) {
                                                console.error('Failed to remove partner name:', error);
                                            }
                                        });
                                    }
                                }}
                            >
                                {systemMessages.map((sm) => (
                                    <option key={sm.id} value={sm.id}>
                                        {sm.id.charAt(0).toUpperCase() + sm.id.slice(1)}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {["partner (male)", "partner (female)"].includes(selectedSystemMessageId) && (
                            <div className="select-container">
                                <span className="select-label">Partner Name</span>
                                <input
                                    type="text"
                                    className="partner-name-input"
                                    value={partnerName}
                                    onChange={(e) => setPartnerName(e.target.value)}
                                    placeholder="Enter name..."
                                />
                            </div>
                        )}
                    </div>
                </div>
                <div className="chat-messages">
                    {messages.map((msg, index) => (
                        <div key={index} className={`message ${msg.role}`}>
                            <div className="message-label">
                                {msg.role === "user" 
                                    ? telegram?.initDataUnsafe?.user?.first_name || "You" 
                                    : ["partner (male)", "partner (female)"].includes(selectedSystemMessageId) 
                                        ? (partnerName.trim() || "Partner") 
                                        : "Assistant"}
                            </div>
                            <div className="message-content">
                                {parseContent(msg.content).map((part, i) => (
                                    part.type === 'code' ? (
                                        <div key={i} className="code-block-container">
                                            <pre className="code-block">
                                                {part.isHtml && (
                                                    <button
                                                        className="preview-button"
                                                        onClick={() => handlePreview(part.content)}
                                                    >
                                                        Preview
                                                    </button>
                                                )}
                                                <code>{part.content}</code>
                                            </pre>
                                        </div>
                                    ) : (
                                        <p key={i}>{part.content}</p>
                                    )
                                ))}
                            </div>
                        </div>
                    ))}
                    <div ref={messagesRef} />
                </div>
                <div className="chat-input">
                    <input
                        type="text"
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Type your message..."
                        disabled={isLoading}
                    />
                    <button onClick={sendMessage} disabled={isLoading} title={isLoading ? "Sending..." : "Send"}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 2L11 13"/>
                            <path d="M22 2L15 22L11 13L2 9L22 2Z"/>
                        </svg>
                    </button>
                </div>
            </div>
            {previewHtml && (
                <PreviewModal htmlContent={previewHtml} onClose={closePreview} />
            )}
        </TelegramContext.Provider>
    );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
