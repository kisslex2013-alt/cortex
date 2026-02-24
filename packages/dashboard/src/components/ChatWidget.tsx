import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Bot, User } from 'lucide-react';

interface ChatMessage {
    id: string;
    sender: 'user' | 'jarvis';
    text: string;
    timestamp: number;
}

export const ChatWidget: React.FC<{ token: string }> = ({ token }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMsg: ChatMessage = {
            id: Date.now().toString(),
            sender: 'user',
            text: input.trim(),
            timestamp: Date.now()
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ message: userMsg.text })
            });

            if (!res.ok) {
                throw new Error(`Error ${res.status}`);
            }

            const data = await res.json();

            const jarvisMsg: ChatMessage = {
                id: (Date.now() + 1).toString(),
                sender: 'jarvis',
                text: data.response,
                timestamp: Date.now()
            };

            setMessages(prev => [...prev, jarvisMsg]);
        } catch (error) {
            const errorMsg: ChatMessage = {
                id: (Date.now() + 1).toString(),
                sender: 'jarvis',
                text: `*System Error:* ${(error as Error).message}`,
                timestamp: Date.now()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="card h-full flex flex-col">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Bot className="text-cyan-400" />
                Jarvis Terminal
            </h2>

            <div className="flex-1 overflow-y-auto pr-2 space-y-4 mb-4 custom-scrollbar min-h-[300px]">
                {messages.length === 0 && (
                    <div className="text-center text-gray-500 mt-10">
                        Initiate conversation...
                    </div>
                )}
                {messages.map(msg => (
                    <div key={msg.id} className={`flex gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
                        <div className={`p-2 rounded-full h-8 w-8 flex items-center justify-center ${msg.sender === 'user' ? 'bg-indigo-600' : 'bg-cyan-900 border border-cyan-500'}`}>
                            {msg.sender === 'user' ? <User size={16} /> : <Bot size={16} className="text-cyan-400" />}
                        </div>
                        <div className={`max-w-[80%] rounded-lg p-3 ${msg.sender === 'user' ? 'bg-indigo-900/50 border border-indigo-500/30' : 'bg-slate-800 border border-slate-700'}`}>
                            {msg.sender === 'jarvis' ? (
                                <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-700">
                                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                                </div>
                            ) : (
                                <div className="text-sm whitespace-pre-wrap">{msg.text}</div>
                            )}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="flex gap-3">
                        <div className="p-2 rounded-full h-8 w-8 flex items-center justify-center bg-cyan-900 border border-cyan-500">
                            <Bot size={16} className="text-cyan-400 animate-pulse" />
                        </div>
                        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 flex items-center gap-2">
                            <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce delay-100"></div>
                            <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce delay-200"></div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="flex gap-2 relative">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    placeholder="Enter command or message..."
                    className="flex-1 bg-slate-900 border border-slate-700 rounded p-2 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                />
                <button
                    onClick={handleSend}
                    disabled={loading || !input.trim()}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white p-2 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Send Message"
                >
                    <Send size={20} />
                </button>
            </div>
        </div>
    );
};
