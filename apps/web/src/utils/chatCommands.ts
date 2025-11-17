import { fetchJson } from '../lib/api';
import type { Message } from '../components/chat/ChatMessage';

export const parseSlashCommand = (input: string): { command: string; args: string } | null => {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  const parts = trimmed.slice(1).split(' ');
  return {
    command: parts[0].toLowerCase(),
    args: parts.slice(1).join(' ')
  };
};

export type CommandResult = {
  type: 'message' | 'data' | 'navigation';
  content?: string;
  data?: any;
  navigation?: {
    surface: 'timeline' | 'characters' | 'memoir' | 'search';
    id?: string;
    query?: string;
  };
};

export const handleSlashCommand = async (
  command: string,
  args: string,
  userId?: string
): Promise<CommandResult | null> => {
  const cmd = command.toLowerCase();

  switch (cmd) {
    case 'recent': {
      try {
        const entries = await fetchJson<any[]>('/api/entries?limit=10');
        const formatted = entries
          .slice(0, 10)
          .map((e: any) => `- ${new Date(e.date).toLocaleDateString()}: ${e.summary || e.content.substring(0, 100)}...`)
          .join('\n');
        
        return {
          type: 'message',
          content: `**Recent Entries**\n\n${formatted || 'No recent entries found.'}`
        };
      } catch (error) {
        return {
          type: 'message',
          content: `Error fetching recent entries: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    }

    case 'search': {
      if (!args.trim()) {
        return {
          type: 'message',
          content: 'Usage: `/search <query>`\nExample: `/search robotics project`'
        };
      }
      
      return {
        type: 'navigation',
        navigation: {
          surface: 'search',
          query: args.trim()
        }
      };
    }

    case 'characters': {
      try {
        const characters = await fetchJson<any[]>('/api/people-places?filter=person');
        const formatted = characters
          .slice(0, 20)
          .map((c: any) => `- **${c.name}**${c.role ? ` (${c.role})` : ''}${c.summary ? `: ${c.summary.substring(0, 80)}...` : ''}`)
          .join('\n');
        
        return {
          type: 'message',
          content: `**Characters**\n\n${formatted || 'No characters found.'}`
        };
      } catch (error) {
        return {
          type: 'message',
          content: `Error fetching characters: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    }

    case 'arcs':
    case 'chapters': {
      try {
        const chapters = await fetchJson<any[]>('/api/chapters');
        const formatted = chapters
          .slice(0, 10)
          .map((ch: any) => {
            const start = new Date(ch.start_date).toLocaleDateString();
            const end = ch.end_date ? new Date(ch.end_date).toLocaleDateString() : 'Ongoing';
            return `- **${ch.title}** (${start} - ${end})${ch.summary ? `\n  ${ch.summary.substring(0, 100)}...` : ''}`;
          })
          .join('\n\n');
        
        return {
          type: 'message',
          content: `**Story Arcs / Chapters**\n\n${formatted || 'No chapters found.'}`
        };
      } catch (error) {
        return {
          type: 'message',
          content: `Error fetching chapters: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    }

    case 'debug': {
      if (process.env.NODE_ENV !== 'development') {
        return {
          type: 'message',
          content: 'Debug mode is only available in development.'
        };
      }
      
      return {
        type: 'message',
        content: `**Debug Info**\n\n- User ID: ${userId || 'Not available'}\n- Timestamp: ${new Date().toISOString()}\n- Command: \`${command}\`\n- Args: \`${args}\``
      };
    }

    default:
      return null;
  }
};

export const formatCommandResponse = (result: CommandResult): Message => {
  return {
    id: `command-${Date.now()}`,
    role: 'assistant',
    content: result.content || 'Command executed.',
    timestamp: new Date()
  };
};

