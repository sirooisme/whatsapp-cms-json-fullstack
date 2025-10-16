"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Send, 
  Paperclip, 
  Smile, 
  Phone, 
  MoreVertical,
  Check,
  CheckCheck,
  Clock
} from "lucide-react";
import { Message, Contact } from "@/lib/types";

interface ChatWindowProps {
  chatId: string;
  contact: Contact;
  messages: Message[];
  onSendMessage: (content: string, type: Message['type']) => void;
  isTyping?: boolean;
}

export default function ChatWindow({ 
  chatId, 
  contact, 
  messages, 
  onSendMessage,
  isTyping = false 
}: ChatWindowProps) {
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || isSending) return;

    setIsSending(true);
    try {
      await onSendMessage(newMessage.trim(), 'text');
      setNewMessage("");
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const getMessageStatusIcon = (status: Message['status']) => {
    switch (status) {
      case 'sent':
        return <Check className="h-3 w-3 text-gray-400" />;
      case 'delivered':
        return <CheckCheck className="h-3 w-3 text-gray-400" />;
      case 'read':
        return <CheckCheck className="h-3 w-3 text-blue-500" />;
      case 'pending':
        return <Clock className="h-3 w-3 text-yellow-500" />;
      case 'failed':
        return <Clock className="h-3 w-3 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <Card className="h-full flex flex-col">
      {/* Chat Header */}
      <CardHeader className="flex-shrink-0 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Avatar>
              <AvatarImage src={contact.avatar} />
              <AvatarFallback>
                {contact.name.split(' ').map(n => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-lg">{contact.name}</CardTitle>
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">{contact.phone}</p>
                {contact.company && (
                  <Badge variant="secondary" className="text-xs">
                    {contact.company}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="sm">
              <Phone className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {/* Messages Area */}
      <CardContent className="flex-1 p-0 pt-0">
        <ScrollArea className="h-full px-4">
          <div className="space-y-4 py-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg px-4 py-2 ${
                    message.direction === 'outbound'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <p className="text-sm break-words">{message.content}</p>
                  <div
                    className={`flex items-center gap-1 mt-1 text-xs ${
                      message.direction === 'outbound' ? 'text-blue-100' : 'text-gray-500'
                    }`}
                  >
                    <span>{formatTime(message.timestamp)}</span>
                    {message.direction === 'outbound' && (
                      getMessageStatusIcon(message.status)
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-lg px-4 py-2">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </CardContent>

      {/* Message Input */}
      <div className="border-t p-4">
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="sm">
            <Paperclip className="h-4 w-4" />
          </Button>
          <div className="flex-1 relative">
            <Input
              ref={inputRef}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Type a message..."
              disabled={isSending}
              className="pr-10"
            />
            <Button variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-2">
              <Smile className="h-4 w-4" />
            </Button>
          </div>
          <Button 
            onClick={handleSendMessage} 
            disabled={!newMessage.trim() || isSending}
            size="sm"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}