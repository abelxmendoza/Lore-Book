import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Upload, Loader2, X } from 'lucide-react';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { uploadVoiceMemo } from '../../api/entries';
import { Button } from '../ui/button';

type VoiceMemoButtonProps = {
  onTranscriptionComplete?: (content: string, tags?: string[], mood?: string) => void;
  onError?: (error: string) => void;
};

export const VoiceMemoButton = ({ onTranscriptionComplete, onError }: VoiceMemoButtonProps) => {
  const {
    state,
    isRecording,
    isPaused,
    isProcessing,
    error: recorderError,
    duration,
    audioBlob,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    reset,
    getAudioFile
  } = useVoiceRecorder();

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [shouldAutoUpload, setShouldAutoUpload] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleFileUpload = useCallback(async (file: File) => {
    setUploading(true);
    setUploadError(null);

    try {
      const response = await uploadVoiceMemo(file);
      
      if (onTranscriptionComplete) {
        onTranscriptionComplete(
          response.formatted.content,
          response.formatted.tags,
          response.formatted.mood || undefined
        );
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to transcribe audio';
      setUploadError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setUploading(false);
    }
  }, [onTranscriptionComplete, onError]);

  const handleRecordClick = async () => {
    if (isRecording) {
      stopRecording();
    } else if (isPaused) {
      resumeRecording();
    } else {
      await startRecording();
    }
  };

  // Auto-upload when blob becomes available after stopping
  useEffect(() => {
    if (shouldAutoUpload && audioBlob && !isRecording && !isPaused) {
      const file = getAudioFile();
      if (file) {
        setShouldAutoUpload(false);
        handleFileUpload(file).then(() => {
          reset();
        });
      }
    }
  }, [audioBlob, shouldAutoUpload, isRecording, isPaused, getAudioFile, handleFileUpload, reset]);

  const handleStopAndUpload = async () => {
    setShouldAutoUpload(true);
    stopRecording();
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const error = recorderError || uploadError;

  if (isRecording || isPaused) {
    return (
      <div className="flex items-center gap-2">
        <Button
          onClick={handleRecordClick}
          variant="outline"
          className="flex items-center gap-2 border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20"
        >
          {isPaused ? (
            <>
              <Mic className="h-4 w-4" />
              Resume
            </>
          ) : (
            <>
              <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              <Mic className="h-4 w-4" />
              {formatDuration(duration)}
            </>
          )}
        </Button>
        <Button
          onClick={handleStopAndUpload}
          variant="outline"
          className="flex items-center gap-2"
          disabled={isProcessing}
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              Stop & Transcribe
            </>
          )}
        </Button>
        <Button
          onClick={reset}
          variant="ghost"
          size="sm"
          className="text-white/60 hover:text-white"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          onClick={handleRecordClick}
          variant="outline"
          className="flex items-center gap-2"
          disabled={uploading}
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Transcribing...
            </>
          ) : (
            <>
              <Mic className="h-4 w-4" />
              Record Voice Memo
            </>
          )}
        </Button>
        <Button
          onClick={() => fileInputRef.current?.click()}
          variant="outline"
          className="flex items-center gap-2"
          disabled={uploading}
        >
          <Upload className="h-4 w-4" />
          Upload Audio
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  );
};

