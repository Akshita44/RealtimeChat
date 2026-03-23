export function getConversationTitle(conversation, myId) {
    if (!conversation) return "Direct Message";
  
    const others = (conversation.participants || []).filter(
      (p) => p._id !== myId
    );
    const names = others.map(
      (p) => p.name || p.email || "Unknown"
    );
    if (names.length === 0) return "Direct Message";
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]}, ${names[1]}`;
    return `${names[0]}, ${names[1]} +${names.length - 2}`;
  }

  export function getTypingInfo(conversation, typingState, myId) {
    if (!conversation) return { typingIds: [], typingNames: [] };
  
    const participants = conversation.participants || [];
    const typingMap = typingState?.[conversation._id] || {};
  
    const typingIds = Object.keys(typingMap).filter(
      (id) => id !== myId
    );
  
    const typingNames = typingIds
      .map((id) => {
        const user = participants.find((p) => p._id === id);
        return user?.name || user?.email;
      })
      .filter(Boolean);
  
    return { typingIds, typingNames };
  }