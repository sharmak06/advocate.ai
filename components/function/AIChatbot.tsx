"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Bot, User, Scale } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import Navbar from "@/components/layout/Navbar";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const parseMarkdown = (text: string) => {
  return text
    .replace(/\*\*\*\*(.*?)\*\*\*\*/g, "<strong>$1</strong>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
};

const MessageContent = ({ content }: { content: string }) => {
  const formattedContent = parseMarkdown(content);

  return (
    <div
      className="text-sm"
      dangerouslySetInnerHTML={{ __html: formattedContent }}
    />
  );
};

const AIChatbot = () => {
  const router = useRouter();
  const { toast } = useToast();
  const { session, loading: authLoading } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const checkAuth = async () => {
      if (authLoading) return;

      if (!session) {
        router.push("/auth");
        return;
      }

      try {
        const response = await fetch(`/api/profile/${session.user.id}`);
        if (response.ok) {
          const profile = await response.json();

          if (!profile?.vkyc_completed) {
            router.push("/vkyc");
            return;
          }
        } else {
          router.push("/auth");
          return;
        }

        const storedApiKey = localStorage.getItem("gemini_api_key");
        if (storedApiKey) {
          setApiKey(storedApiKey);
        }

        // Always show welcome message
        setMessages([
          {
            id: "1",
            role: "assistant",
            content:
              "Welcome to the **Legal AI Assistant**! I'm here to help you with legal questions, document review, legal research, and general legal guidance. How can I assist you today?",
            timestamp: new Date(),
          },
        ]);
      } catch (error) {
        //console.error("Auth check error:", error);
        router.push("/auth");
      }
    };

    checkAuth();
  }, [session, authLoading, router]);

  const handleApiKeySubmit = () => {
    // Deprecated: client-side API key entry removed. The server will use the configured GEMINI_API_KEY.
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputMessage,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = inputMessage; // Capture the input before clearing it
    setInputMessage("");
    setIsLoading(true);

    // This is the prompt you were using before.
    // We send it to the backend so the server can build the full prompt.
    const legalContext = `You are a knowledgeable legal AI assistant specializing in Indian law and general legal principles. 
      You provide helpful, accurate, and professional legal guidance while always reminding users that your advice does not constitute formal legal counsel and they should consult with a qualified lawyer for specific legal matters.
      
      Focus on:
      - Indian legal system and laws
      - Legal procedures and documentation
      - Rights and obligations
      - Legal terminology explanations
      - General legal guidance
      
      Always maintain a professional, helpful tone and provide practical insights while emphasizing the importance of professional legal consultation for specific cases.
      
      Format your responses using markdown when appropriate:
      - Use **text** for important points or headings
      - Use *text* for emphasis
      - Use line breaks for better readability`;

    try {
      // Call your OWN backend API route
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
            message: currentInput, // Send the user's message
            legalContext: legalContext, // Send the system prompt
          }),
      });

      if (!response.ok) {
        // Handle errors from your own API route
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to get response from AI.");
      }

      const data = await response.json();
      const text = data.text; // Get the text from the JSON response

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: text,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error("Error calling /api/chat:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to get response. Please check your API key and try again.",
        variant: "destructive",
      });

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content:
          "I apologize, but I encountered an error processing your request. Please check your API key and try again.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: "1",
        role: "assistant",
        content:
          "Chat cleared! How can I help you with your **legal questions**?",
        timestamp: new Date(),
      },
    ]);
  };

  const resetApiKey = () => {
    // Deprecated: client-side API key reset removed.
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen pt-20">
      <Navbar />
      <div className="pt-12 sm:pt-20 px-2 sm:px-4 py-6 sm:py-8">
        <div className="max-w-4xl mx-auto">
          <Card className="h-[calc(100vh-8rem)] sm:h-[calc(100vh-12rem)] bg-transparent rounded-none flex flex-col">
            <CardHeader className="flex flex-wrap flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 py-4 sm:py-4">
              <div className="flex flex-wrap gap-1 sm:flex-nowrap sm:space-x-1">
                <div className="p-1 rounded-lg  w-7 h-7 flex items-center justify-center">
                  <Scale className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="flex items-center space-x-1 text-base">
                    <span>Legal AI Assistant</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Get instant legal guidance powered by AI
                  </CardDescription>
                </div>
              </div>
              <div className="flex flex-row space-x-1 w-full sm:w-auto mt-2 sm:mt-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="truncate min-w-0 flex-1 py-4 h-7 cursor-pointer"
                  onClick={clearChat}
                >
                  Clear Chat
                </Button>
              </div>
            </CardHeader>
            <>
                <CardContent className="flex-1 p-0 overflow-hidden">
                  <ScrollArea
                    className="h-full px-3 sm:px-6"
                    ref={chatContainerRef}
                  >
                    <div className="space-y-4 py-4">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex ${
                            message.role === "user"
                              ? "justify-end"
                              : "justify-start"
                          }`}
                        >
                          <div
                            className={`flex max-w-[98%] xs:max-w-[90%] sm:max-w-[80%] ${
                              message.role === "user"
                                ? "flex-row-reverse"
                                : "flex-row"
                            } items-start space-x-2`}
                          >
                            <div
                              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                                message.role === "user"
                                  ? "bg-sky-500 text-primary ml-2"
                                  : "bg-slate-100 text-slate-600 mr-2"
                              }`}
                            >
                              {message.role === "user" ? (
                                <User className="w-4 h-4" />
                              ) : (
                                <Bot className="w-4 h-4" />
                              )}
                            </div>
                            <div
                              className={`rounded-lg px-4 py-2 break-words ${
                                message.role === "user"
                                  ? "bg-transparent text-primary border rounded-none"
                                  : "bg-primary border rounded-none border-slate-200 text-slate-800"
                              }`}
                              style={{ wordBreak: "break-word" }}
                            >
                              <MessageContent content={message.content} />
                              <span className="text-xs opacity-70 mt-1 block">
                                {message.timestamp.toLocaleTimeString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                      {isLoading && (
                        <div className="flex justify-start">
                          <div className="flex items-start space-x-2 max-w-[98%] xs:max-w-[90%] sm:max-w-[80%]">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center mr-2">
                              <Bot className="w-4 h-4" />
                            </div>
                            <div className="bg-primary border border-slate-200 rounded-lg px-4 py-2">
                              <div className="flex space-x-1">
                                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                                <div
                                  className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                                  style={{ animationDelay: "0.1s" }}
                                ></div>
                                <div
                                  className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                                  style={{ animationDelay: "0.2s" }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>
                </CardContent>

                <div className="p-2 xs:p-3 sm:p-6 border-t">
                  <div className="flex flex-row sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                    <Input
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyDown={handleKeyPress}
                      placeholder="Ask me anything about legal matters..."
                      disabled={isLoading}
                      className="flex-1 mx-2"
                    />
                    <Button
                      size="icon"
                      onClick={sendMessage}
                      disabled={isLoading || !inputMessage.trim()}
                      className="px-4 cursor-pointer"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    This AI provides general legal guidance. Always consult with
                    a qualified lawyer for specific legal advice.
                  </p>
                </div>
              </>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AIChatbot;
