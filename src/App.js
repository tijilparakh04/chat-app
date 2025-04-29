import React, { useState, useEffect } from 'react';
import { Amplify } from 'aws-amplify';
import { withAuthenticator } from '@aws-amplify/ui-react';
import { generateClient } from 'aws-amplify/api';
import { getCurrentUser, fetchUserAttributes } from 'aws-amplify/auth';
import '@aws-amplify/ui-react/styles.css';
import awsconfig from './aws-exports';
import './App.css';

// Initialize Amplify
Amplify.configure(awsconfig);

// Create API client
const client = generateClient();

// GraphQL operations - updated with senderEmail
const createMessage = /* GraphQL */ `
  mutation CreateMessage($chatRoomId: String!, $content: String!, $recipient: String, $senderEmail: String) {
    createMessage(chatRoomId: $chatRoomId, content: $content, recipient: $recipient, senderEmail: $senderEmail) {
      id
      chatRoomId
      content
      createdAt
      sender
      recipient
      senderEmail
    }
  }
`;

const getMessages = /* GraphQL */ `
  query GetMessages($chatRoomId: String!) {
    getMessages(chatRoomId: $chatRoomId) {
      id
      chatRoomId
      content
      createdAt
      sender
      recipient
      senderEmail
    }
  }
`;

const onCreateMessage = /* GraphQL */ `
  subscription OnCreateMessage($chatRoomId: String!) {
    onCreateMessage(chatRoomId: $chatRoomId) {
      id
      chatRoomId
      content
      createdAt
      sender
      recipient
      senderEmail
    }
  }
`;

