"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { 
  Users, 
  MessageSquare, 
  Phone, 
  TrendingUp, 
  Activity,
  Shield,
  UserPlus,
  Settings,
  BarChart3,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle
} from "lucide-react";

interface DashboardStats {
  totalUsers: number;
  totalContacts: number;
  totalChats: number;
  totalMessages: number;
  activeChats: number;
  connectedAgents: number;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  whatsappConnected: boolean;
  stats: {
    assignedContacts: number;
    totalChats: number;
    activeChats: number;
    totalMessages: number;
    lastLoginAt: string;
  };
}

interface RecentActivity {
  id: string;
  type: 'user_login' | 'message_sent' | 'chat_created' | 'whatsapp_connected';
  description: string;
  timestamp: string;
  userId?: string;
  userName?: string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    totalContacts: 0,
    totalChats: 0,
    totalMessages: 0,
    activeChats: 0,
    connectedAgents: 0
  });
  const [users, setUsers] = useState<User[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load stats
      const statsResponse = await fetch('/api/cms/stats');
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData.data);
      }

      // Load users
      const usersResponse = await fetch('/api/cms/users?page=1&limit=10');
      if (usersResponse.ok) {
        const usersData = await usersResponse.json();
        setUsers(usersData.data);
      }

      // Load recent activity (mock data for now)
      setRecentActivity([
        {
          id: '1',
          type: 'user_login',
          description: 'John Doe logged in',
          timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
          userId: '1',
          userName: 'John Doe'
        },
        {
          id: '2',
          type: 'message_sent',
          description: 'New message from customer +1234567890',
          timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
        },
        {
          id: '3',
          type: 'whatsapp_connected',
          description: 'Jane Smith connected WhatsApp',
          timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
          userId: '2',
          userName: 'Jane Smith'
        }
      ]);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'user_login':
        return <Users className="h-4 w-4 text-green-500" />;
      case 'message_sent':
        return <MessageSquare className="h-4 w-4 text-blue-500" />;
      case 'chat_created':
        return <Phone className="h-4 w-4 text-purple-500" />;
      case 'whatsapp_connected':
        return <Shield className="h-4 w-4 text-green-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const getRelativeTime = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return `${minutes}m ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">
            System overview and management
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
          <Button size="sm">
            <UserPlus className="h-4 w-4 mr-2" />
            Add User
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground">
              {stats.connectedAgents} agents connected
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contacts</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalContacts}</div>
            <p className="text-xs text-muted-foreground">
              Customer database
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Chats</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeChats}</div>
            <p className="text-xs text-muted-foreground">
              of {stats.totalChats} total chats
            </p>
            <Progress 
              value={stats.totalChats > 0 ? (stats.activeChats / stats.totalChats) * 100 : 0} 
              className="mt-2" 
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Messages</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalMessages}</div>
            <p className="text-xs text-muted-foreground">
              All time messages
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Users Overview</CardTitle>
              <CardDescription>
                Manage system users and their access
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {users.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <Avatar>
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback>
                          {user.name.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{user.name}</p>
                          <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                            {user.role}
                          </Badge>
                          {!user.isActive && (
                            <Badge variant="destructive">Inactive</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                        <div className="flex items-center gap-4 mt-1">
                          <span className="text-xs text-muted-foreground">
                            {user.stats.assignedContacts} contacts
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {user.stats.activeChats} active chats
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {user.stats.totalMessages} messages
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="text-right">
                        <div className="flex items-center gap-1">
                          {user.whatsappConnected ? (
                            <CheckCircle className="h-3 w-3 text-green-500" />
                          ) : (
                            <XCircle className="h-3 w-3 text-red-500" />
                          )}
                          <span className="text-xs text-muted-foreground">
                            WhatsApp {user.whatsappConnected ? 'Connected' : 'Disconnected'}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Last login: {user.stats.lastLoginAt ? getRelativeTime(user.stats.lastLoginAt) : 'Never'}
                        </p>
                      </div>
                      <Button variant="outline" size="sm">
                        Manage
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>
                Latest system events and user actions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-center space-x-4 p-3 border rounded-lg">
                    {getActivityIcon(activity.type)}
                    <div className="flex-1">
                      <p className="text-sm">{activity.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {getRelativeTime(activity.timestamp)}
                      </p>
                    </div>
                    {activity.userName && (
                      <Badge variant="outline">{activity.userName}</Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>System Health</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Database</span>
                  <Badge variant="default">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Healthy
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">WhatsApp Service</span>
                  <Badge variant="default">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Running
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">API Response Time</span>
                  <span className="text-sm text-green-600">~45ms</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>System Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Version</span>
                  <span className="text-muted-foreground">1.0.0</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Environment</span>
                  <span className="text-muted-foreground">Development</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Node.js</span>
                  <span className="text-muted-foreground">v22 LTS</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Database</span>
                  <span className="text-muted-foreground">JSON Storage</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}