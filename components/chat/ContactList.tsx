"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { 
  Search, 
  Phone, 
  MessageSquare, 
  Clock,
  Check,
  CheckCheck,
  Circle
} from "lucide-react";
import { Chat, Contact } from "@/lib/types";

interface ContactListProps {
  chats: Chat[];
  contacts: Contact[];
  selectedChatId?: string;
  onChatSelect: (chat: Chat) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export default function ContactList({ 
  chats, 
  contacts, 
  selectedChatId, 
  onChatSelect,
  searchQuery,
  onSearchChange
}: ContactListProps) {
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'archived'>('all');

  // Filter chats based on search query and status
  const filteredChats = chats.filter(chat => {
    const contact = contacts.find(c => c.id === chat.contactId);
    if (!contact) return false;

    const matchesSearch = searchQuery === '' || 
      contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.phone.includes(searchQuery) ||
      (contact.company && contact.company.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = filterStatus === 'all' || chat.status === filterStatus;

    return matchesSearch && matchesStatus;
  });

  // Sort by last message activity (most recent first)
  const sortedChats = [...filteredChats].sort((a, b) => {
    const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return bTime - aTime;
  });

  const formatTime = (timestamp?: string) => {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } else if (diffInHours < 24 * 7) {
      return date.toLocaleDateString('en-US', {
        weekday: 'short'
      });
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-500';
      case 'high':
        return 'bg-orange-500';
      case 'medium':
        return 'bg-yellow-500';
      case 'low':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <Circle className="h-2 w-2 fill-green-500 text-green-500" />;
      case 'archived':
        return <Clock className="h-3 w-3 text-gray-500" />;
      case 'closed':
        return <Check className="h-3 w-3 text-gray-500" />;
      default:
        return null;
    }
  };

  return (
    <Card className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Messages</h2>
          <Button variant="ghost" size="sm">
            <MessageSquare className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search contacts..."
            className="pl-10"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex space-x-1">
          {(['all', 'active', 'archived'] as const).map((status) => (
            <Button
              key={status}
              variant={filterStatus === status ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilterStatus(status)}
              className="flex-1"
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
              {status === 'active' && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1 text-xs">
                  {chats.filter(chat => chat.status === 'active').length}
                </Badge>
              )}
            </Button>
          ))}
        </div>
      </div>

      {/* Contact List */}
      <CardContent className="flex-1 p-0">
        <ScrollArea className="h-full">
          {sortedChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <MessageSquare className="h-12 w-12 mb-2" />
              <p>No conversations found</p>
              <p className="text-sm">
                {searchQuery ? 'Try adjusting your search' : 'Start a new conversation'}
              </p>
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {sortedChats.map((chat) => {
                const contact = contacts.find(c => c.id === chat.contactId);
                if (!contact) return null;

                return (
                  <div
                    key={chat.id}
                    onClick={() => onChatSelect(chat)}
                    className={`flex items-center space-x-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedChatId === chat.id
                        ? 'bg-blue-50 border-l-4 border-blue-500'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="relative">
                      <Avatar>
                        <AvatarImage src={contact.avatar} />
                        <AvatarFallback>
                          {contact.name.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-1 -right-1">
                        {getStatusIcon(chat.status)}
                      </div>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium truncate">{contact.name}</p>
                        <div className="flex items-center space-x-1">
                          {/* Priority indicator */}
                          <div className={`w-2 h-2 rounded-full ${getPriorityColor(chat.priority)}`} />
                          <span className="text-xs text-muted-foreground">
                            {formatTime(chat.lastMessageAt)}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground truncate">
                          {chat.lastMessagePreview || 'No messages yet'}
                        </p>
                        {chat.unreadCount > 0 && (
                          <Badge variant="default" className="h-5 min-w-[20px] px-1 text-xs">
                            {chat.unreadCount}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center space-x-2 mt-1">
                        {contact.company && (
                          <span className="text-xs text-muted-foreground">
                            {contact.company}
                          </span>
                        )}
                        {contact.tags.slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs px-1 py-0">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}