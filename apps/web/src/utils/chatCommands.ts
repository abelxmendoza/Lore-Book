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

    case 'soul':
    case 'essence':
    case 'profile': {
      try {
        const profile = await fetchJson<{ profile: any }>('/api/essence/profile');
        const p = profile.profile;
        
        const parts: string[] = [];
        
        if (p.hopes?.length > 0) {
          parts.push(`**Hopes:**\n${p.hopes.slice(0, 3).map((h: any) => `- ${h.text}`).join('\n')}`);
        }
        if (p.dreams?.length > 0) {
          parts.push(`**Dreams:**\n${p.dreams.slice(0, 3).map((d: any) => `- ${d.text}`).join('\n')}`);
        }
        if (p.fears?.length > 0) {
          parts.push(`**Fears:**\n${p.fears.slice(0, 3).map((f: any) => `- ${f.text}`).join('\n')}`);
        }
        if (p.strengths?.length > 0) {
          parts.push(`**Strengths:**\n${p.strengths.slice(0, 3).map((s: any) => `- ${s.text}`).join('\n')}`);
        }
        if (p.topSkills?.length > 0) {
          parts.push(`**Top Skills:**\n${p.topSkills.slice(0, 5).map((s: any) => `- ${s.skill}`).join('\n')}`);
        }
        
        return {
          type: 'message',
          content: parts.length > 0 
            ? `**Your Soul Profile**\n\n${parts.join('\n\n')}`
            : '**Your Soul Profile**\n\nStill learning about you... Start chatting to build your profile!'
        };
      } catch (error) {
        return {
          type: 'message',
          content: `Error fetching soul profile: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    }

    case 'locations': {
      try {
        const locations = await fetchJson<any[]>('/api/locations');
        const formatted = locations
          .slice(0, 15)
          .map((l: any) => `- **${l.name}**${l.visitCount ? ` (visited ${l.visitCount} times)` : ''}${l.firstVisited ? ` - First: ${new Date(l.firstVisited).toLocaleDateString()}` : ''}`)
          .join('\n');
        
        return {
          type: 'message',
          content: `**Locations**\n\n${formatted || 'No locations found.'}`
        };
      } catch (error) {
        return {
          type: 'message',
          content: `Error fetching locations: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    }

    case 'help': {
      return {
        type: 'message',
        content: `**Available Commands**\n\n` +
          `- \`/recent\` - Show recent entries\n` +
          `- \`/search <query>\` - Search entries\n` +
          `- \`/characters\` - List all characters\n` +
          `- \`/locations\` - List all locations\n` +
          `- \`/arcs\` or \`/chapters\` - Show story arcs/chapters\n` +
          `- \`/soul\` or \`/essence\` - View your soul profile\n` +
          `- \`/help\` - Show this help message`
      };
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