function App({ signOut }) {
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [newRecipient, setNewRecipient] = useState('');
  const [user, setUser] = useState(null);
  const [currentView, setCurrentView] = useState('public');
  const [showNewDmForm, setShowNewDmForm] = useState(false);
  const chatRoomId = 'general';
  const [dmContacts, setDmContacts] = useState([]);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        console.log("Fetching user information...");
        const currentUser = await getCurrentUser();
        console.log("Current user:", currentUser);
        
        const userAttributes = await fetchUserAttributes();
        console.log("User attributes:", userAttributes);
        console.log("User email from attributes:", userAttributes.email);
        
        const userWithEmail = {
          ...currentUser,
          email: userAttributes.email
        };
        
        console.log("Setting user with email:", userWithEmail);
        setUser(userWithEmail);
      } catch (err) {
        console.log('Error getting user:', err);
      }
    };

    fetchUser();
    fetchMessages();

    const sub = client.graphql({
      query: onCreateMessage,
      variables: { chatRoomId }
    }).subscribe({
      next: ({ data }) => {
        console.log("Subscription received new message:", data.onCreateMessage);
        setMessages(prev => {
          const updatedMessages = [data.onCreateMessage, ...prev];
          updateDmContacts(updatedMessages);
          return updatedMessages;
        });
      },
      error: (err) => console.error("Subscription error:", err)
    });

    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    if (user && messages.length > 0) {
      console.log("User and messages updated, updating DM contacts");
      console.log("Current user email:", user.email);
      updateDmContacts(messages);
    }
  }, [messages, user]);

  const updateDmContacts = (msgs) => {
    if (!user) return;

    console.log("Updating DM contacts with user email:", user.email);
    
    // Get all unique users involved in private messages with the current user
    const contacts = new Set();
    
    msgs.forEach(msg => {
      if (msg.recipient) {
        console.log("Processing message with recipient:", msg);
        
        // If current user is the sender, add recipient to contacts
        if (msg.senderEmail === user.email) {
          console.log("Current user is sender, adding recipient to contacts:", msg.recipient);
          contacts.add(msg.recipient);
        }
        // If current user is the recipient, add sender to contacts
        else if (msg.recipient === user.email) {
          console.log("Current user is recipient, adding sender to contacts:", msg.senderEmail);
          contacts.add(msg.senderEmail);
        }
      }
    });
    
    const contactsArray = Array.from(contacts);
    console.log("Final DM contacts:", contactsArray);
    setDmContacts(contactsArray);
  };

  const fetchMessages = async () => {
    try {
      console.log("Fetching messages...");
      const messageData = await client.graphql({
        query: getMessages,
        variables: { chatRoomId }
      });
      console.log("Raw messages data:", messageData);
      
      const fetchedMessages = messageData.data.getMessages.reverse();
      console.log("Processed messages:", fetchedMessages);
      
      setMessages(fetchedMessages);
      
      if (user) {
        console.log("User exists, updating DM contacts with fetched messages");
        updateDmContacts(fetchedMessages);
      }
    } catch (err) {
      console.log('Error fetching messages:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
  
    const currentRecipient = currentView === 'public' ? null : 
                           currentView === 'new-dm' ? newRecipient : 
                           currentView;
  
    console.log("Sending message to:", currentRecipient);
    console.log("Message content:", message);
    console.log("Sender email:", user.email);
    
    try {
      const result = await client.graphql({
        query: createMessage,
        variables: {
          chatRoomId,
          content: message,
          recipient: currentRecipient,
          senderEmail: user.email
        }
      });
      
      console.log("Message sent successfully:", result);
      setMessage('');
      
      if (currentView === 'new-dm' && newRecipient) {
        console.log("Starting new DM conversation with:", newRecipient);
        setCurrentView(newRecipient);
        setShowNewDmForm(false);
        setNewRecipient('');
      }
    } catch (err) {
      console.log('Error creating message:', err);
    }
  };

  const getFilteredMessages = () => {
    if (!user) return [];

    console.log("Filtering messages for view:", currentView);
    console.log("Current user email:", user.email);
    
    let filtered;
    if (currentView === 'public') {
      filtered = messages.filter(msg => !msg.recipient);
    } else {
      // Filter for DM conversation with specific user using email
      filtered = messages.filter(msg => 
        (msg.senderEmail === user.email && msg.recipient === currentView) ||
        (msg.senderEmail === currentView && msg.recipient === user.email)
      );
    }
    
    console.log("Filtered messages:", filtered);
    return filtered;
  };

  const startNewDm = () => {
    console.log("Starting new DM conversation");
    setShowNewDmForm(true);
    setCurrentView('new-dm');
  };

  // Helper function to determine if a message is from the current user
  const isCurrentUser = (senderEmail) => {
    const result = user && senderEmail === user.email;
    console.log(`Checking if ${senderEmail} is current user (${user?.email}):`, result);
    return result;
  };

  if (!user) {
    return <div className="loading">Loading...</div>;
  }

  console.log("Rendering with user:", user);
  console.log("Current view:", currentView);
  console.log("DM contacts:", dmContacts);
  
  const filteredMessages = getFilteredMessages();

  return (
    <div className="app">
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>Chat App</h1>
          <div className="user-info">
            <div>Logged in as: {user.email}</div>
            <button className="sign-out-btn" onClick={signOut}>Sign out</button>
          </div>
        </div>
        
        <div className="sidebar-section">
          <h2>Public Chat</h2>
          <div 
            className={`sidebar-item ${currentView === 'public' ? 'active' : ''}`}
            onClick={() => setCurrentView('public')}
          >
            # General
          </div>
        </div>
        
        <div className="sidebar-section">
          <div className="dm-header">
            <h2>Direct Messages</h2>
            <button className="new-dm-btn" onClick={startNewDm}>+</button>
          </div>
          
          {dmContacts.length === 0 && (
            <div className="no-contacts">No conversations yet</div>
          )}
          
          {dmContacts.map(contact => (
            <div 
              key={contact}
              className={`sidebar-item ${currentView === contact ? 'active' : ''}`}
              onClick={() => {
                console.log("Switching to conversation with:", contact);
                setCurrentView(contact);
                setShowNewDmForm(false);
              }}
            >
              @ {contact}
            </div>
          ))}
        </div>
      </div>

      <div className="chat-container">
        <div className="chat-header">
          {currentView === 'public' && <h2># General</h2>}
          {currentView === 'new-dm' && <h2>New Message</h2>}
          {currentView !== 'public' && currentView !== 'new-dm' && <h2>@ {currentView}</h2>}
        </div>

        {showNewDmForm ? (
          <div className="new-dm-form">
            <input
              type="text"
              value={newRecipient}
              onChange={(e) => setNewRecipient(e.target.value)}
              placeholder="Enter recipient email"
              className="recipient-input"
            />
          </div>
        ) : (
          <div className="messages">
            {filteredMessages.length === 0 && (
              <div className="no-messages">
                No messages yet. Start a conversation!
              </div>
            )}
            
            {filteredMessages.map((msg) => (
              <div 
                key={msg.id} 
                className={`message ${isCurrentUser(msg.senderEmail) ? 'sent' : 'received'}`}
              >
                <div className="message-sender">
                  {!isCurrentUser(msg.senderEmail) && (msg.senderEmail || msg.sender)}
                </div>
                <div className="message-content">
                  {msg.content}
                </div>
                <div className="message-meta">
                  {new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="message-form">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={`Message ${currentView === 'public' ? 'everyone' : currentView}`}
            className="message-input"
          />
          <button type="submit" className="send-button">Send</button>
        </form>
      </div>
    </div>
  );
}

export default withAuthenticator(App);