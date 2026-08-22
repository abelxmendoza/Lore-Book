/**
 * First-open LoreBook window: alpha disclaimer plus welcome for new visitors,
 * "what's new" for returning ones. Reappears whenever a newer product update
 * id ships — including this alpha warning so it is not easy to miss.
 */
import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';

import { config } from '../config/env';
import {
  formatWhatsNewDate,
  hasSeenPreviousWhatsNew,
  isWhatsNewSuppressed,
  markWhatsNewSeen,
  unseenWhatsNew,
  WHATS_NEW,
  WHATS_NEW_SEEN_KEY,
} from '../data/whatsNew';
import { Button } from './ui/button';
import './DevelopmentNotice.css';

type NoticeState = {
  open: boolean;
  returning: boolean;
  unseenIds: Set<string>;
};

function readNoticeState(): NoticeState {
  if (!config.dev.showDevNotice || typeof localStorage === 'undefined') {
    return { open: false, returning: false, unseenIds: new Set() };
  }
  return {
    open: !isWhatsNewSuppressed(localStorage),
    returning: hasSeenPreviousWhatsNew(localStorage),
    unseenIds: new Set(unseenWhatsNew(localStorage.getItem(WHATS_NEW_SEEN_KEY)).map((entry) => entry.id)),
  };
}

export function DevelopmentNotice() {
  const [{ open, returning, unseenIds }, setState] = useState(readNoticeState);

  const handleDismiss = () => {
    markWhatsNewSeen(localStorage);
    setState((current) => ({ ...current, open: false }));
  };

  if (!config.dev.showDevNotice || !open) return null;

  const latestDate = formatWhatsNewDate(WHATS_NEW[0]?.date ?? '');
  const title = returning ? 'LoreBook has grown' : 'Welcome to LoreBook';
  const lede = returning
    ? 'Since you were last here, the life record got sharper — time, people, and conversation now stay on the story you actually lived. It is still alpha: expect breakage and visual change.'
    : 'LoreBook is still in active development. It is not ready for beta testers yet. Chat is the front door, but layouts, styling, and features are changing constantly — and things will break.';

  return (
    <div
      className="whats-new-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dev-notice-title"
      aria-describedby="dev-notice-description"
    >
      <div className="whats-new-panel">
        <button
          type="button"
          className="whats-new-close"
          onClick={handleDismiss}
          aria-label="Dismiss development notice"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="whats-new-body">
          <div className={`whats-new-kicker${returning ? ' whats-new-kicker--pulse' : ' whats-new-kicker--alpha'}`}>
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            {returning ? `Still alpha · ${latestDate}` : 'Alpha · Not ready for beta'}
          </div>

          <h2 id="dev-notice-title" className="whats-new-title">
            {title}
          </h2>
          <p id="dev-notice-description" className="whats-new-lede">
            {lede}
          </p>

          <div className="whats-new-alpha" role="note">
            <strong>Alpha, not beta.</strong>
            {' '}
            This app is still being built. Expect it to break. Styling, layout, labels, and
            features will keep changing — sometimes overnight. If you need something stable
            enough to share with beta testers, it is not there yet.
          </div>

          {!returning && (
            <div className="whats-new-chips">
              <div className="whats-new-chip">
                <strong>Still in development</strong>
                <span>Chat and memory work, but this is an unfinished product — not a beta.</span>
              </div>
              <div className="whats-new-chip">
                <strong>Looks will change</strong>
                <span>Styling, layout, and labels get rewritten as we learn. Nothing visual is final.</span>
              </div>
              <div className="whats-new-chip">
                <strong>Expect breakage</strong>
                <span>Flows can fail, reset, or disappear without warning. That is alpha.</span>
              </div>
            </div>
          )}

          <p className="whats-new-section-label">
            {returning ? 'New since your last visit' : 'Latest in LoreBook'}
          </p>
          <ul className="whats-new-list">
            {WHATS_NEW.map((entry) => {
              const fresh = unseenIds.has(entry.id);
              return (
                <li
                  key={entry.id}
                  className={fresh ? 'whats-new-card whats-new-card--fresh' : 'whats-new-card'}
                >
                  <div className="whats-new-card-top">
                    <span className="whats-new-date">{formatWhatsNewDate(entry.date)}</span>
                    {fresh && returning ? <span className="whats-new-badge">NEW</span> : null}
                  </div>
                  <h3>{entry.title}</h3>
                  <p>{entry.summary}</p>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="whats-new-footer">
          <p>Not a beta. Dismissing only hides this window until the next update.</p>
          <Button onClick={handleDismiss} aria-label="Got it, continue to app">
            {returning ? 'Catch me up' : "Got it, let's go"}
          </Button>
        </div>
      </div>
    </div>
  );
}
