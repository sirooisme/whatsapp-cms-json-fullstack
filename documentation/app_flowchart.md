flowchart TD
  Start[Start] --> LoginPage[Login Page]
  LoginPage --> AuthAPI[Auth API Route]
  AuthAPI --> DBCheck[Validate Credentials in JSON]
  DBCheck --> RoleCheck{Is Admin or Agent}
  RoleCheck -- Admin --> AdminDashboard[Admin Dashboard]
  RoleCheck -- Agent --> AgentDashboard[Agent Dashboard]
  AdminDashboard --> FetchData[Fetch Chats and Contacts]
  AgentDashboard --> FetchData
  FetchData --> APIFetch[API Fetch Data]
  APIFetch --> JSONDBRead[JSON-DB Read]
  JSONDBRead --> ReturnData[Return Data]
  ReturnData --> RenderUI[Render Dashboard UI]
  AgentDashboard --> SendMsg[Agent Sends Message]
  SendMsg --> APIWhatsApp[API WhatsApp Send]
  APIWhatsApp --> WhatsAppService[WhatsApp Service]
  WhatsAppService --> JSONDBWrite[JSON-DB Write Message]
  JSONDBWrite --> Persisted[Message Persisted]
  Persisted --> UIUpdate[UI Update]