import './ChatLoadingDots.css';

export const ChatLoadingDots = () => (
  <div className="chat-loading-dots" role="status" aria-label="Waiting for response">
    <span className="chat-loading-dots__dot" />
    <span className="chat-loading-dots__dot" />
    <span className="chat-loading-dots__dot" />
  </div>
);
