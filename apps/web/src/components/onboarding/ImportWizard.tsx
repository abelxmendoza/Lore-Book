import { useState } from 'react';
import { CalendarDays, CheckCircle2, FileUp, ImageIcon, UploadCloud } from 'lucide-react';

import { Button } from '../ui/button';
import { fetchJson } from '../../lib/api';

export type ImportWizardProps = {
  onComplete?: () => void;
};

const steps = [
  { id: 1, label: 'Choose source' },
  { id: 2, label: 'Grant permissions' },
  { id: 3, label: 'Review & import' },
  { id: 4, label: 'Finish' }
];

export const ImportWizard = ({ onComplete }: ImportWizardProps) => {
  const [activeStep, setActiveStep] = useState(1);
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState('Waiting for files');
  const [calendarEnabled, setCalendarEnabled] = useState(false);
  const [photosEnabled, setPhotosEnabled] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) return;
    setFiles(Array.from(event.target.files));
    setStatus(`${event.target.files.length} files ready`);
    setActiveStep(2);
  };

  const handleImport = async () => {
    setStatus('Importing...');
    try {
      await fetchJson('/api/onboarding/import', {
        method: 'POST',
        body: JSON.stringify({
          files: files.map((file) => ({ name: file.name })),
          calendar: calendarEnabled,
          photos: photosEnabled
        })
      });
      setStatus('Imported successfully');
      setActiveStep(4);
      onComplete?.();
    } catch (error) {
      console.error(error);
      setStatus('Failed to import');
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border/60 bg-black/40 p-6 shadow-panel">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Import wizard</h2>
        <div className="flex gap-2 text-xs text-white/60">
          {steps.map((step) => (
            <div
              key={step.id}
              className={`flex items-center gap-1 rounded-full px-3 py-1 ${
                activeStep >= step.id ? 'bg-primary/20 text-primary' : 'bg-white/5 text-white/50'
              }`}
            >
              {activeStep > step.id ? <CheckCircle2 className="h-4 w-4" /> : <span>{step.id}</span>}
              <span>{step.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 bg-white/5 p-4 text-white/80">
          <UploadCloud className="h-8 w-8 text-primary" />
          <span className="text-sm">Drop text, markdown, or JSON exports</span>
          <input type="file" multiple className="hidden" onChange={handleFileChange} />
        </label>

        <button
          type="button"
          onClick={() => setCalendarEnabled((current) => !current)}
          className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-sm transition ${
            calendarEnabled ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border/60 bg-white/5 text-white/80'
          }`}
        >
          <CalendarDays className="h-8 w-8" />
          Allow calendar import
        </button>

        <button
          type="button"
          onClick={() => setPhotosEnabled((current) => !current)}
          className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-sm transition ${
            photosEnabled ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border/60 bg-white/5 text-white/80'
          }`}
        >
          <ImageIcon className="h-8 w-8" />
          Import photo metadata
        </button>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-white/5 px-4 py-3 text-sm text-white/70">
        <div className="flex items-center gap-2">
          <FileUp className="h-5 w-5 text-primary" />
          <span>{status}</span>
        </div>
        <Button variant="default" onClick={handleImport} disabled={!files.length && !calendarEnabled && !photosEnabled}>
          Run import
        </Button>
      </div>
    </div>
  );
};
