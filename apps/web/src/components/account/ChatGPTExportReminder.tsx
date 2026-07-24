import { BellRing, Clock3, FileArchive, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  getChatGPTExportReminder,
  updateChatGPTExportReminder,
  type ChatGPTExportReminderState,
} from '../../api/chatGPTExportReminder';
import { useAuth } from '../../lib/supabase';

export function ChatGPTExportReminder() {
  const { user } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();
  const [state, setState] = useState<ChatGPTExportReminderState | null>(null);
  const [updating, setUpdating] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!userId) {
      setState(null);
      return;
    }
    let active = true;
    getChatGPTExportReminder()
      .then((next) => {
        if (active) setState(next);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId]);

  if (!user || hidden || !state?.shouldRemind) return null;

  const update = async (action: 'remind_later' | 'dismiss', days = 3) => {
    setUpdating(true);
    try {
      setState(await updateChatGPTExportReminder(action, days));
      setHidden(true);
    } catch {
      // Keep the reminder visible so the user can retry when the connection recovers.
    } finally {
      setUpdating(false);
    }
  };

  return (
    <aside
      aria-label="ChatGPT export reminder"
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 right-4 z-[70] rounded-xl border border-primary/35 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur sm:left-auto sm:right-6 sm:w-[390px]"
    >
      <button
        type="button"
        onClick={() => setHidden(true)}
        className="absolute right-3 top-3 rounded-md p-1 text-white/35 hover:bg-white/10 hover:text-white/70"
        aria-label="Hide reminder for now"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <div className="rounded-lg bg-primary/15 p-2 text-primary">
          <BellRing className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Your ChatGPT export may be ready</p>
          <p className="mt-1 text-xs leading-relaxed text-white/50">
            If OpenAI emailed the download link, you can import the ZIP now. Your existing Lore Book stays intact and every proposed fact goes to review.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setHidden(true);
            navigate('/account?tab=data');
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white hover:bg-primary/90"
        >
          <FileArchive className="h-3.5 w-3.5" />
          Import export
        </button>
        <button
          type="button"
          disabled={updating}
          onClick={() => void update('remind_later', 3)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-3 py-2 text-xs text-white/65 hover:bg-white/[0.06] disabled:opacity-50"
        >
          <Clock3 className="h-3.5 w-3.5" />
          Remind in 3 days
        </button>
        <button
          type="button"
          disabled={updating}
          onClick={() => void update('dismiss')}
          className="px-2 py-2 text-xs text-white/35 hover:text-white/65 disabled:opacity-50"
        >
          Stop reminders
        </button>
      </div>
    </aside>
  );
}
