# App Flow Document

## Onboarding and Sign-In/Sign-Up

When a new user first arrives at the application, they land on a clean welcome page that highlights the features of the WhatsApp Customer Management System. A prominent button invites them to sign up, and another link offers the option to sign in if they already have an account. Clicking the sign-up button opens a form where the user provides their email, creates a password, and selects their role as either an agent or an administrator. Once they submit the form, an email confirmation is sent to verify their address. After clicking the confirmation link in the email, the user’s account becomes active and they are redirected to the login page. 

If a returning user clicks the sign-in button, they see a simple login form asking for email and password. Upon entering valid credentials, they are taken to the dashboard that matches their role. A link labeled “Forgot your password?” sits below the login button for anyone who cannot remember their credentials. Clicking this link prompts the user to enter their registered email. They receive a reset link, and after following it they can choose a new password. Signing out is always accessible from the user menu in the page header, where the user’s name appears. Clicking the name reveals a dropdown containing the “Sign Out” option, which immediately logs the user out and returns them to the welcome page.

## Main Dashboard or Home Page

Right after signing in, an agent sees their Chat Dashboard as the default view. The top of the page has a header displaying the application logo, the user’s name on the right, and a link to their settings. Down the left side, a sidebar lists recent chats and contacts. The center area shows the currently selected chat and message history. Below the history, an input box allows the agent to type and send messages. The sidebar also includes a search field to filter contacts quickly.

When an administrator logs in, they see the Admin Dashboard as the default view instead. The header is similar with the logo and user menu, but the sidebar presents tabs for User Management, Chat Analytics, and System Settings. The main area of the Admin Dashboard changes depending on which tab is selected. From here, administrators can switch to the agent view by selecting the Chat tab, which reveals the same chat interface agents use.

Navigation between the different areas happens through the sidebar or by clicking the application logo to return to the primary dashboard for that role. All links and tabs are clearly labeled so users never wonder where to click next.

## Detailed Feature Flows and Page Transitions

When an agent wants to start a new conversation, they click a “New Chat” button located above the chat list in the sidebar. This opens a modal where they select or search for a contact by name or phone number. After choosing the contact, the modal closes and a blank chat window appears in the main area. The agent types a message and hits Enter or the Send icon. The message is instantly delivered through the WhatsApp service and then saved to the chat history in a JSON file on the server. The chat list in the sidebar updates automatically to show the newest message preview at the top. If an incoming message arrives from a contact, the application pushes it into the active chat window and also displays a notification badge next to that chat in the sidebar.

Profile editing is accessed from the user’s name drop-down in the header. When the user selects “Profile,” a page appears where they can update their display name, upload a profile picture, or change their password. After making changes, they click “Save,” and an API call writes the updated information into the users.json file. A confirmation message appears briefly, and then the application returns to the dashboard.

Administrators manage agents by selecting the User Management tab in the sidebar. They see a list of all users with their roles and status. When an admin clicks “Add User,” a form slides into view where they enter the new agent’s email, assign a temporary password, and choose their role. Submitting this form triggers an API route that appends the new user to the same JSON file that holds user data. An email automatically invites the new agent to complete their registration by setting a permanent password. Clicking on an existing user in the list opens a detail page where the admin can modify the user’s role or deactivate the account entirely. Those updates are written back to the JSON store in real time.

From any page in the application, users can navigate back to their main dashboard by clicking the application logo or using the sidebar links. Page transitions occur smoothly without full reloads, making the app feel fast and responsive.

## Settings and Account Management

All users manage their personal information and preferences through the Settings page, accessible from the header under their name. Within Settings, they can change their display name, update their email address, and set notification preferences for desktop alerts and sounds. They save changes by clicking the “Update Settings” button at the bottom of the form. This interacts with an API route that validates inputs with a schema, then writes updates to the JSON data store. Once saved, the page shows a green checkmark and retains the updated values.

Although there is no subscription billing in this system, administrators can adjust system-wide settings under the System Settings tab in the admin sidebar. These settings include toggling certain features on or off and setting default notifications for agents. Saving these settings follows the same pattern of validation and JSON persistence.

After completing any activity in Settings, a persistent navigation bar at the top reminds the user how to return to the main dashboard, either by clicking the logo or using the sidebar.

## Error States and Alternate Paths

If a user enters an incorrect email or password at login, an error banner appears above the login form informing them that their credentials are invalid. The input fields remain populated so they can correct any typos. When resetting a password, if the user provides an email not associated with any account, they receive a clear message telling them no account exists with that address.

Within the chat interface, if message delivery fails due to connectivity issues or WhatsApp service errors, the message line shakes briefly and a retry button appears next to it. Clicking retry re-attempts sending the message or queues it when the connection restores. Should the backend detect a JSON file write error, a notification at the top of the page explains that saving failed and advises the user to try again. The app automatically retries writes in the background after a short delay.

For unauthorized access, such as an agent trying to view the Admin Dashboard, the middleware intercepts the request and redirects them to their own dashboard with a notice that access is restricted. Similarly, if an unauthenticated visitor attempts to access any protected route, they get sent back to the sign-in page.

## Conclusion and Overall App Journey

From the moment a user first arrives and signs up by providing an email and password, through email confirmation and their initial login, every step guides them clearly into the heart of the WhatsApp CMS. Agents dive into the chat dashboard to handle customer interactions in real time, using the intuitive sidebar, chat window, and notification system. Administrators manage users, roles, and system settings in a separate but familiar dashboard layout. Personal profiles and preferences live in a settings page that feels like a natural extension of the dashboard. Throughout the journey, validation keeps data safe, error states remain informative, and navigation stays consistent. By the end of a typical session, an agent has sent and received messages, updated profile details, and returned easily to the main chat list, while an administrator has managed users or reviewed analytics before signing out. This end-to-end flow ensures that every interaction is logical, connected, and secure, from sign-up to everyday use.