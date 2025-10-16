"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import ContactList from "@/components/chat/ContactList";
import ChatWindow from "@/components/chat/ChatWindow";
import { 
  MessageSquare, 
  Phone, 
  Users, 
  TrendingUp,
  Plus,
  Search,
  Filter,
  Download,
  Settings,
  Wifi,
  WifiOff,
  AlertCircle
} from "lucide-react";

interface DashboardStats {
  totalUsers?: number;
  totalContacts: number;
  totalChats: number;
  totalMessages: number;
  activeChats: number;
  connectedAgents?: number;
  personalChats?: number;
  personalActiveChats?: number;
  assignedContacts?: number;
  personalMessages?: number;
  personalContacts?: number;
}

interface Chat {
  id: string;
  contactId: string;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  unreadCount: number;
  status: string;
  priority: string;
  tags: string[];
  contact: {
    id: string;
    name: string;
    phone: string;
    avatar?: string;
    company?: string;
    tags: string[];
  };
  assignedAgent?: {
    id: string;
    name: string;
    avatar?: string;
  };
}

interface Message {
  id: string;
  chatId: string;
  contactId: string;
  agentId?: string;
  content: string;
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'system';
  direction: 'inbound' | 'outbound';
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
}

export default function AgentDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalContacts: 0,
    totalChats: 0,
    totalMessages: 0,
    activeChats: 0
  });
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [whatsappStatus, setWhatsappStatus] = useState<{ status: string; qrCode?: string }>({ status: 'disconnected' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedChat) {
      loadChatMessages(selectedChat.id);
    }
  }, [selectedChat]);

  const loadDashboardData = async () => {
    try {
      // Load stats
      const statsResponse = await fetch('/api/cms/stats');
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData.data);
      }

      // Load chats
      const chatsResponse = await fetch('/api/cms/chats?page=1&limit=50');
      if (chatsResponse.ok) {
        const chatsData = await chatsResponse.json();
        setChats(chatsData.data);
      }

      // Load WhatsApp status
      const whatsappResponse = await fetch('/api/cms/whatsapp/status');
      if (whatsappResponse.ok) {
        const whatsappData = await whatsappResponse.json();
        setWhatsappStatus(whatsappData.data);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadChatMessages = async (chatId: string) => {
    try {
      const response = await fetch(`/api/cms/messages?chatId=${chatId}&limit=50`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.data);
      }
    } catch (error) {
      console.error('Failed to load chat messages:', error);
    }
  };

  const handleSendMessage = async (content: string, type: Message['type']) => {
    if (!selectedChat) return;

    try {
      const response = await fetch('/api/cms/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selectedChat.contact.phone,
          content,
          type
        })
      });

      if (response.ok) {
        const newMessage = await response.json();
        setMessages(prev => [...prev, newMessage.data]);
        await loadDashboardData(); // Refresh chat list
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleConnectWhatsApp = async () => {
    try {
      const response = await fetch('/api/cms/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '+1234567890' }) // User would provide their number
      });

      if (response.ok) {
        const data = await response.json();
        setWhatsappStatus(data.data);
      }
    } catch (error) {
      console.error('Failed to connect WhatsApp:', error);
    }
  };

  const handleDisconnectWhatsApp = async () => {
    try {
      const response = await fetch('/api/cms/whatsapp/disconnect', {
        method: 'DELETE'
      });

      if (response.ok) {
        setWhatsappStatus({ status: 'disconnected' });
      }
    } catch (error) {
      console.error('Failed to disconnect WhatsApp:', error);
    }
  };

  const contacts = chats.map(chat => chat.contact);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-white">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp CMS</h1>
          <p className="text-gray-600">Manage customer conversations</p>
        </div>
        
        <div className="flex items-center space-x-4">
          {/* WhatsApp Status */}
          <div className="flex items-center space-x-2">
            {whatsappStatus.status === 'connected' ? (
              <Badge className="bg-green-500 hover:bg-green-600">
                <Wifi className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            ) : whatsappStatus.status === 'qr_required' ? (
              <Button onClick={handleConnectWhatsApp} variant="outline" size="sm">
                <AlertCircle className="h-3 w-3 mr-1" />
                Scan QR
              </Button>
            ) : (
              <Button onClick={handleConnectWhatsApp} variant="outline" size="sm">
                <WifiOff className="h-3 w-3 mr-1" />
                Connect
              </Button>
            )}
          </div>

          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Chats</p>
              <p className="text-2xl font-bold">{stats.activeChats}</p>
            </div>
            <MessageSquare className="h-8 w-8 text-blue-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Contacts</p>
              <p className="text-2xl font-bold">{stats.personalContacts || stats.totalContacts}</p>
            </div>
            <Users className="h-8 w-8 text-green-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Messages Today</p>
              <p className="text-2xl font-bold">{stats.personalMessages || stats.totalMessages}</p>
            </div>
            <TrendingUp className="h-8 w-8 text-purple-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Response Rate</p>
              <p className="text-2xl font-bold">95%</p>
            </div>
            <Phone className="h-8 w-8 text-orange-500" />
          </div>
        </Card>
      </div>

      {/* Main Chat Interface */}
      <div className="flex-1 flex overflow-hidden">
        <div className="w-80 border-r bg-white">
          <ContactList
            chats={chats}
            contacts={contacts}
            selectedChatId={selectedChat?.id}
            onChatSelect={setSelectedChat}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        </div>

        <div className="flex-1 bg-white">
          {selectedChat ? (
            <ChatWindow
              chatId={selectedChat.id}
              contact={selectedChat.contact}
              messages={messages}
              onSendMessage={handleSendMessage}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500">
              <div className="text-center">
                <MessageSquare className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                <h3 className="text-lg font-medium mb-2">Select a conversation</h3>
                <p className="text-sm">Choose a chat from the sidebar to start messaging</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}