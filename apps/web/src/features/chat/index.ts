// Main exports
export { ChatFirstInterface } from './components/ChatFirstInterface';
export { ChatHeader } from './components/ChatHeader';
export { ChatEmptyState } from './components/ChatEmptyState';
export { ChatLoadingPulse } from './components/ChatLoadingPulse';

// Message components
export { ChatMessage, type Message, type ChatSource } from './message/ChatMessage';
export { ChatMessageList } from './message/ChatMessageList';
export { ChatMessageActions } from './message/ChatMessageActions';
export { ChatMarkdown } from './message/ChatMarkdown';

// Composer components
export { ChatComposer } from './composer/ChatComposer';
export { MoodIndicator } from './composer/MoodIndicator';
export { ComposerHints } from './composer/ComposerHints';
export { CommandSuggestions } from './composer/CommandSuggestions';
export { TagSuggestions } from './composer/TagSuggestions';

// Sources components
export { ChatSourcesBar } from './sources/ChatSourcesBar';
export { ChatSourceNavigator } from './sources/ChatSourceNavigator';

// Search components
export { ChatSearchModal } from './search/ChatSearchModal';
export { ChatSearchResult } from './search/ChatSearchResult';

// Hooks
export { useChat } from './hooks/useChat';
export { useChatComposer } from './hooks/useChatComposer';
export { useChatSearch } from './hooks/useChatSearch';
export { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
export { useConversationStore } from './hooks/useConversationStore';

// Utils
export { markdownConfig } from './utils/markdownConfig';
export { groupMessagesByDate } from './utils/messageGrouping';
export { highlightMatches, findMatchPositions } from './utils/highlightMatches';
export { scrollToMessage } from './utils/scrollToMessage';

