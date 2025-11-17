export type SlashCommand = {
  command: string;
  description: string;
  handler: (args: string) => Promise<any> | any;
};

export const parseSlashCommand = (input: string): { command: string; args: string } | null => {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  const parts = trimmed.slice(1).split(' ');
  return {
    command: parts[0].toLowerCase(),
    args: parts.slice(1).join(' ')
  };
};

export const SLASH_COMMANDS: Record<string, Omit<SlashCommand, 'handler'>> = {
  recent: {
    command: '/recent',
    description: 'Show recent entries'
  },
  search: {
    command: '/search <query>',
    description: 'Search your memories'
  },
  characters: {
    command: '/characters',
    description: 'List all characters'
  },
  arcs: {
    command: '/arcs',
    description: 'Show story arcs/chapters'
  },
  debug: {
    command: '/debug',
    description: 'Show debug info (dev mode)'
  }
};

export const getCommandSuggestions = (input: string): Array<{ command: string; description: string }> => {
  if (!input.startsWith('/')) return [];

  const query = input.slice(1).toLowerCase();
  return Object.values(SLASH_COMMANDS)
    .filter(cmd => cmd.command.toLowerCase().includes(query))
    .map(cmd => ({
      command: cmd.command,
      description: cmd.description
    }))
    .slice(0, 5);
};

