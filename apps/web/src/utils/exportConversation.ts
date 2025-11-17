import type { Message } from '../components/chat/ChatMessage';

export const exportConversationAsMarkdown = (messages: Message[]): string => {
  const date = new Date().toISOString().split('T')[0];
  let markdown = `# Lore Keeper Chat Export\n\n`;
  markdown += `**Date:** ${date}\n`;
  markdown += `**Messages:** ${messages.length}\n\n`;
  markdown += `---\n\n`;

  let currentDate: string | null = null;

  messages.forEach((message) => {
    const messageDate = message.timestamp.toLocaleDateString();
    
    if (messageDate !== currentDate) {
      if (currentDate !== null) {
        markdown += '\n---\n\n';
      }
      markdown += `## ${messageDate}\n\n`;
      currentDate = messageDate;
    }

    const role = message.role === 'user' ? '**You**' : '**AI**';
    const time = message.timestamp.toLocaleTimeString();
    
    markdown += `${role} (${time})\n\n`;
    markdown += `${message.content}\n\n`;

    if (message.sources && message.sources.length > 0) {
      markdown += `*Sources:*\n`;
      message.sources.forEach((source) => {
        markdown += `- [${source.type}] ${source.title}${source.date ? ` (${new Date(source.date).toLocaleDateString()})` : ''}\n`;
      });
      markdown += '\n';
    }

    if (message.connections && message.connections.length > 0) {
      markdown += `*Connections:*\n`;
      message.connections.forEach((conn) => {
        markdown += `- ${conn}\n`;
      });
      markdown += '\n';
    }

    if (message.continuityWarnings && message.continuityWarnings.length > 0) {
      markdown += `*Continuity Warnings:*\n`;
      message.continuityWarnings.forEach((warning) => {
        markdown += `- ⚠️ ${warning}\n`;
      });
      markdown += '\n';
    }

    markdown += '\n';
  });

  return markdown;
};

export const exportConversationAsJSON = (messages: Message[]): string => {
  const exportData = {
    exportedAt: new Date().toISOString(),
    messageCount: messages.length,
    messages: messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp.toISOString(),
      sources: msg.sources,
      connections: msg.connections,
      continuityWarnings: msg.continuityWarnings,
      timelineUpdates: msg.timelineUpdates,
      strategicGuidance: msg.strategicGuidance,
      extractedDates: msg.extractedDates,
      citations: msg.citations
    }))
  };

  return JSON.stringify(exportData, null, 2);
};

export const downloadFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

