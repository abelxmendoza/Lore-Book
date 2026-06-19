import './ChatLoadingDots.css';

type ChatLoadingDotsProps = {
  label?: string;
};

export const ChatLoadingDots = ({ label = 'Thinking' }: ChatLoadingDotsProps) => (
  <div className="chat-loading-dots" role="status" aria-label="Waiting for response">
    <span className="chat-loading-dots__label">{label}</span>
    <span className="chat-loading-dots__wave" aria-hidden>
      <span className="chat-loading-dots__dot" />
      <span className="chat-loading-dots__dot" />
      <span className="chat-loading-dots__dot" />
    </span>
  </div>
);
